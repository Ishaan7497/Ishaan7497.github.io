// Hand Cricket CV: a browser port of OoE_CV.py from the Odd_or_Eve_CV repo.
// Same screens, colours, gesture rules (fstates / is_cup / raw_gesture),
// hold-to-confirm, CPU "Brain", match engine (end_of_ball_update), effects and
// celebrations, drawn onto a 960×720 canvas like the OpenCV window.
// Hand tracking is MediaPipe HandLandmarker running locally in the browser.
// Without a camera, cards can be clicked and number keys pressed.
window.DEMOS = window.DEMOS || {};
window.DEMOS.cricket = function (el) {
  const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const W = 960, H = 720;

  // OpenCV colours are BGR; these are the same colours in RGB.
  const DEEP = "rgb(30,22,18)", PANEL = "rgb(52,38,32)", PANEL_HI = "rgb(78,60,52)", LINE = "rgb(105,85,75)";
  const TEXT = "rgb(248,244,240)", TEXT_DIM = "rgb(200,185,175)", TEXT_MUTE = "rgb(135,120,110)";
  const PRIMARY = "rgb(120,220,95)", GOLD = "rgb(250,200,35)", RED = "rgb(235,75,60)", BLUE = "rgb(90,175,240)", PURPLE = "rgb(240,100,220)";

  const HAND_CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  const G_MAP = { "01000": 1, "01100": 2, "01110": 3, "01111": 4, "11111": 5, "10000": 6, "11000": 7, "11100": 8, "11110": 9 };
  const MODE_NAMES = { "1 to 6": "CLASSIC  1-6", "1 to 10": "EXTENDED  1-10", CRAZY: "CRAZY  1-10" };
  const PAUSE_SECONDS = 1.2, COIN_DUR = 45, HOLD = 1.3, GRACE = 0.15, QUIT_HOLD = 3.0;

  el.innerHTML = `
    <div class="cv-wrap" data-wrap>
      <canvas class="cv-canvas" width="${W}" height="${H}" data-cv role="img" aria-label="Hand Cricket game screen"></canvas>
    </div>
    <div class="cv-controls">
      <button type="button" class="p-btn p-btn-primary" data-cam>Turn on camera</button>
      <button type="button" class="p-btn" data-sound aria-pressed="true">Sound on</button>
      <button type="button" class="p-btn" data-full>Full screen</button>
      <span class="p-note" data-status>Camera off: click the cards, use the buttons below, or press number keys.</span>
    </div>
    <div class="cv-fallback" role="group" aria-label="Choices" data-fallback></div>
    <details class="hc-guide">
      <summary>Gesture guide</summary>
      <ul>
        <li><b>1</b> index finger</li><li><b>2</b> index + middle</li><li><b>3</b> index + middle + ring</li>
        <li><b>4</b> four fingers, thumb folded</li><li><b>5</b> open hand</li><li><b>6</b> thumb only</li>
        <li><b>7</b> thumb + index</li><li><b>8</b> thumb + index + middle</li><li><b>9</b> thumb + index + middle + ring</li>
        <li><b>10</b> both hands closed, held together</li>
      </ul>
      <p class="p-note">Use one hand for 1–9. Hold the gesture until the ring fills (1.3 s). Video never leaves your device.</p>
    </details>`;

  const q = (s) => el.querySelector(s);
  const cv = q("[data-cv]"), ctx = cv.getContext("2d");
  const video = document.createElement("video");
  video.playsInline = true; video.muted = true;

  let alive = true, raf = 0, lastStep = 0, frameIdx = 0, hits = [], pending = null, fallbackKey = "";
  const cam = { on: false, loading: false, lm: null, stream: null, crop: null };
  const now = () => performance.now() / 1000;
  const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  function choices(items, weights) {
    let r = Math.random() * weights.reduce((x, y) => x + y, 0);
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  /* ── Drawing helpers (ports of the OpenCV helpers) ── */
  const font = (scale, bold) => `${bold ? 700 : 500} ${Math.round(scale * 30)}px Arial, Helvetica, sans-serif`;
  function textW(s, scale, bold) { ctx.font = font(scale, bold); return ctx.measureText(String(s)).width; }
  function rrect(x1, y1, x2, y2, r) {
    r = Math.max(0, Math.min(r, (x2 - x1) / 2, (y2 - y1) / 2));
    ctx.beginPath(); ctx.roundRect(x1, y1, x2 - x1, y2 - y1, r);
  }
  function roundedRect(p1, p2, color, radius = 12, thickness = -1) {
    rrect(p1[0], p1[1], p2[0], p2[1], radius);
    if (thickness === -1) { ctx.fillStyle = color; ctx.fill(); }
    else { ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.stroke(); }
  }
  function blendRect(p1, p2, color, alpha = 0.85, radius = 0) {
    ctx.save(); ctx.globalAlpha = alpha; roundedRect(p1, p2, color, radius, -1); ctx.restore();
  }
  function text(s, x, y, scale = 0.75, color = TEXT, bold = false, shadow = true, center = false) {
    s = String(s);
    ctx.font = font(scale, bold);
    if (center) x -= ctx.measureText(s).width / 2;
    if (shadow) { ctx.lineJoin = "round"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.strokeText(s, x + 1, y + 2); ctx.fillStyle = "#000"; ctx.fillText(s, x + 1, y + 2); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function glowText(s, x, y, scale, color, bold = true, layers = 4, center = false) {
    s = String(s);
    ctx.font = font(scale, bold);
    if (center) x -= ctx.measureText(s).width / 2;
    ctx.lineJoin = "round";
    for (let i = layers; i > 0; i--) { ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = color; ctx.lineWidth = 4 + i * 3; ctx.strokeText(s, x, y); ctx.restore(); }
    ctx.strokeStyle = "#000"; ctx.lineWidth = 5; ctx.strokeText(s, x, y);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function drawPill(x, y, label, color, scale = 0.65, pad = [14, 8]) {
    ctx.font = font(scale, false);
    const tw = ctx.measureText(label).width, th = scale * 22;
    const x2 = x + tw + pad[0] * 2, y1 = y - th - pad[1], y2 = y + pad[1];
    roundedRect([x, y1], [x2, y2], color, (y2 - y1) / 2, -1);
    ctx.fillStyle = "rgb(10,10,10)"; ctx.fillText(label, x + pad[0], y);
    return x2;
  }
  function panelBg(y1, y2, alpha = 0.78) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = DEEP; ctx.fillRect(0, y1, W, y2 - y1); ctx.restore();
    ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y1 + 0.5); ctx.lineTo(W, y1 + 0.5); ctx.moveTo(0, y2 + 0.5); ctx.lineTo(W, y2 + 0.5); ctx.stroke();
  }
  function sheet(height) { const y1 = H - height; panelBg(y1, H - 8, 0.86); return y1; }
  function vignette(alpha = 0.55) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = "rgb(14,8,5)"; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  function circle(x, y, r, color, fill = true, lw = 1) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function arc(x, y, r, frac, color, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.stroke(); ctx.lineCap = "butt";
  }
  function optionCard(box, num, title, col, sub = null, active = false, prog = 0) {
    const [x1, y1, x2, y2] = box, ch = y2 - y1;
    hits.push({ x1, y1, x2, y2, n: num });
    blendRect([x1, y1], [x2, y2], active ? PANEL_HI : PANEL, 0.9, 14);
    roundedRect([x1, y1], [x2, y2], active ? col : LINE, 14, active ? 2 : 1);
    roundedRect([x1 + 1, y1 + 12], [x1 + 6, y2 - 12], col, 2, -1);
    const r = Math.min(22, ch / 2 - 8), bx = x1 + 22 + r, by = y1 + ch / 2;
    circle(bx, by, r, col);
    text(num, bx, by + r * 0.42, r / 23, "rgb(10,10,10)", true, false, true);
    const tx = bx + r + 18;
    if (sub) {
      text(title, tx, y1 + ch / 2 - 6, 0.82, col, true);
      text(sub, tx, y1 + ch / 2 + Math.min(24, ch / 2 - 10), 0.58, TEXT_DIM);
    } else text(title, tx, y1 + ch / 2 + 11, 0.82, active ? TEXT : col, true);
    if (active && prog > 0) {
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(x1 + 14, y2 - 4); ctx.lineTo(x1 + 14 + (x2 - x1 - 28) * prog, y2 - 4); ctx.stroke();
    }
  }
  function drawStar(cx, cy, r, col) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const ang = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 === 0 ? r : r * 0.45;
      const px = cx + rr * Math.cos(ang), py = cy + rr * Math.sin(ang);
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  function progressBar(prog, height = 6) {
    ctx.fillStyle = "rgb(18,12,10)"; ctx.fillRect(0, H - height, W, height);
    if (prog > 0) { ctx.fillStyle = prog < 1 ? PRIMARY : GOLD; ctx.fillRect(0, H - height, W * prog, height); }
  }

  /* ── Sound (port of _make / _chord / SND, with the repo's mp3 overrides) ── */
  const SR = 22050;
  const SND_DEF = {
    click: ["tones", [[880, 0.04, 0.30], [1320, 0.05, 0.25]]],
    hover: ["tones", [[660, 0.03, 0.18]]],
    run: ["tones", [[620, 0.06, 0.35], [820, 0.10, 0.40]]],
    four: ["chords", [[[523, 659], 0.10, 0.45], [[659, 784], 0.10, 0.45], [[784, 988], 0.20, 0.55]]],
    six: ["chords", [[[523, 659, 784], 0.10, 0.50], [[587, 740, 880], 0.10, 0.50], [[659, 831, 988], 0.10, 0.50], [[784, 988, 1175], 0.32, 0.65]]],
    wicket: ["tones", [[440, 0.05, 0.45], [330, 0.10, 0.50], [220, 0.12, 0.55], [165, 0.20, 0.55]]],
    out: ["tones", [[330, 0.18, 0.55], [247, 0.20, 0.55], [165, 0.30, 0.55], [110, 0.40, 0.50]]],
    coin: ["tones", [[900, 0.04, 0.30], [1200, 0.04, 0.30], [900, 0.04, 0.25], [1200, 0.04, 0.30], [900, 0.04, 0.20], [1300, 0.05, 0.30]]],
    toss_win: ["chords", [[[784, 988], 0.10, 0.50], [[1047, 1319], 0.20, 0.55]]],
    win: ["chords", [[[392, 494], 0.10, 0.50], [[523, 659], 0.10, 0.50], [[659, 784], 0.10, 0.50], [[784, 988, 1175], 0.45, 0.65]]],
    lose: ["chords", [[[330, 415], 0.18, 0.50], [[277, 349], 0.18, 0.50], [[220, 277], 0.20, 0.50], [[165, 196], 0.45, 0.45]]],
    tie: ["tones", [[523, 0.12, 0.45], [494, 0.12, 0.45], [523, 0.30, 0.50]]],
    crowd_cheer: ["chords", [[[220, 277, 330, 415], 0.30, 0.30], [[247, 311, 370, 466], 0.30, 0.35], [[262, 330, 392, 494], 0.40, 0.40], [[220, 277, 330, 392, 494], 0.80, 0.45]]],
    crowd_aww: ["chords", [[[523, 466], 0.25, 0.35], [[466, 415], 0.30, 0.35], [[415, 370], 0.40, 0.35], [[370, 311], 0.60, 0.35]]],
    out_call: ["chords", [[[260, 520, 1040], 0.05, 0.55], [[280, 560, 1120], 0.18, 0.65], [[300, 600, 1200], 0.18, 0.65], [[1800, 2400], 0.05, 0.55], [[1200, 1600], 0.04, 0.30]]],
    stumps_hit: ["tones", [[80, 0.04, 0.7], [60, 0.06, 0.7], [40, 0.10, 0.6], [200, 0.04, 0.5], [150, 0.06, 0.4]]],
  };
  const OVERRIDES = ["crowd_cheer", "crowd_aww", "stumps_hit"]; // real clips shipped in the game's assets/
  const audio = { ctx: null, buf: {}, on: true, master: null };
  try { audio.on = localStorage.getItem("hc:sound") !== "off"; } catch (e) {}

  function segment(freqs, dur, vol, rel) {
    const n = Math.max(1, Math.floor(SR * dur)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (const f of freqs) s += Math.sin(2 * Math.PI * f * (i / SR)); out[i] = (s / freqs.length) * vol; }
    const atk = Math.min(Math.floor(0.008 * SR), Math.floor(n / 4)), r = Math.min(Math.floor(rel * SR), Math.floor(n / 3));
    for (let i = 0; i < atk; i++) out[i] *= i / atk;
    for (let i = 0; i < r; i++) out[n - 1 - i] *= i / r;
    return out;
  }
  function synth(kind, parts) {
    const segs = parts.map((p) => (kind === "tones" ? segment([p[0]], p[1], p[2], 0.03) : segment(p[0], p[1], p[2], 0.04)));
    const len = segs.reduce((a, s) => a + s.length, 0), b = audio.ctx.createBuffer(1, len, SR), ch = b.getChannelData(0);
    let o = 0;
    for (const s of segs) { for (let i = 0; i < s.length; i++) ch[o + i] = Math.max(-1, Math.min(1, s[i])); o += s.length; }
    return b;
  }
  function unlockAudio() {
    if (!audio.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.6;
      audio.master.connect(audio.ctx.destination);
      for (const [name, [kind, parts]] of Object.entries(SND_DEF)) audio.buf[name] = synth(kind, parts);
      for (const name of OVERRIDES) {
        fetch(`assets/sounds/${name}.mp3`).then((r) => r.arrayBuffer()).then((ab) => audio.ctx.decodeAudioData(ab))
          .then((b) => { audio.buf[name] = b; }).catch(() => {});
      }
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
  }
  function play(name) {
    if (!audio.on || !audio.ctx || !audio.buf[name]) return;
    const src = audio.ctx.createBufferSource();
    src.buffer = audio.buf[name];
    src.connect(audio.master);
    src.start();
  }
  const timers = new Set();
  function playLater(name, delay) { const id = setTimeout(() => { timers.delete(id); if (alive) play(name); }, delay * 1000); timers.add(id); }

  /* ── Effects (port of Particles / Confetti / FX) ── */
  function particles(cx, cy, count = 65, gravity = 0.45, speed = [4, 15], life = [35, 90]) {
    const cols = ["rgb(140,255,120)", "rgb(255,220,90)", GOLD, "rgb(255,120,200)", "rgb(255,95,95)", "#fff"];
    return Array.from({ length: count }, () => {
      const ang = Math.random() * Math.PI * 2, spd = speed[0] + Math.random() * (speed[1] - speed[0]), lf = randint(...life);
      return { x: cx, y: cy, vx: spd * Math.cos(ang), vy: spd * Math.sin(ang) - (3 + Math.random() * 6), r: randint(4, 11), c: choice(cols), life: lf, ml: lf, g: gravity };
    });
  }
  function drawParticles(ps) {
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99; p.life -= 1;
      if (p.life > 0) circle(p.x, p.y, Math.max(1, p.r * (p.life / p.ml)), p.c);
    }
    return ps.filter((p) => p.life > 0);
  }
  const fx = {
    q: [], confetti: null,
    trigger(k, kw = {}) { this.q.push({ k, t: 0, ...kw }); },
    confettiOn() {
      const cols = [PRIMARY, GOLD, BLUE, PURPLE, RED, "#fff"];
      this.confetti = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: -Math.random() * H, vx: Math.random() * 2 - 1, vy: 2.5 + Math.random() * 3, rot: Math.random() * 6.28, spin: Math.random() * 0.5 - 0.25, sz: randint(5, 11), c: choice(cols) }));
    },
    clear() { this.q = []; this.confetti = null; },
    shake() { const a = this.q.find((e) => e.k === "OUT" && e.t < 22); if (!a) return [0, 0]; const sh = 10 * (1 - a.t / 22); return [randint(-sh, sh), randint(-sh, sh)]; },
    draw() {
      if (this.confetti) for (const p of this.confetti) {
        p.x += p.vx; p.y += p.vy; p.rot += p.spin;
        if (p.y > H + 20) { p.y = -10; p.x = Math.random() * W; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.sz, -p.sz / 2, p.sz * 2, p.sz); ctx.restore();
      }
      const next = [];
      for (const a of this.q) {
        const t = a.t;
        const wash = (col, al) => { ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore(); };
        if (a.k === "OUT") { if (t >= 95) continue; wash("rgb(215,35,35)", 0.32 * (1 - t / 95)); }
        else if (a.k === "BIGRUN") {
          if (t >= 115) continue;
          a.ps = a.ps || particles(W / 2, H / 2, 42, 0.45, [5, 17]);
          if (t < 18) wash(GOLD, 0.22 * (1 - t / 18));
          a.ps = drawParticles(a.ps);
          glowText(a.lbl || "BIG HIT!", W / 2, H / 3, 1.9, GOLD, true, 3, true);
        } else if (a.k === "RUN_POP") {
          if (t >= 50) continue;
          const p = t / 50;
          ctx.save(); ctx.globalAlpha = 1 - p; glowText(`+${a.runs}`, W / 2, H * 0.45 - p * 70, 1.7, a.col || PRIMARY, true, 3, true); ctx.restore();
        } else if (a.k === "FLASH") { if (t >= 30) continue; wash(a.col || PRIMARY, 0.13 * (1 - t / 30)); }
        else if (a.k === "WIN") {
          if (t >= 220) continue;
          a.ps = a.ps || particles(W / 2, H * 0.35, 55, 0.45, [5, 18]);
          a.ps = drawParticles(a.ps);
          if ([40, 80, 130, 170].includes(t)) next.push({ k: "_BURST", t: 0, cx: randint(W * 0.2, W * 0.8), cy: randint(H * 0.2, H * 0.5) });
        } else if (a.k === "_BURST") {
          if (t >= 35) continue;
          a.ps = a.ps || particles(a.cx, a.cy, 20, 0.45, [3, 9]);
          a.ps = drawParticles(a.ps);
        }
        next.push({ ...a, t: t + 1 });
      }
      this.q = next;
    },
  };

  /* ── Gestures (port of fstates / is_cup / raw_gesture / GestureConfirm) ── */
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  function fstates(l) {
    const hs = d3(l[0], l[9]);
    if (hs < 0.001) return "00000";
    const t = d3(l[4], l[5]) > hs * 0.45 ? "1" : "0";
    return t + [8, 12, 16, 20].map((i) => (d3(l[i], l[0]) > d3(l[i - 2], l[0]) ? "1" : "0")).join("");
  }
  const fingerCount = (s) => [...s].filter((c) => c === "1").length;
  const isCup = (hl) => hl.length >= 2 && hl.every((l) => fingerCount(fstates(l)) <= 1);
  function rawGesture(hl, valid) {
    if (!hl.length) return null;
    if (valid.includes(10) && isCup(hl)) return 10;
    if (hl.length === 1) { const v = G_MAP[fstates(hl[0])]; if (v !== undefined && valid.includes(v)) return v; }
    return null;
  }
  // Same as GestureConfirm, plus a 150 ms grace so one dropped frame doesn't reset the hold.
  const gc = {
    cur: null, t0: null, seen: 0,
    update(raw) {
      const t = now();
      if (raw !== null && raw === this.cur) this.seen = t;
      else if (this.cur !== null && t - this.seen < GRACE) { /* brief flicker: keep holding */ }
      else { this.cur = raw; this.t0 = raw !== null ? t : null; this.seen = t; return [null, 0]; }
      if (this.cur === null) return [null, 0];
      const e = t - this.t0, p = Math.min(e / HOLD, 1);
      if (e >= HOLD) { const v = this.cur; this.reset(); return [v, 1]; }
      return [null, p];
    },
    reset() { this.cur = null; this.t0 = null; },
  };
  const quitDet = {
    start: null, frames: 0,
    update(hl) {
      const two = hl.length >= 2 && hl.filter((l) => fstates(l) === "00000").length >= 2;
      if (!two) { this.start = null; this.frames = 0; return 0; }
      if (++this.frames < 5) return 0;
      if (this.start === null) this.start = now();
      return Math.min(1, (now() - this.start) / QUIT_HOLD);
    },
  };
  const isHandRaised = (hl) => hl.some((l) => l[8].y < l[0].y - 0.15);

  /* ── CPU (port of Brain) ── */
  const brain = {
    diff: "EASY", hist: [],
    pick(rng, bowling) {
      const lo = rng[0], hi = rng[rng.length - 1], span = Math.max(1, hi - lo);
      if (this.diff === "EASY") return choices(rng, rng.map((n) => 1 + 0.15 * (n - lo) / span));
      let predict = null;
      if (this.hist.length >= 3) {
        const c = {}; this.hist.slice(-6).forEach((v) => (c[v] = (c[v] || 0) + 1));
        predict = Number(Object.keys(c).sort((a, b) => c[b] - c[a])[0]);
        if (!rng.includes(predict)) predict = null;
      }
      const [pb, pa] = this.diff === "MEDIUM" ? [0.28, 0.22] : [0.52, 0.42];
      if (bowling && predict && Math.random() < pb) return predict;
      if (!bowling && predict && Math.random() < pa) { const o = rng.filter((n) => n !== predict); if (o.length) return choice(o); }
      if (this.diff === "MEDIUM") {
        const mid = (lo + hi) / 2;
        return choices(rng, rng.map((n) => (1.5 / (Math.abs(n - mid) + 0.6)) * (1 + 0.3 * (n - lo) / span)));
      }
      return choices(rng, rng.map((n) => 1 + 0.5 * (n - lo) / span));
    },
    record(v) { this.hist = this.hist.concat(v).slice(-12); },
  };

  /* ── Match engine (port of new_game / resolve / end_of_ball_update / check_milestone) ── */
  let g, dlbl = " EASY", dkey = "EASY";
  function newGame() {
    return { state: "MODE_SELECT", mode: null, runRange: null, tossChoice: null, tossUserNum: null, tossCompNum: null, tossTotal: null, tossResultStr: null,
      userWonToss: false, tossCompDec: null, userBatting: null, battingFirst: null, currentRuns: 0, innings: 0, inningsScores: [null, null],
      isSuperOver: false, superBalls: 6, ballMsg: "", ballOut: false, ballRuns: 0, youShowed: null, compShowed: null, ballTimer: null, coinTimer: 0,
      resultSoundPlayed: false, fiftyShown: false, hundredShown: false, pendingCelebration: null, matchCelebrationShown: false, celebrationStart: null, celebrationAck: false };
  }
  function resolve(bat, bowl, mode) {
    if (mode === "CRAZY") {
      const d = Math.abs(bat - bowl);
      if (d === 1 || d === 9) return [0, true, `OUT! Adjacent (${bat} vs ${bowl})`];
      if (bat === bowl) return [bat * bat, false, `SQUARED! ${bat}^2=${bat * bat}`];
      return [bat, false, `+${bat}`];
    }
    if (bat === bowl) return [0, true, `OUT! Both chose ${bat}`];
    return [bat, false, `+${bat}`];
  }
  function endOfBallUpdate(g) {
    const first = g.inningsScores[0], chasing = g.innings === 1 && first !== null, passed = chasing && g.currentRuns > first;
    const upd = {};
    let over;
    if (g.isSuperOver) { upd.superBalls = g.superBalls - 1; over = upd.superBalls <= 0 || passed; }
    else over = g.ballOut || passed;
    if (!over) { upd.state = "PLAYING"; return upd; }
    if (g.innings === 0) {
      Object.assign(upd, { inningsScores: [g.currentRuns, null], innings: 1, userBatting: !g.userBatting, currentRuns: 0, state: "INNINGS_BREAK" });
      if (g.isSuperOver) upd.superBalls = 6;
      return upd;
    }
    const scores = [first, g.currentRuns];
    if (scores[0] === scores[1] && !g.isSuperOver) {
      return Object.assign(upd, { inningsScores: [null, null], isSuperOver: true, innings: 0, currentRuns: 0, superBalls: 6, userBatting: true, battingFirst: "user", state: "INNINGS_BREAK" });
    }
    return Object.assign(upd, { inningsScores: scores, state: "GAME_RESULT" });
  }
  function checkMilestone(g) {
    if (!g.hundredShown && g.currentRuns >= 100) { g.hundredShown = g.fiftyShown = true; return "HUNDRED"; }
    if (!g.fiftyShown && g.currentRuns >= 50) { g.fiftyShown = true; return "FIFTY"; }
    return null;
  }
  const CELEB = {
    OUT_BATTING: { label: "OUT!", color: "rgb(255,60,60)", subtext: null, prompt: null, duration: 2.8, auto: [["stumps_hit", 0], ["out_call", 0.15], ["crowd_aww", 0.55]] },
    WICKET_BOWLING: { label: "WICKET!", color: PRIMARY, subtext: null, prompt: "RAISE YOUR HAND TO CELEBRATE", duration: 3.5, auto: [["stumps_hit", 0], ["out_call", 0.15], ["crowd_cheer", 0.5]] },
    FIFTY: { label: "FIFTY!", color: GOLD, subtext: "50 RUNS", prompt: "RAISE YOUR HAND TO CELEBRATE", duration: 3.5 },
    HUNDRED: { label: "HUNDRED!", color: PRIMARY, subtext: "100 RUNS: CENTURY!", prompt: "RAISE YOUR HAND TO CELEBRATE", duration: 4.0 },
    MATCH_WIN: { label: "YOU WIN!", color: PRIMARY, subtext: "Victory!", prompt: "RAISE YOUR HAND TO CELEBRATE", duration: 4.5 },
    MATCH_LOSE: { label: "DEFEAT", color: RED, subtext: "Better luck next time", prompt: null, duration: 3.0, auto: [["crowd_aww", 0]] },
  };
  function enterCelebration(kind, post) {
    Object.assign(g, { pendingCelebration: kind, postCelebration: post, celebrationStart: now(), celebrationAck: false, state: "CELEBRATION" });
    for (const [name, delay] of CELEB[kind].auto || []) playLater(name, delay);
  }

  /* ── Screens (ports of the screen_* functions) ── */
  function topbar() {
    panelBg(0, 86, 0.86);
    glowText("HAND CRICKET", 18, 34, 0.78, PRIMARY, true, 2);
    let modeS = g.mode ? MODE_NAMES[g.mode] : "";
    if (modeS) { if (g.isSuperOver) modeS += "  |  SUPER OVER"; text(modeS, 18, 64, 0.58, TEXT_DIM); }
    const dcol = { EASY: PRIMARY, MEDIUM: GOLD, HARD: RED }[dkey] || TEXT;
    const s1 = g.inningsScores[0] === null ? "---" : String(g.inningsScores[0]);
    const s2 = g.inningsScores[1] === null ? "---" : String(g.inningsScores[1]);
    const bx1 = W - 260 - 14, pill = `CPU  ${dlbl.trim()}`, pw = textW(pill, 0.55);
    drawPill(Math.min(W / 2 - (pw + 28) / 2, bx1 - pw - 28 - 16), 50, pill, dcol, 0.55);
    const [l1, l2] = g.battingFirst === "user" ? ["YOU", "CPU"] : g.battingFirst === "computer" ? ["CPU", "YOU"] : ["1st", "2nd"];
    blendRect([bx1, 12], [W - 14, 74], PANEL, 0.9, 10); roundedRect([bx1, 12], [W - 14, 74], LINE, 10, 1);
    text(l1, bx1 + 18, 37, 0.52, TEXT_MUTE); text(l2, bx1 + 18, 65, 0.52, TEXT_MUTE);
    text(s1, bx1 + 70, 38, 0.78, TEXT, true); text(s2, bx1 + 70, 66, 0.78, TEXT, true);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx1 + 128, 22); ctx.lineTo(bx1 + 128, 64); ctx.stroke();
    if (g.innings === 1 && g.inningsScores[0] !== null) {
      const target = g.inningsScores[0] + 1, need = target - g.currentRuns;
      text(`TARGET ${target}`, bx1 + 140, 38, 0.58, GOLD, true);
      if (need > 0) text(`NEED ${need}`, bx1 + 140, 66, 0.58, TEXT_DIM);
      else text("CHASED", bx1 + 140, 66, 0.58, g.userBatting ? PRIMARY : RED, true);
    }
  }
  function gestureIndicator(raw, prog) {
    const cx = W - 50, cy = 120, R = 28;
    roundedRect([cx - R - 6, cy - R - 6], [cx + R + 6, cy + R + 6], PANEL, 12, -1);
    circle(cx, cy, R, DEEP); circle(cx, cy, R, LINE, false, 1);
    if (prog > 0) arc(cx, cy, R - 2, prog, prog < 1 ? PRIMARY : GOLD, 4);
    if (raw !== null) text(raw, cx, cy + 12, 1.05, GOLD, true, true, true); else circle(cx, cy, 4, TEXT_MUTE);
    text(raw !== null ? "HOLD" : "SHOW", cx, cy + R + 24, 0.45, TEXT_DIM, false, true, true);
  }
  function quitIndicator(prog) {
    const cx = 50, cy = 120, R = 22, active = prog > 0;
    blendRect([cx - R - 6, cy - R - 6], [cx + R + 6, cy + R + 6], active ? "rgb(18,12,30)" : PANEL, active ? 0.9 : 0.55, 10);
    circle(cx, cy, R, active ? "rgb(80,60,60)" : LINE, false, 1);
    if (active) arc(cx, cy, R - 3, prog, RED, 4);
    text("QUIT", cx, cy + 6, 0.42, active ? "rgb(230,220,220)" : TEXT_DIM, active, true, true);
    text("2 fists", cx, cy + R + 24, 0.45, TEXT_DIM, false, true, true);
  }
  function menu(title, titleCol, subtitle, items, sel, prog) {
    vignette(0.6);
    const pulse = 1 + 0.03 * Math.sin(frameIdx * 0.08);
    glowText(title, W / 2, 100, 1.8 * pulse, titleCol, true, 4, true);
    text(subtitle, W / 2, 142, 0.74, TEXT_DIM, false, true, true);
    const [cardH, spacing] = H >= 640 ? [84, 16] : [64, 10];
    const total = items.length * cardH + (items.length - 1) * spacing;
    const y0 = Math.max(162, H / 2 - total / 2 + 30), x1 = 60, x2 = W - 60;
    items.forEach(([name, sub, col, stars], i) => {
      const n = i + 1, y = y0 + i * (cardH + spacing);
      optionCard([x1, y, x2, y + cardH], n, name, col, sub, sel === n, prog);
      if (stars) for (let s = 0; s < 3; s++) drawStar(x2 - 112 + s * 30, y + cardH / 2, 11, s < stars ? col : "rgb(92,76,70)");
      else if (x2 - x1 >= 700) { const lbl = `${n} finger${n > 1 ? "s" : ""}`; text(lbl, x2 - 28 - textW(lbl, 0.6), y + cardH / 2 + 8, 0.6, TEXT_DIM); }
    });
    text("Hold up 1, 2 or 3 fingers until the ring fills", W / 2, H - 30, 0.64, TEXT_DIM, false, true, true);
  }
  function twoOptions(y, opts, sel, prog, height = 64) {
    const cw = Math.min(260, (W - 100) / 2);
    opts.forEach(([num, label, col], i) => { const x = 40 + i * (cw + 20); optionCard([x, y, x + cw, y + height], num, label, col, null, sel === num, prog); });
  }
  function drawCoin(t) {
    const cx = W / 2, cy = H / 2 - 20, R = 92, LAND = COIN_DUR - 15;
    vignette(0.62);
    glowText("COIN  TOSS", W / 2, Math.max(122, cy - R - 40), 1.3, GOLD, true, 3, true);
    const ell = (x, y, rx, ry, col, fill = true, lw = 1) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2); if (fill) { ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); } };
    ell(cx + 6, cy + 12, R, R / 5, "rgb(16,12,10)");
    if (t < LAND) {
      const prog = t / LAND, period = Math.max(2, Math.floor(12 * (1 - prog * 0.85))), ph = (t % period) / period;
      const xr = Math.max(6, R * Math.abs(2 * ph - 1)), front = ph < 0.5;
      ell(cx, cy, xr, R, front ? "rgb(210,145,8)" : "rgb(180,110,4)");
      ell(cx, cy, Math.max(2, xr * 0.85), R * 0.92, front ? GOLD : "rgb(220,165,25)");
      ell(cx, cy, xr, R, "rgb(255,230,60)", false, 3);
      if (xr > 30) glowText("?", cx, cy + 18, 2.4, "#fff", true, 2, true);
      text("Flipping...", W / 2, cy + R + 78, 0.85, TEXT_DIM, false, true, true);
    } else {
      const age = t - LAND, rr = R + age * 2, al = Math.max(0, 1 - age / 15);
      ell(cx, cy, rr, rr / 2, GOLD, false, Math.max(1, 4 * al));
      ell(cx, cy, R, R, "rgb(210,145,8)"); ell(cx, cy, R * 0.86, R * 0.86, GOLD); ell(cx, cy, R, R, "rgb(255,230,90)", false, 4);
      ctx.strokeStyle = "rgb(210,145,8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.55); ctx.lineTo(cx, cy + R * 0.55); ctx.stroke();
      [[g.tossUserNum, -R * 0.42, "YOU"], [g.tossCompNum, R * 0.42, "CPU"]].forEach(([num, xo, lbl]) => {
        glowText(num, cx + xo, cy + 18, 1.5, "#fff", true, 2, true);
        text(lbl, cx + xo, cy + R + 38, 0.7, TEXT_DIM, false, true, true);
      });
      text(`${g.tossUserNum} + ${g.tossCompNum} = ${g.tossUserNum + g.tossCompNum}`, W / 2, cy + R + 78, 0.85, TEXT, true, true, true);
    }
  }
  function screenPlay() {
    const rng = g.runRange, role = g.userBatting ? "BATTING" : "BOWLING", rcol = g.userBatting ? PRIMARY : BLUE;
    let status = null;
    if (g.isSuperOver) status = `SUPER OVER  |  ${g.superBalls} ball${g.superBalls !== 1 ? "s" : ""} left`;
    else if (g.innings === 1 && g.inningsScores[0] !== null) { const target = g.inningsScores[0] + 1; status = `TARGET ${target}  |  NEED ${Math.max(0, target - g.currentRuns)}`; }
    const y1 = sheet(status ? 166 : 130);
    blendRect([32, y1 + 16], [262, y1 + 58], DEEP, 0.9, 10); roundedRect([32, y1 + 16], [262, y1 + 58], rcol, 10, 1);
    circle(54, y1 + 37, 8, rcol);
    text(`YOU: ${role}`, 72, y1 + 46, 0.76, rcol, true);
    blendRect([W - 232, y1 + 16], [W - 32, y1 + 58], DEEP, 0.9, 10); roundedRect([W - 232, y1 + 16], [W - 32, y1 + 58], GOLD, 10, 1);
    text("RUNS", W - 214, y1 + 44, 0.55, TEXT_DIM);
    const runs = String(g.currentRuns);
    text(runs, W - 48 - textW(runs, 1.05, true), y1 + 49, 1.05, GOLD, true);
    let y = y1 + 94;
    if (status) { text(status, 40, y, 0.74, GOLD, true); y += 40; }
    const show = `Show ${rng[0]} to ${rng[rng.length - 1]}`;
    text(show, 40, y, 0.7, TEXT, true);
    const x = 40 + textW(show, 0.7, true) + 18;
    if (g.mode === "CRAZY") text("Next-door = OUT   Same = runs squared", x, y, 0.58, PURPLE);
    else text("Same number = OUT", x, y, 0.58, TEXT_DIM);
    if (dkey === "HARD") { const m = "CPU is reading you..."; text(m, W - 32 - textW(m, 0.52), y1 + 94, 0.52, "rgb(230,130,140)"); }
  }
  function screenBallResult() {
    const y1 = sheet(176);
    glowText(g.ballMsg, 40, y1 + 50, 1.05, g.ballOut ? RED : PRIMARY, true, 2);
    const youRole = g.userBatting ? "BAT" : "BOWL", cpuRole = g.userBatting ? "BOWL" : "BAT";
    let x = 40;
    [["YOU", youRole, g.youShowed, PRIMARY], ["CPU", cpuRole, g.compShowed, BLUE]].forEach(([who, role, n, c]) => {
      const lbl = `${who} (${role})  ${n}`, x2 = x + textW(lbl, 0.62) + 28;
      blendRect([x, y1 + 72], [x2, y1 + 106], DEEP, 0.9, 10); roundedRect([x, y1 + 72], [x2, y1 + 106], c, 10, 1);
      text(lbl, x + 14, y1 + 97, 0.62, TEXT);
      x = x2 + 14;
    });
    let line = `Innings total ${g.currentRuns}`;
    if (g.innings === 1 && g.inningsScores[0] !== null) line += `   |   Target ${g.inningsScores[0] + 1}`;
    text(line, 40, y1 + 146, 0.76, GOLD, true);
    const p = Math.min(1, (now() - (g.ballTimer || now())) / PAUSE_SECONDS), bx = W - 232, by = y1 + 140;
    roundedRect([bx, by], [bx + 200, by + 8], PANEL_HI, 4, -1);
    roundedRect([bx, by], [bx + Math.max(8, 200 * p), by + 8], PRIMARY, 4, -1);
    text("Next ball", bx, by - 10, 0.52, TEXT_DIM);
  }
  function screenInningsBreak() {
    const y1 = sheet(200), role = g.userBatting ? "BATTING" : "BOWLING", rcol = g.userBatting ? PRIMARY : BLUE;
    if (g.isSuperOver && g.innings === 0) {
      glowText("TIE!  SUPER OVER", 40, y1 + 50, 1.05, GOLD, true, 2);
      text("6 balls each. Getting out costs that ball's runs, but you keep batting.", 40, y1 + 92, 0.6, TEXT_DIM);
      text("You bat first.", 40, y1 + 134, 0.8, PRIMARY, true);
    } else {
      const s = g.inningsScores[0];
      if (g.isSuperOver) { glowText("SUPER OVER: HALF TIME", 40, y1 + 50, 1.0, GOLD, true, 2); text(`First score ${s}`, 40, y1 + 92, 0.74, TEXT); }
      else { glowText("INNINGS OVER", 40, y1 + 50, 1.05, GOLD, true, 2); text(`${g.battingFirst === "user" ? "Your" : "CPU's"} score: ${s}`, 40, y1 + 92, 0.78, TEXT); }
      text(`You are now ${role}  |  Target ${s + 1}`, 40, y1 + 134, 0.8, rcol, true);
    }
    text("Show any gesture to continue", 40, y1 + 176, 0.62, TEXT_DIM);
  }
  function screenGameResult(sel, prog) {
    vignette(0.72);
    const [s1, s2] = g.inningsScores, [u, c] = g.battingFirst === "user" ? [s1, s2] : [s2, s1];
    if (u === null || c === null) return;
    const cy = H / 2 - 30;
    let title, col, sub;
    if (u > c) { title = "YOU WIN!"; col = PRIMARY; sub = `By ${u - c} run${u - c !== 1 ? "s" : ""}`; }
    else if (c > u) { title = "YOU LOSE"; col = RED; sub = `CPU won by ${c - u} run${c - u !== 1 ? "s" : ""}`; }
    else { title = "STILL A TIE"; col = GOLD; sub = "Level after the super over"; }
    glowText(title, W / 2, cy - 30, 2.3, col, true, 4, true);
    text(sub, W / 2, cy + 16, 0.85, col, false, true, true);
    const you = String(u), cpu = String(c);
    text(you, W / 2 - 24 - textW(you, 1.3, true), cy + 82, 1.3, TEXT, true);
    text(cpu, W / 2 + 24, cy + 82, 1.3, TEXT, true);
    ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2, cy + 46); ctx.lineTo(W / 2, cy + 88); ctx.stroke();
    text("YOU", W / 2 - 24 - textW(you, 1.3, true) - 16 - textW("YOU", 0.6), cy + 76, 0.6, TEXT_DIM);
    text("CPU", W / 2 + 24 + textW(cpu, 1.3, true) + 16, cy + 76, 0.6, TEXT_DIM);
    let meta = `${MODE_NAMES[g.mode]}  |  CPU ${dlbl.trim()}`;
    if (g.isSuperOver) meta += "  |  SUPER OVER";
    text(meta, W / 2, cy + 122, 0.6, TEXT_DIM, false, true, true);
    optionCard([W / 2 - 12 - 240, H - 92, W / 2 - 12, H - 28], 1, "PLAY AGAIN", PRIMARY, null, sel === 1, prog);
    optionCard([W / 2 + 12, H - 92, W / 2 + 12 + 240, H - 28], 2, "QUIT", RED, null, sel === 2, prog);
  }
  function screenCelebration(kind, hands) {
    const cfg = CELEB[kind];
    vignette(0.65);
    glowText(cfg.label, W / 2, H * 0.4, 2.2 * (1 + 0.06 * Math.sin(frameIdx * 0.18)), cfg.color, true, 4, true);
    if (cfg.subtext) text(cfg.subtext, W / 2, H * 0.5, 0.9, TEXT, false, true, true);
    if (cfg.prompt && !g.celebrationAck) {
      glowText(cfg.prompt, W / 2, H * 0.62, 1.0, cfg.color, true, 2, true);
      text("(or wait to skip)", W / 2, H * 0.7, 0.6, TEXT_MUTE, false, true, true);
      if (isHandRaised(hands) || pending === "celebrate") {
        play("crowd_cheer");
        g.celebrationAck = true;
        g.celebrationStart = now() - cfg.duration * 0.55;
        fx.trigger("FLASH", { col: cfg.color });
        fx.confettiOn();
      }
    }
    return now() - (g.celebrationStart || now()) >= cfg.duration;
  }

  /* ── Main loop (port of main()) ── */
  function validFor(state) {
    if (state === "MODE_SELECT" || state === "DIFFICULTY_SELECT") return [1, 2, 3];
    if (["TOSS_CHOICE", "TOSS_NUMBER", "BAT_BOWL"].includes(state)) return [1, 2];
    if (["COIN_ANIM", "TOSS_RESULT", "INNINGS_BREAK", "GAME_RESULT", "CELEBRATION"].includes(state)) return range(1, 11);
    return g.runRange || range(1, 7);
  }

  function step() {
    frameIdx++;
    hits = [];
    const [sx, sy] = fx.shake();
    ctx.save();
    ctx.translate(sx, sy);

    // Background: the mirrored, slightly desaturated webcam frame (or a dark stage).
    if (cam.on && video.readyState >= 2) {
      const vw = video.videoWidth, vh = video.videoHeight, target = W / H;
      let cw = vw, ch = vh, cx = 0, cy = 0;
      if (vw / vh > target) { cw = vh * target; cx = (vw - cw) / 2; } else { ch = vw / target; cy = (vh - ch) / 2; }
      cam.crop = { vw, vh, cx, cy, cw, ch };
      ctx.save(); ctx.filter = "saturate(0.8)"; ctx.translate(W, 0); ctx.scale(-1, 1);
      ctx.drawImage(video, cx, cy, cw, ch, 0, 0, W, H); ctx.restore();
    } else {
      const grd = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.7);
      grd.addColorStop(0, "rgb(58,46,40)"); grd.addColorStop(1, "rgb(22,16,13)");
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      if (cam.loading) text("Loading hand-tracking model…", W / 2, H / 2 + 8, 0.8, TEXT_DIM, false, true, true);
    }

    // Detect hands, in the same 4:3 frame the player sees (x mirrored like cv2.flip).
    let hands = [];
    if (cam.on && cam.lm && video.readyState >= 2 && cam.crop) {
      const res = cam.lm.detectForVideo(video, performance.now());
      const { vw, vh, cx, cy, cw, ch } = cam.crop;
      hands = (res.landmarks || []).map((l) => l.map((p) => ({ x: 1 - (p.x * vw - cx) / cw, y: (p.y * vh - cy) / ch, z: p.z })));
    }

    let state = g.state;
    const valid = validFor(state);
    const raw = rawGesture(hands, valid);
    let [conf, prog] = gc.update(raw);
    if (pending !== null && pending !== "celebrate" && conf === null && valid.includes(pending)) { conf = pending; prog = 0; }
    const quitProg = quitDet.update(hands);
    if (quitProg >= 1) { stopCam(); g = newGame(); fx.clear(); gc.reset(); quitDet.start = null; }
    const sel = raw;

    if (!["MODE_SELECT", "DIFFICULTY_SELECT"].includes(state)) topbar();

    if (state === "MODE_SELECT") {
      menu("HAND CRICKET", PRIMARY, "Pick your match format", [["CLASSIC", "Numbers 1 to 6", PRIMARY, 0], ["EXTENDED", "Numbers 1 to 10", GOLD, 0], ["CRAZY", "1 to 10: next-door = OUT, same = squared", PURPLE, 0]], sel, prog);
      if ([1, 2, 3].includes(conf)) {
        g.mode = ["1 to 6", "1 to 10", "CRAZY"][conf - 1];
        g.runRange = [range(1, 7), range(1, 11), range(1, 11)][conf - 1];
        g.state = "DIFFICULTY_SELECT";
        play("click");
      }
    } else if (state === "DIFFICULTY_SELECT") {
      menu("DIFFICULTY", GOLD, "How smart should the CPU be?", [["EASY", "Random: pure fun", PRIMARY, 1], ["MEDIUM", "Notices your patterns", GOLD, 2], ["HARD", "Tracks and counters you", RED, 3]], sel, prog);
      if ([1, 2, 3].includes(conf)) {
        [dlbl, dkey] = { 1: [" EASY", "EASY"], 2: ["MEDIUM", "MEDIUM"], 3: ["  HARD", "HARD"] }[conf];
        brain.diff = dkey; brain.hist = [];
        g.state = "TOSS_CHOICE";
        play("click");
      }
    } else if (state === "TOSS_CHOICE") {
      const y1 = sheet(196);
      glowText("TOSS: CALL IT", 40, y1 + 46, 0.95, GOLD, true, 2);
      text("Odd or even? Hold up 1 finger for ODD, 2 for EVEN.", 40, y1 + 84, 0.66, TEXT_DIM);
      twoOptions(y1 + 106, [[1, "ODD", PRIMARY], [2, "EVEN", GOLD]], sel, prog);
      if ([1, 2].includes(conf)) { g.tossChoice = conf === 1 ? "ODD" : "EVEN"; g.state = "TOSS_NUMBER"; play("click"); }
    } else if (state === "TOSS_NUMBER") {
      const y1 = sheet(196);
      const x = drawPill(40, y1 + 42, `YOU CALLED ${g.tossChoice}`, PRIMARY, 0.6);
      text("Now throw 1 or 2", x + 16, y1 + 42, 0.78, TEXT, true);
      text("The CPU throws too. The total decides the toss.", 40, y1 + 84, 0.62, TEXT_DIM);
      twoOptions(y1 + 106, [[1, "ONE", PRIMARY], [2, "TWO", GOLD]], sel, prog);
      if ([1, 2].includes(conf)) {
        const cn = randint(1, 2), tot = conf + cn, rs = tot % 2 === 0 ? "EVEN" : "ODD", won = rs === g.tossChoice;
        Object.assign(g, { tossUserNum: conf, tossCompNum: cn, tossTotal: tot, tossResultStr: rs, userWonToss: won, coinTimer: 0, coinStart: now() });
        if (!won) { const dec = choice(["BAT", "BOWL"]); Object.assign(g, { tossCompDec: dec, userBatting: dec === "BOWL", battingFirst: dec === "BOWL" ? "user" : "computer" }); }
        play("coin");
        g.state = "COIN_ANIM";
      }
    } else if (state === "COIN_ANIM") {
      g.coinTimer = Math.floor((now() - g.coinStart) * 30); // 30 "frames" per second, like the webcam loop
      drawCoin(g.coinTimer);
      if (g.coinTimer >= COIN_DUR) { g.state = "TOSS_RESULT"; if (g.userWonToss) play("toss_win"); }
    } else if (state === "TOSS_RESULT") {
      const y1 = sheet(214);
      text(`You ${g.tossUserNum} + CPU ${g.tossCompNum} = ${g.tossTotal}  (${g.tossResultStr})`, 40, y1 + 36, 0.68, TEXT_DIM);
      if (g.userWonToss) {
        glowText("YOU WON THE TOSS!", 40, y1 + 82, 1.0, PRIMARY, true, 2);
        twoOptions(y1 + 112, [[1, "BAT", PRIMARY], [2, "BOWL", BLUE]], sel, prog);
        if ([1, 2].includes(conf)) { g.userBatting = conf === 1; g.battingFirst = conf === 1 ? "user" : "computer"; g.currentRuns = 0; g.state = "PLAYING"; play("click"); }
      } else {
        glowText("YOU LOST THE TOSS", 40, y1 + 82, 1.0, RED, true, 2);
        text(`CPU chose to ${g.tossCompDec}, so you ${g.tossCompDec === "BAT" ? "bowl" : "bat"} first.`, 40, y1 + 128, 0.78, GOLD, true);
        text("Show any gesture to start", 40, y1 + 176, 0.64, TEXT_DIM);
        if (conf !== null) { g.currentRuns = 0; g.state = "PLAYING"; play("click"); }
      }
    } else if (state === "PLAYING") {
      screenPlay();
      if (conf !== null) {
        const comp = brain.pick(g.runRange, !g.userBatting); // CPU chooses before it learns this gesture
        brain.record(conf);
        const bv = g.userBatting ? conf : comp, bw = g.userBatting ? comp : conf;
        const [runs, out, msg] = resolve(bv, bw, g.mode);
        if (!out) g.currentRuns += runs;
        Object.assign(g, { youShowed: conf, compShowed: comp, ballMsg: msg, ballOut: out, ballRuns: runs, ballTimer: now(), state: "BALL_RESULT" });
        const isSix = g.mode === "1 to 6" && bv === 6, isTen = g.mode === "1 to 10" && bv === 10, isSq = g.mode === "CRAZY" && !out && bv === bw;
        const isFour = (g.mode === "1 to 6" && bv === 4) || (g.mode === "1 to 10" && (bv === 7 || bv === 8));
        if (out) {
          if (g.userBatting) { fx.trigger("OUT"); g.pendingCelebration = "OUT_BATTING"; }
          else { fx.trigger("FLASH", { col: PRIMARY }); g.pendingCelebration = "WICKET_BOWLING"; }
        } else if (isSix || isTen || isSq) {
          const lbl = isSix ? "SIX!" : isTen ? "TEN!" : `${bv}^2=${runs}!`;
          if (g.userBatting) { fx.trigger("BIGRUN", { lbl }); fx.trigger("RUN_POP", { runs, col: GOLD }); play("six"); }
          else { fx.trigger("FLASH", { col: "rgb(200,60,60)" }); fx.trigger("RUN_POP", { runs, col: "rgb(240,100,80)" }); play("out"); }
        } else if (isFour) {
          if (g.userBatting) { fx.trigger("FLASH", { col: "rgb(90,230,160)" }); fx.trigger("RUN_POP", { runs, col: PRIMARY }); play("four"); }
          else { fx.trigger("FLASH", { col: "rgb(200,80,80)" }); fx.trigger("RUN_POP", { runs, col: "rgb(240,100,80)" }); play("run"); }
        } else if (g.userBatting) { fx.trigger("FLASH", { col: PRIMARY }); fx.trigger("RUN_POP", { runs, col: PRIMARY }); play("run"); }
        else { fx.trigger("FLASH", { col: "rgb(130,70,70)" }); fx.trigger("RUN_POP", { runs, col: "rgb(220,130,120)" }); play("hover"); }
        if (g.userBatting && !out) { const m = checkMilestone(g); if (m) g.pendingCelebration = m; }
      }
    } else if (state === "BALL_RESULT") {
      screenBallResult();
      if (now() - (g.ballTimer || now()) > PAUSE_SECONDS) {
        const upd = endOfBallUpdate(g);
        if (g.pendingCelebration) enterCelebration(g.pendingCelebration, upd);
        else Object.assign(g, upd);
      }
    } else if (state === "CELEBRATION") {
      const kind = g.pendingCelebration;
      if (!kind) { Object.assign(g, g.postCelebration || { state: "PLAYING" }); g.postCelebration = null; }
      else if (screenCelebration(kind, hands)) {
        g.pendingCelebration = null; g.celebrationStart = null; g.celebrationAck = false; fx.confetti = null;
        const upd = g.postCelebration; g.postCelebration = null;
        Object.assign(g, upd || { state: "GAME_RESULT" });
      }
    } else if (state === "INNINGS_BREAK") {
      screenInningsBreak();
      if (conf !== null) { g.state = "PLAYING"; play("click"); }
    } else if (state === "GAME_RESULT") {
      screenGameResult(sel, prog);
      const [s1, s2] = g.inningsScores, [u, c] = g.battingFirst === "user" ? [s1, s2] : [s2, s1];
      if (!g.resultSoundPlayed && u !== null && c !== null) {
        if (u > c) { fx.trigger("WIN"); fx.confettiOn(); play("win"); } else play(c > u ? "lose" : "tie");
        g.resultSoundPlayed = true;
      }
      if (!g.matchCelebrationShown && u !== null && c !== null && u !== c) {
        g.matchCelebrationShown = true;
        enterCelebration(u > c ? "MATCH_WIN" : "MATCH_LOSE", { state: "GAME_RESULT" });
      }
      if (conf === 1) { g = newGame(); fx.clear(); play("click"); }
      else if (conf === 2) { g = newGame(); fx.clear(); play("click"); if (cam.on) stopCam(); }
    }
    pending = null;

    // A gesture held across a screen change must not confirm the next screen.
    if (g.state !== state) gc.reset();

    // Hand skeleton, gesture ring, hold bar, quit ring, effects.
    for (const l of hands) {
      ctx.strokeStyle = "rgb(255,200,0)"; ctx.lineWidth = 2;
      for (const [a, b] of HAND_CONN) { ctx.beginPath(); ctx.moveTo(l[a].x * W, l[a].y * H); ctx.lineTo(l[b].x * W, l[b].y * H); ctx.stroke(); }
      for (const p of l) { circle(p.x * W, p.y * H, 5, DEEP); circle(p.x * W, p.y * H, 3, "#fff"); }
    }
    gestureIndicator(raw, prog);
    progressBar(prog);
    quitIndicator(quitProg);
    fx.draw();
    ctx.restore();
    updateFallback();
  }

  function loop(t) {
    if (!alive) return;
    if (t - lastStep >= 1000 / 30 - 2) { lastStep = t; step(); }
    raf = requestAnimationFrame(loop);
  }

  /* ── Clicks, keys and accessible buttons (for playing without a camera) ── */
  function fallbackChoices() {
    const s = g.state;
    if (s === "MODE_SELECT") return [[1, "Classic 1–6"], [2, "Extended 1–10"], [3, "Crazy 1–10"]];
    if (s === "DIFFICULTY_SELECT") return [[1, "Easy"], [2, "Medium"], [3, "Hard"]];
    if (s === "TOSS_CHOICE") return [[1, "Odd"], [2, "Even"]];
    if (s === "TOSS_NUMBER") return [[1, "Throw 1"], [2, "Throw 2"]];
    if (s === "TOSS_RESULT") return g.userWonToss ? [[1, "Bat"], [2, "Bowl"]] : [[1, "Start"]];
    if (s === "PLAYING") return g.runRange.map((n) => [n, String(n)]);
    if (s === "INNINGS_BREAK") return [[1, "Continue"]];
    if (s === "GAME_RESULT") return [[1, "Play again"], [2, "Quit"]];
    if (s === "CELEBRATION" && CELEB[g.pendingCelebration]?.prompt && !g.celebrationAck) return [["celebrate", "Celebrate"]];
    return [];
  }
  function updateFallback() {
    const ch = fallbackChoices(), key = g.state + ch.map((c) => c[0]).join(",");
    if (key === fallbackKey) return;
    fallbackKey = key;
    q("[data-fallback]").innerHTML = ch.map(([n, l]) => `<button type="button" class="${g.state === "PLAYING" ? "num-btn" : "p-btn"}" data-n="${n}">${l}</button>`).join("");
  }
  // Browsers only allow audio after the visitor interacts, so any click or key unlocks it.
  el.addEventListener("pointerdown", unlockAudio);
  function renderSound() {
    const b = q("[data-sound]");
    b.textContent = audio.on ? "Sound on" : "Sound off";
    b.setAttribute("aria-pressed", String(audio.on));
  }
  q("[data-sound]").addEventListener("click", () => {
    audio.on = !audio.on;
    try { localStorage.setItem("hc:sound", audio.on ? "on" : "off"); } catch (e) {}
    renderSound();
    unlockAudio();
    play("click");
  });
  renderSound();

  q("[data-fallback]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (b) pending = b.dataset.n === "celebrate" ? "celebrate" : Number(b.dataset.n);
  });
  cv.addEventListener("click", (e) => {
    const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const h = hits.find((b) => x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2);
    if (h) pending = h.n;
    else if (g.state === "INNINGS_BREAK" || (g.state === "TOSS_RESULT" && !g.userWonToss)) pending = 1;
    else if (g.state === "CELEBRATION") pending = "celebrate";
  });
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = document.activeElement;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (document.querySelector("dialog[open]")) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    if (/^[0-9]$/.test(e.key)) { unlockAudio(); pending = e.key === "0" ? 10 : Number(e.key); e.preventDefault(); }
  }
  document.addEventListener("keydown", onKey);

  q("[data-full]").addEventListener("click", () => {
    const wrap = q("[data-wrap]");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {});
  });

  /* ── Camera ── */
  async function startCam() {
    const btn = q("[data-cam]"), status = q("[data-status]");
    if (cam.on || cam.loading) { stopCam(); return; }
    cam.loading = true;
    btn.disabled = true;
    status.textContent = "Loading the hand-tracking model…";
    try {
      if (!cam.lm) {
        const vision = await import(MP + "/vision_bundle.mjs");
        const files = await vision.FilesetResolver.forVisionTasks(MP + "/wasm");
        const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numHands: 2 });
        try { cam.lm = await vision.HandLandmarker.createFromOptions(files, opts("GPU")); }
        catch (e) { cam.lm = await vision.HandLandmarker.createFromOptions(files, opts("CPU")); }
      }
      if (!alive) return;
      status.textContent = "Allow camera access in your browser…";
      cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" } });
      video.srcObject = cam.stream;
      await video.play();
      cam.on = true;
      status.textContent = "Camera on. Use one hand for 1–9 and hold until the ring fills. Video stays on your device.";
      btn.textContent = "Turn off camera";
    } catch (err) {
      stopCam();
      status.textContent = "Camera unavailable (permission denied or no webcam). You can still click the cards or press number keys.";
    } finally {
      cam.loading = false;
      btn.disabled = false;
    }
  }
  function stopCam() {
    cam.on = false;
    if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
    cam.stream = null;
    video.srcObject = null;
    if (!alive) return;
    q("[data-cam]").textContent = "Turn on camera";
    q("[data-status]").textContent = "Camera off: click the cards, use the buttons below, or press number keys.";
  }
  q("[data-cam]").addEventListener("click", startCam);

  g = newGame();
  step(); // draw the first screen and its buttons right away
  raf = requestAnimationFrame(loop);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    stopCam();
    document.removeEventListener("keydown", onKey);
    timers.forEach(clearTimeout);
    if (audio.ctx) audio.ctx.close().catch(() => {});
  };
};
