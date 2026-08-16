/* Profound operating model — dashboard interaction and charts.
 * Charts are hand-built SVG so the page has no external dependencies. */

const $ = (s) => document.querySelector(s);
const el = (t, a = {}, kids = []) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", t);
  for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
  for (const c of [].concat(kids)) n.appendChild(c);
  return n;
};
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5"];
const cssv = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const fM = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const a = Math.abs(v), sign = v < 0 ? "\u2212" : "";
  if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "B";
  return sign + "$" + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
};
const fK = (v) => v == null ? "n/a" : "$" + Math.round(v / 1e3).toLocaleString() + "K";
const fP = (v, d = 0) => v == null ? "n/a" : (v * 100).toFixed(d) + "%";
const fN = (v, d = 0) => v == null ? "n/a" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
const fX = (v) => v == null ? "n/a" : v.toFixed(2) + "x";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mlabel = (i) => MON[i % 12] + "-" + String(26 + Math.floor(i / 12));

const SCN = Object.keys(A.SCENARIO_LABELS);
const RUNS = {};
SCN.forEach((s) => { RUNS[s] = run(A, s); });
const BASE = RUNS.base;

/* ------------------------------------------------------------------ charts */
function lineChart(host, opts) {
  const { series, hline, yFmt = fM, height = 300, tip, labelLast = true } = opts;
  const W = host.clientWidth || 760, H = height;
  const P = { t: 14, r: labelLast ? 96 : 20, b: 26, l: 56 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const n = series[0].values.length;
  let lo = Infinity, hi = -Infinity;
  for (const s of series) for (const v of s.values) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    if (v < lo) lo = v; if (v > hi) hi = v;
  }
  if (hline != null) { lo = Math.min(lo, hline); hi = Math.max(hi, hline); }
  const pad = (hi - lo) * 0.08 || 1;
  const ok = (v) => v !== null && v !== undefined && !Number.isNaN(v);
  const allPos = series.every((s) => s.values.every((v) => !ok(v) || v >= 0)) && (hline == null || hline >= 0);
  lo = allPos ? Math.max(0, lo - pad) : lo - pad;
  hi += pad;
  const X = (i) => P.l + (i / (n - 1)) * iw;
  const Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * ih;

  const g = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  const ticks = 5;
  for (let k = 0; k <= ticks; k++) {
    const v = lo + (hi - lo) * (k / ticks), y = Y(v);
    g.appendChild(el("line", { x1: P.l, x2: P.l + iw, y1: y, y2: y, stroke: cssv("--grid"), "stroke-width": 1 }));
    const t = el("text", { x: P.l - 9, y: y + 4, "text-anchor": "end", fill: cssv("--text-muted"),
      "font-size": 11, "font-variant-numeric": "tabular-nums" });
    t.textContent = yFmt(v); g.appendChild(t);
  }
  for (let i = 0; i < n; i += 12) {
    const t = el("text", { x: X(i), y: H - 6, "text-anchor": "middle", fill: cssv("--text-muted"), "font-size": 11 });
    t.textContent = mlabel(i); g.appendChild(t);
  }
  if (hline != null) {
    g.appendChild(el("line", { x1: P.l, x2: P.l + iw, y1: Y(hline), y2: Y(hline),
      stroke: cssv("--critical"), "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
    const t = el("text", { x: P.l + 6, y: Y(hline) - 7, fill: cssv("--critical"), "font-size": 11, "font-weight": 600 });
    t.textContent = opts.hlabel || "$25M floor"; g.appendChild(t);
  }
  series.forEach((s) => {
    let d = "", pen = false;
    s.values.forEach((v, i) => {
      if (!ok(v)) { pen = false; return; }
      d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true;
    });
    g.appendChild(el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2,
      "stroke-linejoin": "round", "stroke-linecap": "round", opacity: s.dim ? 0.5 : 1,
      ...(s.dash ? { "stroke-dasharray": s.dash } : {}) }));
    if (labelLast) {
      let li = n - 1; while (li > 0 && !ok(s.values[li])) li--;
      const t = el("text", { x: P.l + iw + 8, y: Y(s.values[li]) + 4, fill: s.color,
        "font-size": 11.5, "font-weight": 620 });
      t.textContent = s.name; g.appendChild(t);
    }
  });

  const cross = el("line", { y1: P.t, y2: P.t + ih, stroke: cssv("--axis"), "stroke-width": 1, opacity: 0 });
  g.appendChild(cross);
  const dots = series.map((s) => {
    const c = el("circle", { r: 4.5, fill: s.color, stroke: cssv("--surface-1"), "stroke-width": 2, opacity: 0 });
    g.appendChild(c); return c;
  });
  const hit = el("rect", { x: P.l, y: P.t, width: iw, height: ih, fill: "transparent" });
  g.appendChild(hit);
  if (tip) {
    hit.addEventListener("mousemove", (e) => {
      const r = g.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width * W - P.l) / iw * (n - 1))));
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("opacity", 1);
      dots.forEach((c, k) => {
        const v = series[k].values[i];
        if (!ok(v)) { c.setAttribute("opacity", 0); return; }
        c.setAttribute("cx", X(i)); c.setAttribute("cy", Y(v)); c.setAttribute("opacity", 1);
      });
      tip.innerHTML = `<div class="th">${mlabel(i)}</div>` + series.map((s) =>
        `<div class="row"><span><span class="dot" style="background:${s.color}"></span>${s.name}</span><span>${ok(s.values[i]) ? yFmt(s.values[i]) : "n/a"}</span></div>`).join("");
      tip.style.opacity = 1;
      const left = Math.min(Math.max(X(i) / W * r.width - 90, 0), r.width - 190);
      tip.style.left = left + "px"; tip.style.top = "8px";
    });
    hit.addEventListener("mouseleave", () => {
      tip.style.opacity = 0; cross.setAttribute("opacity", 0); dots.forEach((c) => c.setAttribute("opacity", 0));
    });
  }
  host.innerHTML = ""; host.appendChild(g);
}

