# Python engine and build scripts

| File | Purpose |
|---|---|
| `assumptions.py` | Every input, with derivation and source in comments. Nothing is hardcoded anywhere else. |
| `model.py` | The engine. Blocks run in strict dependency order. |
| `build_excel.py` | Generates the workbook with live Excel formulas and the full formatting standard. |
| `xl_style.py` | Formatting conventions: font colour rules, number formats, sheet geometry. |
| `export_json.py` | Exports assumptions and reference results for the dashboard. |
| `validate.py` | Engine tie-outs, benchmark panel, annual summaries, all five scenarios. |
| `verify_all.py` | The one that matters. All three engines, all five scenarios, plus switch-order consistency. |
| `tie_out.py` | Narrower per-artifact check: workbook against engine, base case. |
| `qa_workbook.py` | Formatting hygiene on the generated workbook. |

Run order is in the top-level README. `verify_all.py` requires LibreOffice.

## Font convention in the generated workbook

Applied by construction, never by hand.

| Colour | Meaning |
|---|---|
| Dark blue | Hardcoded input. Lives on the Inputs tab only. |
| Black | Calculation on this sheet |
| Purple | Reference to another cell on the same sheet |
| Dark green | Link to another sheet |
| Red | Formula that deliberately breaks the row's pattern |

Structural rules: no gridlines, nothing in row 1 or column A, no merged cells, one date header row
driving column alignment across every tab, one row equals one formula carried across all periods, and a
single scenario switch cell driving the whole model.
