"""
Profound Operating Model — Engine
==================================
Built in strict dependency order. Every block consumes only what is already computed.

Design principles enforced here:
  - Option A: the HIRING PLAN is the input, revenue is the OUTPUT. Never the reverse.
  - NRR, GRR and Gross Margin are OUTPUTS of driver blocks, never inputs.
  - Cohorts are DOLLAR-denominated (correct for NRR/GRR). A separate LOGO cohort
    view is computed with a worse churn rate and does not feed the ARR math.
  - Interest income runs off BEGINNING cash (no circular reference).
  - New ARR lands at month end, recognises from the following month.
"""

import copy
import numpy as np
import pandas as pd

from assumptions import (
    GIVEN, TIME, OPENING_BASE, SALES, RETENTION, ACV, SELFSERVE, AGENTS,
    COGS, HEADCOUNT, OPEX, CASH, FUNDRAISE, SCENARIOS, BENCHMARKS,
)

M = TIME["months"]


# =============================================================================
# Scenario plumbing
# =============================================================================
def build_params(scenario="base"):
    """Assemble a full parameter set with scenario overrides applied."""
    p = {
        "GIVEN": copy.deepcopy(GIVEN), "TIME": copy.deepcopy(TIME),
        "OPENING_BASE": copy.deepcopy(OPENING_BASE), "SALES": copy.deepcopy(SALES),
        "RETENTION": copy.deepcopy(RETENTION), "ACV": copy.deepcopy(ACV),
        "SELFSERVE": copy.deepcopy(SELFSERVE), "AGENTS": copy.deepcopy(AGENTS),
        "COGS": copy.deepcopy(COGS), "HEADCOUNT": copy.deepcopy(HEADCOUNT),
        "OPEX": copy.deepcopy(OPEX), "CASH": copy.deepcopy(CASH),
        "FUNDRAISE": copy.deepcopy(FUNDRAISE),
    }
    for key, val in SCENARIOS.get(scenario, {}).items():
        block, field = key.split(".")
        p[block][field] = copy.deepcopy(val)
    return p


def month_index():
    """Return (dates, years, month_of_year) arrays for the 60-month spine."""
    dates, years, moys = [], [], []
    y, mo = TIME["start_year"], TIME["start_month"]
    for _ in range(M):
        dates.append(pd.Timestamp(year=y, month=mo, day=1) + pd.offsets.MonthEnd(0))
        years.append(y)
        moys.append(mo)
        mo += 1
        if mo > 12:
            mo, y = 1, y + 1
    return dates, np.array(years), np.array(moys)


def yr_val(d, year, default=None):
    """Look up a per-year dict, falling back to the last available year."""
    if not isinstance(d, dict):
        return d
    if year in d:
        return d[year]
    return d[max(d.keys())] if default is None else default


def monthly_from_annual(rate):
    """Convert an annual growth rate to its monthly equivalent."""
    return (1.0 + rate) ** (1.0 / 12.0) - 1.0


# =============================================================================
# BLOCK 1 — Sales capacity  ->  productive AE equivalents
# =============================================================================
def sales_capacity(p, years):
    """AE headcount, ramp state, and productive capacity by month.

    An AE hired in month m starts contributing on the ramp curve. Attrition
    removes AEs pro-rata across the ramped population, which is why sales
    attrition destroys CAPACITY and not merely cost.
    """
    s = p["SALES"]
    ae_attr_m = HEADCOUNT["attrition_sales_pa"] / 12.0

    ae_headcount = np.zeros(M)
    productive_ae = np.zeros(M)
    ae_hires = np.zeros(M)
    ae_attrition = np.zeros(M)

    lag = s["time_to_hire_months"]
    for m in range(M):
        src = max(m - lag, 0)
        ae_hires[m] = yr_val(s["ae_hires_per_month"], years[src])

    prev = float(s["opening_aes"])
    for m in range(M):
        ae_attrition[m] = prev * ae_attr_m
        ae_headcount[m] = prev * (1.0 - ae_attr_m) + ae_hires[m]
        prev = ae_headcount[m]

    # Unramped drag: recent hires carry only part of a quota. Five slots, year varying,
    # expressed exactly as the workbook expresses it so the two engines cannot diverge.
    for m in range(M):
        L = yr_val(s["ramp_months_by_year"], years[m])
        curve = s["ramp_curve"] if L == 4 else s["ramp_curve_5mo"]
        drag = 0.0
        for k in range(5):
            f = curve[k] if k < len(curve) else 1.0
            if m - k >= 0:
                drag += ae_hires[m - k] * (1.0 - f)
        productive_ae[m] = max(ae_headcount[m] - drag, 0.0)

    return {
        "ae_headcount": ae_headcount,
        "productive_ae": productive_ae,
        "ae_hires": ae_hires,
        "ae_attrition": ae_attrition,
    }