function barChart(host, opts) {
  const { items, yFmt = fM, height = 300, tip, horizontal = false } = opts;
  const W = host.clientWidth || 520, H = height;
  const g = el("svg", { viewBox: `0 0 ${W} ${H}` });
  if (horizontal) {
    const P = { t: 8, r: 74, b: 8, l: 156 };
    const iw = W - P.l - P.r, rh = (H - P.t - P.b) / items.length;
    const mx = Math.max(...items.map((d) => Math.abs(d.value))) || 1;
    items.forEach((d, i) => {
      const y = P.t + i * rh + rh * 0.18, h = rh * 0.64;
      const w = Math.abs(d.value) / mx * iw;
      g.appendChild(el("rect", { x: P.l, y, width: Math.max(w, 2), height: h, rx: 4, fill: d.color }));
      const lb = el("text", { x: P.l - 10, y: y + h / 2 + 4, "text-anchor": "end",
        fill: cssv("--text-secondary"), "font-size": 11.5 });
      lb.textContent = d.name; g.appendChild(lb);
      const vl = el("text", { x: P.l + w + 8, y: y + h / 2 + 4, fill: cssv("--text-primary"),
        "font-size": 11.5, "font-weight": 620, "font-variant-numeric": "tabular-nums" });
      vl.textContent = yFmt(d.value); g.appendChild(vl);
      if (tip) {
        const hz = el("rect", { x: 0, y: P.t + i * rh, width: W, height: rh, fill: "transparent" });
        hz.addEventListener("mousemove", () => {
          tip.innerHTML = `<div class="th">${d.name}</div><div class="row"><span>${d.note || "Swing"}</span><span>${yFmt(d.value)}</span></div>`;
          tip.style.opacity = 1; tip.style.left = "12px"; tip.style.top = (P.t + i * rh) + "px";
        });
        hz.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
        g.appendChild(hz);
      }
    });
  } else {
    const P = { t: 16, r: 12, b: 58, l: 58 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b, bw = iw / items.length;
    const vmax = Math.max(0, ...items.map((d) => d.value));
    const vmin = Math.min(0, ...items.map((d) => d.value));
    const span = (vmax - vmin) || 1;
    const zero = P.t + (vmax / span) * ih;
    items.forEach((d, i) => {
      const h = Math.abs(d.value) / span * ih;
      const x = P.l + i * bw + bw * 0.16, w = bw * 0.68;
      const y = d.value >= 0 ? zero - h : zero;
      g.appendChild(el("rect", { x, y, width: w, height: Math.max(h, 2), rx: 4, fill: d.color }));
      const v = el("text", { x: x + w / 2, y: d.value >= 0 ? y - 8 : y + h + 15, "text-anchor": "middle",
        fill: cssv("--text-primary"), "font-size": 11.5, "font-weight": 620 });
      v.textContent = yFmt(d.value); g.appendChild(v);
      d.name.split("\n").forEach((line, k) => {
        const t = el("text", { x: x + w / 2, y: H - 30 + k * 13, "text-anchor": "middle",
          fill: cssv("--text-muted"), "font-size": 11 });
        t.textContent = line; g.appendChild(t);
      });
    });
    g.appendChild(el("line", { x1: P.l, x2: P.l + iw, y1: zero, y2: zero, stroke: cssv("--axis"), "stroke-width": 1 }));
  }
  host.innerHTML = ""; host.appendChild(g);
}

function areaChart(host, opts) {
  const { stack, height = 260, tip } = opts;
  const W = host.clientWidth || 760, H = height;
  const P = { t: 14, r: 92, b: 26, l: 52 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b, n = stack[0].values.length;
  const tot = new Array(n).fill(0);
  stack.forEach((s) => s.values.forEach((v, i) => tot[i] += v));
  const hi = Math.max(...tot) * 1.05;
  const X = (i) => P.l + (i / (n - 1)) * iw, Y = (v) => P.t + (1 - v / hi) * ih;
  const g = el("svg", { viewBox: `0 0 ${W} ${H}` });
  for (let k = 0; k <= 4; k++) {
    const y = Y(hi * k / 4);
    g.appendChild(el("line", { x1: P.l, x2: P.l + iw, y1: y, y2: y, stroke: cssv("--grid") }));
    const t = el("text", { x: P.l - 9, y: y + 4, "text-anchor": "end", fill: cssv("--text-muted"), "font-size": 11 });
    t.textContent = fN(hi * k / 4); g.appendChild(t);
  }
  const base = new Array(n).fill(0);
  stack.forEach((s) => {
    const top = base.map((b, i) => b + s.values[i]);
    const d = top.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("")
      + base.slice().reverse().map((v, j) => `L${X(n - 1 - j).toFixed(1)},${Y(v).toFixed(1)}`).join("") + "Z";
    g.appendChild(el("path", { d, fill: s.color, opacity: 0.9, stroke: cssv("--surface-1"), "stroke-width": 2 }));
    const t = el("text", { x: P.l + iw + 8, y: Y((top[n - 1] + base[n - 1]) / 2) + 4, fill: s.color,
      "font-size": 11.5, "font-weight": 620 });
    t.textContent = s.name; g.appendChild(t);
    for (let i = 0; i < n; i++) base[i] = top[i];
  });
  for (let i = 0; i < n; i += 12) {
    const t = el("text", { x: X(i), y: H - 6, "text-anchor": "middle", fill: cssv("--text-muted"), "font-size": 11 });
    t.textContent = mlabel(i); g.appendChild(t);
  }
  const hit = el("rect", { x: P.l, y: P.t, width: iw, height: ih, fill: "transparent" });
  g.appendChild(hit);
  if (tip) {
    hit.addEventListener("mousemove", (e) => {
      const r = g.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width * W - P.l) / iw * (n - 1))));
      tip.innerHTML = `<div class="th">${mlabel(i)}</div>` + stack.map((s) =>
        `<div class="row"><span><span class="dot" style="background:${s.color}"></span>${s.name}</span><span>${fN(s.values[i])}</span></div>`).join("")
        + `<div class="row" style="margin-top:4px;font-weight:640"><span>Total</span><span>${fN(tot[i])}</span></div>`;
      tip.style.opacity = 1;
      tip.style.left = Math.min(Math.max(X(i) / W * r.width - 90, 0), r.width - 190) + "px";
      tip.style.top = "8px";
    });
    hit.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
  }
  host.innerHTML = ""; host.appendChild(g);
}

