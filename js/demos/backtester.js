// Strategy Backtester: backtest.py from the backtester repo, in the browser.
// Same SETTINGS block, same three modes (single / sweep / multi_stock), same
// rules (signal shifted one day, stop-loss/take-profit on yesterday's close,
// a fee on every change of position), the same printed tables, and charts
// drawn like the matplotlib figures it saves (results.png, sweep.png).
// Prices: adjusted daily closes (yfinance, auto_adjust=True), stored in data/prices.
window.DEMOS = window.DEMOS || {};
window.DEMOS.backtester = function (el) {
  const DAY = 86400000;
  const cache = {};
  let index = null, alive = true, timer = 0, hoverI = null, last = null;

  // Defaults are the SETTINGS block at the top of backtest.py (MODE starts on single here).
  const s = {
    mode: "single", ticker: "META", start: "2021-01-01", end: "2023-01-01",
    fast: 20, slow: 50, cost: 0.001, stop: 0.05, take: 0.10,
    sweepFast: [5, 10, 20, 50], sweepSlow: [50, 100, 150, 200],
    tickers: ["MSFT", "NVDA", "TSLA", "AAPL"],
  };
  const FAST_PRESETS = [5, 10, 15, 20, 50], SLOW_PRESETS = [20, 50, 100, 150, 200];
  const SWEEP_FAST_OPTS = [3, 5, 10, 15, 20, 30, 50], SWEEP_SLOW_OPTS = [30, 50, 75, 100, 150, 200, 250];
  const PERIODS = [["1Y", 1], ["3Y", 3], ["5Y", 5], ["10Y", 10], ["Max", 0]];

  el.innerHTML = `
    <div class="bt-modes" role="tablist" aria-label="Mode">
      <span class="bt-kw">MODE =</span>
      ${["single", "sweep", "multi_stock"].map((m) => `<button type="button" role="tab" class="bt-mode" data-mode="${m}">"${m}"</button>`).join("")}
    </div>
    <p class="bt-mode-help" data-mode-help></p>

    <div class="bt-settings" data-settings>
      <p class="bt-comment"># ============================================================<br/>#   SETTINGS  --  same as the top of backtest.py. Change any value.<br/># ============================================================</p>
      <div class="bt-row" data-row="ticker">
        <label class="bt-key" for="bt-ticker">TICKER</label><span class="bt-eq">=</span>
        <div class="bt-val"><select id="bt-ticker" class="p-input" data-ticker></select></div>
        <span class="bt-note"># the stock symbol</span>
      </div>
      <div class="bt-row">
        <label class="bt-key" for="bt-start">START_DATE</label><span class="bt-eq">=</span>
        <div class="bt-val"><input id="bt-start" type="date" class="p-input" data-start /></div>
        <span class="bt-note"># when to start testing</span>
      </div>
      <div class="bt-row">
        <label class="bt-key" for="bt-end">END_DATE</label><span class="bt-eq">=</span>
        <div class="bt-val"><input id="bt-end" type="date" class="p-input" data-end />
          <div class="chip-row" role="group" aria-label="Quick date ranges" data-periods></div></div>
        <span class="bt-note"># when to stop testing</span>
      </div>
      ${maRow("fast", "FAST_MA", 2, 100, FAST_PRESETS, "# fast (short) moving average, in days")}
      ${maRow("slow", "SLOW_MA", 5, 250, SLOW_PRESETS, "# slow (long) moving average, in days")}
      ${numRow("cost", "COST_PER_TRADE", 0, 0.01, 0.0005, "# fee per trade (0.001 = 0.1%)")}
      ${numRow("stop", "STOP_LOSS_PCT", 0, 0.5, 0.01, "# exit if down this much from entry (0.05 = 5%), 0 to disable")}
      ${numRow("take", "TAKE_PROFIT_PCT", 0, 1, 0.01, "# exit if up this much from entry (0.10 = 10%), 0 to disable")}
      <div class="bt-row" data-row="sweep">
        <span class="bt-key">SWEEP_FAST</span><span class="bt-eq">=</span>
        <div class="bt-val chip-row" role="group" aria-label="Fast windows to sweep" data-list="sweepFast"></div>
        <span class="bt-note"># fast windows to try in sweep mode</span>
      </div>
      <div class="bt-row" data-row="sweep">
        <span class="bt-key">SWEEP_SLOW</span><span class="bt-eq">=</span>
        <div class="bt-val chip-row" role="group" aria-label="Slow windows to sweep" data-list="sweepSlow"></div>
        <span class="bt-note"># slow windows to try in sweep mode</span>
      </div>
      <div class="bt-row" data-row="multi">
        <span class="bt-key">TICKERS_TO_TEST</span><span class="bt-eq">=</span>
        <div class="bt-val chip-row" role="group" aria-label="Tickers to test" data-list="tickers"></div>
        <span class="bt-note"># for multi_stock mode</span>
      </div>
    </div>

    <div class="bt-cmd">
      <code data-cmd></code>
      <button type="button" class="p-btn bt-copy" data-copy>Copy command</button>
    </div>

    <div class="term bt-term" aria-label="Output">
      <div class="term-bar" aria-hidden="true"><span></span><span></span><span></span><em>Terminal</em></div>
      <pre class="bt-out" data-out aria-live="polite"></pre>
    </div>

    <figure class="mpl" data-figure>
      <figcaption class="mpl-cap"><span data-figname></span><span class="mpl-read" data-readout></span></figcaption>
      <div class="mpl-canvas" data-plot></div>
    </figure>
    <p class="p-note">Prices are adjusted daily closes from Yahoo Finance (the same <code>yfinance</code> download the Python tool uses), <span data-updated></span>. Nothing here is investment advice. It's a learning tool.</p>`;

  function maRow(k, key, min, max, presets, note) {
    return `<div class="bt-row" data-row="ma">
      <label class="bt-key" for="bt-${k}">${key}</label><span class="bt-eq">=</span>
      <div class="bt-val">
        <div class="ma-line"><input id="bt-${k}" type="number" class="p-input p-num" min="${min}" max="${max}" data-num="${k}" />
          <input type="range" min="${min}" max="${max}" data-range="${k}" aria-label="${key} slider" /></div>
        <div class="chip-row" role="group" aria-label="${key} presets">${presets.map((v) => `<button type="button" class="p-chip" data-preset="${k}" data-v="${v}">${v}</button>`).join("")}</div>
      </div>
      <span class="bt-note">${note}</span>
    </div>`;
  }
  function numRow(k, key, min, max, step, note) {
    return `<div class="bt-row">
      <label class="bt-key" for="bt-${k}">${key}</label><span class="bt-eq">=</span>
      <div class="bt-val"><input id="bt-${k}" type="number" class="p-input p-num wide" min="${min}" max="${max}" step="${step}" data-frac="${k}" /></div>
      <span class="bt-note">${note}</span>
    </div>`;
  }

  const q = (sel) => el.querySelector(sel);
  const toDay = (str) => Math.round(Date.parse(str + "T00:00:00Z") / DAY);
  const iso = (d) => new Date(d * DAY).toISOString().slice(0, 10);

  /* ── Data ── */
  async function loadIndex() {
    index = await (await fetch("data/prices/index.json")).json();
    q("[data-ticker]").innerHTML = index.tickers.map((t) => `<option value="${t.ticker}">"${t.ticker}"  · ${t.name}</option>`).join("");
    q("[data-updated]").textContent = `through ${index.tickers[0].last}`;
  }
  async function load(t) {
    if (!cache[t]) {
      const r = await (await fetch(`data/prices/${t}.json`)).json();
      const days = [toDay(r.first)];
      for (const g of r.gaps) days.push(days[days.length - 1] + g);
      cache[t] = { days, close: r.close };
    }
    return cache[t];
  }
  // Like yf.download(start, end): start is included, end is not.
  function window_(series) {
    const a = toDay(s.start), b = toDay(s.end);
    const days = [], close = [];
    series.days.forEach((d, i) => { if (d >= a && d < b) { days.push(d); close.push(series.close[i]); } });
    return { days, close };
  }

  /* ── Port of run_backtest / trade_breakdown / summarize ── */
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
  function runBacktest(close, fast, slow, cost, sl, tp) {
    const n = close.length;
    const maS = rolling(close, fast), maL = rolling(close, slow);
    const signal = maS.map((v, i) => (v !== null && maL[i] !== null && v > maL[i] ? 1 : 0));
    const target = signal.map((_, i) => (i ? signal[i - 1] : 0));
    const pos = new Array(n).fill(0);
    let entry = null;
    for (let i = 1; i < n; i++) {
      const lastClose = close[i - 1];
      if (pos[i - 1] === 0 && target[i] === 1) { pos[i] = 1; entry = lastClose; }
      else if (pos[i - 1] === 1) {
        const ch = (lastClose - entry) / entry;
        if ((sl > 0 && ch <= -sl) || (tp > 0 && ch >= tp)) { pos[i] = 0; entry = null; }
        else if (target[i] === 0) { pos[i] = 0; entry = null; }
        else pos[i] = 1;
      }
    }
    const mkt = close.map((c, i) => (i ? c / close[i - 1] - 1 : 0));
    const strat = mkt.map((m, i) => pos[i] * m - (i ? Math.abs(pos[i] - pos[i - 1]) : 0) * cost);
    const cum = (r) => { let e = 1; return r.map((x) => (e *= 1 + x)); };
    const trades = pos.reduce((a, p, i) => a + (i ? Math.abs(p - pos[i - 1]) : 0), 0);
    // trade_breakdown: a position that starts or ends on day i was traded at day i-1's close.
    const results = [], marks = [];
    let ent = null;
    for (let i = 1; i < n; i++) {
      if (pos[i] && !pos[i - 1]) { ent = close[i - 1]; marks.push([i - 1, 1]); }
      else if (!pos[i] && pos[i - 1] && ent !== null) { results.push(close[i - 1] / ent - 1 - 2 * cost); ent = null; marks.push([i - 1, -1]); }
    }
    if (ent !== null) results.push(close[n - 1] / ent - 1 - 2 * cost);
    const wins = results.filter((r) => r > 0).length;
    return { maS, maL, pos, mkt, strat, eq: cum(strat), hold: cum(mkt), trades, wins, losses: results.length - wins, marks };
  }
  function summarize(equity, returns) {
    const n = returns.length, mean = returns.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    let peak = -Infinity, dd = 0;
    for (const v of equity) { peak = Math.max(peak, v); dd = Math.min(dd, (v - peak) / peak); }
    return [equity[equity.length - 1] - 1, sd > 0 ? (mean / sd) * Math.sqrt(252) : 0, dd];
  }

  /* ── Python-style formatting ── */
  const P = (x, d = 1) => (x * 100).toFixed(d) + "%";               // {x:.1%}
  const SP = (x, d = 1) => (x >= 0 ? "+" : "") + P(x, d);            // {x:+.1%}
  const R = (v, w) => String(v).padStart(w);                         // {v:>w}
  const L = (v, w) => String(v).padEnd(w);                           // {v:w}
  function header(title, w) {
    const sl = s.stop > 0 ? `${(s.stop * 100).toFixed(0)}%` : "off";
    const tp = s.take > 0 ? `${(s.take * 100).toFixed(0)}%` : "off";
    return ["", "=".repeat(w), `  ${title}`, `  ${s.start} to ${s.end}  |  cost ${(s.cost * 100).toFixed(2)}%  |  stop-loss ${sl}  |  take-profit ${tp}`, "=".repeat(w)];
  }
  function checkSettings() {
    if (s.fast < 1 || s.slow < 1) return "moving-average windows must be at least 1 day";
    if (s.mode !== "sweep" && s.fast >= s.slow) return `the short window (${s.fast}) must be shorter than the long window (${s.slow})`;
    if (s.cost < 0 || s.stop < 0 || s.take < 0) return "cost, stop-loss and take-profit can't be negative";
    if (s.start >= s.end) return `start date (${s.start}) must be before end date (${s.end})`;
    return null;
  }
  const noData = (t) => [`No data came back for '${t}' in that date range.`, `(This copy of the data covers ${index.tickers.find((x) => x.ticker === t).first} to ${index.tickers.find((x) => x.ticker === t).last}.)`];

  /* ── The three modes ── */
  async function run() {
    if (!alive) return;
    syncControls();
    const err = checkSettings();
    if (err) { show(["usage: backtest.py [-h] [--ticker TICKER] [--start START] [--end END] ...", `backtest.py: error: ${err}`], null); return; }
    if (s.mode === "single") return runSingle();
    if (s.mode === "sweep") return runSweep();
    return runMulti();
  }

  async function runSingle() {
    const w = window_(await load(s.ticker));
    const out = [`Downloading ${s.ticker} from ${s.start} to ${s.end}...`];
    if (!w.close.length) return show(out.concat(noData(s.ticker)), null);
    if (w.close.length <= s.slow) out.push(`Warning: only ${w.close.length} days of prices, but the long average needs ${s.slow}. The strategy will never trade.`);
    const d = runBacktest(w.close, s.fast, s.slow, s.cost, s.stop, s.take);
    const st = summarize(d.eq, d.strat), ho = summarize(d.hold, d.mkt);
    const trips = d.wins + d.losses, wr = trips ? d.wins / trips : 0, beat = st[0] - ho[0];
    out.push(...header(`${s.ticker}  —  ${s.fast}/${s.slow}-day crossover`, 52),
      `  ${L("", 16)}${R("Strategy", 11)}${R("Buy & Hold", 13)}`,
      `  ${L("Total return", 16)}${R(P(st[0]), 10)}${R(P(ho[0]), 13)}`,
      `  ${L("Sharpe ratio", 16)}${R(st[1].toFixed(2), 10)}${R(ho[1].toFixed(2), 13)}`,
      `  ${L("Max drawdown", 16)}${R(P(st[2]), 10)}${R(P(ho[2]), 13)}`,
      `  ${L("Trades", 16)}${R(d.trades, 10)}`,
      `  ${L("Win rate", 16)}${R(P(wr, 0), 10)}    (${d.wins} W / ${d.losses} L)`,
      "-".repeat(52),
      beat > 0 ? `  Strategy BEAT buy & hold by ${SP(beat)}` : `  Strategy lost to buy & hold by ${P(beat)}`,
      "=".repeat(52), "", "Chart saved to results.png (2 panels: strategy trades + equity curves)");
    last = { kind: "single", w, d };
    show(out, "results.png");
  }

  async function runSweep() {
    const w = window_(await load(s.ticker));
    const out = [`Downloading ${s.ticker} from ${s.start} to ${s.end}...`];
    if (!w.close.length) return show(out.concat(noData(s.ticker)), null);
    const rows = [];
    for (const f of s.sweepFast) for (const sl of s.sweepSlow) {
      if (f >= sl) continue; // fast must be shorter than slow
      const d = runBacktest(w.close, f, sl, s.cost, s.stop, s.take);
      const [total, sharpe, dd] = summarize(d.eq, d.strat);
      rows.push([f, sl, total, sharpe, dd, d.trades]);
    }
    if (!rows.length) return show(out.concat(["", "No valid combos to test: every fast window is >= every slow window."]), null);
    rows.sort((a, b) => b[2] - a[2]);
    const mkt = w.close.map((c, i) => (i ? c / w.close[i - 1] - 1 : 0));
    let e = 1; const base = summarize(mkt.map((x) => (e *= 1 + x)), mkt);
    let beat = 0;
    out.push(...header(`Parameter sweep  —  ${s.ticker}`, 70),
      `  ${R("Fast", 5)}${R("Slow", 6)}${R("Return", 11)}${R("Sharpe", 8)}${R("MaxDD", 9)}${R("Trades", 8)}${R("vs B&H", 13)}`,
      "-".repeat(70));
    for (const [f, sl, total, sharpe, dd, n] of rows) {
      const diff = total - base[0];
      if (diff > 0) beat++;
      out.push(`  ${R(f, 5)}${R(sl, 6)}${R(P(total), 11)}${R(sharpe.toFixed(2), 8)}${R(P(dd), 9)}${R(n, 8)}${R(SP(diff), 12)} `);
    }
    out.push("-".repeat(70),
      `  ${R("Buy & Hold", 11)}${R(P(base[0]), 11)}${R(base[1].toFixed(2), 8)}${R(P(base[2]), 9)}${R("—", 8)}${R("baseline", 13)}`,
      "=".repeat(70), "",
      `  Best combo: ${rows[0][0]}/${rows[0][1]}-day  ->  ${P(rows[0][2])} return (${SP(rows[0][2] - base[0])} vs buy & hold)`,
      `  ${beat} of ${rows.length} combos beat buy & hold.`);
    if (beat <= 1) out.push("  Only one (or none) beating it is a warning sign — likely luck, not edge.");
    out.push("  Check sweep.png: a green CLUSTER is trustworthy, one lone green cell isn't.", "", "Heatmap saved to sweep.png");
    last = { kind: "sweep", rows, hold: base[0] };
    show(out, "sweep.png");
  }

  async function runMulti() {
    const out = [], rows = [];
    for (const t of s.tickers) {
      const w = window_(await load(t));
      if (!w.close.length) { out.push(`  ${R(t, 6)} — no data`); continue; }
      const d = runBacktest(w.close, s.fast, s.slow, s.cost, s.stop, s.take);
      const st = summarize(d.eq, d.strat), ho = summarize(d.hold, d.mkt);
      const trips = d.wins + d.losses;
      rows.push([t, st[0], ho[0], st[1], st[2], d.trades, trips ? d.wins / trips : 0]);
    }
    rows.sort((a, b) => b[1] - a[1]);
    let beat = 0;
    out.push(...header(`Multi-stock test  —  ${s.fast}/${s.slow}-day crossover`, 74),
      `  ${R("Ticker", 7)}${R("Strategy", 11)}${R("Buy&Hold", 11)}${R("vs B&H", 10)}${R("Sharpe", 8)}${R("MaxDD", 9)}${R("Win%", 7)}`,
      "-".repeat(74));
    for (const [t, sr, hr, sharpe, dd, , wr] of rows) {
      const diff = sr - hr, mark = diff > 0 ? " *" : "  ";
      if (diff > 0) beat++;
      out.push(`  ${R(t, 7)}${R(P(sr), 11)}${R(P(hr), 11)}${R(SP(diff), 9)}${mark}${R(sharpe.toFixed(2), 7)}${R(P(dd), 9)}${R(P(wr, 0), 7)}`);
    }
    out.push("-".repeat(74), "  ( * = beat buy & hold )", "=".repeat(74), "", `  ${beat} of ${rows.length} stocks beat buy & hold with this strategy.`);
    if (beat === rows.length && rows.length) out.push("  It worked on every stock — that's a sign of something real, not luck.");
    else if (beat <= 1) out.push("  It only worked on one (or none) — likely stock-specific luck.");
    last = null;
    show(out, null);
  }

  function show(lines, figName) {
    if (!alive) return;
    q("[data-out]").textContent = lines.join("\n");
    const fig = q("[data-figure]");
    fig.hidden = !figName;
    q("[data-figname]").textContent = figName || "";
    hoverI = null;
    if (figName) draw();
  }

  /* ── matplotlib-style figures ── */
  const MPL = { blue: "#0000ff", orange: "#ffa500", gray: "#808080", green: "#008000", red: "#ff0000", grid: "#b0b0b0", text: "#000" };
  const FONT = `font-family="DejaVu Sans, Verdana, Geneva, sans-serif"`;
  function niceTicks(lo, hi, maxTicks = 7) {
    const span = hi - lo || 1, raw = span / maxTicks, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => span / st <= maxTicks) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return { ticks: out, step };
  }
  const fmtTick = (v, step) => (step >= 1 ? v.toFixed(0) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2));
  function dateTicks(days) {
    // Ticks anywhere inside the axis, which runs 5% past the data on each side (matplotlib's margins).
    const pad = (days[days.length - 1] - days[0]) * 0.05;
    const lo = days[0] - pad, hi = days[days.length - 1] + pad;
    const a = new Date(lo * DAY), b = new Date(hi * DAY);
    const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
    const every = [1, 2, 3, 4, 6, 12, 24, 36, 60].find((m) => months / m <= 8) || 60;
    const out = [];
    let y = a.getUTCFullYear(), m = a.getUTCMonth() + 1;
    if (every >= 12) { m = 0; y += 1; while (y % (every / 12)) y++; } else m = Math.ceil(m / every) * every;
    while (true) {
      if (m >= 12) { y += Math.floor(m / 12); m %= 12; }
      const d = Date.UTC(y, m, 1) / DAY;
      if (d > hi) break;
      if (d >= lo) out.push([d, every >= 12 ? String(y) : `${y}-${String(m + 1).padStart(2, "0")}`]);
      m += every;
    }
    return out;
  }
  function axes({ x, y, w, h, xlo, xhi, ylo, yhi, title, ylabel, xlabel, xticks, showXLabels }) {
    // matplotlib default margins: 5% of the data range on each side
    const xm = (xhi - xlo) * 0.05 || 1, ym = (yhi - ylo) * 0.05 || 1;
    xlo -= xm; xhi += xm; ylo -= ym; yhi += ym;
    const X = (v) => x + ((v - xlo) / (xhi - xlo)) * w, Y = (v) => y + h - ((v - ylo) / (yhi - ylo)) * h;
    const yt = niceTicks(ylo, yhi);
    let svg = "";
    for (const t of yt.ticks) svg += `<line x1="${x}" x2="${x + w}" y1="${Y(t)}" y2="${Y(t)}" stroke="${MPL.grid}" stroke-opacity=".3" stroke-width="0.8"/>`;
    for (const [d] of xticks) svg += `<line x1="${X(d)}" x2="${X(d)}" y1="${y}" y2="${y + h}" stroke="${MPL.grid}" stroke-opacity=".3" stroke-width="0.8"/>`;
    const frame = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="0.8"/>` +
      yt.ticks.map((t) => `<line x1="${x - 3.5}" x2="${x}" y1="${Y(t)}" y2="${Y(t)}" stroke="#000" stroke-width="0.8"/><text x="${x - 6}" y="${Y(t) + 3.5}" font-size="10" text-anchor="end" ${FONT}>${fmtTick(t, yt.step)}</text>`).join("") +
      xticks.map(([d, lab]) => `<line x1="${X(d)}" x2="${X(d)}" y1="${y + h}" y2="${y + h + 3.5}" stroke="#000" stroke-width="0.8"/>` + (showXLabels ? `<text x="${X(d)}" y="${y + h + 15}" font-size="10" text-anchor="middle" ${FONT}>${lab}</text>` : "")).join("") +
      (title ? `<text x="${x + w / 2}" y="${y - 8}" font-size="12" text-anchor="middle" ${FONT}>${title}</text>` : "") +
      (ylabel ? `<text transform="translate(${x - 46},${y + h / 2}) rotate(-90)" font-size="10" text-anchor="middle" ${FONT}>${ylabel}</text>` : "") +
      (xlabel ? `<text x="${x + w / 2}" y="${y + h + 32}" font-size="10" text-anchor="middle" ${FONT}>${xlabel}</text>` : "");
    return { svg, frame, X, Y, clip: `<clipPath id="clip${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>` };
  }
  function legend(x, y, items) {
    const h = 8 + items.length * 15;
    let wMax = Math.max(...items.map((i) => i[0].length)) * 6.1 + 34;
    let svg = `<rect x="${x}" y="${y}" width="${wMax}" height="${h}" rx="3" fill="#fff" fill-opacity=".8" stroke="#ccc" stroke-width="0.8"/>`;
    items.forEach(([label, color, kind], i) => {
      const cy = y + 11 + i * 15;
      svg += kind === "^" ? `<path d="M${x + 15},${cy - 5} L${x + 20},${cy + 4} L${x + 10},${cy + 4} Z" fill="${color}"/>`
        : kind === "v" ? `<path d="M${x + 15},${cy + 5} L${x + 20},${cy - 4} L${x + 10},${cy - 4} Z" fill="${color}"/>`
        : `<line x1="${x + 6}" x2="${x + 24}" y1="${cy}" y2="${cy}" stroke="${color}" stroke-width="1.8" ${kind === "a" ? 'stroke-opacity=".7"' : ""}/>`;
      svg += `<text x="${x + 30}" y="${cy + 3.5}" font-size="9" ${FONT}>${label}</text>`;
    });
    return svg;
  }
  const path = (xs, ys, X, Y) => {
    let d = "", pen = false;
    const step = Math.max(1, Math.floor(xs.length / 900));
    for (let i = 0; i < xs.length; i += step) {
      if (ys[i] === null) { pen = false; continue; }
      d += (pen ? "L" : "M") + X(xs[i]).toFixed(1) + "," + Y(ys[i]).toFixed(1);
      pen = true;
    }
    const k = xs.length - 1;
    if (ys[k] !== null && pen) d += "L" + X(xs[k]).toFixed(1) + "," + Y(ys[k]).toFixed(1);
    return d;
  };

  function drawSingle() {
    const { w, d } = last, xs = w.days, n = xs.length;
    const vals = w.close.concat(d.maS, d.maL).filter((v) => v !== null);
    const xt = dateTicks(xs);
    const A = axes({ x: 70, y: 34, w: 860, h: 270, xlo: xs[0], xhi: xs[n - 1], ylo: Math.min(...vals), yhi: Math.max(...vals), title: `${s.ticker}: Moving Average Crossover (${s.fast}/${s.slow}-day)`, ylabel: "Price ($)", xticks: xt, showXLabels: false });
    const eqv = d.eq.concat(d.hold);
    const B = axes({ x: 70, y: 330, w: 860, h: 255, xlo: xs[0], xhi: xs[n - 1], ylo: Math.min(...eqv), yhi: Math.max(...eqv), ylabel: "Account value (started at $1)", xlabel: "Date", xticks: xt, showXLabels: true });
    const tri = (i, up) => { const x = A.X(xs[i]), y = A.Y(w.close[i]); return up ? `<path d="M${x},${y - 8} L${x + 7.5},${y + 6} L${x - 7.5},${y + 6} Z" fill="${MPL.green}"/>` : `<path d="M${x},${y + 8} L${x + 7.5},${y - 6} L${x - 7.5},${y - 6} Z" fill="${MPL.red}"/>`; };
    const cur = hoverI === null ? "" : `<line x1="${A.X(xs[hoverI])}" x2="${A.X(xs[hoverI])}" y1="34" y2="585" stroke="#000" stroke-opacity=".35" stroke-dasharray="3 3"/>`;
    return `<svg viewBox="0 0 960 640" class="mpl-svg" data-svg role="img" aria-label="Two-panel chart: price with moving averages and trades, and the account value of the strategy against buy and hold">
      <rect width="960" height="640" fill="#fff"/><defs>${A.clip}${B.clip}</defs>
      ${A.svg}${B.svg}
      <g clip-path="url(#clip34)">
        <path d="${path(xs, w.close, A.X, A.Y)}" fill="none" stroke="${MPL.gray}" stroke-width="1.5" stroke-opacity=".7"/>
        <path d="${path(xs, d.maS, A.X, A.Y)}" fill="none" stroke="${MPL.blue}" stroke-width="1.8"/>
        <path d="${path(xs, d.maL, A.X, A.Y)}" fill="none" stroke="${MPL.orange}" stroke-width="1.8"/>
        ${d.marks.length <= 400 ? d.marks.map(([i, t]) => tri(i, t > 0)).join("") : ""}
      </g>
      <g clip-path="url(#clip330)">
        <path d="${path(xs, d.eq, B.X, B.Y)}" fill="none" stroke="${MPL.blue}" stroke-width="1.8"/>
        <path d="${path(xs, d.hold, B.X, B.Y)}" fill="none" stroke="${MPL.gray}" stroke-width="1.8" stroke-opacity=".7"/>
      </g>
      ${A.frame}${B.frame}${cur}
      ${legend(78, 42, [["Price", MPL.gray, "a"], [`Short MA (${s.fast}d)`, MPL.blue], [`Long MA (${s.slow}d)`, MPL.orange], ["Buy", MPL.green, "^"], ["Sell", MPL.red, "v"]])}
      ${legend(78, 338, [["Strategy", MPL.blue], ["Buy & Hold", MPL.gray, "a"]])}
    </svg>`;
  }

  // matplotlib's RdYlGn colormap
  const RDYLGN = ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b", "#ffffbf", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#006837"];
  function cmap(t) {
    t = Math.min(1, Math.max(0, t)) * (RDYLGN.length - 1);
    const i = Math.min(RDYLGN.length - 2, Math.floor(t)), f = t - i;
    const a = RDYLGN[i].match(/\w\w/g).map((h) => parseInt(h, 16)), b = RDYLGN[i + 1].match(/\w\w/g).map((h) => parseInt(h, 16));
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
  }
  function drawSweep() {
    const { rows, hold } = last, F = s.sweepFast, S = s.sweepSlow;
    const lookup = {};
    rows.forEach(([f, sl, total]) => (lookup[f + "/" + sl] = total * 100));
    const holdPct = hold * 100;
    const spread = Math.max(...Object.values(lookup).map((v) => Math.abs(v - holdPct))) || 1;
    const vmin = holdPct - spread, vmax = holdPct + spread;
    const x0 = 80, y0 = 62, gw = 430, gh = 360, cw = gw / S.length, ch = gh / F.length;
    let cells = "";
    F.forEach((f, i) => S.forEach((sl, j) => {
      const v = lookup[f + "/" + sl];
      if (v === undefined) return;
      const t = (v - vmin) / (vmax - vmin);
      cells += `<rect x="${x0 + j * cw}" y="${y0 + i * ch}" width="${cw + 0.5}" height="${ch + 0.5}" fill="${cmap(t)}"><title>${f}/${sl}-day: ${v.toFixed(1)}%</title></rect>` +
        `<text x="${x0 + j * cw + cw / 2}" y="${y0 + i * ch + ch / 2 + 4}" font-size="11" text-anchor="middle" ${FONT}>${v.toFixed(0)}%</text>`;
    }));
    const ticks = S.map((sl, j) => `<line x1="${x0 + j * cw + cw / 2}" x2="${x0 + j * cw + cw / 2}" y1="${y0 + gh}" y2="${y0 + gh + 3.5}" stroke="#000"/><text x="${x0 + j * cw + cw / 2}" y="${y0 + gh + 16}" font-size="10" text-anchor="middle" ${FONT}>${sl}</text>`).join("") +
      F.map((f, i) => `<line x1="${x0 - 3.5}" x2="${x0}" y1="${y0 + i * ch + ch / 2}" y2="${y0 + i * ch + ch / 2}" stroke="#000"/><text x="${x0 - 6}" y="${y0 + i * ch + ch / 2 + 3.5}" font-size="10" text-anchor="end" ${FONT}>${f}</text>`).join("");
    // colorbar
    const cbx = 540, cbw = 18, steps = 60;
    let bar = "";
    for (let k = 0; k < steps; k++) bar += `<rect x="${cbx}" y="${y0 + gh - ((k + 1) / steps) * gh}" width="${cbw}" height="${gh / steps + 0.6}" fill="${cmap(k / (steps - 1))}"/>`;
    const ct = niceTicks(vmin, vmax, 6);
    const cy = (v) => y0 + gh - ((v - vmin) / (vmax - vmin)) * gh;
    bar += `<rect x="${cbx}" y="${y0}" width="${cbw}" height="${gh}" fill="none" stroke="#000" stroke-width="0.8"/>` +
      ct.ticks.filter((v) => v >= vmin && v <= vmax).map((v) => `<line x1="${cbx + cbw}" x2="${cbx + cbw + 3.5}" y1="${cy(v)}" y2="${cy(v)}" stroke="#000"/><text x="${cbx + cbw + 6}" y="${cy(v) + 3.5}" font-size="10" ${FONT}>${fmtTick(v, ct.step)}</text>`).join("") +
      `<line x1="${cbx}" x2="${cbx + cbw}" y1="${cy(holdPct)}" y2="${cy(holdPct)}" stroke="#000" stroke-width="1.5"/>` +
      `<text transform="translate(${cbx + 64},${y0 + gh / 2}) rotate(-90)" font-size="10" text-anchor="middle" ${FONT}>Total return (%)</text>`;
    return `<svg viewBox="0 0 640 480" class="mpl-svg mpl-heat" role="img" aria-label="Heatmap of total return for each fast and slow moving-average pair, green where it beat buy and hold and red where it lost to it">
      <rect width="640" height="480" fill="#fff"/>
      <text x="${x0 + gw / 2}" y="24" font-size="12" text-anchor="middle" ${FONT}>${s.ticker}: total return by parameter combo (%)</text>
      <text x="${x0 + gw / 2}" y="40" font-size="12" text-anchor="middle" ${FONT}>green = beat buy &amp; hold (${holdPct.toFixed(0)}%), red = lost to it</text>
      ${cells}<rect x="${x0}" y="${y0}" width="${gw}" height="${gh}" fill="none" stroke="#000" stroke-width="0.8"/>${ticks}
      <text x="${x0 + gw / 2}" y="${y0 + gh + 34}" font-size="10" text-anchor="middle" ${FONT}>Slow MA (days)</text>
      <text transform="translate(${x0 - 34},${y0 + gh / 2}) rotate(-90)" font-size="10" text-anchor="middle" ${FONT}>Fast MA (days)</text>
      ${bar}
    </svg>`;
  }

  function draw() {
    if (!last) return;
    q("[data-plot]").innerHTML = last.kind === "single" ? drawSingle() : drawSweep();
    if (last.kind === "single") {
      const { w, d } = last, i = hoverI ?? w.days.length - 1;
      const f = (v) => (v === null ? "–" : "$" + v.toFixed(2));
      q("[data-readout]").textContent = `${iso(w.days[i])} · price ${f(w.close[i])} · short MA ${f(d.maS[i])} · long MA ${f(d.maL[i])} · strategy $${d.eq[i].toFixed(2)} · buy & hold $${d.hold[i].toFixed(2)}`;
      const svg = q("[data-svg]");
      const move = (ev) => {
        const r = svg.getBoundingClientRect(), xpx = ((ev.clientX - r.left) / r.width) * 960;
        const n = w.days.length, xm = (w.days[n - 1] - w.days[0]) * 0.05 || 1;
        const day = w.days[0] - xm + ((xpx - 70) / 860) * (w.days[n - 1] - w.days[0] + 2 * xm);
        let lo = 0, hi = n - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (w.days[mid] < day) lo = mid + 1; else hi = mid; }
        if (lo !== hoverI) { hoverI = lo; draw(); }
      };
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerleave", () => { hoverI = null; draw(); });
    } else q("[data-readout]").textContent = "Hover a cell to see its exact return";
  }

  /* ── Controls ── */
  const MODE_HELP = {
    single: "single: tests one FAST_MA / SLOW_MA pair on one stock, prints a summary, and draws the two-panel chart (results.png).",
    sweep: "sweep: tests every SWEEP_FAST × SWEEP_SLOW pair on one stock, ranks them, and draws a heatmap (sweep.png). Green beat buy & hold, red lost to it.",
    multi_stock: "multi_stock: runs the same FAST_MA / SLOW_MA on every stock in TICKERS_TO_TEST and ranks them, to see whether a result holds up beyond one stock.",
  };
  function syncControls() {
    el.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === s.mode)));
    q("[data-mode-help]").textContent = MODE_HELP[s.mode];
    q("[data-ticker]").value = s.ticker;
    q("[data-start]").value = s.start; q("[data-end]").value = s.end;
    for (const k of ["fast", "slow"]) { q(`[data-num="${k}"]`).value = s[k]; q(`[data-range="${k}"]`).value = s[k]; }
    for (const k of ["cost", "stop", "take"]) if (document.activeElement !== q(`[data-frac="${k}"]`)) q(`[data-frac="${k}"]`).value = s[k];
    el.querySelectorAll("[data-preset]").forEach((c) => c.setAttribute("aria-pressed", String(s[c.dataset.preset] === Number(c.dataset.v))));
    // Settings the current mode doesn't use are dimmed, like unused lines in the Python file.
    el.querySelectorAll('[data-row="ma"]').forEach((r) => r.classList.toggle("unused", s.mode === "sweep"));
    el.querySelectorAll('[data-row="ticker"]').forEach((r) => r.classList.toggle("unused", s.mode === "multi_stock"));
    el.querySelectorAll('[data-row="sweep"]').forEach((r) => r.classList.toggle("unused", s.mode !== "sweep"));
    el.querySelectorAll('[data-row="multi"]').forEach((r) => r.classList.toggle("unused", s.mode !== "multi_stock"));
    const list = (k, opts) => (q(`[data-list="${k}"]`).innerHTML = opts.map((v) => `<button type="button" class="p-chip" data-toggle="${k}" data-v="${v}" aria-pressed="${s[k].includes(v)}">${k === "tickers" ? `"${v}"` : v}</button>`).join(""));
    list("sweepFast", SWEEP_FAST_OPTS); list("sweepSlow", SWEEP_SLOW_OPTS);
    if (index) list("tickers", index.tickers.map((t) => t.ticker));
    q("[data-periods]").innerHTML = PERIODS.map(([c]) => `<button type="button" class="p-chip" data-period="${c}">${c}</button>`).join("");
    // The matching command line for the real tool.
    const lists = s.mode === "sweep" ? `# in backtest.py: SWEEP_FAST = [${s.sweepFast.join(", ")}]   SWEEP_SLOW = [${s.sweepSlow.join(", ")}]\n`
      : s.mode === "multi_stock" ? `# in backtest.py: TICKERS_TO_TEST = [${s.tickers.map((t) => `"${t}"`).join(", ")}]\n` : "";
    q("[data-cmd]").textContent = `${lists}$ python backtest.py --ticker ${s.ticker} --start ${s.start} --end ${s.end} --short ${s.fast} --long ${s.slow} --cost ${s.cost} --stop-loss ${s.stop} --take-profit ${s.take} --mode ${s.mode}`;
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 120); };
  function setMA(k, v) {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) return;
    if (k === "fast") { s.fast = Math.min(Math.max(v, 1), 100); if (s.fast >= s.slow) s.slow = Math.min(250, s.fast + 1); }
    else { s.slow = Math.min(Math.max(v, 2), 250); if (s.fast >= s.slow) s.fast = Math.max(1, s.slow - 1); }
  }

  el.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.range) { setMA(t.dataset.range, t.value); schedule(); }
  });
  el.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.num) setMA(t.dataset.num, t.value);
    else if (t.dataset.frac) { const v = Number(t.value); if (Number.isFinite(v) && v >= 0) s[t.dataset.frac] = v; }
    else if (t.dataset.ticker !== undefined) s.ticker = t.value;
    else if (t.dataset.start !== undefined && t.value) s.start = t.value;
    else if (t.dataset.end !== undefined && t.value) s.end = t.value;
    else return;
    schedule();
  });
  el.addEventListener("click", async (e) => {
    if (!index) return; // still loading the price list
    const m = e.target.closest("[data-mode]");
    if (m) { s.mode = m.dataset.mode; return schedule(); }
    const p = e.target.closest("[data-preset]");
    if (p) { setMA(p.dataset.preset, p.dataset.v); return schedule(); }
    const tg = e.target.closest("[data-toggle]");
    if (tg) {
      const k = tg.dataset.toggle, v = k === "tickers" ? tg.dataset.v : Number(tg.dataset.v);
      s[k] = s[k].includes(v) ? s[k].filter((x) => x !== v) : s[k].concat(v);
      if (k !== "tickers") s[k].sort((a, b) => a - b);
      if (!s[k].length) s[k] = [v]; // keep at least one
      return schedule();
    }
    const per = e.target.closest("[data-period]");
    if (per) {
      const years = PERIODS.find((x) => x[0] === per.dataset.period)[1];
      const meta = index.tickers.find((x) => x.ticker === s.ticker);
      const lastDay = toDay(meta.last) + 1;
      s.end = iso(lastDay);
      s.start = years ? iso(Math.max(toDay(meta.first), lastDay - Math.round(years * 365.25))) : meta.first;
      return schedule();
    }
    if (e.target.closest("[data-copy]")) {
      const cmd = q("[data-cmd]").textContent.split("\n").pop().replace(/^\$ /, "");
      try { await navigator.clipboard.writeText(cmd); e.target.textContent = "Copied ✓"; } catch (err) { e.target.textContent = "Select and copy"; }
      setTimeout(() => (e.target.textContent = "Copy command"), 1800);
    }
  });

  (async () => {
    try { await loadIndex(); run(); }
    catch (err) { q("[data-out]").textContent = "Couldn't load the price data. Please refresh the page."; }
  })();
  return () => { alive = false; clearTimeout(timer); };
};
