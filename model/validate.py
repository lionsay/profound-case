"""
Phase 2 — Validation. Runs BEFORE any formatting work.
Internal ties, benchmark panel, and the annual summaries for review.
"""
import numpy as np
import pandas as pd
from model import run, M
from assumptions import BENCHMARKS, GIVEN, SCENARIO_LABELS

pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 50)
pd.set_option("display.float_format", lambda x: f"{x:,.2f}")

FAILS = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "**FAIL**"
    if not condition:
        FAILS.append(name)
    print(f"  [{status}] {name} {detail}")


def validate(df, meta, scenario):
    print(f"\n{'='*78}\nINTERNAL TIE-OUTS — {SCENARIO_LABELS[scenario]}\n{'='*78}")

    # 1. Cohort engine foots to the ARR bridge
    beg = np.concatenate([[meta["params"]["OPENING_BASE"]["ent_arr"]],
                          df["ent_arr"].values[:-1]])
    implied = beg + df["new_arr"] - df["churn"] + df["expansion"]
    max_err = np.abs(implied - df["ent_arr"]).max()
    check("Cohorts foot to ARR bridge", max_err < 1.0, f"(max err ${max_err:,.4f})")

    # 2. Cash roll is continuous
    err = np.abs(df["cash_beg"] + df["fcf"] - df["cash_end"]).max()
    check("Cash roll: beg + FCF = end", err < 0.01, f"(max err ${err:,.4f})")
    err2 = np.abs(df["cash_beg"].values[1:] - df["cash_end"].values[:-1]).max()
    check("Cash roll: continuous month to month", err2 < 0.01, f"(max err ${err2:,.4f})")
    check("Opening cash ties to given", abs(df["cash_beg"].iloc[0] - GIVEN["opening_cash"]) < 1)

    # 3. Deferred revenue rolls
    open_def = df["deferred"].iloc[0] - df["d_deferred"].iloc[0]
    roll = open_def + df["d_deferred"].cumsum()
    check("Deferred revenue rolls clean", np.abs(roll - df["deferred"]).max() < 0.01)

    # 4. Revenue ties to beginning ARR / 12
    beg_arr = np.concatenate([[GIVEN["opening_arr"]], df["total_arr"].values[:-1]])
    check("Revenue = beginning ARR / 12", np.abs(df["revenue"] - beg_arr / 12).max() < 1.0)

    # 5. Opening balances tie to the given four
    check("Opening ARR ties to given ($55.0M)",
          abs(meta["params"]["OPENING_BASE"]["ent_arr"] +
              meta["params"]["OPENING_BASE"]["selfserve_arr"] - GIVEN["opening_arr"]) < 1)
    check("Opening headcount ties to given (250)",
          abs(sum(meta["params"]["HEADCOUNT"]["opening_split"].values()) - 250) < 1)

    # 6. P&L internal
    check("Gross profit = revenue - COGS",
          np.abs(df["revenue"] - df["cogs"] - df["gross_profit"]).max() < 0.01)
    check("EBITDA = GP - opex - SBC",
          np.abs(df["gross_profit"] - df["opex_total"] - df["sbc"] - df["ebitda"]).max() < 0.01)

    # 7. No negative balances where impossible
    check("ARR never negative", (df["total_arr"] >= 0).all())
    check("Headcount never negative", (df["hc_total"] >= 0).all())


def annual(df, label):
    g = df.groupby("year")
    flows = ["revenue", "rev_ent", "rev_ss", "rev_agents", "cogs", "gross_profit",
             "opex_sm", "opex_rnd", "opex_ga", "sbc", "ebitda", "interest", "fcf",
             "new_arr", "expansion", "churn", "billings", "capex", "da"]
    ends = ["total_arr", "core_arr", "agents_arr", "ent_arr", "ss_arr", "cash_end",
            "hc_total", "hc_rnd", "hc_sm", "hc_cs", "hc_ga", "ae_headcount",
            "ent_customers", "deferred", "nrr", "grr", "gross_margin",
            "burn_multiple", "rule_of_40", "arr_per_fte", "arr_growth_yoy",
            "magic_number", "cac_payback_months", "runway_months", "agents_attach"]
    a = pd.concat([g[flows].sum(), g[ends].last()], axis=1)
    return a