/* ------------------------------------------------------------- aggregation */
const yearIdx = [0, 1, 2, 3, 4].map((y) => ({ lo: y * 12, hi: y * 12 + 12, label: "FY" + (2026 + y) }));
const sum = (a, lo, hi) => { let s = 0; for (let i = lo; i < hi; i++) s += a[i]; return s; };
const last = (a, hi) => a[hi - 1];

/* ------------------------------------------------------------------- tiles */
function tile(k, v, d, bench) {
  return `<div class="card tile"><div class="k">${k}</div><div class="v">${v}</div>
    <div class="d">${d}</div>${bench || ""}</div>`;
}
function benchLine(ok, txt) {
  return `<div class="bench" style="color:${ok ? "var(--success-text)" : "var(--text-secondary)"}">
    <span class="dot" style="background:${ok ? "var(--good)" : "var(--warning)"}"></span>${txt}</div>`;
}

function renderFindings() {
  const b = BASE, d = RUNS.downside;
  /* The strength gate is the ARR milestone. Burn multiple is deliberately not part of
   * it: it never exceeds 1.0x anywhere in the model, so it would confirm rather than
   * test. Crossing $100M is the condition that actually binds. */
  let gateIdx = -1;
  for (let i = 0; i < 60; i++) {
    if (BASE.total_arr[i] >= A.FUNDRAISE.milestone_arr) { gateIdx = i; break; }
  }
  const gateTxt = gateIdx < 0 ? "not reached" : mlabel(gateIdx);
  const breachTxt = b.breach_month === null ? "No breach in five years" : mlabel(b.breach_month);
  const decTxt = b.decision_month === null || b.decision_month < 0 ? "Not required" : mlabel(b.decision_month);
  $("#tiles").innerHTML =
    tile("Peak capital need, downside", fM(d.capital_need), "Base case needs " + fM(b.capital_need),
      benchLine(false, "The requirement lives here, not in the base")) +
    tile("Launch the process", "Q1 2027",
      "$100M ARR crossed " + gateTxt + ". Necessity gate not until " + decTxt) +
    tile("Trough cash, base", fM(b.trough), "In " + mlabel(b.trough_month) + " against a $25M floor") +
    tile("FY30 ARR, base", fM(b.total_arr[59]),
      fP(Math.pow(b.total_arr[59] / A.GIVEN.opening_arr, 1 / 5) - 1) +
      " CAGR from $55M, " + fK(b.arr_per_fte[59]) + " per employee");

  const cacN = BASE.cac_payback_new_business || [];
  const cacDeterioration = fP((cacN[59] / cacN[11]) - 1);
  let below = 0;
  for (let i = 0; i < 60; i++) if (d.cash_end[i] < A.GIVEN.min_cash) below++;

  $("#recommendation").innerHTML =
    `<b>Recommendation. Raise $150M to $200M, with the process launched in Q1 2027</b>, gated on passing
     $100M ARR rather than on a cash level. That range is where Series D rounds at this ARR clear, and at
     plausible marks it costs 4% to 6% dilution.
     <br><br>
     <b>Why raise, when the base case barely needs it.</b> The base case needs ${fM(b.capital_need)},
     which is noise. The reason to raise is not the base case. It is that the two things this plan
     depends on are the two things with no evidence behind them yet.
     <br><br>
     Retention is the first. Nothing in the opening base has faced a renewal. A first renewal cohort
     landing at 88.5% rather than 92% turns a ${fM(b.capital_need)} requirement into
     <b>${fM(d.capital_need)}</b>, and the company spends ${below} months below the cash floor getting
     there. There is no way to know which of those worlds you are in until late 2027, by which point the
     financing decision has been made for you.
     <br><br>
     Acquisition efficiency is the second. CAC payback on new business runs
     <b>${cacN[11].toFixed(0)} months today and ${cacN[59].toFixed(0)} by FY30</b>, a
     ${cacDeterioration} deterioration driven by quota decay and lengthening ramp. Every month of delay
     buys a less productive seller than the month before. Capital deployed into sales in 2027 works
     materially harder than the same capital in 2029.
     <br><br>
     <b>Why Q1 2027 rather than later.</b> Two dates matter and they sit two quarters apart. ARR crosses
     $100M in <b>${gateTxt}</b>, so Q1 2027 is the first window with a full quarter of post milestone
     actuals to put in front of an investor. The necessity gate, eighteen months ahead of the base case
     breach in ${breachTxt}, is <b>${decTxt}</b>. Raising at the first tells the story that growth is
     compounding and the round funds capturing more of it. Raising at the second tells the story that the
     round extends runway.`;

  const cashSeries = SCN.map((s, i) => ({
    name: A.SCENARIO_LABELS[s], color: cssv(SERIES[i]), values: Array.from(RUNS[s].cash_end),
    width: s === "base" ? 2.5 : 2,
  }));
  $("#cashlegend").innerHTML = cashSeries.map((s) =>
    `<span class="lg"><span class="sw" style="background:${s.color}"></span>${s.name}</span>`).join("") +
    `<span class="lg"><span class="sw" style="background:var(--critical)"></span>$25M floor</span>`;
  lineChart($("#cashchart"), { series: cashSeries, hline: A.GIVEN.min_cash, tip: $("#cashtip"), height: 330 });

  const N = 60;
  const eb = sum(BASE.ebitda, 0, N), sbc = sum(BASE.sbc, 0, N);
  const ddef = BASE.deferred[N - 1] - (A.GIVEN.opening_arr *
    (A.CASH.annual_upfront_pct * 0.5 + A.CASH.quarterly_pct * 1.5 / 12));
  const intr = sum(BASE.interest, 0, N), fcf = sum(BASE.fcf, 0, N);
  barChart($("#bridgechart"), {
    items: [
      { name: "EBITDA\nex-SBC", value: eb, color: cssv("--critical") },
      { name: "Stock\ncomp", value: sbc, color: cssv("--s3") },
      { name: "Deferred\nrevenue", value: ddef, color: cssv("--s1") },
      { name: "Interest\nincome", value: intr, color: cssv("--s3") },
      { name: "Free cash\nflow", value: fcf, color: cssv("--s2") },
    ], tip: $("#bridgetip"), height: 290,
  });

  tornadoChart($("#tornado"), tornado(), $("#tortip"));

  const cacB = Array.from(BASE.cac_payback_months || []);
  const cacNb = Array.from(BASE.cac_payback_new_business || []);
  $("#caclegend").innerHTML =
    `<span class="lg"><span class="sw" style="background:${cssv("--s1")}"></span>New business only, excludes customer success</span>` +
    `<span class="lg"><span class="sw" style="background:${cssv("--s2")}"></span>Blended, all sales and marketing</span>` +
    `<span class="lg"><span class="sw" style="background:var(--critical)"></span>18 month benchmark</span>`;
  lineChart($("#cacchart"), {
    series: [
      { name: "New business", color: cssv("--s1"), values: cacNb, width: 2.5 },
      { name: "Blended", color: cssv("--s2"), values: cacB, width: 2 },
    ],
    hline: 18, hlabel: "18 month benchmark", yFmt: (v) => v.toFixed(0) + " mo",
    tip: $("#cactip"), height: 260, labelLast: false,
  });

  const rows = SCN.map((s) => {
    const r = RUNS[s];
    return `<tr${s === "base" ? ' class="strong"' : ""}><td>${A.SCENARIO_LABELS[s]}</td>
      <td>${fM(r.total_arr[11])}</td><td>${fM(r.total_arr[35])}</td><td>${fM(r.total_arr[59])}</td>
      <td>${fN(r.hc_total[59])}</td><td>${fK(r.arr_per_fte[59])}</td><td>${fM(r.trough)}</td>
      <td>${r.breach_month === null ? "None" : mlabel(r.breach_month)}</td>
      <td>${r.capital_need > 0 ? fM(r.capital_need) : "—"}</td></tr>`;
  }).join("");
  $("#scntable").innerHTML = `<thead><tr><th>Scenario</th><th>FY26 ARR</th><th>FY28 ARR</th>
    <th>FY30 ARR</th><th>FY30 heads</th><th>ARR per FTE</th><th>Trough cash</th>
    <th>Breach</th><th>Capital need</th></tr></thead><tbody>${rows}</tbody>`;
}

