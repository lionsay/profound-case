/*
 * Profound Operating Model — browser engine.
 *
 * A faithful port of model.py, including the dollar cohort triangle. Not a
 * simplified summary: the sliders recompute the real model, so there is no band
 * outside which the dashboard and the workbook disagree.
 *
 * Assumptions are loaded from assumptions.json, which is exported from
 * assumptions.py. Nothing here is transcribed by hand.
 *
 * tie_out.mjs asserts this file matches the Python engine line by line across
 * all 60 months and all five scenarios.
 */

export const M = 60;

const yrVal = (d, year) => {
  if (d === null || typeof d !== "object") return d;
  if (year in d) return d[year];
  const keys = Object.keys(d).map(Number).sort((a, b) => a - b);
  return d[keys[keys.length - 1]];
};

const mGrow = (annual) => Math.pow(1 + annual, 1 / 12) - 1;

const clone = (o) => JSON.parse(JSON.stringify(o));

/* Assemble a parameter set: base assumptions, scenario overrides, then any
 * live slider overrides on top. */
export function buildParams(A, scenario = "base", overrides = {}) {
  const p = {
    GIVEN: clone(A.GIVEN), TIME: clone(A.TIME), OPENING_BASE: clone(A.OPENING_BASE),
    SALES: clone(A.SALES), RETENTION: clone(A.RETENTION), ACV: clone(A.ACV),
    SELFSERVE: clone(A.SELFSERVE), AGENTS: clone(A.AGENTS), COGS: clone(A.COGS),
    HEADCOUNT: clone(A.HEADCOUNT), OPEX: clone(A.OPEX), CASH: clone(A.CASH),
    FUNDRAISE: clone(A.FUNDRAISE),
  };
  const sc = A.SCENARIOS[scenario] || {};
  for (const [key, val] of Object.entries(sc)) {
    const [block, field] = key.split(".");
    p[block][field] = clone(val);
  }
  for (const [key, val] of Object.entries(overrides)) {
    if (val === null || val === undefined) continue;
    const [block, field] = key.split(".");
    const cur = p[block][field];
    if (cur !== null && typeof cur === "object") {
      // scale a per-year schedule by the ratio the slider implies at its first year
      const keys = Object.keys(cur).map(Number).sort((a, b) => a - b);
      const ratio = cur[keys[0]] !== 0 ? val / cur[keys[0]] : 1;
      const next = {};
      for (const y of keys) next[y] = cur[y] * ratio;
      p[block][field] = next;
    } else {
      p[block][field] = val;
    }
  }
  return p;
}

export function monthIndex(A) {
  const dates = [], years = [];
  let y = A.TIME.start_year, mo = A.TIME.start_month;
  for (let i = 0; i < M; i++) {
    dates.push(new Date(Date.UTC(y, mo, 0)));
    years.push(y);
    mo += 1;
    if (mo > 12) { mo = 1; y += 1; }
  }
  return { dates, years };
}

/* ---------------------------------------------------------------- capacity */
function salesCapacity(p, years) {
  const s = p.SALES, attr = p.HEADCOUNT.attrition_sales_pa / 12;
  const hires = new Float64Array(M), hc = new Float64Array(M);
  const prod = new Float64Array(M), attrition = new Float64Array(M);
  const lag = s.time_to_hire_months;

  for (let m = 0; m < M; m++) hires[m] = yrVal(s.ae_hires_per_month, years[Math.max(m - lag, 0)]);

  let prev = s.opening_aes;
  for (let m = 0; m < M; m++) {
    attrition[m] = prev * attr;
    hc[m] = prev * (1 - attr) + hires[m];
    prev = hc[m];
  }
  for (let m = 0; m < M; m++) {
    const L = yrVal(s.ramp_months_by_year, years[m]);
    const curve = L === 4 ? s.ramp_curve : s.ramp_curve_5mo;
    let drag = 0;
    for (let k = 0; k < 5; k++) {
      const f = k < curve.length ? curve[k] : 1.0;
      if (m - k >= 0) drag += hires[m - k] * (1 - f);
    }
    prod[m] = Math.max(hc[m] - drag, 0);
  }
  return { ae_hires: hires, ae_headcount: hc, productive_ae: prod, ae_attrition: attrition };
}

