"""
Profound Operating Model — Assumptions
=======================================
SINGLE SOURCE OF TRUTH. Every input the model consumes lives here and nowhere else.
The Excel workbook and the JS dashboard are both generated from this file.

Convention: nothing in the engine is hardcoded. If a number appears in model.py
that is not traceable to this file, it is a defect.

Scenario structure: base values below; SCENARIOS holds deltas/overrides.
"""

# =============================================================================
# 0. GIVEN — the four prompt assumptions, and their interpretation
# =============================================================================
GIVEN = {
    "opening_arr": 55_000_000.0,        # $55M ARR as of Jan 2026 (opening balance 1-Jan-26)
    "opening_cash": 110_000_000.0,      # $110M starting cash
    "opening_headcount": 250,           # 250 employees
    "min_cash": 25_000_000.0,           # Minimum cash balance requirement
}

# Interpretations (documented in the register):
#   - opening_arr is ENDING CONTRACTED ARR at 31-Dec-25 = opening balance 1-Jan-26
#   - opening_cash assumed post-Series-C; NO further financing in base case
#   - min_cash is a board operating floor, not zero. Usable cash = 110 - 25 = $85M
#   - raise DECISION must precede the breach; see FUNDRAISE below

# =============================================================================
# 1. TIME
# =============================================================================
TIME = {
    "start_year": 2026,
    "start_month": 1,          # Jan 2026
    "months": 60,              # 5 years: Jan-2026 through Dec-2030
    "fy_start_month": 1,       # Fiscal year = calendar year (starts January)
}

# Timing conventions (stated, not implied):
#   - New ARR lands at MONTH END, recognises from the FOLLOWING month
#   - Interest income calculated on BEGINNING cash (avoids circular reference)
#   - Opening balances (ARR, cash, headcount) are as at 1-Jan-2026

# =============================================================================
# 2. REVENUE — opening base split
# =============================================================================
# Reconciliation: Fortune describes 700+ ENTERPRISE customers. Self-serve logos
# sit on top of that count. To tie to the given $55.0M total:
#   Enterprise  ~700 customers @ ~$76.4K ACV = $53.5M
#   Self-serve  ~500 customers @ ~$3.0K ACV  =  $1.5M
OPENING_BASE = {
    "ent_arr": 53_500_000.0,
    "ent_customers": 700,
    "selfserve_arr": 1_500_000.0,
    "selfserve_customers": 500,
    "agents_arr": 0.0,          # Agents excluded from the $55M — pure growth vector
}

# =============================================================================
# 3. SALES CAPACITY — drives NEW enterprise ARR (Option A: plan drives revenue)
# =============================================================================
SALES = {
    # Opening S&M composition (75 heads = 30% of 250)
    "opening_aes": 30,
    "opening_sdrs": 20,
    "opening_mktg": 13,
    "opening_salesops": 8,

    # Productivity
    "quota_annual": 1_300_000.0,     # Fully-ramped AE annual quota (top of commercial band)
    "attainment": 0.78,              # Top-quartile (benchmark median 70%)
    "quota_growth_pa": -0.05,        # DECLINES: territories thin as the org scales 5x.
    # ACV growth is a tailwind, territory thinning a headwind. Net: productivity per
    # rep falls. Modelling it as rising is the classic capacity-model error.

    # Ramp — 4 months in FY26 drifting to 5 by FY28 (two-product sale, higher ACV)
    "ramp_months_by_year": {2026: 4, 2027: 4, 2028: 5, 2029: 5, 2030: 5},
    "ramp_curve": [0.25, 0.50, 0.75, 1.00],   # productivity by month of ramp
    "ramp_curve_5mo": [0.20, 0.40, 0.60, 0.80, 1.00],

    # Hiring
    "time_to_hire_months": 2,        # req approved -> start date
    # Sales headcount grows SLOWER than ARR - that is the expansion-led thesis.
    "ae_hires_per_month": {2026: 2.2, 2027: 2.6, 2028: 2.8, 2029: 2.6, 2030: 2.2},
    "sdr_per_ae": 0.80,
    "mktg_per_ae": 0.45,
    "salesops_per_ae": 0.30,

    # Sales enablement — explicit investment that holds ramp at the short end
    "enablement_heads_per_20_aes": 1.0,
}