/* ---------------------------------------------------------------- tornado */
const DRIVERS = [
  { key: "RETENTION.first_renewal_survival", name: "First renewal survival", short: "First renewal survival",
    lo: 0.84, hi: 0.96, tlo: 0.88, thi: 0.95, base: A.RETENTION.first_renewal_survival, fmt: (v) => fP(v, 1), step: 0.005,
    note: "The least proven number in the business" },
  { key: "SALES.attainment", name: "Quota attainment", short: "Quota attainment", lo: 0.60, hi: 0.90, tlo: 0.70, thi: 0.85,
    base: A.SALES.attainment, fmt: (v) => fP(v, 0), step: 0.01, note: "Benchmark 70% median, 80% top quartile" },
  { key: "RETENTION.seat_expansion_pa", name: "Seat expansion, FY26", short: "Seat expansion", lo: 0.10, hi: 0.32, tlo: 0.17, thi: 0.27,
    base: A.RETENTION.seat_expansion_pa["2026"], fmt: (v) => fP(v, 0), step: 0.005,
    note: "Later years scale with this" },
  { key: "AGENTS.attach_by_yearend", name: "Agents attach, FY26", short: "Agents attach", lo: 0.03, hi: 0.20, tlo: 0.05, thi: 0.12,
    base: A.AGENTS.attach_by_yearend["2026"], fmt: (v) => fP(v, 0), step: 0.005,
    note: "Biggest swing, weakest benchmark" },
  { key: "CASH.annual_upfront_pct", name: "Billed annually upfront", short: "Annual upfront billing", lo: 0.40, hi: 0.90, tlo: 0.55, thi: 0.75,
    base: A.CASH.annual_upfront_pct, fmt: (v) => fP(v, 0), step: 0.01,
    note: "Drives the deferred revenue cushion" },
  { key: "COGS.tracked_prompts_per_customer", name: "Tracked prompts per customer", short: "Query volume", lo: 600, hi: 4000, tlo: 1200, thi: 3000,
    base: A.COGS.tracked_prompts_per_customer, fmt: (v) => fN(v), step: 50,
    note: "Least observable input in the model" },
  { key: "SALES.ae_hires_per_month", name: "AE hires per month, FY26", short: "AE hiring pace", lo: 0.8, hi: 5.0, tlo: 1.6, thi: 3.0,
    base: A.SALES.ae_hires_per_month["2026"], fmt: (v) => v.toFixed(1), step: 0.1,
    note: "Later years scale with this" },
  { key: "HEADCOUNT.rnd_hires_per_month", name: "R&D hires per month, FY26", short: "R&D hiring pace", lo: 3, hi: 16, tlo: 4, thi: 9,
    base: A.HEADCOUNT.rnd_hires_per_month["2026"], fmt: (v) => v.toFixed(1), step: 0.5,
    note: "Later years scale with this" },
];

