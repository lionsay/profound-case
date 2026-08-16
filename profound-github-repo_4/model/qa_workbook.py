"""Formatting and hygiene QA on the generated workbook."""
import re, openpyxl
from xl_style import BLUE

WB = "../output/Profound_Operating_Model.xlsx"
AI_TELLS = ["—", "–", "‘", "’", "“", "”",
            "delve", "leverage the", "seamless", "robust solution"]


def main():
    wb = openpyxl.load_workbook(WB)
    issues = []
    stats = {"sheets": len(wb.worksheets), "formulas": 0, "blue_outside_inputs": 0, "cells": 0}

    for ws in wb.worksheets:
        if ws.sheet_view.showGridLines:
            issues.append(f"{ws.title}: gridlines visible")
        if ws.merged_cells.ranges:
            issues.append(f"{ws.title}: {len(ws.merged_cells.ranges)} merged ranges")
        for row in ws.iter_rows():
            for c in row:
                if c.value is None:
                    continue
                stats["cells"] += 1
                if c.row == 1:
                    issues.append(f"{ws.title}!{c.coordinate}: content in row 1")
                if c.column == 1:
                    issues.append(f"{ws.title}!{c.coordinate}: content in column A")
                if isinstance(c.value, str):
                    if c.value.startswith("="):
                        stats["formulas"] += 1
                    else:
                        for t in AI_TELLS:
                            if t in c.value:
                                issues.append(f"{ws.title}!{c.coordinate}: contains {t!r}")
                # hardcoded numeric inputs must live on Inputs only
                if (ws.title != "Inputs" and c.font and c.font.color
                        and c.font.color.rgb and BLUE in str(c.font.color.rgb)
                        and not isinstance(c.value, str)):
                    stats["blue_outside_inputs"] += 1
                    if ws.title != "Scenarios":
                        issues.append(f"{ws.title}!{c.coordinate}: blue hardcode outside Inputs")

    print(f"Sheets {stats['sheets']} | populated cells {stats['cells']:,} | "
          f"live formulas {stats['formulas']:,}")
    print(f"Tab order: {', '.join(wb.sheetnames)}")
    if issues:
        print(f"\n{len(issues)} issues:")
        for i in issues[:25]:
            print("  -", i)
    else:
        print("\nNo formatting issues found.")
    return len(issues)


if __name__ == "__main__":
    raise SystemExit(0 if main() == 0 else 1)
