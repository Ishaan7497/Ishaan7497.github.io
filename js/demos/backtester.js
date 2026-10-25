// Strategy Backtester: a browser port of backtest.py from the backtester repo.
// Same rules: the crossover signal is shifted one day (no lookahead), stop-loss
// and take-profit only look at yesterday's close, and every change of position
// pays the fee. Prices are adjusted daily closes (yfinance, auto_adjust=True).
window.DEMOS = window.DEMOS || {};
window.DEMOS.backtester = function (el) {
  const DAY = 86400000;
  const cache = {};
  let index = null, series = null, result = null, hoverI = null, alive = true;
  const s = { ticker: "SPY", from: null, to: null, fast: 20, slow: 50, stop: 5, take: 10, fee: 0.1, warm: false, period: "3Y" };

  const FAST_PRESETS = [5, 10, 15, 20, 50];
  const SLOW_PRESETS = [20, 50, 100, 150, 200];
  const PERIODS = [["1Y", 1], ["3Y", 3], ["5Y", 5], ["10Y", 10], ["Max", 0]];

  el.innerHTML = `
    <div class="bt-controls">
      <fieldset class="p-group">
        <legend>Stock &amp; dates</legend>
        <label class="p-label">Stock
          <select class="p-input" data-ticker><option>Loading…</option></select></label>
        <div class="chip-row" role="group" aria-label="Period" data-periods></div>
        <div class="date-row">
          <label class="p-label">From <input type="date" class="p-input" data-from /></label>
          <label class="p-label">To <input type="date" class="p-input" data-to /></label>
        </div>
      </fieldset>
      <fieldset class="p-group">
        <legend>Moving averages</legend>
        ${maControl("fast", "Fast", 2, 100, FAST_PRESETS)}
        ${maControl("slow", "Slow", 5, 250, SLOW_PRESETS)}
      </fieldset>
      <fieldset class="p-group">
        <legend>Risk &amp; costs</legend>
        <label class="p-label"><span class="lab-row">Stop-loss <output data-o="stop"></output></span>
          <input type="range" min="0" max="25" step="1" data-k="stop" /></label>
        <label class="p-label"><span class="lab-row">Take-profit <output data-o="take"></output></span>
          <input type="range" min="0" max="50" step="1" data-k="take" /></label>
        <label class="p-label"><span class="lab-row">Fee per trade <output data-o="fee"></output></span>
          <input type="range" min="0" max="0.5" step="0.05" data-k="fee" /></label>
        <label class="p-check"><input type="checkbox" data-warm /> Warm up averages on earlier data</label>
      </fieldset>
    </div>

    <p class="bt-readout" data-readout aria-live="polite"></p>

    <div class="p-box bt-chart" data-chart="price">
      <div class="bt-chart-head"><span>Price &amp; moving averages</span><span data-scale-price></span></div>
      <svg viewBox="0 0 640 230" class="chart" data-svg="price" role="img" aria-label="Price with fast and slow moving averages and trade markers"></svg>
      <div class="p-legend">
        <span><i style="border-top:2px solid var(--p-muted)"></i>Price</span>
        <span><i style="border-top:2px solid var(--p-accent-2)"></i>Fast MA</span>
        <span><i style="border-top:2px solid var(--p-accent-3)"></i>Slow MA</span>
        <span><b style="color:var(--p-accent)">▲</b> Buy</span>
        <span><b style="color:#F87171">▼</b> Sell</span>
      </div>
    </div>
    <div class="p-box bt-chart" data-chart="equity">
      <div class="bt-chart-head"><span>Growth of $1</span><span data-scale-eq></span></div>
      <svg viewBox="0 0 640 170" class="chart" data-svg="equity" role="img" aria-label="Equity curves of the strategy and buy and hold"></svg>
      <div class="p-legend">
        <span><i style="border-top:3px solid var(--p-accent)"></i>Strategy</span>
        <span><i style="border-top:2px dashed var(--p-muted)"></i>Buy &amp; hold</span>
      </div>
    </div>

    <dl class="p-metrics" data-metrics></dl>
    <p class="p-note" data-note></p>`;

  function maControl(k, label, min, max, presets) {
    return `
      <div class="ma-control">
        <label class="p-label"><span class="lab-row">${label} MA
          <span class="num-wrap"><input type="number" class="p-input p-num" min="${min}" max="${max}" data-num="${k}" aria-label="${label} moving average in days" /> days</span></span>
          <input type="range" min="${min}" max="${max}" data-k="${k}" aria-label="${label} moving average slider" /></label>
        <div class="chip-row" role="group" aria-label="${label} moving average presets">
          ${presets.map((v) => `<button type="button" class="p-chip" data-preset="${k}" data-v="${v}">${v}</button>`).join("")}
        </div>
      </div>`;
  }

  const q = (sel) => el.querySelector(sel);
  const fmtDate = (d) => new Date(d * DAY).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const iso = (d) => new Date(d * DAY).toISOString().slice(0, 10);
  const toDay = (str) => Math.round(Date.parse(str + "T00:00:00Z") / DAY);
  const pct = (v) => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(1) + "%";

  /* ── Data ── */
  async function loadIndex() {
    index = await (await fetch("data/prices/index.json")).json();
    q("[data-ticker]").innerHTML = index.tickers.map((t) => `<option value="${t.ticker}">${t.ticker} · ${t.name}</option>`).join("");
    q("[data-ticker]").value = s.ticker;
  }
  async function loadTicker(t) {
    if (!cache[t]) {
      const r = await (await fetch(`data/prices/${t}.json`)).json();
      const days = [toDay(r.first)];
      for (const g of r.gaps) days.push(days[days.length - 1] + g);
      cache[t] = { days, close: r.close, name: r.name };
    }
    return cache[t];
  }

  function applyPeriod(code) {
    s.period = code;
    const years = PERIODS.find((p) => p[0] === code)[1];
    const last = series.days[series.days.length - 1];
    s.to = last;
    s.from = years ? Math.max(series.days[0], last - Math.round(years * 365.25)) : series.days[0];
  }

  /* ── The backtest (port of run_backtest + trade_breakdown + summarize) ── */
  function rolling(arr, w) {
    const out = new Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= w) sum -= arr[i - w];
      if (i >= w - 1) out[i] = sum / w;
    }
    return out;
  }

  function backtest() {
    const { days, close: all } = series;
    let a = days.findIndex((d) => d >= s.from);
    let b = days.length - 1;
    while (b > 0 && days[b] > s.to) b--;
    if (a < 0 || b - a < 20) return null;

    // Moving averages on the test window only (like backtest.py), or warmed up on earlier prices.
    const src = s.warm ? all.slice(0, b + 1) : all.slice(a, b + 1);
    const off = s.warm ? a : 0;
    const maS = rolling(src, s.fast).slice(off), maL = rolling(src, s.slow).slice(off);
    const close = all.slice(a, b + 1), n = close.length;
    const sl = s.stop / 100, tp = s.take / 100, cost = s.fee / 100;

    const signal = maS.map((v, i) => (v !== null && maL[i] !== null && v > maL[i] ? 1 : 0));
    const target = signal.map((_, i) => (i ? signal[i - 1] : 0));
    const pos = new Array(n).fill(0);
    let entry = null;
    for (let i = 1; i < n; i++) {
      const last = close[i - 1];
      if (pos[i - 1] === 0 && target[i] === 1) { pos[i] = 1; entry = last; }
      else if (pos[i - 1] === 1) {
        const ch = (last - entry) / entry;
        if ((sl > 0 && ch <= -sl) || (tp > 0 && ch >= tp)) { pos[i] = 0; entry = null; }
        else if (target[i] === 0) { pos[i] = 0; entry = null; }
        else pos[i] = 1;
      }
    }

    const strat = [], eq = [], hold = [];
    let e = 1, h = 1, trades = 0;
    for (let i = 0; i < n; i++) {
      const mkt = i ? close[i] / close[i - 1] - 1 : 0;
      const turn = i ? Math.abs(pos[i] - pos[i - 1]) : 0;
      trades += turn;
      const r = pos[i] * mkt - turn * cost;
      strat.push(r);
      e *= 1 + r; h *= 1 + mkt;
      eq.push(e); hold.push(h);
    }

    // Round trips: traded at the previous day's close.
    const marks = [], trips = [];
    let ent = null;
    for (let i = 1; i < n; i++) {
      if (pos[i] && !pos[i - 1]) { ent = close[i - 1]; marks.push({ i: i - 1, buy: true }); }
      else if (!pos[i] && pos[i - 1] && ent !== null) { trips.push(close[i - 1] / ent - 1 - 2 * cost); ent = null; marks.push({ i: i - 1, buy: false }); }
    }
    if (ent !== null) trips.push(close[n - 1] / ent - 1 - 2 * cost);

    const mean = strat.reduce((x, y) => x + y, 0) / n;
    const sd = Math.sqrt(strat.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1));
    const ddOf = (arr) => { let pk = arr[0], dd = 0; for (const v of arr) { pk = Math.max(pk, v); dd = Math.min(dd, (v - pk) / pk); } return dd; };
    const wins = trips.filter((r) => r > 0).length;

    return {
      days: days.slice(a, b + 1), close, maS, maL, eq, hold, marks,
      total: eq[n - 1] - 1, holdTotal: hold[n - 1] - 1,
      sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : 0,
      dd: ddOf(eq), holdDd: ddOf(hold), trades, wins, trips: trips.length,
      inMarket: pos.reduce((x, y) => x + y, 0) / n,
    };
  }

  /* ── Drawing ── */
  function scaleY(values, top, bottom) {
    const v = values.filter((x) => x !== null && x > 0);
    const lo = Math.min(...v), hi = Math.max(...v);
    const log = hi / lo > 6; // long or explosive periods read better on a log scale
    const f = log ? Math.log : (x) => x;
    let L = f(lo), H = f(hi);
    const pad = (H - L) * 0.06 || 1;
    L -= pad; H += pad;
    const inv = (py) => { const u = L + ((bottom - py) / (bottom - top)) * (H - L); return log ? Math.exp(u) : u; };
    return { y: (x) => bottom - ((f(x) - L) / (H - L)) * (bottom - top), inv, log };
  }

  // Three faint horizontal gridlines with their values, right-aligned.
  function yGrid(S, top, bottom, fmt) {
    let out = "";
    for (const fr of [0.15, 0.5, 0.85]) {
      const py = top + (bottom - top) * fr;
      out += `<line x1="0" x2="640" y1="${py}" y2="${py}" stroke="var(--p-line)" stroke-opacity=".6"/>` +
             `<text x="636" y="${py - 4}" font-size="10" text-anchor="end" fill="var(--p-muted)">${fmt(S.inv(py))}</text>`;
    }
    return out;
  }
  const money = (v) => "$" + (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(v >= 10 ? 1 : 2));

  function linePath(arr, X, Y, step) {
    let d = "", pen = false;
    for (let i = 0; i < arr.length; i += step) {
      const v = arr[i];
      if (v === null) { pen = false; continue; }
      d += (pen ? " L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1);
      pen = true;
    }
    const lastI = arr.length - 1;
    if (arr[lastI] !== null && pen) d += " L" + X(lastI).toFixed(1) + "," + Y(arr[lastI]).toFixed(1);
    return d;
  }

  function yearTicks(R, X, y) {
    const n = R.days.length, spanYears = (R.days[n - 1] - R.days[0]) / 365.25;
    const every = spanYears > 14 ? 4 : spanYears > 7 ? 2 : 1;
    let out = "", prevYear = null;
    for (let i = 0; i < n; i++) {
      const yr = new Date(R.days[i] * DAY).getUTCFullYear();
      if (prevYear !== null && yr !== prevYear && yr % every === 0) {
        out += `<line x1="${X(i)}" x2="${X(i)}" y1="0" y2="${y}" stroke="var(--p-line)" stroke-dasharray="2 4"/>` +
               `<text x="${X(i) + 3}" y="${y + 13}" font-size="10" fill="var(--p-muted)">${yr}</text>`;
      }
      prevYear = yr;
    }
    return out;
  }

  function draw() {
    const R = result;
    if (!R) return;
    const n = R.close.length, W = 640, step = Math.max(1, Math.floor(n / 700));
    const X = (i) => (i / (n - 1)) * W;

    // Price chart
    const P = scaleY(R.close.concat(R.maS, R.maL), 8, 200);
    const markers = R.marks.map((m) => {
      const x = X(m.i), y = P.y(R.close[m.i]);
      return m.buy
        ? `<path d="M${x - 5},${y + 13} L${x + 5},${y + 13} L${x},${y + 5} Z" fill="var(--p-accent)"/>`
        : `<path d="M${x - 5},${y - 13} L${x + 5},${y - 13} L${x},${y - 5} Z" fill="#F87171"/>`;
    }).join("");
    const cursorP = hoverI === null ? "" : `<line x1="${X(hoverI)}" x2="${X(hoverI)}" y1="0" y2="200" stroke="var(--p-text)" stroke-opacity=".5"/>`;
    q('[data-svg="price"]').innerHTML =
      yGrid(P, 8, 200, money) + yearTicks(R, X, 200) +
      `<path d="${linePath(R.close, X, P.y, step)}" fill="none" stroke="var(--p-muted)" stroke-width="1.5"/>` +
      `<path d="${linePath(R.maS, X, P.y, step)}" fill="none" stroke="var(--p-accent-2)" stroke-width="2"/>` +
      `<path d="${linePath(R.maL, X, P.y, step)}" fill="none" stroke="var(--p-accent-3)" stroke-width="2"/>` +
      (R.marks.length <= 160 ? markers : "") + cursorP;
    q("[data-scale-price]").textContent = P.log ? "log scale" : "";

    // Equity chart
    const E = scaleY(R.eq.concat(R.hold), 8, 140);
    const one = E.y(1);
    const cursorE = hoverI === null ? "" : `<line x1="${X(hoverI)}" x2="${X(hoverI)}" y1="0" y2="140" stroke="var(--p-text)" stroke-opacity=".5"/>`;
    q('[data-svg="equity"]').innerHTML =
      yGrid(E, 8, 140, money) + yearTicks(R, X, 140) +
      (one > 0 && one < 140 ? `<line x1="0" x2="${W}" y1="${one}" y2="${one}" stroke="var(--p-muted)" stroke-dasharray="1 3"/><text x="4" y="${one - 4}" font-size="10" fill="var(--p-muted)">$1 start</text>` : "") +
      `<path d="${linePath(R.hold, X, E.y, step)}" fill="none" stroke="var(--p-muted)" stroke-width="2" stroke-dasharray="5 5"/>` +
      `<path d="${linePath(R.eq, X, E.y, step)}" fill="none" stroke="var(--p-accent)" stroke-width="2.5" stroke-linejoin="round"/>` +
      cursorE;
    q("[data-scale-eq]").textContent = E.log ? "log scale" : "";
    readout();
  }

  function readout() {
    const R = result, i = hoverI === null ? R.close.length - 1 : hoverI;
    const ma = (v) => (v === null ? "warming up" : "$" + v.toFixed(2));
    q("[data-readout]").innerHTML =
      `<b>${fmtDate(R.days[i])}</b> · Price $${R.close[i].toFixed(2)} · Fast ${ma(R.maS[i])} · Slow ${ma(R.maL[i])} · ` +
      `Strategy <b style="color:var(--p-accent)">${pct(R.eq[i] - 1)}</b> · Buy &amp; hold <b>${pct(R.hold[i] - 1)}</b>`;
  }

  function metrics() {
    const R = result;
    const m = [
      ["Strategy return", pct(R.total), "color:var(--p-accent)"],
      ["Buy & hold", pct(R.holdTotal), ""],
      ["Sharpe ratio", R.sharpe.toFixed(2), ""],
      ["Max drawdown", pct(R.dd) + "", ""],
      ["Trades", String(R.trades), ""],
      ["Win rate", R.trips ? Math.round((R.wins / R.trips) * 100) + "% of " + R.trips : "–", ""],
    ];
    q("[data-metrics]").innerHTML = m.map(([k, v, st]) => `<div class="p-metric"><dt>${k}</dt><dd style="${st}">${v}</dd></div>`).join("");
    q("[data-note]").innerHTML =
      `Same rules as my Python backtester: trades act on the previous day's close (no lookahead), stop-loss and take-profit only see yesterday's price, and each trade pays the fee. ` +
      `Adjusted daily closes from Yahoo Finance, ${index ? "updated " + fmtDate(toDay(index.updated)) : ""}. Past results don't predict future ones. This is a learning tool, not investment advice.`;
  }

  /* ── Controls ── */
  function syncControls() {
    q("[data-ticker]").value = s.ticker;
    for (const k of ["fast", "slow", "stop", "take", "fee"]) { const r = q(`[data-k="${k}"]`); if (r) r.value = s[k]; }
    q('[data-num="fast"]').value = s.fast;
    q('[data-num="slow"]').value = s.slow;
    q('[data-o="stop"]').textContent = s.stop ? s.stop + "%" : "off";
    q('[data-o="take"]').textContent = s.take ? s.take + "%" : "off";
    q('[data-o="fee"]').textContent = s.fee.toFixed(2) + "%";
    q("[data-warm]").checked = s.warm;
    el.querySelectorAll("[data-preset]").forEach((c) => c.setAttribute("aria-pressed", String(s[c.dataset.preset] === Number(c.dataset.v))));
    q("[data-periods]").innerHTML = PERIODS.map(([c]) => `<button type="button" class="p-chip" data-period="${c}" aria-pressed="${s.period === c}">${c}</button>`).join("");
    const f = q("[data-from]"), t = q("[data-to]");
    f.min = t.min = iso(series.days[0]); f.max = t.max = iso(series.days[series.days.length - 1]);
    f.value = iso(s.from); t.value = iso(s.to);
  }

  function setMA(k, v) {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) return;
    if (k === "fast") { s.fast = Math.min(Math.max(v, 2), 100); if (s.fast >= s.slow) s.slow = Math.min(250, s.fast + 1); }
    else { s.slow = Math.min(Math.max(v, 5), 250); if (s.fast >= s.slow) s.fast = Math.max(2, s.slow - 1); }
  }

  function update() {
    if (!alive) return;
    result = backtest();
    syncControls();
    if (!result) {
      q("[data-readout]").textContent = "Pick a longer date range (at least a month of trading).";
      return;
    }
    hoverI = null;
    draw();
    metrics();
  }

  el.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.k === "fast" || t.dataset.k === "slow") setMA(t.dataset.k, t.value);
    else if (t.dataset.k) s[t.dataset.k] = Number(t.value);
    else if (t.dataset.warm !== undefined) s.warm = t.checked;
    else return;
    update();
  });
  el.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.num) { setMA(t.dataset.num, t.value); update(); }
    if (t.dataset.ticker !== undefined) {
      s.ticker = t.value;
      series = await loadTicker(s.ticker);
      applyPeriod(s.period === "custom" ? "3Y" : s.period);
      update();
    }
    if (t.dataset.from !== undefined || t.dataset.to !== undefined) {
      const f = toDay(q("[data-from]").value), to = toDay(q("[data-to]").value);
      if (Number.isFinite(f) && Number.isFinite(to) && f < to) { s.from = f; s.to = to; s.period = "custom"; }
      update();
    }
  });
  el.addEventListener("click", (e) => {
    const p = e.target.closest("[data-preset]");
    if (p) { setMA(p.dataset.preset, p.dataset.v); update(); }
    const per = e.target.closest("[data-period]");
    if (per) { applyPeriod(per.dataset.period); update(); }
  });

  // Hover / touch readout across both charts.
  el.querySelectorAll("[data-svg]").forEach((svg) => {
    const move = (ev) => {
      if (!result) return;
      const r = svg.getBoundingClientRect();
      const x = Math.min(Math.max(0, ev.clientX - r.left), r.width);
      hoverI = Math.round((x / r.width) * (result.close.length - 1));
      draw();
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", () => { hoverI = null; draw(); });
  });

  (async () => {
    try {
      await loadIndex();
      series = await loadTicker(s.ticker);
      applyPeriod(s.period);
      update();
    } catch (err) {
      q("[data-readout]").textContent = "Couldn't load price data. Please refresh the page.";
    }
  })();

  return () => { alive = false; };
};