function tornado() {
  const base = BASE.trough;
  return DRIVERS.map((d) => {
    const lo = run(A, "base", { [d.key]: d.tlo }).trough - base;
    const hi = run(A, "base", { [d.key]: d.thi }).trough - base;
    return { name: d.short || d.name, lo, hi, value: Math.abs(hi - lo),
      loLabel: d.fmt(d.tlo), hiLabel: d.fmt(d.thi) };
  }).sort((a, b) => b.value - a.value);
}

/* Two sided tornado, centred on the base case. Left reduces the requirement, right raises it. */
function tornadoChart(host, items, tip) {
  const W = host.clientWidth || 520, H = 24 + items.length * 34;
  const P = { t: 10, r: 20, b: 30, l: 132 };
  const iw = W - P.l - P.r, rh = (H - P.t - P.b) / items.length;
  const mx = Math.max(...items.map((d) => Math.max(Math.abs(d.lo), Math.abs(d.hi)))) || 1;
  const cx = P.l + iw / 2;
  const X = (v) => cx + (v / mx) * (iw / 2);
  const g = el("svg", { viewBox: `0 0 ${W} ${H}` });
  g.appendChild(el("line", { x1: cx, x2: cx, y1: P.t, y2: P.t + items.length * rh,
    stroke: cssv("--axis"), "stroke-width": 1 }));

  items.forEach((d, i) => {
    const y = P.t + i * rh + rh * 0.2, h = rh * 0.6;
    [[d.lo, d.loLabel], [d.hi, d.hiLabel]].forEach(([v, lab]) => {
      const col = v < 0 ? cssv("--s2") : cssv("--s3");
      const x0 = Math.min(cx, X(v)), w = Math.abs(X(v) - cx);
      g.appendChild(el("rect", { x: x0, y, width: Math.max(w, 1.5), height: h, rx: 3, fill: col }));
    });
    const lb = el("text", { x: P.l - 12, y: y + h / 2 + 4, "text-anchor": "end",
      fill: cssv("--text-secondary"), "font-size": 11 });
    lb.textContent = d.name; g.appendChild(lb);
    if (tip) {
      const hz = el("rect", { x: 0, y: P.t + i * rh, width: W, height: rh, fill: "transparent" });
      hz.addEventListener("mousemove", () => {
        tip.innerHTML = `<div class="th">${d.name}</div>` +
          `<div class="row"><span><span class="dot" style="background:${d.lo < 0 ? cssv("--s2") : cssv("--s3")}"></span>at ${d.loLabel}</span><span>${d.lo >= 0 ? "+" : "\u2212"}${fM(Math.abs(d.lo))} trough</span></div>` +
          `<div class="row"><span><span class="dot" style="background:${d.hi < 0 ? cssv("--s2") : cssv("--s3")}"></span>at ${d.hiLabel}</span><span>${d.hi >= 0 ? "+" : "\u2212"}${fM(Math.abs(d.hi))} trough</span></div>`;
        tip.style.opacity = 1; tip.style.left = "12px"; tip.style.top = (P.t + i * rh) + "px";
      });
      hz.addEventListener("mouseleave", () => { tip.style.opacity = 0; });
      g.appendChild(hz);
    }
  });
  [["\u2190 lower trough cash", P.l, "start"], ["higher trough cash \u2192", W - 2, "end"]]
    .forEach(([txt, x, anchor]) => {
      const t = el("text", { x, y: H - 8, "text-anchor": anchor, fill: cssv("--text-muted"), "font-size": 10.5 });
      t.textContent = txt; g.appendChild(t);
    });
  host.innerHTML = ""; host.appendChild(g);
}

