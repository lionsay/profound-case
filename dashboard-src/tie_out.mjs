/*
 * JavaScript to Python tie-out.
 *
 * The browser engine and the Python engine implement the same equations. This
 * asserts they agree line by line across all 60 months and all five scenarios,
 * against reference.json exported from the Python model.
 *
 * Run: node tie_out.mjs
 */
import { readFileSync } from "fs";
import { run, M } from "./engine.js";

const A = JSON.parse(readFileSync("./assumptions.json", "utf8"));
const REF = JSON.parse(readFileSync("./reference.json", "utf8"));
const TOL = 0.001;

const KEYS = ["ae_headcount", "productive_ae", "new_arr", "ss_customers", "ss_arr",
  "ent_arr", "ent_customers", "agents_arr", "agents_attach", "core_arr", "total_arr",
  "expansion", "churn", "hc_rnd", "hc_cs", "hc_sm", "hc_ga", "hc_total", "payroll",
  "revenue", "cogs", "cogs_inference", "gross_profit", "opex_sm", "opex_rnd",
  "opex_ga", "sbc", "ebitda", "deferred", "billings", "capex", "da", "interest",
  "fcf", "cash_beg", "cash_end", "nrr", "grr", "gross_margin", "burn_multiple",
  "arr_per_fte", "rule_of_40"];

let totalFail = 0;
console.log("=".repeat(84));
console.log("JAVASCRIPT TO PYTHON TIE-OUT   all scenarios, 60 months, tolerance 0.1%");
console.log("=".repeat(84));

for (const sc of Object.keys(A.SCENARIO_LABELS)) {
  const js = run(A, sc);
  const py = REF.scenarios[sc];
  let worst = 0, worstKey = "", fails = 0;

  for (const key of KEYS) {
    if (!(key in py.series)) continue;
    const pv = py.series[key], jv = js[key];
    for (let m = 0; m < M; m++) {
      const a = pv[m], b = jv[m];
      if (a === null || a === undefined) continue;
      if (b === null || b === undefined || Number.isNaN(b)) { fails++; continue; }
      const err = Math.abs(b - a) / Math.max(Math.abs(a), 1);
      if (err > worst) { worst = err; worstKey = `${key}[${m}]`; }
      if (err > TOL) fails++;
    }
  }
  const bOk = js.breach_month === py.breach_month;
  if (!bOk) fails++;
  totalFail += fails;
  const pct = (worst * 100).toFixed(5);
  console.log(`  [${fails === 0 ? "PASS" : "FAIL"}] ${A.SCENARIO_LABELS[sc].padEnd(20)}` +
    ` worst ${pct.padStart(9)}%  at ${worstKey.padEnd(22)}` +
    ` breach js=${js.breach_month} py=${py.breach_month}${bOk ? "" : "  MISMATCH"}` +
    `  cells failing ${fails}`);
}

console.log("=".repeat(84));
console.log(totalFail === 0
  ? "TIE-OUT CLEAN   the browser engine and the Python engine are identical"
  : `TIE-OUT FAILED   ${totalFail} cells outside tolerance`);
console.log("=".repeat(84));
process.exit(totalFail === 0 ? 0 : 1);