# =============================================================================
# BLOCK 2 — Self-serve
# =============================================================================
def selfserve_block(p, years):
    ss, acv = p["SELFSERVE"], p["ACV"]
    cust = np.zeros(M)
    arr = np.zeros(M)
    conv_to_ent = np.zeros(M)
    new_adds = np.zeros(M)

    c = float(p["OPENING_BASE"]["selfserve_customers"])
    g_m = monthly_from_annual(ss["new_cust_growth_pa"])
    acv_g_m = monthly_from_annual(acv["selfserve_acv_growth_pa"])

    for m in range(M):
        adds = ss["new_customers_per_month"] * ((1.0 + g_m) ** m)
        churned = c * ss["monthly_churn"]
        converted = c * ss["monthly_conv_to_ent"]
        c = c - churned - converted + adds

        new_adds[m] = adds
        conv_to_ent[m] = converted
        cust[m] = c
        arr[m] = c * acv["selfserve_acv"] * ((1.0 + acv_g_m) ** m)

    return {"ss_customers": cust, "ss_arr": arr,
            "ss_conv_to_ent": conv_to_ent, "ss_new_adds": new_adds}


# =============================================================================
# BLOCK 3 — Dollar cohort engine  ->  enterprise core ARR
# NRR and GRR fall out of this. They are not inputs.
# =============================================================================
class Cohort:
    __slots__ = ("age", "arr", "history", "churn_history", "is_opening")

    def __init__(self, age, arr, months, is_opening=False):
        self.age = age
        self.arr = arr
        self.is_opening = is_opening
        self.history = np.zeros(months + 1)
        self.churn_history = np.zeros(months + 1)


def cohort_engine(p, years, capacity, ss):
    """Run dollar cohorts. New bookings come from sales capacity (Option A)."""
    r, s, acv = p["RETENTION"], p["SALES"], p["ACV"]

    cohorts = []
    # Opening base: spread evenly across prior 12 months so 1/12 faces first
    # renewal each month of FY26 — makes the renewal cliff explicit.
    n = r["opening_base_spread_months"]
    slice_arr = p["OPENING_BASE"]["ent_arr"] / n
    for i in range(n):
        # ages 12, 11, ... 1  -> the age-12 slice renews in month 1
        cohorts.append(Cohort(age=n - i, arr=slice_arr, months=M, is_opening=True))

    ent_arr = np.zeros(M)
    new_arr = np.zeros(M)
    expansion = np.zeros(M)
    churn = np.zeros(M)
    new_logos = np.zeros(M)
    ent_customers = np.zeros(M)

    acv_g_m = monthly_from_annual(acv["ent_acv_growth_pa"])
    quota_g_m = monthly_from_annual(s["quota_growth_pa"])
    in_contract_churn_m = r["in_contract_churn_pa"] / 12.0

    logo_cust = float(p["OPENING_BASE"]["ent_customers"])

    for m in range(M):
        year = years[m]
        seat_pa = yr_val(r["seat_expansion_pa"], year)
        seat_m = monthly_from_annual(seat_pa)
        cross = yr_val(r["cross_sell_uplift"], year)
        later_surv = yr_val(r["later_renewal_survival"], year)

        exp_m = 0.0
        churn_m = 0.0

        for c in cohorts:
            c.age += 1
            before = c.arr

            # in-contract seat/usage expansion
            c.arr *= (1.0 + seat_m)
            exp_m += c.arr - before

            # in-contract churn (rare with annual terms)
            lost = c.arr * in_contract_churn_m
            c.arr -= lost
            churn_m += lost
            c.churn_history[m] = lost

            # renewal event at each 12-month anniversary
            if c.age % 12 == 0:
                surv = r["first_renewal_survival"] if c.age == 12 else later_surv
                lost_r = c.arr * (1.0 - surv)
                c.arr -= lost_r
                churn_m += lost_r
                c.churn_history[m] += lost_r
                pre_up = c.arr
                c.arr *= (1.0 + r["renewal_price_uplift"] + cross)
                exp_m += c.arr - pre_up

        # --- new bookings from productive sales capacity
        quota_now = s["quota_annual"] * ((1.0 + quota_g_m) ** m)
        booked = capacity["productive_ae"][m] * (quota_now / 12.0) * s["attainment"]

        # self-serve graduates land as enterprise logos
        acv_now = acv["ent_new_logo_acv"] * ((1.0 + acv_g_m) ** m)
        booked += ss["ss_conv_to_ent"][m] * acv_now

        nc = Cohort(age=0, arr=booked, months=M)
        cohorts.append(nc)

        new_arr[m] = booked
        expansion[m] = exp_m
        churn[m] = churn_m
        new_logos[m] = booked / acv_now if acv_now > 0 else 0.0

        total = 0.0
        for c in cohorts:
            c.history[m] = c.arr
            total += c.arr
        ent_arr[m] = total

        # --- logo count view (separate, worse churn; does NOT feed ARR math)
        logo_surv_pen = r["logo_churn_premium"] / 12.0
        logo_cust = logo_cust * (1.0 - in_contract_churn_m - logo_surv_pen) + new_logos[m]
        # renewal-driven logo loss, spread
        if m < 12:
            logo_cust -= (p["OPENING_BASE"]["ent_customers"] / 12.0) * \
                         (1.0 - (r["first_renewal_survival"] - r["logo_churn_premium"]))
        ent_customers[m] = max(logo_cust, 0.0)

    return {
        "ent_arr": ent_arr, "new_arr": new_arr, "expansion": expansion,
        "churn": churn, "new_logos": new_logos, "ent_customers": ent_customers,
        "cohorts": cohorts,
    }