/* ---------------------------------------------------------------- builder */
let curScn = "base", overrides = {};

function renderBuilder() {
  $("#scnbtns").innerHTML = SCN.map((s) =>
    `<button class="scn" data-s="${s}" aria-pressed="${s === curScn}">${A.SCENARIO_LABELS[s]}</button>`).join("");
  $("#scnbtns").querySelectorAll(".scn").forEach((b) => b.onclick = () => {
    curScn = b.dataset.s; overrides = {}; renderBuilder(); });

  const scnBase = run(A, curScn);
  $("#sliders").innerHTML = DRIVERS.map((d, i) => {
    const cur = overrides[d.key] ?? defaultFor(d, curScn);
    return `<div class="sl"><label><span class="nm">${d.name}</span>
      <span class="val" id="v${i}">${d.fmt(cur)}</span></label>
      <input type="range" min="${d.lo}" max="${d.hi}" step="${d.step}" value="${cur}" data-i="${i}">
      <div class="slnote">${d.note}</div></div>`;
  }).join("");
  $("#sliders").querySelectorAll("input").forEach((inp) => {
    inp.oninput = () => {
      const d = DRIVERS[inp.dataset.i];
      overrides[d.key] = parseFloat(inp.value);
      $("#v" + inp.dataset.i).textContent = d.fmt(parseFloat(inp.value));
      updateBuilder();
    };
  });
  $("#reset").onclick = () => { overrides = {}; renderBuilder(); };
  updateBuilder();
}

function defaultFor(d, scn) {
  const p = buildParams(A, scn, {});
  const [b, f] = d.key.split(".");
  const v = p[b][f];
  return (v !== null && typeof v === "object") ? v[Object.keys(v).sort()[0]] : v;
}

