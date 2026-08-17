"""
Export assumptions and Python results to JSON.

The dashboard consumes assumptions.json directly, so the browser and the workbook
read the same source. Nothing is transcribed by hand.
"""
import json
import numpy as np
import assumptions as A
from model import run, month_index

OUT = "../dashboard"


def jsonable(o):
    if isinstance(o, dict):
        return {str(k): jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    return o


def main():
    import os
    os.makedirs(OUT, exist_ok=True)

    payload = {
        "GIVEN": A.GIVEN, "TIME": A.TIME, "OPENING_BASE": A.OPENING_BASE,
        "SALES": A.SALES, "RETENTION": A.RETENTION, "ACV": A.ACV,
        "SELFSERVE": A.SELFSERVE, "AGENTS": A.AGENTS, "COGS": A.COGS,
        "HEADCOUNT": A.HEADCOUNT, "OPEX": A.OPEX, "CASH": A.CASH,
        "FUNDRAISE": A.FUNDRAISE, "SCENARIOS": A.SCENARIOS,
        "SCENARIO_LABELS": A.SCENARIO_LABELS, "BENCHMARKS": A.BENCHMARKS,
    }
    with open(f"{OUT}/assumptions.json", "w") as f:
        json.dump(jsonable(payload), f, indent=1)

    dates, years, _ = month_index()
    ref = {"dates": [d.strftime("%Y-%m") for d in dates], "years": years.tolist(),
           "scenarios": {}}
    keys = ["ae_hires", "ae_headcount", "productive_ae", "new_arr", "ss_customers",
            "ss_arr", "ent_arr", "ent_customers", "agents_arr", "agents_attach",
            "core_arr", "total_arr", "expansion", "churn", "hc_rnd", "hc_cs",
            "hc_sm", "hc_ga", "hc_total", "payroll", "revenue", "rev_agents",
            "cogs", "cogs_inference", "gross_profit", "opex_sm", "opex_rnd",
            "opex_ga", "sbc", "ebitda", "deferred", "billings", "capex", "da",
            "interest", "fcf", "cash_beg", "cash_end", "nrr", "grr",
            "gross_margin", "burn_multiple", "arr_per_fte", "rule_of_40",
            "arr_growth_yoy", "runway_months", "magic_number",
            "cac_payback_months", "diag_required_productive_ae"]
    for sc in A.SCENARIO_LABELS:
        df, meta = run(sc)
        ref["scenarios"][sc] = {
            "series": {k: [None if (isinstance(v, float) and np.isnan(v)) else float(v)
                           for v in df[k].values] for k in keys if k in df},
            "breach_month": meta["breach_month"],
            "decision_month": meta["decision_month"],
        }
    with open(f"{OUT}/reference.json", "w") as f:
        json.dump(jsonable(ref), f)
    print(f"wrote {OUT}/assumptions.json and {OUT}/reference.json")


if __name__ == "__main__":
    main()