def show(df, meta, scenario):
    a = annual(df, scenario)
    lbl = SCENARIO_LABELS[scenario]

    print(f"\n{'='*78}\nARR BRIDGE ($M) — {lbl}\n{'='*78}")
    br = pd.DataFrame({
        "Beg ARR": [GIVEN["opening_arr"] / 1e6] + list(a["total_arr"].values[:-1] / 1e6),
        "+ New": a["new_arr"].values / 1e6,
        "+ Expansion": a["expansion"].values / 1e6,
        "- Churn": -a["churn"].values / 1e6,
        "+ Agents": np.diff(np.concatenate([[0], a["agents_arr"].values])) / 1e6,
        "+ Self-serve": np.diff(np.concatenate([[1.5e6], a["ss_arr"].values])) / 1e6,
        "= End ARR": a["total_arr"].values / 1e6,
        "YoY growth": a["arr_growth_yoy"].values,
    }, index=a.index)
    print(br.to_string(float_format=lambda x: f"{x:,.1f}"))

    print(f"\n{'='*78}\nP&L ($M) — {lbl}\n{'='*78}")
    pl = pd.DataFrame({
        "Revenue": a["revenue"] / 1e6,
        "  Core ent": a["rev_ent"] / 1e6,
        "  Self-serve": a["rev_ss"] / 1e6,
        "  Agents": a["rev_agents"] / 1e6,
        "COGS": -a["cogs"] / 1e6,
        "Gross profit": a["gross_profit"] / 1e6,
        "GM %": a["gross_margin"],
        "S&M": -a["opex_sm"] / 1e6,
        "R&D": -a["opex_rnd"] / 1e6,
        "G&A": -a["opex_ga"] / 1e6,
        "SBC": -a["sbc"] / 1e6,
        "EBITDA": a["ebitda"] / 1e6,
        "EBITDA %": a["ebitda"] / a["revenue"],
    })
    print(pl.to_string(float_format=lambda x: f"{x:,.1f}"))

    print(f"\n{'='*78}\nCASH ($M) — {lbl}\n{'='*78}")
    cf = pd.DataFrame({
        "EBITDA": a["ebitda"] / 1e6,
        "+ SBC": a["sbc"] / 1e6,
        "+ D&A": a["da"] / 1e6,
        "+ Interest": a["interest"] / 1e6,
        "Billings": a["billings"] / 1e6,
        "Deferred bal": a["deferred"] / 1e6,
        "Capex": -a["capex"] / 1e6,
        "FCF": a["fcf"] / 1e6,
        "Ending cash": a["cash_end"] / 1e6,
        "Runway (mo)": a["runway_months"],
    })
    print(cf.to_string(float_format=lambda x: f"{x:,.1f}"))

    print(f"\n{'='*78}\nHEADCOUNT & KPIs — {lbl}\n{'='*78}")
    kp = pd.DataFrame({
        "Headcount": a["hc_total"],
        "  R&D": a["hc_rnd"], "  S&M": a["hc_sm"], "  CS": a["hc_cs"], "  G&A": a["hc_ga"],
        "AEs": a["ae_headcount"],
        "Ent customers": a["ent_customers"],
        "Agents attach": a["agents_attach"],
        "ARR/FTE ($K)": a["arr_per_fte"] / 1e3,
        "NRR": a["nrr"], "GRR": a["grr"],
        "Burn multiple": a["burn_multiple"],
        "Rule of 40": a["rule_of_40"],
        "Magic number": a["magic_number"],
        "CAC payback (mo)": a["cac_payback_months"],
    })
    print(kp.to_string(float_format=lambda x: f"{x:,.2f}"))
    return a


def benchmark_panel(a):
    print(f"\n{'='*78}\nBENCHMARK PANEL — computed outputs vs standard\n{'='*78}")
    rows = []
    for yr in a.index:
        rows.append({
            "Year": yr,
            "NRR": f"{a.loc[yr,'nrr']:.1%}" if not np.isnan(a.loc[yr, "nrr"]) else "n/a",
            "vs 115%/128%": ("above TQ" if a.loc[yr, "nrr"] > BENCHMARKS["nrr_top_quartile"]
                             else "above median" if a.loc[yr, "nrr"] > BENCHMARKS["nrr_median"]
                             else "below median") if not np.isnan(a.loc[yr, "nrr"]) else "-",
            "GRR": f"{a.loc[yr,'grr']:.1%}" if not np.isnan(a.loc[yr, "grr"]) else "n/a",
            "vs 89%/94%": ("above TQ" if a.loc[yr, "grr"] > BENCHMARKS["grr_top_quartile"]
                           else "above median" if a.loc[yr, "grr"] > BENCHMARKS["grr_median"]
                           else "below median") if not np.isnan(a.loc[yr, "grr"]) else "-",
            "GM": f"{a.loc[yr,'gross_margin']:.1%}",
            "Burn mult": f"{a.loc[yr,'burn_multiple']:.2f}x" if not np.isnan(a.loc[yr, "burn_multiple"]) else "n/a",
            "vs <1.0x": ("PASS" if a.loc[yr, "burn_multiple"] < 1.0 else "above")
                        if not np.isnan(a.loc[yr, "burn_multiple"]) else "-",
            "ARR/FTE": f"${a.loc[yr,'arr_per_fte']/1e3:,.0f}K",
        })
    print(pd.DataFrame(rows).to_string(index=False))