function delta(v, base, fmt, goodIfLower) {
  const diff = v - base;
  if (Math.abs(diff) < 1e-9) return `<div class="d">Same as base case</div>`;
  const good = goodIfLower ? diff < 0 : diff > 0;
  return `<div class="d ${good ? "up" : "down"}">${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))} vs base</div>`;
}

function updateBuilder() {
  const r = run(A, curScn, overrides);
  const b = BASE;
  const breach = r.breach_month === null ? "No breach" : mlabel(r.breach_month);
  const dec = r.decision_month === null || r.decision_month < 0 ? "Not required" : mlabel(r.decision_month);
  $("#btiles").innerHTML =
    tile("Capital need", fM(r.capital_need), "") .replace("<div class=\"d\"></div>",
      delta(r.capital_need, b.capital_need, fM, true)) +
    tile("Trough cash", fM(r.trough), "").replace("<div class=\"d\"></div>",
      delta(r.trough, b.trough, fM, false)) +
    tile("Raise decision", dec, "Breach in " + breach) +
    tile("FY26 ARR", fM(r.total_arr[11]), "").replace("<div class=\"d\"></div>",
      delta(r.total_arr[11], b.total_arr[11], fM, false)) +
    tile("FY30 ARR", fM(r.total_arr[59]), "").replace("<div class=\"d\"></div>",
      delta(r.total_arr[59], b.total_arr[59], fM, false));

  lineChart($("#bcash"), {
    series: [
      { name: "Base", color: cssv("--text-muted"), values: Array.from(b.cash_end), dim: true, dash: "5 4" },
      { name: "Live", color: cssv("--s1"), values: Array.from(r.cash_end), width: 2.5 },
    ], hline: A.GIVEN.min_cash, tip: $("#btip"), height: 300, labelLast: false,
  });

  const rows = yearIdx.map((y) => `<tr><td>${y.label}</td>
    <td>${fM(last(r.total_arr, y.hi))}</td><td>${fP(last(r.arr_growth_yoy, y.hi))}</td>
    <td>${fM(sum(r.revenue, y.lo, y.hi))}</td><td>${fP(last(r.gross_margin, y.hi), 1)}</td>
    <td>${fM(sum(r.ebitda, y.lo, y.hi))}</td><td>${fM(sum(r.fcf, y.lo, y.hi))}</td>
    <td>${fM(last(r.cash_end, y.hi))}</td><td>${fN(last(r.hc_total, y.hi))}</td>
    <td>${fP(last(r.nrr, y.hi), 1)}</td></tr>`).join("");
  $("#btable").innerHTML = `<thead><tr><th>Year</th><th>Ending ARR</th><th>Growth</th><th>Revenue</th>
    <th>Gross margin</th><th>EBITDA ex-SBC</th><th>Free cash flow</th><th>Closing cash</th>
    <th>Headcount</th><th>NRR</th></tr></thead><tbody>${rows}</tbody>`;
}

