# Methodology

How this was built, why it was built this way, and what it does not do.

---

## 1. The architecture problem, and the decision that follows from it

The exercise asks for a financial model, an interactive dashboard, and a memo. The naive approach
builds the model in Excel, reads numbers off it into a dashboard, and quotes them again in the memo.
That produces three artifacts that agree on the day they are made and drift from each other from then on.

Instead there is **one source of truth and a generator**:

```
assumptions.py          every input, with derivation and source
      |
      v
   model.py             the engine
      |
      +---> build_excel.py  ---> Profound_Operating_Model.xlsx   (live formulas, not values)
      |
      +---> export_json.py  ---> assumptions.json ---> engine.js ---> index.html
```

The workbook is **generated**, not maintained. Every one of its 12,973 formulas is written by a script
from `assumptions.py`. Changing an assumption and re-running the build propagates it to all three
artifacts. There is no step where a human copies a number from one place to another.

The dashboard runs a faithful port of the engine, cohort triangle included, rather than a simplified
summary. That matters: it means the scenario builder's sliders recompute the real model, and there is no
band outside which the dashboard and the workbook disagree.

## 2. Why there are verification harnesses

The same equations exist three times: Python, Excel formulas, JavaScript. Implementations that are
maintained in parallel drift. Rather than trusting that they will not, **the build fails when they do.**

| Harness | What it asserts |
|---|---|
| `verify_all.py` | Flips the workbook's scenario switch through all five cases, recalculates each headlessly through LibreOffice, and compares against the Python engine across all sixty months. Then runs the JavaScript tie-out. Also asserts the scenario switch means the same thing in all three artifacts. |
| `tie_out.py` | Narrower per-artifact check: workbook against engine, base case, 30 rows. |
| `tie_out.mjs` | Browser engine against Python, all five scenarios, 42 series. |
| `qa_workbook.py` | Formatting hygiene: gridlines, row 1 and column A, merged cells, hardcodes outside the Inputs tab. |
| `audit_self_reference` | Build-time guard inside `build_excel.py`. Any formula referencing its own cell fails the build. |

Current state: **all three engines agree to 0.00000% across all sixty months and all five scenarios.**

## 3. The defect log

Every one of these produced numbers that looked entirely reasonable. None would have been caught by
reading the outputs. This is the argument for the harnesses.

| # | Defect | How it was caught |
|---|---|---|
| 1 | A formula referencing its own cell, creating a circular reference that surfaced as `#VALUE!` cascades | Build-time guard, added in response |
| 2 | Ramp curve ran four months in Excel and five in Python from FY28 | Excel to Python tie-out |
| 3 | Agents attach curve anchored to the same month a year prior rather than the previous December, distorting Agents ARR by up to 77% | Excel to Python tie-out |
| 4 | Expansion and churn split used a period test where it needed a cohort age test, so cohorts reaching their first renewal after month 12 were given the wrong survival rate | In-workbook reconciliation |
| 5 | Gross hires used closing rather than opening headcount for attrition | Excel to Python tie-out |
| 6 | Four scenario inputs were not wired to the workbook's scenario switch, so two of five cases silently produced base case costs | Scenario sweep |
| 7 | The downside and freeze scenarios hired **more** sellers than the base case, so they booked more new ARR than the case they were meant to stress | Reviewer question, then decomposition |
| 8 | The scenario switch meant different things in different artifacts: position 4 was Downside + Freeze in the workbook and Agents-Led in the dashboard | `verify_all.py` switch-order assertion |
| 9 | A workbook formula with an empty argument, which Excel evaluates as **zero** rather than blank, so burn multiple read 0.00x from November 2029 instead of undefined | Reviewer question, then a gap in the harness itself |
| 10 | Gross retention was defined differently in the workbook and the engine, differing by up to two points | Widening the verification row list |

Defects 7 and 8 are worth separating out: the arithmetic was never wrong, the *meaning* was. A tie-out
that only checks the base case cannot see either of them, which is why the harness was widened.

Defect 9 is the most instructive. The comparison was skipping every cell where the engine returns an
undefined value, on the reasoning that there was nothing to compare against. That is exactly where a
formula returning zero instead of blank hides. The comparison now asserts that where the engine says
undefined, the workbook must be blank. Widening the verification row list at the same time immediately
surfaced defect 10, in a metric that had never been checked at all.

## 4. Modelling decisions

| Decision | Rationale |
|---|---|
| **The hiring plan is the input, revenue is the output** | Sales capacity, ramp, attrition and quota attainment determine bookings, and growth falls out. No growth rate is assumed anywhere. A diagnostic row shows productive AEs required for an ambition path against what the plan delivers, so the gap is visible rather than assumed away. |
| **NRR, GRR and gross margin are computed, never entered** | They fall out of retention drivers and query volume, then get compared against benchmark on a panel that shows whether the model is claiming above-benchmark performance. |
| **Cohorts are dollar denominated** | The correct basis for retention metrics. Logo churn and dollar churn differ because churned accounts are systematically smaller. A separate logo view uses a worse churn rate and does not feed the ARR calculation. |
| **The opening base is aged across twelve months** | So one twelfth faces its first renewal each month of FY26. This makes the renewal cliff explicit rather than averaging it away, which matters because nothing in the base has actually renewed yet. |
| **Customer success sits in operating expense, inside S&M** | Benchmark definitions of S&M include it, so gross margin and the S&M ratio become comparable to published comps. It also means CAC payback is reported on two bases, since the blended measure charges retention spend against new logos. |
| **EBITDA excludes stock compensation** | The standard presentation. SBC is shown separately and benchmarked against revenue, which is how public companies disclose it. |
| **Interest runs off the opening cash balance** | Avoids a circular reference. Stated rather than discovered. |
| **Cost of revenue is driven by volume** | Inference cost is queries times cost per query, not a percentage of revenue, because for an AI-native business the volume relationship is the interesting one. |

## 5. What this model does not do

Stated rather than silently omitted.

- **R&D spend has no revenue return.** The model charges the full cost of product investment and credits
  it with nothing. The base case therefore understates the return on its own plan, and no part of the
  recommendation rests on modelled returns to R&D.
- **Agents is modelled as subscription-shaped.** Attach rate times ACV gives it a contracted ARR shape,
  which a consumption product does not have. Billing in arrears is modelled, which is the part that
  matters most for cash. Usage variability, overage and in-account ramp are not.
- **Retention is exogenous.** It is not a function of customer success investment.
- **Gross retention uses a simplified basis.** Trailing twelve month churn over total ARR twelve months
  ago. This charges churn from customers acquired *during* the window against the opening base, so it
  overstates churn and understates GRR by up to two points. That is the conservative direction, and it is
  the definition the workbook can express without per-cohort churn tracking, so all three artifacts agree
  exactly rather than approximately.
- **Burn multiple is flattered by float.** It is a cash metric, and annual prepay suppresses cash burn.
  It never exceeds 1.0x in this model, which is why it is not part of the raise gate.
- **No forecast balance sheet**, no debt structures, no detailed cap table or waterfall, no FX
  translation, no ASC 606 commission capitalisation, no multi-entity transfer pricing.

## 6. The weakest input

Query volume per customer is the least observable driver. It is decomposed as tracked prompts times
engines monitored times monthly runs, so the arguable number is 2,000 tracked prompts rather than an
opaque 600,000 queries. Ten engines is a published product fact; daily refresh is the core value
proposition. Across the plausible range the base case moves between no breach and a FY28 breach, while
the downside requirement stays between roughly $80M and $120M. The recommendation rests on the downside,
which is why it holds across that range.