/* -------------------------------------------------------------- self serve */
function selfServe(p) {
  const ss = p.SELFSERVE, acv = p.ACV;
  const cust = new Float64Array(M), arr = new Float64Array(M), conv = new Float64Array(M);
  let c = p.OPENING_BASE.selfserve_customers;
  const g = mGrow(ss.new_cust_growth_pa), ag = mGrow(acv.selfserve_acv_growth_pa);
  for (let m = 0; m < M; m++) {
    const adds = ss.new_customers_per_month * Math.pow(1 + g, m);
    const churned = c * ss.monthly_churn;
    const converted = c * ss.monthly_conv_to_ent;
    c = c - churned - converted + adds;
    conv[m] = converted; cust[m] = c;
    arr[m] = c * acv.selfserve_acv * Math.pow(1 + ag, m);
  }
  return { ss_customers: cust, ss_arr: arr, ss_conv_to_ent: conv };
}

/* --------------------------------------------------- dollar cohort triangle */
function cohortEngine(p, years, cap, ss) {
  const r = p.RETENTION, s = p.SALES, acv = p.ACV;
  const n = r.opening_base_spread_months;
  const slice = p.OPENING_BASE.ent_arr / n;

  const cohorts = [];
  for (let i = 0; i < n; i++) {
    cohorts.push({ age: n - i, arr: slice, hist: new Float64Array(M + 1), churn: new Float64Array(M + 1) });
  }

  const entArr = new Float64Array(M), newArr = new Float64Array(M);
  const expansion = new Float64Array(M), churn = new Float64Array(M);
  const newLogos = new Float64Array(M), entCust = new Float64Array(M);

  const acvG = mGrow(acv.ent_acv_growth_pa), quotaG = mGrow(s.quota_growth_pa);
  const icChurn = r.in_contract_churn_pa / 12;
  let logo = p.OPENING_BASE.ent_customers;

  for (let m = 0; m < M; m++) {
    const year = years[m];
    const seatM = mGrow(yrVal(r.seat_expansion_pa, year));
    const cross = yrVal(r.cross_sell_uplift, year);
    const laterSurv = yrVal(r.later_renewal_survival, year);
    let expM = 0, chM = 0;

    for (const c of cohorts) {
      c.age += 1;
      const before = c.arr;
      c.arr *= (1 + seatM);
      expM += c.arr - before;

      const lost = c.arr * icChurn;
      c.arr -= lost; chM += lost; c.churn[m] = lost;

      if (c.age % 12 === 0) {
        const surv = c.age === 12 ? r.first_renewal_survival : laterSurv;
        const lostR = c.arr * (1 - surv);
        c.arr -= lostR; chM += lostR; c.churn[m] += lostR;
        const preUp = c.arr;
        c.arr *= (1 + r.renewal_price_uplift + cross);
        expM += c.arr - preUp;
      }
    }

    const quotaNow = s.quota_annual * Math.pow(1 + quotaG, m);
    let booked = cap.productive_ae[m] * (quotaNow / 12) * s.attainment;
    const acvNow = acv.ent_new_logo_acv * Math.pow(1 + acvG, m);
    booked += ss.ss_conv_to_ent[m] * acvNow;

    cohorts.push({ age: 0, arr: booked, hist: new Float64Array(M + 1), churn: new Float64Array(M + 1) });

    newArr[m] = booked; expansion[m] = expM; churn[m] = chM;
    newLogos[m] = acvNow > 0 ? booked / acvNow : 0;

    let total = 0;
    for (const c of cohorts) { c.hist[m] = c.arr; total += c.arr; }
    entArr[m] = total;

    const logoPen = r.logo_churn_premium / 12;
    logo = logo * (1 - icChurn - logoPen) + newLogos[m];
    if (m < 12) {
      logo -= (p.OPENING_BASE.ent_customers / 12) * (1 - (r.first_renewal_survival - r.logo_churn_premium));
    }
    entCust[m] = Math.max(logo, 0);
  }
  return { ent_arr: entArr, new_arr: newArr, expansion, churn, new_logos: newLogos,
           ent_customers: entCust, cohorts };
}

