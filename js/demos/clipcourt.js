// ClipCourt: the shot chart + zone stats ClipCourt produces, driven by a
// simulated game (the real YOLOv8 video pipeline needs a GPU server).
window.DEMOS = window.DEMOS || {};
window.DEMOS.clipcourt = function (el) {
  const RIM = { x: 250, y: 52 };          // court units: 500 × 470 half court
  let shots = [], filter = "all", game = 0;

  el.innerHTML = `
    <div class="p-row">
      <div class="p-main">
        <div class="court" data-court>
          <svg viewBox="0 0 500 470" aria-hidden="true">
            <g fill="none" stroke="#8A5A2B" stroke-width="3">
              <rect x="170" y="0" width="160" height="190" fill="#D9B98E"></rect>
              <circle cx="250" cy="190" r="60"></circle>
              <path d="M30,0 L30,52 A220,220 0 0 0 470,52 L470,0"></path>
              <path d="M190,470 A60,60 0 0 1 310,470"></path>
              <line x1="220" y1="38" x2="280" y2="38" stroke-width="4"></line>
              <circle cx="250" cy="52" r="10" stroke="#C2410C" stroke-width="4"></circle>
            </g>
          </svg>
        </div>
        <div class="p-legend">
          <span><i style="width:12px;height:12px;border-radius:50%;background:#EA580C;border:2px solid #fff"></i>Made</span>
          <span><i style="width:12px;height:12px;border-radius:50%;border:3px solid var(--p-muted)"></i>Missed</span>
        </div>
      </div>
      <div class="p-side">
        <div class="btn-row" role="group" aria-label="Filter shots" data-filters></div>
        <dl class="p-metrics" data-totals></dl>
        <div class="p-box" data-zones></div>
        <button type="button" class="p-btn p-btn-primary" data-new>Simulate another game</button>
        <p class="p-note">A simulated game in the same format ClipCourt outputs from real footage: every shot located, labelled made or missed, and grouped by zone. Running the full YOLOv8 video pipeline needs a GPU server, so it lives on GitHub.</p>
      </div>
    </div>`;

  const q = (s) => el.querySelector(s);

  function zoneOf(x, y) {
    const d = Math.hypot(x - RIM.x, y - RIM.y);
    if (x >= 170 && x <= 330 && y <= 190) return "Paint";
    if (d > 220 || (y <= 52 && (x < 30 || x > 470))) return "Three";
    return "Mid-range";
  }

  function simulate() {
    game++;
    const out = [];
    const pMake = { Paint: 0.57, "Mid-range": 0.41, Three: 0.35 };
    const n = 26 + Math.floor(Math.random() * 10);
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      let x, y;
      if (roll < 0.4) { x = 185 + Math.random() * 130; y = 15 + Math.random() * 165; }
      else if (roll < 0.65) { const a = Math.random() * Math.PI, r = 110 + Math.random() * 95; x = RIM.x + Math.cos(a) * r; y = RIM.y + Math.sin(a) * r; }
      else { const a = Math.random() * Math.PI, r = 232 + Math.random() * 40; x = RIM.x + Math.cos(a) * r; y = RIM.y + Math.sin(a) * r; }
      x = Math.min(488, Math.max(12, x)); y = Math.min(455, Math.max(10, y));
      const zone = zoneOf(x, y);
      out.push({ x, y, zone, made: Math.random() < pMake[zone] });
    }
    shots = out;
    render(true);
  }

  function render(fresh) {
    const court = q("[data-court]");
    if (fresh) {
      court.querySelectorAll(".shot").forEach((s) => s.remove());
      shots.forEach((s, i) => {
        const d = document.createElement("span");
        d.className = "shot " + (s.made ? "made" : "miss") + " hide";
        d.style.left = (s.x / 5) + "%";
        d.style.top = (s.y / 4.7) + "%";
        d.title = `${s.zone}: ${s.made ? "made" : "missed"}`;
        court.appendChild(d);
        s.el = d;
        setTimeout(() => s.el && s.el.classList.toggle("hide", !visible(s)), 25 * i);
      });
    } else {
      shots.forEach((s) => s.el.classList.toggle("hide", !visible(s)));
    }

    q("[data-filters]").innerHTML = [["all", "All"], ["made", "Made"], ["miss", "Missed"]]
      .map(([id, l]) => `<button type="button" class="p-btn" data-f="${id}" aria-pressed="${filter === id}">${l}</button>`).join("");

    const made = shots.filter((s) => s.made).length;
    const threes = shots.filter((s) => s.zone === "Three");
    const threeMade = threes.filter((s) => s.made).length;
    const pts = shots.reduce((a, s) => a + (s.made ? (s.zone === "Three" ? 3 : 2) : 0), 0);
    q("[data-totals]").innerHTML = [
      ["Field goals", `${made}/${shots.length}`],
      ["FG%", Math.round((made / shots.length) * 100) + "%"],
      ["3-pointers", `${threeMade}/${threes.length}`],
      ["Points", String(pts)],
    ].map(([k, v]) => `<div class="p-metric"><dt>${k}</dt><dd>${v}</dd></div>`).join("");

    q("[data-zones]").innerHTML = `<p class="p-note" style="margin-bottom:10px">Shooting by zone · game ${game}</p>` +
      ["Paint", "Mid-range", "Three"].map((z) => {
        const zs = shots.filter((s) => s.zone === z), zm = zs.filter((s) => s.made).length;
        const pc = zs.length ? Math.round((zm / zs.length) * 100) : 0;
        return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px"><span>${z}</span><span>${zm}/${zs.length} · ${pc}%</span></div><div class="zone-bar"><span style="width:${pc}%"></span></div></div>`;
      }).join("");
  }

  function visible(s) { return filter === "all" || (filter === "made" ? s.made : !s.made); }

  el.addEventListener("click", (e) => {
    const f = e.target.closest("[data-f]");
    if (f) { filter = f.dataset.f; render(false); }
    if (e.target.closest("[data-new]")) simulate();
  });

  simulate();
  return () => shots.forEach((s) => (s.el = null));
};