# =============================================================================
# BLOCK 4 — Agents (usage-based, billed in arrears)
# =============================================================================
def agents_block(p, years, coh):
    a, acv = p["AGENTS"], p["ACV"]
    attach = np.zeros(M)
    agents_arr = np.zeros(M)
    agents_customers = np.zeros(M)

    acv_g_m = monthly_from_annual(a["acv_growth_pa"])
    core_acv_g_m = monthly_from_annual(acv["ent_acv_growth_pa"])

    prev_year_end = 0.0
    for m in range(M):
        year = years[m]
        target = yr_val(a["attach_by_yearend"], year)
        start = prev_year_end if (m % 12 == 0 and m > 0) else None
        if m % 12 == 0:
            prev_year_end = attach[m - 1] if m > 0 else 0.0
        moy = m % 12
        base_attach = prev_year_end
        attach[m] = base_attach + (target - base_attach) * ((moy + 1) / 12.0)

        agents_customers[m] = coh["ent_customers"][m] * attach[m]
        # Agents ACV grows at its OWN rate only. Compounding core ACV growth on top
        # double-counts and produces ~22%/yr escalation.
        agents_acv = acv["ent_new_logo_acv"] * a["acv_pct_of_core"] * ((1.0 + acv_g_m) ** m)
        agents_arr[m] = agents_customers[m] * agents_acv

    return {"agents_attach": attach, "agents_arr": agents_arr,
            "agents_customers": agents_customers}