/* ------------------------------------------------------------------ agents */
function agentsBlock(p, years, coh) {
  const a = p.AGENTS, acv = p.ACV;
  const attach = new Float64Array(M), arr = new Float64Array(M), cust = new Float64Array(M);
  const agG = mGrow(a.acv_growth_pa);
  let prevYearEnd = 0;
  for (let m = 0; m < M; m++) {
    const target = yrVal(a.attach_by_yearend, years[m]);
    if (m % 12 === 0) prevYearEnd = m > 0 ? attach[m - 1] : 0;
    attach[m] = prevYearEnd + (target - prevYearEnd) * (((m % 12) + 1) / 12);
    cust[m] = coh.ent_customers[m] * attach[m];
    const agAcv = acv.ent_new_logo_acv * a.acv_pct_of_core * Math.pow(1 + agG, m);
    arr[m] = cust[m] * agAcv;
  }
  return { agents_attach: attach, agents_arr: arr, agents_customers: cust };
}

/* --------------------------------------------------------------- headcount */
function headcountBlock(p, years, cap, coh) {
  const h = p.HEADCOUNT, s = p.SALES, ns = h.attrition_nonsales_pa / 12;
  const rnd = new Float64Array(M), ga = new Float64Array(M), cs = new Float64Array(M);
  const sdr = new Float64Array(M), mktg = new Float64Array(M);
  const sops = new Float64Array(M), enable = new Float64Array(M);
  const gross = new Float64Array(M);
  let rc = h.opening_split.rnd, gc = h.opening_split.ga;

  for (let m = 0; m < M; m++) {
    const year = years[m];
    const rh = yrVal(h.rnd_hires_per_month, year), gh = yrVal(h.ga_hires_per_month, year);
    const rLost = rc * ns, gLost = gc * ns;
    gross[m] = rh + rLost + gh + gLost + cap.ae_hires[m] + cap.ae_attrition[m];
    rc = rc + rh; gc = gc + gh;
    rnd[m] = rc; ga[m] = gc;
    const ae = cap.ae_headcount[m];
    sdr[m] = ae * s.sdr_per_ae; mktg[m] = ae * s.mktg_per_ae;
    sops[m] = ae * s.salesops_per_ae; enable[m] = ae / 20 * s.enablement_heads_per_20_aes;
    cs[m] = Math.max(coh.ent_customers[m] / yrVal(h.ent_custs_per_csm, year),
                     h.opening_split.cs * 0.5);
  }

  const smTotal = new Float64Array(M), total = new Float64Array(M);
  const payRnd = new Float64Array(M), payCs = new Float64Array(M);
  const payGa = new Float64Array(M), paySm = new Float64Array(M), payroll = new Float64Array(M);
  const lc = h.loaded_cost, inf = mGrow(h.comp_inflation_pa);

  for (let m = 0; m < M; m++) {
    smTotal[m] = cap.ae_headcount[m] + sdr[m] + mktg[m] + sops[m] + enable[m];
    total[m] = rnd[m] + ga[m] + cs[m] + smTotal[m];
    const esc = Math.pow(1 + inf, m);
    payRnd[m] = rnd[m] * lc.rnd / 12 * esc;
    payCs[m] = cs[m] * lc.cs / 12 * esc;
    payGa[m] = ga[m] * lc.ga / 12 * esc;
    paySm[m] = (cap.ae_headcount[m] * lc.ae + sdr[m] * lc.sdr + mktg[m] * lc.mktg
                + (sops[m] + enable[m]) * lc.salesops) / 12 * esc;
    payroll[m] = payRnd[m] + payCs[m] + payGa[m] + paySm[m];
  }
  const recruiting = new Float64Array(M);
  for (let m = 0; m < M; m++) recruiting[m] = gross[m] * h.recruiting_cost_per_hire;

  return { hc_rnd: rnd, hc_ga: ga, hc_cs: cs, hc_sm: smTotal, hc_total: total,
           gross_hires: gross, pay_rnd: payRnd, pay_cs: payCs, pay_ga: payGa,
           pay_sm: paySm, payroll, recruiting };
}