# =============================================================================
# 4. RETENTION & EXPANSION — DOLLAR cohort drivers
# NRR and GRR are OUTPUTS of this block, not inputs. They are computed in the
# KPI layer and benchmarked against 115%/128% (NRR) and 89%/94% (GRR).
# =============================================================================
RETENTION = {
    # Opening base cohort ageing: assume the $53.5M was acquired evenly across the
    # prior 12 months, so 1/12 of the opening base faces FIRST RENEWAL each month
    # of FY26. This makes the renewal cliff explicit rather than averaged away.
    "opening_base_spread_months": 12,

    "first_renewal_survival": 0.92,      # DOLLAR survival at month 12 (least-proven number)
    "later_renewal_survival": {2026: 0.95, 2027: 0.95, 2028: 0.955, 2029: 0.96, 2030: 0.96},
    "in_contract_churn_pa": 0.005,       # Rare with annual contracts

    # Expansion within retained accounts
    # Steep decay is not optional: expansion rates compress hard as accounts saturate.
    "seat_expansion_pa": {2026: 0.22, 2027: 0.16, 2028: 0.100, 2029: 0.065, 2030: 0.045},
    "renewal_price_uplift": 0.08,        # Applied at each renewal event
    "cross_sell_uplift": {2026: 0.11, 2027: 0.08, 2028: 0.05, 2029: 0.035, 2030: 0.025},

    # Logo cohort view — churn runs WORSE than dollar churn (churned accounts are
    # systematically smaller). Reported separately; does not feed the ARR math.
    "logo_churn_premium": 0.03,          # logo survival = dollar survival - 3pts
}

# =============================================================================
# 5. PRICING / ACV
# =============================================================================
ACV = {
    # DERIVATION of opening enterprise ACV:
    #   Total ARR (given)                                       $55.0M
    #   less self serve: ~500 accounts on the published $99 and
    #     $399 monthly tiers, blended ~$3.0K annual              ($1.5M)
    #   = enterprise ARR                                         $53.5M
    #   over 700+ enterprise customers (Fortune, Series C)      /    700
    #   = ACV                                                    $76,429
    # This puts the motion in the COMMERCIAL band rather than true enterprise, which is
    # why quota and ramp are benchmarked to commercial norms despite Fortune 500 logos.
    "ent_new_logo_acv": 76_428.57,
    "ent_acv_growth_pa": 0.10,           # Product surface expands -> ACV climbs
    "selfserve_acv": 3_000.0,            # Blend of $99 and $399 tiers annualised
    "selfserve_acv_growth_pa": 0.05,
}

# =============================================================================
# 6. SELF-SERVE — kept as a real (small) line: top-of-funnel + competitive block
# =============================================================================
SELFSERVE = {
    "new_customers_per_month": 45,
    "new_cust_growth_pa": 0.25,
    "monthly_churn": 0.040,              # PLG churn is structurally high
    "monthly_conv_to_ent": 0.010,        # Converts INTO enterprise — the strategic value
}

# =============================================================================
# 7. AGENTS — second revenue stream, usage-based, billed in ARREARS
# Attach rate is the single biggest swing factor and the weakest benchmark.
# =============================================================================
AGENTS = {
    # % of enterprise customers with Agents, at each year end
    "attach_by_yearend": {2026: 0.08, 2027: 0.18, 2028: 0.30, 2029: 0.38, 2030: 0.45},
    "acv_pct_of_core": 0.45,             # Agents ACV as % of core enterprise ACV
    "acv_growth_pa": 0.12,
    "billed_in_arrears": True,           # Reverses the deferred-revenue cash benefit
}

# =============================================================================
# 8. COGS — driven by VOLUME, not as a % of revenue. GM is an OUTPUT.
# =============================================================================
COGS = {
    # Query volume is decomposed rather than stated as one opaque number, because
    # 600,000 per customer per month invites disbelief while its components do not.
    #   2,000 tracked prompts  x  10 engines  x  30 runs per month  =  600,000
    # Ten engines is a published product fact (Enterprise tier covers all ten).
    # Daily refresh is the core value proposition, since AI answers change constantly.
    # Tracked prompts per customer is the only genuinely soft input of the three, and
    # is set for a large multi brand enterprise. This is the least observable driver in
    # the model; see the sensitivity note on the Inputs tab.
    "tracked_prompts_per_customer": 2_000,
    "engines_monitored": 10,
    "runs_per_prompt_per_month": 30,
    "query_volume_growth_pa": 0.15,      # More engines, more prompts, deeper monitoring
    # DERIVED, not plugged. One tracked prompt costs:
    #   engine execution  ~250 input + ~600 output tokens at a mid tier blend
    #                     (Gemini 2.5 Flash $0.30 / $2.50 per M as representative) = $0.001575
    #   extraction pass   ~700 input + ~150 output on a budget model
    #                     (GPT-4.1 Nano $0.10 / $0.40 per M)                       = $0.000130
    #   gross                                                                      = $0.001705
    #   less ~30% for batch processing (50% off) and prompt caching (up to 90% off
    #   cached input; brand prompt sets repeat on every run)
    # Source: CloudZero LLM API pricing comparison, 2026.
    "cost_per_query": 0.00120,
    "inference_deflation_pa": 0.22,      # Observed token-price decline; partially offsets volume

    "agents_cogs_pct": {2026: 0.40, 2027: 0.37, 2028: 0.34, 2029: 0.32, 2030: 0.30},
    "selfserve_cogs_pct": 0.25,

    "hosting_pct_of_rev": {2026: 0.06, 2027: 0.055, 2028: 0.05, 2029: 0.045, 2030: 0.04},
    "third_party_data_pct_of_rev": 0.02,
    "cs_in_cogs": False,                 # POLICY: customer success payroll sits in OPERATING
    # EXPENSE, inside S&M. Benchmark definitions of S&M include customer success, so this
    # makes both gross margin and the S&M ratio comparable to published comps.                  # POLICY: CS payroll sits in COGS
}