# =============================================================================
# BLOCK 5 — Headcount roster
# =============================================================================
def headcount_block(p, years, capacity, coh):
    h, s = p["HEADCOUNT"], p["SALES"]
    ns_attr_m = h["attrition_nonsales_pa"] / 12.0

    rnd = np.zeros(M); ga = np.zeros(M); cs = np.zeros(M)
    sdr = np.zeros(M); mktg = np.zeros(M); salesops = np.zeros(M); enable = np.zeros(M)
    gross_hires = np.zeros(M)

    r_c = float(h["opening_split"]["rnd"])
    g_c = float(h["opening_split"]["ga"])

    for m in range(M):
        year = years[m]
        r_hires = yr_val(h["rnd_hires_per_month"], year)
        g_hires = yr_val(h["ga_hires_per_month"], year)

        r_lost = r_c * ns_attr_m
        g_lost = g_c * ns_attr_m
        r_c = r_c - r_lost + r_hires + r_lost      # backfill + net adds
        g_c = g_c - g_lost + g_hires + g_lost
        rnd[m], ga[m] = r_c, g_c

        ae = capacity["ae_headcount"][m]
        sdr[m] = ae * s["sdr_per_ae"]
        mktg[m] = ae * s["mktg_per_ae"]
        salesops[m] = ae * s["salesops_per_ae"]
        enable[m] = ae / 20.0 * s["enablement_heads_per_20_aes"]

        cs[m] = max(coh["ent_customers"][m] / yr_val(h["ent_custs_per_csm"], year),
                    h["opening_split"]["cs"] * 0.5)

        gross_hires[m] = (r_hires + r_lost + g_hires + g_lost +
                          capacity["ae_hires"][m] + capacity["ae_attrition"][m])

    sm_total = capacity["ae_headcount"] + sdr + mktg + salesops + enable
    total = rnd + ga + cs + sm_total

    # --- payroll
    lc, infl_m = h["loaded_cost"], monthly_from_annual(h["comp_inflation_pa"])
    esc = np.array([(1.0 + infl_m) ** m for m in range(M)])

    pay_rnd = rnd * lc["rnd"] / 12.0 * esc
    pay_cs = cs * lc["cs"] / 12.0 * esc
    pay_ga = ga * lc["ga"] / 12.0 * esc
    pay_sm = (capacity["ae_headcount"] * lc["ae"] + sdr * lc["sdr"] +
              mktg * lc["mktg"] + (salesops + enable) * lc["salesops"]) / 12.0 * esc

    payroll = pay_rnd + pay_cs + pay_ga + pay_sm
    recruiting = gross_hires * h["recruiting_cost_per_hire"]

    return {
        "hc_rnd": rnd, "hc_ga": ga, "hc_cs": cs, "hc_sm": sm_total,
        "hc_sdr": sdr, "hc_mktg": mktg, "hc_salesops": salesops, "hc_enable": enable,
        "hc_total": total, "gross_hires": gross_hires,
        "pay_rnd": pay_rnd, "pay_cs": pay_cs, "pay_ga": pay_ga, "pay_sm": pay_sm,
        "payroll": payroll, "recruiting": recruiting,
    }