/* -------------------------------------------------------------- financials */
function financials(p, years, coh, ag, ss, hc) {
  const c = p.COGS, o = p.OPEX, cp = p.CASH;
  const core = new Float64Array(M), totalArr = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    core[m] = coh.ent_arr[m] + ss.ss_arr[m];
    totalArr[m] = core[m] + ag.agents_arr[m];
  }

  const revCore = new Float64Array(M), revAg = new Float64Array(M);
  const revSs = new Float64Array(M), revenue = new Float64Array(M), revEnt = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    const begCore = m === 0 ? p.OPENING_BASE.ent_arr + p.OPENING_BASE.selfserve_arr : core[m - 1];
    const begAg = m === 0 ? 0 : ag.agents_arr[m - 1];
    const begSs = m === 0 ? p.OPENING_BASE.selfserve_arr : ss.ss_arr[m - 1];
    revCore[m] = begCore / 12; revAg[m] = begAg / 12; revSs[m] = begSs / 12;
    revenue[m] = revCore[m] + revAg[m]; revEnt[m] = revCore[m] - revSs[m];
  }

  const qGrow = mGrow(c.query_volume_growth_pa), defl = mGrow(-c.inference_deflation_pa);
  const qBase = c.tracked_prompts_per_customer * c.engines_monitored * c.runs_per_prompt_per_month;
  const cogs = new Float64Array(M), cogsInf = new Float64Array(M), gp = new Float64Array(M);
  const opexSm = new Float64Array(M), opexRnd = new Float64Array(M), opexGa = new Float64Array(M);
  const opexTotal = new Float64Array(M), sbc = new Float64Array(M);
  const ebitda = new Float64Array(M), capex = new Float64Array(M);
  const mktgProg = new Float64Array(M);

  let crossed = false;
  for (let m = 0; m < M; m++) {
    const year = years[m];
    const q = qBase * Math.pow(1 + qGrow, m);
    const cq = c.cost_per_query * Math.pow(1 + defl, m);
    cogsInf[m] = coh.ent_customers[m] * q * cq;
    const cogsAg = revAg[m] * yrVal(c.agents_cogs_pct, year);
    const cogsSs = revSs[m] * c.selfserve_cogs_pct;
    const cogsHost = revenue[m] * yrVal(c.hosting_pct_of_rev, year);
    const cogsData = revenue[m] * c.third_party_data_pct_of_rev;
    const cogsCs = c.cs_in_cogs ? hc.pay_cs[m] : 0;
    cogs[m] = cogsInf[m] + cogsAg + cogsSs + cogsHost + cogsData + cogsCs;
    gp[m] = revenue[m] - cogs[m];

    const hct = hc.hc_total[m];
    const software = hct * o.software_per_head_pa / 12;
    const te = hct * o.te_per_head_pa / 12;
    const otherGa = hct * o.other_ga_per_head_pa / 12;
    const facilities = hct * o.facilities_per_head_pa / 12
      + (hct >= o.office_step_at_headcount ? o.office_step_cost_pa / 12 : 0);
    const rndCompute = revenue[m] * yrVal(o.rnd_compute_pct_of_rev, year);
    mktgProg[m] = revenue[m] * o.marketing_programs_pct_of_rev;
    const prof = o.professional_fees_pa * Math.pow(1 + o.professional_fees_growth_pa, year - years[0]) / 12;
    const ins = o.insurance_pa * Math.pow(1 + o.insurance_growth_pa, year - years[0]) / 12;
    const opexCs = c.cs_in_cogs ? 0 : hc.pay_cs[m];

    opexSm[m] = hc.pay_sm[m] + opexCs + mktgProg[m] + te * 0.5;
    opexRnd[m] = hc.pay_rnd[m] + software * 0.5 + rndCompute;
    opexGa[m] = hc.pay_ga[m] + hc.recruiting[m] + prof + ins + facilities + otherGa
      + software * 0.5 + te * 0.5;
    opexTotal[m] = opexSm[m] + opexRnd[m] + opexGa[m];
    sbc[m] = revenue[m] * p.HEADCOUNT.sbc_pct_of_revenue;
    ebitda[m] = gp[m] - opexTotal[m];

    capex[m] = hc.gross_hires[m] * cp.capex_per_new_hire;
    if (!crossed && hct >= o.office_step_at_headcount) {
      capex[m] += cp.leasehold_at_office_step; crossed = true;
    }
  }

  const da = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    for (let k = Math.max(0, m - 35); k <= m; k++) da[m] += capex[k] / 36;
  }

  const defFactor = cp.annual_upfront_pct * 0.5 + cp.quarterly_pct * (1.5 / 12);
  const deferred = new Float64Array(M), dDef = new Float64Array(M);
  const billings = new Float64Array(M), ar = new Float64Array(M), dAr = new Float64Array(M);
  const ap = new Float64Array(M), dAp = new Float64Array(M), badDebt = new Float64Array(M);
  const openDef = (p.OPENING_BASE.ent_arr + p.OPENING_BASE.selfserve_arr) * defFactor;

  for (let m = 0; m < M; m++) {
    deferred[m] = core[m] * defFactor;
    dDef[m] = deferred[m] - (m === 0 ? openDef : deferred[m - 1]);
    const billAg = m === 0 ? 0 : revAg[m - 1];
    billings[m] = revCore[m] + dDef[m] + billAg;
    ar[m] = billings[m] * (cp.dso_days / 30);
    dAr[m] = m === 0 ? 0 : ar[m] - ar[m - 1];
    ap[m] = (cogs[m] + opexTotal[m]) * (cp.dpo_days / 30);
    dAp[m] = m === 0 ? 0 : ap[m] - ap[m - 1];
    badDebt[m] = billings[m] * cp.bad_debt_pct;
  }

  const cashBeg = new Float64Array(M), cashEnd = new Float64Array(M);
  const interest = new Float64Array(M), netIncome = new Float64Array(M), fcf = new Float64Array(M);
  let bal = p.GIVEN.opening_cash;
  for (let m = 0; m < M; m++) {
    cashBeg[m] = bal;
    interest[m] = bal * cp.interest_rate_on_cash / 12;
    netIncome[m] = ebitda[m] - sbc[m] - da[m] + interest[m];
    fcf[m] = netIncome[m] + sbc[m] + da[m] - dAr[m] + dDef[m] + dAp[m] - badDebt[m] - capex[m];
    bal += fcf[m];
    cashEnd[m] = bal;
  }

  return { core_arr: core, total_arr: totalArr, revenue, rev_ent: revEnt, rev_ss: revSs,
           rev_agents: revAg, cogs, cogs_inference: cogsInf, gross_profit: gp,
           opex_sm: opexSm, opex_rnd: opexRnd, opex_ga: opexGa, opex_total: opexTotal,
           sbc, ebitda, capex, da, deferred, billings, interest, fcf,
           cash_beg: cashBeg, cash_end: cashEnd };
}

