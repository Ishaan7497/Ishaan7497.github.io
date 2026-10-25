// Strategy Backtester: an in-browser port of the moving-average crossover backtester.
// Simulates a market with geometric Brownian motion plus one crash regime, then
// compares an MA-crossover strategy (with optional stop-loss) against buy-and-hold.
window.DEMOS = window.DEMOS || {};
window.DEMOS.backtester = function (el) {
  const p = { fast: 10, slow: 40, stop: 8, vol: 25, drift: 8, seed: 7 };

  el.innerHTML = `
    <div class="p-row">
      <form class="p-side" aria-label="Backtest parameters" onsubmit="return false">
        <label class="p-label">Fast moving average <output data-o="fast"></output>
          <input type="range" data-k="fast" min="3" max="50" value="${p.fast}" /></label>
        <label class="p-label">Slow moving average <output data-o="slow"></output>
          <input type="range" data-k="slow" min="10" max="200" value="${p.slow}" /></label>
        <label class="p-label">Stop-loss <output data-o="stop"></output>
          <input type="range" data-k="stop" min="0" max="30" value="${p.stop}" /></label>
        <label class="p-label">Market volatility <output data-o="vol"></output>
          <input type="range" data-k="vol" min="5" max="60" value="${p.vol}" /></label>
        <label class="p-label">Market drift (per year) <output data-o="drift"></output>
          <input type="range" data-k="drift" min="-20" max="30" value="${p.drift}" /></label>
        <button type="button" class="p-btn p-btn-primary" data-reseed>New random market</button>
      </form>
      <div class="p-main">
        <div class="p-box">
          <svg class="chart" viewBox="0 0 600 240" role="img" aria-label="Equity curves for the strategy and buy and hold">
            <g data-grid></g>
            <rect data-crash y="0" height="240" fill="currentColor" opacity="0.07"></rect>
            <text data-crash-label y="14" font-size="11" fill="var(--p-muted)">crash</text>
            <path data-bh fill="none" stroke="var(--p-muted)" stroke-width="2" stroke-dasharray="5 5"></path>
            <path data-st fill="none" stroke="var(--p-accent)" stroke-width="3" stroke-linejoin="round"></path>
          </svg>
          <div class="p-legend">
            <span><i style="border-top:3px solid var(--p-accent)"></i>Strategy</span>
            <span><i style="border-top:2px dashed var(--p-muted)"></i>Buy &amp; hold</span>
          </div>
        </div>
        <dl class="p-metrics" data-metrics></dl>
        <p class="p-note">Runs on a simulated three-year market, not real prices, so every click of "New random market" is a fresh test. Notice how the stop-loss changes behaviour around the crash.</p>
      </div>
    </div>`;

  const q = (s) => el.querySelector(s);
  const fmt = { fast: (v) => v + " days", slow: (v) => v + " days", stop: (v) => (v ? v + "%" : "off"), vol: (v) => v + "%", drift: (v) => (v > 0 ? "+" : "") + v + "%" };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function run() {
    const r = rng(p.seed * 9973 + 17);
    const gauss = () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const N = 756, dt = 1 / 252, sig = p.vol / 100, mu = p.drift / 100;
    const crashAt = 150 + Math.floor(r() * 450), crashLen = 30;
    const px = [100];
    for (let i = 1; i < N; i++) {
      let s = sig, m = mu;
      if (i >= crashAt && i < crashAt + crashLen) { s = sig * 2; m = -2.2; }
      px.push(px[i - 1] * Math.exp((m - 0.5 * s * s) * dt + s * Math.sqrt(dt) * gauss()));
    }
    const ma = (k) => { const out = []; let sum = 0; for (let i = 0; i < N; i++) { sum += px[i]; if (i >= k) sum -= px[i - k]; out.push(i >= k - 1 ? sum / k : null); } return out; };
    const slow = Math.max(p.slow, p.fast + 1);
    const mf = ma(p.fast), ms = ma(slow);
    const eq = [100], rets = [];
    let inPos = false, entry = 0, stopped = false, trades = 0, daysIn = 0;
    for (let i = 1; i < N; i++) {
      const dr = inPos ? px[i] / px[i - 1] - 1 : 0;
      if (inPos) daysIn++;
      rets.push(dr);
      eq.push(eq[i - 1] * (1 + dr));
      const up = ms[i] !== null && mf[i] > ms[i];
      if (!up) { inPos = false; stopped = false; }
      else if (!inPos && !stopped) { inPos = true; entry = px[i]; trades++; }
      if (inPos && p.stop > 0 && px[i] < entry * (1 - p.stop / 100)) { inPos = false; stopped = true; }
    }
    let peak = eq[0], dd = 0;
    for (const v of eq) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    const sharpe = sd ? (mean / sd) * Math.sqrt(252) : 0;
    return { px, eq, N, dd, trades, sharpe, exposure: daysIn / (N - 1), crashAt, crashLen };
  }

  function draw() {
    for (const k of ["fast", "slow", "stop", "vol", "drift"]) q(`[data-o="${k}"]`).textContent = fmt[k](p[k]);
    const R = run();
    const lo = Math.min(...R.px, ...R.eq) * 0.97, hi = Math.max(...R.px, ...R.eq) * 1.03;
    const X = (i) => (i / (R.N - 1)) * 600, Y = (v) => 230 - ((v - lo) / (hi - lo)) * 220;
    const path = (a) => { let d = ""; for (let i = 0; i < R.N; i += 3) d += (i ? " L" : "M") + X(i).toFixed(1) + "," + Y(a[i]).toFixed(1); return d + " L600," + Y(a[R.N - 1]).toFixed(1); };
    q("[data-st]").setAttribute("d", path(R.eq));
    q("[data-bh]").setAttribute("d", path(R.px));
    const cr = q("[data-crash]");
    cr.setAttribute("x", X(R.crashAt).toFixed(1));
    cr.setAttribute("width", (X(R.crashLen) ).toFixed(1));
    q("[data-crash-label]").setAttribute("x", (X(R.crashAt) + 4).toFixed(1));
    q("[data-grid]").innerHTML = [60, 120, 180].map((y) => `<line x1="0" x2="600" y1="${y}" y2="${y}" stroke="var(--p-line)" />`).join("");
    const pct = (v) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";
    const m = [
      ["Strategy return", pct(R.eq[R.N - 1] / 100 - 1), "color:var(--p-accent)"],
      ["Buy & hold", pct(R.px[R.N - 1] / 100 - 1), ""],
      ["Max drawdown", (R.dd * 100).toFixed(1) + "%", ""],
      ["Sharpe ratio", R.sharpe.toFixed(2), ""],
      ["Trades", String(R.trades), ""],
      ["Time in market", Math.round(R.exposure * 100) + "%", ""],
    ];
    q("[data-metrics]").innerHTML = m.map(([k, v, s]) => `<div class="p-metric"><dt>${k}</dt><dd style="${s}">${v}</dd></div>`).join("");
  }

  el.querySelectorAll("input[data-k]").forEach((inp) =>
    inp.addEventListener("input", () => {
      p[inp.dataset.k] = Number(inp.value);
      if (p.fast >= p.slow) {
        if (inp.dataset.k === "fast") { p.slow = p.fast + 1; q('[data-k="slow"]').value = p.slow; }
        else { p.fast = Math.max(3, p.slow - 1); q('[data-k="fast"]').value = p.fast; }
      }
      draw();
    })
  );
  q("[data-reseed]").addEventListener("click", () => { p.seed = Math.floor(Math.random() * 1e6); draw(); });
  draw();
};