/* ----------------------------------------------------------------- detail */
function renderDetail() {
  const b = BASE;
  const arrSeries = [
    { name: "Total ARR", color: cssv("--s1"), values: Array.from(b.total_arr), width: 2.5 },
    { name: "Core", color: cssv("--s3"), values: Array.from(b.core_arr) },
    { name: "Agents", color: cssv("--s2"), values: Array.from(b.agents_arr) },
  ];
  $("#arrlegend").innerHTML = arrSeries.map((s) =>
    `<span class="lg"><span class="sw" style="background:${s.color}"></span>${s.name}</span>`).join("");
  lineChart($("#arrchart"), { series: arrSeries, tip: $("#arrtip"), height: 300 });

  $("#arrtable").innerHTML = `<thead><tr><th>Year</th><th>Beginning</th><th>New</th><th>Expansion</th>
    <th>Churn</th><th>Agents</th><th>Ending</th><th>Growth</th></tr></thead><tbody>` +
    yearIdx.map((y, i) => {
      const beg = i === 0 ? A.GIVEN.opening_arr : last(b.total_arr, y.lo);
      const agDelta = last(b.agents_arr, y.hi) - (i === 0 ? 0 : last(b.agents_arr, y.lo));
      return `<tr><td>${y.label}</td><td>${fM(beg)}</td><td>${fM(sum(b.new_arr, y.lo, y.hi))}</td>
        <td>${fM(sum(b.expansion, y.lo, y.hi))}</td><td>−${fM(sum(b.churn, y.lo, y.hi)).replace("$", "$")}</td>
        <td>${fM(agDelta)}</td><td>${fM(last(b.total_arr, y.hi))}</td>
        <td>${fP(last(b.arr_growth_yoy, y.hi))}</td></tr>`;
    }).join("") + "</tbody>";

  $("#pltable").innerHTML = `<thead><tr><th>Year</th><th>Revenue</th><th>Cost of revenue</th>
    <th>Gross profit</th><th>Gross margin</th><th>S&amp;M</th><th>R&amp;D</th><th>G&amp;A</th>
    <th>EBITDA ex-SBC</th><th>Margin</th></tr></thead><tbody>` +
    yearIdx.map((y) => {
      const rev = sum(b.revenue, y.lo, y.hi), eb = sum(b.ebitda, y.lo, y.hi);
      return `<tr><td>${y.label}</td><td>${fM(rev)}</td><td>${fM(sum(b.cogs, y.lo, y.hi))}</td>
        <td>${fM(sum(b.gross_profit, y.lo, y.hi))}</td><td>${fP(last(b.gross_margin, y.hi), 1)}</td>
        <td>${fM(sum(b.opex_sm, y.lo, y.hi))}</td><td>${fM(sum(b.opex_rnd, y.lo, y.hi))}</td>
        <td>${fM(sum(b.opex_ga, y.lo, y.hi))}</td><td>${fM(eb)}</td><td>${fP(eb / rev, 1)}</td></tr>`;
    }).join("") + "</tbody>";

  const B = A.BENCHMARKS;
  const mark = (ok) => `<span class="dot" style="background:${ok ? "var(--good)" : "var(--warning)"};display:inline-block;margin-right:6px"></span>`;
  $("#kpitable").innerHTML = `<thead><tr><th>Year</th><th>NRR</th><th>GRR</th><th>Gross margin</th>
    <th>Burn multiple</th><th>Rule of 40</th><th>CAC $ / logo</th><th>CAC payback, new business</th><th>CAC payback, blended</th>
    <th>ARR per FTE</th></tr></thead><tbody>` +
    yearIdx.map((y) => {
      const nrr = last(b.nrr, y.hi), grr = last(b.grr, y.hi), gm = last(b.gross_margin, y.hi);
      const bm = last(b.burn_multiple, y.hi), r40 = last(b.rule_of_40, y.hi), af = last(b.arr_per_fte, y.hi);
      const cp = last(b.cac_payback_months || [], y.hi);
      const cn = last(b.cac_payback_new_business || [], y.hi);
      const cd = last(b.cac_dollars || [], y.hi);
      return `<tr><td>${y.label}</td>
        <td>${nrr == null ? "n/a" : mark(nrr > B.nrr_median) + fP(nrr, 1)}</td>
        <td>${grr == null ? "n/a" : mark(grr > B.grr_median) + fP(grr, 1)}</td>
        <td>${mark(gm > B.gross_margin_saas) + fP(gm, 1)}</td>
        <td>${bm == null ? "n/a" : mark(bm < B.burn_multiple_good) + fX(bm)}</td>
        <td>${r40 == null ? "n/a" : mark(r40 > 0.40) + fP(r40)}</td>
        <td>${cd == null ? "n/a" : fK(cd)}</td>
        <td>${cn == null ? "n/a" : mark(cn < 18) + cn.toFixed(0) + " mo"}</td>
        <td>${cp == null ? "n/a" : mark(cp < 18) + cp.toFixed(0) + " mo"}</td>
        <td>${fK(af)}</td></tr>`;
    }).join("") + "</tbody>" +
    `<tfoot><tr><td colspan="9" style="color:var(--text-muted);font-size:11.5px;padding-top:9px;border:none">
      Benchmarks: NRR 115% median and 128% top quartile, GRR 89% and 94%, burn multiple below 1.00x,
      gross margin 78%, CAC payback under eighteen months. CAC payback is shown on two bases because
      customer success sits inside sales and marketing: the new business measure excludes it and is the
      acquisition number, the blended measure includes it and is what a reader can recompute from the
      P&amp;L. Sources are cited on the Inputs tab of the workbook.
    </td></tr></tfoot>`;

  const hcStack = [
    { name: "R&D", color: cssv("--s1"), values: Array.from(b.hc_rnd) },
    { name: "S&M and CS", color: cssv("--s2"), values: Array.from(b.hc_sm).map((v, i) => v + b.hc_cs[i]) },
    { name: "G&A", color: cssv("--s3"), values: Array.from(b.hc_ga) },
  ];
  $("#hclegend").innerHTML = hcStack.map((s) =>
    `<span class="lg"><span class="sw" style="background:${s.color}"></span>${s.name}</span>`).join("");
  areaChart($("#hcchart"), { stack: hcStack, tip: $("#hctip"), height: 270 });
}

/* -------------------------------------------------------------- interface */
function renderAll() { renderFindings(); renderBuilder(); renderDetail(); }

document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", x === t));
  ["findings", "builder", "detail"].forEach((v) =>
    document.getElementById("view-" + v).classList.toggle("hidden", v !== t.dataset.view));
  requestAnimationFrame(renderAll);
});
$("#theme").onclick = () => {
  const dark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  $("#theme").textContent = dark ? "Dark" : "Light";
  renderAll();
};
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(renderAll, 140); });
renderAll();