/* -------------------------------------------------------------------- KPIs */
function kpis(p, coh, hc, fin) {
  const nrr = new Array(M).fill(null), grr = new Array(M).fill(null);
  for (let m = 12; m < M; m++) {
    let vNow = 0, vThen = 0, ch12 = 0;
    for (const c of coh.cohorts) {
      const then = c.hist[m - 12];
      if (then > 0) {
        vThen += then; vNow += c.hist[m];
        for (let k = m - 11; k <= m; k++) ch12 += c.churn[k];
      }
    }
    if (vThen > 0) nrr[m] = vNow / vThen;
  }
  /* GRR on a simplified basis: trailing twelve month churn over total ARR twelve months ago.
   * Slightly overstates churn, which is the conservative direction, and is the definition the
   * workbook can express without per-cohort churn tracking. All three artifacts agree exactly. */
  for (let m = 12; m < M; m++) {
    const base = fin.total_arr[m - 12];
    if (base > 0) {
      let ch = 0;
      for (let k = m - 11; k <= m; k++) ch += coh.churn[k];
      grr[m] = Math.max(0, 1 - ch / base);
    }
  }
  const gm = new Array(M).fill(null), arrFte = new Float64Array(M);
  const bm = new Array(M).fill(null), r40 = new Array(M).fill(null);
  const yoy = new Float64Array(M), runway = new Array(M).fill(null);
  for (let m = 0; m < M; m++) {
    gm[m] = fin.revenue[m] > 0 ? fin.gross_profit[m] / fin.revenue[m] : null;
    arrFte[m] = fin.total_arr[m] / hc.hc_total[m];
    const prior = m < 12 ? p.GIVEN.opening_arr : fin.total_arr[m - 12];
    yoy[m] = fin.total_arr[m] / prior - 1;
  }
  for (let m = 12; m < M; m++) {
    let burn = 0, revTtm = 0, ebTtm = 0;
    for (let k = m - 11; k <= m; k++) { burn -= fin.fcf[k]; revTtm += fin.revenue[k]; ebTtm += fin.ebitda[k]; }
    const netNew = fin.total_arr[m] - fin.total_arr[m - 12];
    bm[m] = (netNew > 0 && burn > 0) ? burn / netNew : null;
    r40[m] = yoy[m] + (revTtm > 0 ? ebTtm / revTtm : 0);
  }
  const minCash = p.GIVEN.min_cash;
  for (let m = 0; m < M; m++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, m - 2); k <= m; k++) { s += fin.fcf[k]; n++; }
    const burn = -s / n;
    runway[m] = burn > 0 ? Math.max((fin.cash_end[m] - minCash) / burn, 0) : null;
  }
  /* CAC on two bases. BLENDED charges all of S&M, including customer success, against
   * newly acquired customers; it is what a reader can recompute from the P&L. NEW BUSINESS
   * excludes customer success and is the true acquisition measure. */
  const cac = new Array(M).fill(null), cacNb = new Array(M).fill(null);
  const cacDollars = new Array(M).fill(null), magic = new Array(M).fill(null);
  for (let m = 3; m < M; m++) {
    let sm3 = 0, cs3 = 0, new3 = 0, logos3 = 0;
    for (let k = m - 2; k <= m; k++) {
      sm3 += fin.opex_sm[k];
      cs3 += p.COGS.cs_in_cogs ? 0 : hc.pay_cs[k];
      new3 += coh.new_arr[k]; logos3 += coh.new_logos[k];
    }
    if (new3 > 0 && gm[m] != null && gm[m] > 0) {
      cac[m] = sm3 / (new3 * gm[m]) * 12;
      cacNb[m] = (sm3 - cs3) / (new3 * gm[m]) * 12;
    }
    if (logos3 > 0) cacDollars[m] = (sm3 - cs3) / logos3;
  }
  for (let m = 6; m < M; m++) {
    let q1 = 0, q0 = 0, smp = 0;
    for (let k = m - 2; k <= m; k++) q1 += fin.revenue[k];
    for (let k = m - 5; k <= m - 3; k++) { q0 += fin.revenue[k]; smp += fin.opex_sm[k]; }
    if (smp > 0) magic[m] = (q1 - q0) * 4 / smp;
  }
  let breach = null;
  for (let m = 0; m < M; m++) if (fin.cash_end[m] < minCash) { breach = m; break; }
  const decision = breach === null ? null : breach - p.FUNDRAISE.process_launch_at_runway_months;

  let trough = Infinity, troughMonth = 0;
  for (let m = 0; m < M; m++) if (fin.cash_end[m] < trough) { trough = fin.cash_end[m]; troughMonth = m; }

  return { nrr, grr, gross_margin: gm, burn_multiple: bm, arr_per_fte: arrFte,
           rule_of_40: r40, arr_growth_yoy: yoy, runway_months: runway,
           cac_payback_months: cac, cac_payback_new_business: cacNb,
           cac_dollars: cacDollars, magic_number: magic,
           breach_month: breach, decision_month: decision, trough, trough_month: troughMonth,
           capital_need: Math.max(minCash - trough, 0) };
}

/* --------------------------------------------------------------------- run */
export function run(A, scenario = "base", overrides = {}) {
  const p = buildParams(A, scenario, overrides);
  const { dates, years } = monthIndex(A);
  const cap = salesCapacity(p, years);
  const ss = selfServe(p);
  const coh = cohortEngine(p, years, cap, ss);
  const ag = agentsBlock(p, years, coh);
  const hc = headcountBlock(p, years, cap, coh);
  const fin = financials(p, years, coh, ag, ss, hc);
  const k = kpis(p, coh, hc, fin);
  return { dates, years, params: p, ...cap, ...ss, ...coh, ...ag, ...hc, ...fin, ...k };
}