# =============================================================================
# 9. HEADCOUNT & COMP — all US-based (simplification; disclosed)
# Opening 250: R&D 40% / S&M 30% / CS 18% / G&A 12%
# The S&M share sits BELOW the 35-40% SaaS norm — that is the expansion-led
# thesis expressed in the org chart.
# =============================================================================
HEADCOUNT = {
    "opening_split": {"rnd": 100, "sm": 75, "cs": 45, "ga": 30},

    # AI-first staffing: fewer, more senior, more expensive people with heavy internal
    # AI leverage. High cost per head is only coherent if it buys high ARR per FTE.
    "loaded_cost": {                     # Fully loaded, incl. ~28% benefits/tax load
        "rnd": 288_000.0,
        "ae": 323_000.0,                 # incl. commission at target
        "sdr": 161_000.0,
        "mktg": 217_000.0,
        "salesops": 205_000.0,
        "cs": 182_000.0,
        "ga": 201_000.0,
    },
    "comp_inflation_pa": 0.04,

    # Attrition — sales runs materially higher and destroys CAPACITY, not just cost
    "attrition_sales_pa": 0.20,          # Best-in-class (benchmark AE 30-32%)
    "attrition_nonsales_pa": 0.08,

    "recruiting_cost_per_hire": 22_000.0,

    # Non-sales hiring plan
    "rnd_hires_per_month": {2026: 6.0, 2027: 8.0, 2028: 8.5, 2029: 8.5, 2030: 8.0},
    "ga_hires_per_month": {2026: 2.2, 2027: 3.0, 2028: 3.5, 2029: 3.5, 2030: 3.0},
    # CS coverage TIGHTENS. Expansion is a CS-delivered motion - if expansion carries
    # growth, coverage must densify. Widening it while claiming expansion-led growth
    # is internally inconsistent.
    "ent_custs_per_csm": {2026: 13, 2027: 12, 2028: 11, 2029: 11, 2030: 10},

    "sbc_pct_of_revenue": 0.15,          # Non-cash. Benchmarked against REVENUE, which is
    # how public companies disclose it. Public SaaS comps run 15% to 25% of revenue.
}

# =============================================================================
# 10. NON-HEADCOUNT OPEX
# =============================================================================
OPEX = {
    "software_per_head_pa": 12_000.0,
    "te_per_head_pa": 6_000.0,
    "other_ga_per_head_pa": 3_000.0,

    # Facilities is a STEP function, not per-head (they will outgrow the office)
    "facilities_per_head_pa": 18_000.0,
    "office_step_at_headcount": 400,
    "office_step_cost_pa": 3_000_000.0,

    "rnd_compute_pct_of_rev": {2026: 0.05, 2027: 0.055, 2028: 0.055, 2029: 0.05, 2030: 0.045},
    "marketing_programs_pct_of_rev": 0.08,
    "professional_fees_pa": 2_500_000.0,
    "professional_fees_growth_pa": 0.15,
    "insurance_pa": 1_200_000.0,
    "insurance_growth_pa": 0.10,
}

# =============================================================================
# 11. CASH / WORKING CAPITAL
# =============================================================================
CASH = {
    "annual_upfront_pct": 0.65,          # Core subscription billing mix
    "quarterly_pct": 0.35,
    "dso_days": 45,
    "dpo_days": 30,
    "bad_debt_pct": 0.005,
    "capex_per_new_hire": 4_000.0,
    "leasehold_at_office_step": 4_000_000.0,
    "capitalise_software": False,        # POLICY: expense all internal software
    "interest_rate_on_cash": 0.04,       # On BEGINNING balance
    "bonus_payout_month": 3,             # Annual bonus paid in March
}

# =============================================================================
# 12. FUNDRAISE POLICY
# =============================================================================
FUNDRAISE = {
    "process_launch_at_runway_months": 18,   # Rocket story, not Buying Time
    "milestone_arr": 100_000_000.0,
    "milestone_burn_multiple": 1.00,
    "target_post_raise_runway_months": 24,
    "illustrative_round_size": 200_000_000.0,
    "illustrative_post_money": 3_000_000_000.0,
    # Ambition path used ONLY by the diagnostic row (plan vs required capacity).
    # It is not an input to revenue — revenue comes from the hiring plan (Option A).
    "ambition_growth": {2026: 1.00, 2027: 0.70, 2028: 0.50, 2029: 0.38, 2030: 0.30},
}