def runway_summary(df, meta, scenario):
    b, d = meta["breach_month"], meta["decision_month"]
    lbl = SCENARIO_LABELS[scenario]
    print(f"\n--- RUNWAY — {lbl} ---")
    if b is None:
        print(f"  Cash never breaches ${GIVEN['min_cash']/1e6:.0f}M floor within 60 months.")
        print(f"  Trough cash: ${df['cash_end'].min()/1e6:,.1f}M "
              f"in {df.loc[df['cash_end'].idxmin(),'date']:%b-%Y}")
        pos = df[df["fcf"] > 0]
        if len(pos):
            print(f"  First FCF-positive month: {pos['date'].iloc[0]:%b-%Y}")
    else:
        print(f"  Breaches ${GIVEN['min_cash']/1e6:.0f}M floor: {df['date'].iloc[b]:%b-%Y} (month {b+1})")
        if d is not None and d >= 0:
            print(f"  Raise DECISION date (18mo prior):  {df['date'].iloc[d]:%b-%Y}")
            print(f"    ARR at decision: ${df['total_arr'].iloc[d]/1e6:,.1f}M | "
                  f"burn multiple: {df['burn_multiple'].iloc[d]:.2f}x | "
                  f"cash: ${df['cash_end'].iloc[d]/1e6:,.1f}M")
    print(f"  Trough cash: ${df['cash_end'].min()/1e6:,.1f}M")


if __name__ == "__main__":
    results = {}
    for sc in ["base", "upside", "downside", "downside_with_freeze", "agents_led"]:
        df, meta = run(sc)
        results[sc] = (df, meta)
        if sc == "base":
            validate(df, meta, sc)
            a = show(df, meta, sc)
            benchmark_panel(a)

    print(f"\n{'='*78}\nDIAGNOSTIC — capacity gap to a doubling plan (base case, FY26)\n{'='*78}")
    df = results["base"][0]
    d = df[df["year"] == 2026][["date", "diag_plan_productive_ae",
                                "diag_required_productive_ae", "diag_ae_gap"]]
    d = d.copy(); d["date"] = d["date"].dt.strftime("%b-%y")
    print(d.to_string(index=False, float_format=lambda x: f"{x:,.1f}"))

    print(f"\n{'='*78}\nSCENARIO COMPARISON\n{'='*78}")
    rows = []
    for sc, (df, meta) in results.items():
        a = annual(df, sc)
        rows.append({
            "Scenario": SCENARIO_LABELS[sc],
            "FY26 ARR": f"${a.loc[2026,'total_arr']/1e6:,.0f}M",
            "FY26 gr": f"{a.loc[2026,'arr_growth_yoy']:.0%}",
            "FY28 ARR": f"${a.loc[2028,'total_arr']/1e6:,.0f}M",
            "FY30 ARR": f"${a.loc[2030,'total_arr']/1e6:,.0f}M",
            "Trough cash": f"${df['cash_end'].min()/1e6:,.0f}M",
            "Breach": (df['date'].iloc[meta['breach_month']].strftime('%b-%y')
                       if meta['breach_month'] is not None else "none in 5yr"),
            "FY28 burn mult": f"{a.loc[2028,'burn_multiple']:.2f}x",
            "FY30 HC": f"{a.loc[2030,'hc_total']:,.0f}",
        })
    print(pd.DataFrame(rows).to_string(index=False))

    for sc, (df, meta) in results.items():
        runway_summary(df, meta, sc)

    print(f"\n{'='*78}")
    print("VALIDATION RESULT:", "ALL CHECKS PASS" if not FAILS else f"{len(FAILS)} FAILURES: {FAILS}")
    print(f"{'='*78}")
