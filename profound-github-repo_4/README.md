# Profound — Five Year Operating Model

**Live dashboard:** https://lionsay.github.io/profound-case/

A monthly operating model for Profound, January 2026 through December 2030, built from the four
assumptions given in the exercise: $55M ARR, $110M cash, 250 employees, and a $25M minimum cash balance.

Three artifacts, one source of truth. An Excel workbook with live formulas, an interactive dashboard,
and the Python engine that generates both. An automated harness proves all three produce identical
numbers before any of them ship.

---

## The recommendation

**Raise $150M to $200M, with the process launched in Q1 2027**, gated on passing $100M ARR rather than
on a cash level.

The base case needs $6M of capital, which is noise. The reason to raise is not the base case. It is that
the two things the plan depends on are the two things with no evidence behind them yet.

**Retention is the first.** Nothing in the opening base has faced a renewal. A first renewal cohort
landing at 88.5% rather than 92% turns a $6M requirement into **$97M**, and the company spends 35 months
below the cash floor getting there. There is no way to know which world you are in until late 2027, by
which point the financing decision has been made for you.

**Acquisition efficiency is the second.** CAC payback on new business runs 12 months today and 18 by
FY30, a 52% deterioration driven by quota decay and lengthening ramp. Capital deployed into sales in
2027 works materially harder than the same capital in 2029.

**Timing is the sharpest point.** Two dates sit two quarters apart. ARR crosses $100M in **September
2026**, so Q1 2027 is the first window with a full quarter of post milestone actuals to put in front of
an investor. The necessity gate, eighteen months ahead of the base case breach in October 2028, is April
2027. Raising at the first tells the story that growth is compounding and the round funds capturing more
of it. Raising at the second tells the story that the round extends runway.


## The finding underneath it

Cumulative EBITDA loss across the five years is $195M. Cumulative free cash flow is negative $33M.
Annual prepay billing builds deferred revenue that funds most of the reported loss, so **cash burn runs
at roughly a sixth of profit and loss burn**. That is why the base case is close to self funding, and it
is what turns this from a runway question into a capital allocation decision.

---

## Scenarios

| Scenario | FY26 ARR | FY30 ARR | FY30 heads | Trough cash | Breach | Capital need |
|---|---|---|---|---|---|---|
| Base | $123M | $729M | 1,457 | $19M | Oct-2028 | $6M |
| Upside | $144M | $1.23B | 2,163 | $20M | Apr-2028 | $5M |
| Downside | $115M | $617M | 1,440 | −$72M | Feb-2028 | **$97M** |
| Agents-Led | $131M | $1.06B | 1,613 | $7M | Apr-2028 | $18M |
| Downside + Freeze | $115M | $509M | 681 | $55M | None | — |

The freeze case is not a forecast. It isolates the management lever: holding downside growth and cutting
hiring from FY27 removes the capital requirement entirely, at a cost of $220M of FY30 ARR and 776 people.
That trade is the alternative the recommendation argues against.

---

## Repository layout

```
index.html                       Dashboard. Self contained, no external dependencies.
Profound_Operating_Model.xlsx    11 tabs, ~13,000 live Excel formulas, no pasted values.
METHODOLOGY.md                   How it is built, the defect log, what it does not do.
DEPLOY.md                        Two deployment routes.
model/                           Python engine, Excel generator, verification harnesses.
dashboard-src/                   Dashboard source before inlining, plus its own tie-out.
```

## Reproducing everything

```bash
cd model
python3 validate.py       # engine tie-outs, benchmark panel, all five scenarios
python3 build_excel.py    # regenerates the workbook from assumptions.py
python3 export_json.py    # exports assumptions and reference results for the dashboard
python3 verify_all.py     # all three engines, all five scenarios, plus switch-order consistency
python3 qa_workbook.py    # formatting QA

cd ../dashboard-src
node tie_out.mjs          # browser engine against Python, all scenarios
python3 build.py          # inlines everything into ../index.html
```

`verify_all.py` needs LibreOffice for headless recalculation. Everything else is standard Python and Node.

## Verification status

- Excel against Python: **0.00000% worst error**, all five scenarios, all sixty months
- JavaScript against Python: **0.00000% worst error**, all five scenarios
- In-workbook reconciliations: **15 of 15 passing**, and they ship inside the file rather than being
  deleted before sending
- Scenario switch order: **consistent across all three artifacts**

Ten defects were caught by these harnesses during the build, every one of which produced plausible
looking numbers. The log is in [METHODOLOGY.md](METHODOLOGY.md).

---

## Sources

Every benchmark is cited on the workbook's Inputs tab.

- Retention benchmarks, NRR 115% median and 128% top quartile, GRR 89% and 94% — Growthspree, 2026
- Sales capacity: quota, ramp, attainment, time to hire — Growthspree, 2026
- Efficiency benchmarks: burn multiple, magic number, Rule of 40 — Data-Mania, 2026
- Sales attrition by role across 939 B2B companies — Optifai
- Series D round size, valuation and dilution norms — Startups.com
- Profound customer count, funding and valuation — Fortune, February 2026
- Published pricing tiers — Profound, 2026
- Token pricing used to derive cost per query — CloudZero, 2026