# =============================================================================
# BLOCK 6 — Revenue recognition, COGS, opex, P&L, cash
# =============================================================================
def financials(p, years, coh, ag, ss, hc):
    c, o, cs_p = p["COGS"], p["OPEX"], p["CASH"]

    core_arr = coh["ent_arr"] + ss["ss_arr"]
    total_arr = core_arr + ag["agents_arr"]

    # --- revenue: new ARR lands month end, recognises from following month
    beg_core = np.concatenate([[p["OPENING_BASE"]["ent_arr"] +
                                p["OPENING_BASE"]["selfserve_arr"]], core_arr[:-1]])
    beg_agents = np.concatenate([[0.0], ag["agents_arr"][:-1]])
    rev_core = beg_core / 12.0
    rev_agents = beg_agents / 12.0
    revenue = rev_core + rev_agents

    rev_ss = np.concatenate([[p["OPENING_BASE"]["selfserve_arr"]], ss["ss_arr"][:-1]]) / 12.0
    rev_ent = rev_core - rev_ss

    # --- COGS from VOLUME (gross margin is an OUTPUT)
    q_growth_m = monthly_from_annual(c["query_volume_growth_pa"])
    defl_m = monthly_from_annual(-c["inference_deflation_pa"])
    queries_base = (c["tracked_prompts_per_customer"] * c["engines_monitored"]
                    * c["runs_per_prompt_per_month"])
    queries = np.array([queries_base * ((1 + q_growth_m) ** m)
                        for m in range(M)])
    cost_q = np.array([c["cost_per_query"] * ((1 + defl_m) ** m) for m in range(M)])
    cogs_inference = coh["ent_customers"] * queries * cost_q

    agents_pct = np.array([yr_val(c["agents_cogs_pct"], y) for y in years])
    cogs_agents = rev_agents * agents_pct
    cogs_ss = rev_ss * c["selfserve_cogs_pct"]
    host_pct = np.array([yr_val(c["hosting_pct_of_rev"], y) for y in years])
    cogs_hosting = revenue * host_pct
    cogs_data = revenue * c["third_party_data_pct_of_rev"]
    cogs_cs = hc["pay_cs"] if c["cs_in_cogs"] else np.zeros(M)
    opex_cs = np.zeros(M) if c["cs_in_cogs"] else hc["pay_cs"]

    cogs = cogs_inference + cogs_agents + cogs_ss + cogs_hosting + cogs_data + cogs_cs
    gross_profit = revenue - cogs

    # --- non-headcount opex
    hct = hc["hc_total"]
    software = hct * o["software_per_head_pa"] / 12.0
    te = hct * o["te_per_head_pa"] / 12.0
    other_ga = hct * o["other_ga_per_head_pa"] / 12.0
    facilities = hct * o["facilities_per_head_pa"] / 12.0 + \
        np.where(hct >= o["office_step_at_headcount"], o["office_step_cost_pa"] / 12.0, 0.0)
    rnd_compute = revenue * np.array([yr_val(o["rnd_compute_pct_of_rev"], y) for y in years])
    mktg_prog = revenue * o["marketing_programs_pct_of_rev"]
    prof_fees = np.array([o["professional_fees_pa"] *
                          ((1 + o["professional_fees_growth_pa"]) ** ((y - years[0]))) / 12.0
                          for y in years])
    insurance = np.array([o["insurance_pa"] *
                          ((1 + o["insurance_growth_pa"]) ** ((y - years[0]))) / 12.0
                          for y in years])

    opex_sm = hc["pay_sm"] + opex_cs + mktg_prog + te * 0.5
    opex_rnd = hc["pay_rnd"] + software * 0.5 + rnd_compute
    opex_ga = (hc["pay_ga"] + hc["recruiting"] + prof_fees + insurance +
               facilities + other_ga + software * 0.5 + te * 0.5)
    opex_total = opex_sm + opex_rnd + opex_ga
    # Stock compensation is benchmarked against revenue, as public companies disclose it.
    sbc = revenue * p["HEADCOUNT"]["sbc_pct_of_revenue"]

    # --- capex & D&A
    capex = hc["gross_hires"] * cs_p["capex_per_new_hire"]
    step_hit = np.zeros(M)
    crossed = False
    for m in range(M):
        if not crossed and hct[m] >= o["office_step_at_headcount"]:
            step_hit[m] = cs_p["leasehold_at_office_step"]
            crossed = True
    capex = capex + step_hit

    da = np.zeros(M)
    for m in range(M):
        for k in range(max(0, m - 35), m + 1):
            da[m] += capex[k] / 36.0

    # EBITDA EXCLUDES stock compensation, which is the standard presentation.
    # SBC is shown separately and deducted to reach operating income.
    ebitda = gross_profit - opex_total
    op_income = ebitda - sbc - da

    # --- billings, deferred revenue, AR, collections
    #   Annual upfront: average 6 months unrecognised. Quarterly: average 1.5.
    def_factor = cs_p["annual_upfront_pct"] * 0.5 + cs_p["quarterly_pct"] * (1.5 / 12.0)
    deferred = core_arr * def_factor
    open_def = (p["OPENING_BASE"]["ent_arr"] + p["OPENING_BASE"]["selfserve_arr"]) * def_factor
    d_deferred = np.diff(np.concatenate([[open_def], deferred]))

    billings_core = rev_core + d_deferred
    billings_agents = np.concatenate([[0.0], rev_agents[:-1]])   # arrears
    billings = billings_core + billings_agents

    ar = billings * (cs_p["dso_days"] / 30.0)
    d_ar = np.diff(np.concatenate([[billings[0] * (cs_p["dso_days"] / 30.0)], ar]))
    bad_debt = billings * cs_p["bad_debt_pct"]

    ap = (cogs + opex_total) * (cs_p["dpo_days"] / 30.0)
    d_ap = np.diff(np.concatenate([[ap[0]], ap]))

    # --- cash roll (interest on BEGINNING balance -> no circularity)
    cash_beg = np.zeros(M); cash_end = np.zeros(M)
    interest = np.zeros(M); net_income = np.zeros(M); fcf = np.zeros(M)
    bal = p["GIVEN"]["opening_cash"]

    for m in range(M):
        cash_beg[m] = bal
        interest[m] = bal * cs_p["interest_rate_on_cash"] / 12.0
        net_income[m] = op_income[m] + interest[m]
        cf = (net_income[m] + sbc[m] + da[m]
              - d_ar[m] + d_deferred[m] + d_ap[m] - bad_debt[m] - capex[m])
        fcf[m] = cf
        bal += cf
        cash_end[m] = bal

    return {
        "core_arr": core_arr, "total_arr": total_arr,
        "revenue": revenue, "rev_ent": rev_ent, "rev_ss": rev_ss, "rev_agents": rev_agents,
        "cogs": cogs, "cogs_inference": cogs_inference, "cogs_agents": cogs_agents,
        "cogs_cs": cogs_cs, "cogs_hosting": cogs_hosting, "cogs_ss": cogs_ss,
        "cogs_data": cogs_data,
        "gross_profit": gross_profit,
        "opex_sm": opex_sm, "opex_rnd": opex_rnd, "opex_ga": opex_ga,
        "opex_total": opex_total, "opex_cs": opex_cs, "sbc": sbc, "da": da, "capex": capex,
        "ebitda": ebitda, "op_income": op_income, "net_income": net_income,
        "billings": billings, "deferred": deferred, "d_deferred": d_deferred,
        "ar": ar, "d_ar": d_ar, "ap": ap, "d_ap": d_ap,
        "interest": interest, "fcf": fcf, "cash_beg": cash_beg, "cash_end": cash_end,
        "mktg_prog": mktg_prog, "facilities": facilities, "rnd_compute": rnd_compute,
    }


