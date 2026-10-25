// Hand Cricket CV: full innings vs an adaptive AI. Play with buttons, or turn on
// the webcam and show fingers. Hand tracking uses MediaPipe's HandLandmarker,
// the same model family as the Python project, running locally in the browser.
window.DEMOS = window.DEMOS || {};
window.DEMOS.cricket = function (el) {
  const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  let g, best = 0;
  let cam = { on: false, stream: null, landmarker: null, raf: 0, held: null, since: 0, cooldown: 0 };

  function reset() {
    g = { phase: "bat", you: 0, ai: 0, target: 0, log: [], last: "You're batting first. Pick a number from 1 to 6.", seen: [0, 0, 0, 0, 0, 0, 0] };
  }

  // The AI watches which numbers you favour and leans toward (or away from) them.
  function favourite() { let b = 1; for (let k = 2; k <= 6; k++) if (g.seen[k] > g.seen[b]) b = k; return b; }
  function aiPick(match) {
    const total = g.seen.reduce((a, c) => a + c, 0);
    if (total >= 3 && Math.random() < 0.4) {
      const fav = favourite();
      if (match) return fav;
      let n; do { n = 1 + Math.floor(Math.random() * 6); } while (n === fav);
      return n;
    }
    return 1 + Math.floor(Math.random() * 6);
  }

  function play(n) {
    if (g.phase === "over") return;
    const inn = g.phase === "bat" ? "you" : "ai";
    g.seen[n]++;
    if (g.phase === "bat") {
      const ai = aiPick(true);
      if (ai === n) {
        g.log.push({ inn, t:"W" });
        g.target = g.you + 1;
        g.phase = "bowl";
        best = Math.max(best, g.you);
        g.last = `OUT! You showed ${n}, the AI bowled ${ai}. You set a target of ${g.target}. Now you bowl: match the AI's number to get it out.`;
      } else {
        g.you += n;
        g.log.push({ inn, t:n });
        g.last = `You played ${n}, AI bowled ${ai}. +${n} runs.`;
      }
    } else {
      const ai = aiPick(false);
      if (ai === n) {
        g.log.push({ inn, t:"W" });
        g.phase = "over";
        g.last = `Bowled! The AI played ${ai} too and is out for ${g.ai}. You win by ${g.you - g.ai} runs.`;
      } else {
        g.ai += ai;
        g.log.push({ inn, t:ai });
        if (g.ai >= g.target) { g.phase = "over"; g.last = `The AI hit ${ai} and chased down ${g.target}. AI wins. Try mixing up your numbers.`; }
        else g.last = `You bowled ${n}, AI hit ${ai}. AI needs ${g.target - g.ai} more.`;
      }
    }
    render();
  }

  el.innerHTML = `
    <div class="p-row">
      <div class="p-main" style="gap:16px">
        <div class="p-box" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px">
          <strong data-phase style="font-size:17px"></strong>
          <button type="button" class="p-btn" data-cam aria-pressed="false">Play with webcam</button>
        </div>
        <div class="cam" data-camwrap hidden>
          <video data-video playsinline muted></video>
          <span class="cam-badge" data-badge>Starting camera…</span>
          <span class="cam-hold" data-hold></span>
        </div>
        <div class="num-grid" role="group" aria-label="Choose your number" data-nums>
          ${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" class="num-btn" data-n="${n}">${n}</button>`).join("")}
        </div>
        <p data-msg aria-live="polite" style="min-height:3.2em"></p>
        <div data-log aria-label="Ball by ball" style="display:flex;flex-direction:column;gap:6px"></div>
      </div>
      <div class="p-side">
        <dl class="p-metrics" data-score></dl>
        <button type="button" class="p-btn p-btn-primary" data-reset>New match</button>
        <p class="p-note">Webcam mode: hold up 1–4 fingers, an open palm for 5, or a thumbs-up for 6, and keep it steady for a moment. Video never leaves your device.</p>
      </div>
    </div>`;

  const q = (s) => el.querySelector(s);

  function render() {
    q("[data-phase]").textContent = g.phase === "bat" ? "You're batting" : g.phase === "bowl" ? `You're bowling · target ${g.target}` : "Match over";
    q("[data-msg]").textContent = g.last;
    el.querySelectorAll("[data-n]").forEach((b) => (b.disabled = g.phase === "over"));
    const row = (inn, label) => {
      const balls = g.log.filter((b) => b.inn === inn).slice(-18);
      return balls.length ? `<div class="ball-log"><span class="lbl">${label}</span>${balls.map((b) => `<span class="${b.t === "W" ? "w" : ""}">${b.t}</span>`).join("")}</div>` : "";
    };
    q("[data-log]").innerHTML = row("you", "You") + row("ai", "AI");
    q("[data-score]").innerHTML = [
      ["Your runs", g.you],
      ["AI runs", g.phase === "bat" ? "–" : g.ai],
      ["Target", g.target || "–"],
      ["Your best", best],
    ].map(([k, v]) => `<div class="p-metric"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  }

  /* ── Webcam ── */
  function countFingers(lm) {
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([t, p]) => lm[t].y < lm[p].y).length;
    const thumb = d(lm[4], lm[5]) > 0.55 * d(lm[0], lm[5]);
    if (fingers === 0) return thumb ? 6 : null;
    if (fingers === 4 && thumb) return 5;
    return fingers;
  }

  async function startCam() {
    const badge = q("[data-badge]");
    q("[data-camwrap]").hidden = false;
    q("[data-cam]").setAttribute("aria-pressed", "true");
    q("[data-cam]").textContent = "Stop webcam";
    cam.on = true;
    try {
      if (!cam.landmarker) {
        badge.textContent = "Loading hand-tracking model…";
        const vision = await import(MP + "/vision_bundle.mjs");
        const files = await vision.FilesetResolver.forVisionTasks(MP + "/wasm");
        cam.landmarker = await vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" }, runningMode: "VIDEO", numHands: 1,
        });
      }
      if (!cam.on) return;
      cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      const v = q("[data-video]");
      v.srcObject = cam.stream;
      await v.play();
      badge.textContent = "Show your number";
      loop();
    } catch (err) {
      badge.textContent = "Camera unavailable. Use the buttons below.";
      stopCam(true);
    }
  }

  function loop() {
    if (!cam.on) return;
    const v = q("[data-video]");
    if (!v) return;
    const now = performance.now();
    const res = cam.landmarker.detectForVideo(v, now);
    const n = res.landmarks && res.landmarks[0] ? countFingers(res.landmarks[0]) : null;
    const badge = q("[data-badge]"), hold = q("[data-hold]");
    if (now < cam.cooldown) {
      hold.style.width = "0";
    } else if (n && n === cam.held) {
      const pct = Math.min(1, (now - cam.since) / 900);
      hold.style.width = pct * 100 + "%";
      badge.textContent = `Seeing ${n}…`;
      if (pct >= 1) { play(n); cam.held = null; cam.cooldown = now + 1300; badge.textContent = `Played ${n}`; }
    } else {
      cam.held = n; cam.since = now; hold.style.width = "0";
      if (!n) badge.textContent = "Show your number";
    }
    cam.raf = requestAnimationFrame(loop);
  }

  function stopCam(keepMsg) {
    cam.on = false;
    cancelAnimationFrame(cam.raf);
    if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
    cam.stream = null;
    const btn = q("[data-cam]");
    if (btn) { btn.setAttribute("aria-pressed", "false"); btn.textContent = "Play with webcam"; }
    if (!keepMsg && q("[data-camwrap]")) q("[data-camwrap]").hidden = true;
  }

  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (b) play(Number(b.dataset.n));
    if (e.target.closest("[data-reset]")) { reset(); render(); }
    if (e.target.closest("[data-cam]")) cam.on ? stopCam() : startCam();
  });

  reset();
  render();
  return () => stopCam();
};