# =============================================================================
# 13. SCENARIOS — internally coherent worlds. Growth, hiring and burn move TOGETHER.
# =============================================================================
SCENARIOS = {
    "base": {},

    "upside": {
        "SALES.attainment": 0.85,
        "SALES.ae_hires_per_month": {2026: 4.0, 2027: 5.2, 2028: 5.8, 2029: 5.8, 2030: 5.2},
        "RETENTION.first_renewal_survival": 0.94,
        "RETENTION.seat_expansion_pa": {2026: 0.27, 2027: 0.21, 2028: 0.135, 2029: 0.09, 2030: 0.06},
        "AGENTS.attach_by_yearend": {2026: 0.10, 2027: 0.24, 2028: 0.38, 2029: 0.47, 2030: 0.55},
        "HEADCOUNT.rnd_hires_per_month": {2026: 8.5, 2027: 11.0, 2028: 12.0, 2029: 12.0, 2030: 11.0},
    },

    "downside": {
        # The renewal cliff bites: first-renewal survival at 85%
        "SALES.attainment": 0.74,
        # Hiring is held at the BASE plan: the risk is that growth disappoints while the
        # plan is already committed. Hiring above base would make the downside book
        # more new ARR than the base case, which is not a downside at all.
        "SALES.ae_hires_per_month": {2026: 2.2, 2027: 2.6, 2028: 2.8, 2029: 2.6, 2030: 2.2},
        "RETENTION.first_renewal_survival": 0.885,
        "RETENTION.seat_expansion_pa": {2026: 0.185, 2027: 0.13, 2028: 0.08, 2029: 0.05, 2030: 0.035},
        "AGENTS.attach_by_yearend": {2026: 0.05, 2027: 0.11, 2028: 0.18, 2029: 0.23, 2030: 0.27},
        "HEADCOUNT.rnd_hires_per_month": {2026: 6.0, 2027: 8.0, 2028: 8.5, 2029: 8.5, 2030: 8.0},
    },

    # LEVER, not a scenario: downside growth PLUS the management response.
    # Demonstrates what a hiring freeze actually buys, and how fast it acts.
    "downside_with_freeze": {
        "SALES.attainment": 0.74,
        # FY26 holds the committed BASE plan; the response starts in FY27, which is when
        # management would actually have the data to react.
        "SALES.ae_hires_per_month": {2026: 2.2, 2027: 1.0, 2028: 0.8, 2029: 0.8, 2030: 0.8},
        "RETENTION.first_renewal_survival": 0.885,
        "RETENTION.seat_expansion_pa": {2026: 0.185, 2027: 0.13, 2028: 0.08, 2029: 0.05, 2030: 0.035},
        "AGENTS.attach_by_yearend": {2026: 0.05, 2027: 0.11, 2028: 0.18, 2029: 0.23, 2030: 0.27},
        "HEADCOUNT.rnd_hires_per_month": {2026: 6.0, 2027: 2.5, 2028: 2.0, 2029: 2.0, 2030: 2.0},
        "HEADCOUNT.ga_hires_per_month": {2026: 2.2, 2027: 0.8, 2028: 0.5, 2029: 0.5, 2030: 0.5},
        "HEADCOUNT.ent_custs_per_csm": {2026: 13, 2027: 15, 2028: 16, 2029: 16, 2030: 16},
    },

    # Strategic scenario: Agents becomes the primary product
    "agents_led": {
        "AGENTS.attach_by_yearend": {2026: 0.14, 2027: 0.35, 2028: 0.55, 2029: 0.70, 2030: 0.80},
        "AGENTS.acv_pct_of_core": 0.80,
        "AGENTS.acv_growth_pa": 0.18,
        "HEADCOUNT.rnd_hires_per_month": {2026: 8.0, 2027: 10.5, 2028: 11.5, 2029: 11.5, 2030: 10.5},
    },
}

SCENARIO_LABELS = {
    "base": "Base",
    "upside": "Upside",
    "downside": "Downside",
    "agents_led": "Agents-Led",
    "downside_with_freeze": "Downside + Freeze",
}

# =============================================================================
# 14. BENCHMARKS — for the self-reporting benchmark panel (outputs vs standard)
# =============================================================================
BENCHMARKS = {
    "nrr_median": 1.15, "nrr_top_quartile": 1.28,
    "grr_median": 0.89, "grr_top_quartile": 0.94,
    "burn_multiple_good": 1.00,
    "magic_number_low": 0.60, "magic_number_high": 0.85,
    "rule_of_40": 0.40,
    "gross_margin_saas": 0.78,
    "arr_per_fte_median": 200_000.0,
}