# =============================================================================
# BLOCK 7 — KPIs (all OUTPUTS) + runway + diagnostic
# =============================================================================
def kpis(p, years, coh, ag, ss, hc, fin, capacity):
    total_arr = fin["total_arr"]
    out = {}

    # --- NRR / GRR from the dollar cohorts (computed, never assumed)
    nrr = np.full(M, np.nan); grr = np.full(M, np.nan)
    for m in range(12, M):
        v_now = v_then = churn_12 = 0.0
        for c in coh["cohorts"]:
            then = c.history[m - 12]
            if then > 0:
                v_then += then
                v_now += c.history[m]
                churn_12 += c.churn_history[m - 11:m + 1].sum()
        if v_then > 0:
            nrr[m] = v_now / v_then
    # GRR on a simplified basis: trailing twelve month churn over total ARR twelve months
    # ago. This charges churn from customers acquired DURING the window against the opening
    # base, so it slightly overstates churn and understates GRR by up to two points. That is
    # the conservative direction, and it is the definition the workbook can express without
    # per-cohort churn tracking, so all three artifacts agree exactly rather than approximately.
    for m in range(12, M):
        base = fin["total_arr"][m - 12]
        if base > 0:
            grr[m] = max(0.0, 1.0 - coh["churn"][m - 11:m + 1].sum() / base)
    out["nrr"], out["grr"] = nrr, grr

    out["gross_margin"] = np.where(fin["revenue"] > 0,
                                   fin["gross_profit"] / fin["revenue"], np.nan)

    # --- burn multiple (TTM net burn / TTM net new ARR)
    bm = np.full(M, np.nan)
    for m in range(12, M):
        burn = -fin["fcf"][m - 11:m + 1].sum()
        net_new = total_arr[m] - total_arr[m - 12]
        bm[m] = burn / net_new if net_new > 0 and burn > 0 else np.nan
    out["burn_multiple"] = bm

    # --- magic number (quarterly)
    mn = np.full(M, np.nan)
    for m in range(6, M):
        d_q = (fin["revenue"][m - 2:m + 1].sum() - fin["revenue"][m - 5:m - 2].sum()) * 4
        sm_prior = fin["opex_sm"][m - 5:m - 2].sum()
        if sm_prior > 0:
            mn[m] = d_q / sm_prior
    out["magic_number"] = mn

    # --- Rule of 40, ARR/FTE, CAC payback
    r40 = np.full(M, np.nan)
    for m in range(12, M):
        g = total_arr[m] / total_arr[m - 12] - 1.0
        rev_ttm = fin["revenue"][m - 11:m + 1].sum()
        margin = fin["ebitda"][m - 11:m + 1].sum() / rev_ttm if rev_ttm > 0 else 0
        r40[m] = g + margin
    out["rule_of_40"] = r40
    out["arr_per_fte"] = total_arr / hc["hc_total"]

    # CAC on two bases.
    #   BLENDED     all of S&M over new ARR. This is what a reader can recompute from the
    #               P&L, and it is the conservative number, but it charges customer success
    #               (a retention and expansion cost) against newly acquired customers.
    #   NEW BUSINESS  S&M excluding customer success. This is the true acquisition measure
    #               and the one that should drive a decision to add sellers.
    cacp = np.full(M, np.nan)
    cacp_nb = np.full(M, np.nan)
    cac_dollars = np.full(M, np.nan)
    for m in range(3, M):
        sm3 = fin["opex_sm"][m - 2:m + 1].sum()
        cs3 = hc["pay_cs"][m - 2:m + 1].sum() if not p["COGS"]["cs_in_cogs"] else 0.0
        new3 = coh["new_arr"][m - 2:m + 1].sum()
        logos3 = coh["new_logos"][m - 2:m + 1].sum()
        gm = out["gross_margin"][m]
        if new3 > 0 and not np.isnan(gm) and gm > 0:
            cacp[m] = sm3 / (new3 * gm) * 12.0
            cacp_nb[m] = (sm3 - cs3) / (new3 * gm) * 12.0
        if logos3 > 0:
            cac_dollars[m] = (sm3 - cs3) / logos3
    out["cac_payback_months"] = cacp
    out["cac_payback_new_business"] = cacp_nb
    out["cac_dollars"] = cac_dollars

    yoy = np.full(M, np.nan)
    for m in range(M):
        prior = p["GIVEN"]["opening_arr"] if m < 12 else total_arr[m - 12]
        yoy[m] = total_arr[m] / prior - 1.0
    out["arr_growth_yoy"] = yoy

    # --- runway
    min_cash = p["GIVEN"]["min_cash"]
    breach = next((m for m in range(M) if fin["cash_end"][m] < min_cash), None)
    out["breach_month"] = breach
    out["decision_month"] = (breach - p["FUNDRAISE"]["process_launch_at_runway_months"]
                             if breach is not None else None)

    runway = np.full(M, np.nan)
    for m in range(M):
        burn3 = -fin["fcf"][max(0, m - 2):m + 1].mean()
        usable = fin["cash_end"][m] - min_cash
        runway[m] = usable / burn3 if burn3 > 0 else 999.0
    out["runway_months"] = runway

    # --- DIAGNOSTIC: productive AEs the PLAN delivers vs productive AEs REQUIRED
    # to hit an ambition path. Computed per fiscal year (constant within year) so
    # it does not explode as months remaining approach zero.
    s = p["SALES"]
    ambition = p["FUNDRAISE"].get("ambition_growth", {2026: 1.00, 2027: 0.70,
                                                     2028: 0.50, 2029: 0.38, 2030: 0.30})
    req_ae = np.zeros(M); req_new_arr = np.zeros(M)
    quota_g_m = monthly_from_annual(s["quota_growth_pa"])
    for y_i in range(M // 12):
        lo, hi = y_i * 12, y_i * 12 + 12
        year = years[lo]
        arr_beg = p["GIVEN"]["opening_arr"] if lo == 0 else total_arr[lo - 1]
        target_end = arr_beg * (1.0 + yr_val(ambition, year))
        organic = coh["expansion"][lo:hi].sum() - coh["churn"][lo:hi].sum() + \
            (ag["agents_arr"][hi - 1] - (ag["agents_arr"][lo - 1] if lo > 0 else 0.0))
        gap = max(target_end - arr_beg - organic, 0.0)
        quota_yr = s["quota_annual"] * ((1 + quota_g_m) ** ((lo + hi) / 2))
        req = gap / (quota_yr * s["attainment"])
        req_new_arr[lo:hi] = gap / 12.0
        req_ae[lo:hi] = req
    out["diag_required_productive_ae"] = req_ae
    out["diag_required_new_arr_mo"] = req_new_arr
    out["diag_plan_productive_ae"] = capacity["productive_ae"]
    out["diag_ae_gap"] = req_ae - capacity["productive_ae"]

    return out


# =============================================================================
# Orchestration
# =============================================================================
def run(scenario="base"):
    p = build_params(scenario)
    dates, years, moys = month_index()

    capacity = sales_capacity(p, years)
    ss = selfserve_block(p, years)
    coh = cohort_engine(p, years, capacity, ss)
    ag = agents_block(p, years, coh)
    hc = headcount_block(p, years, capacity, coh)
    fin = financials(p, years, coh, ag, ss, hc)
    k = kpis(p, years, coh, ag, ss, hc, fin, capacity)

    df = pd.DataFrame({"date": dates, "year": years, "month": moys})
    for src in (capacity, ss, coh, ag, hc, fin, k):
        for key, val in src.items():
            if isinstance(val, np.ndarray) and val.shape == (M,):
                df[key] = val

    meta = {"breach_month": k["breach_month"], "decision_month": k["decision_month"],
            "params": p, "cohorts": coh["cohorts"]}
    return df, meta


if __name__ == "__main__":
    df, meta = run("base")
    print(df.shape)
