// ClipCourt in the browser. Same steps as the real app (upload → mark the rim →
// choose what to clip → highlights) and the same engine (clipcourt-engine.js is
// a port of engine.py). Instead of a FastAPI server, everything runs on the
// visitor's device: WebCodecs + mp4box decode every frame of the video, and
// YOLOv8s (exported to ONNX) finds the ball with ONNX Runtime Web, on the GPU
// via WebGPU when available and the CPU otherwise. The video is never uploaded.
window.DEMOS = window.DEMOS || {};
window.DEMOS.clipcourt = function (el) {
  const E = window.ClipCourtEngine;
  const cfg = { ...E.DEFAULTS };
  const ORT_DIR = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
  const MP4BOX_JS = "https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js";
  const MODEL_URL = "assets/models/yolov8s.onnx";
  let alive = true;
  const st = { file: null, url: null, w: 0, h: 0, duration: 0, box: null, running: false, cancel: false, result: null, mode: "all", probe: null };

  el.innerHTML = `
    <div class="cc-tabs" role="tablist" aria-label="ClipCourt">
      <button type="button" role="tab" class="cc-tab" data-tab="real" aria-selected="true">Analyze your video</button>
      <button type="button" role="tab" class="cc-tab" data-tab="example" aria-selected="false">Example game</button>
    </div>

    <div data-pane="real" class="cc-app">
      <section class="cc-step" data-step="1">
        <div class="cc-head"><span class="cc-num" aria-hidden="true">1</span><h4>Upload your footage</h4></div>
        <p class="cc-sub">Game tape, practice video, an old phone recording: anything works. MP4 or MOV is best. Your video never leaves your device: it's analyzed right here in your browser.</p>
        <label class="cc-drop" data-drop>
          <input type="file" accept="video/*,.mov,.mp4,.m4v,.webm" data-file class="cc-file" />
          <span class="cc-choose">Choose a video</span>
          <span class="cc-or">or drag and drop it here</span>
        </label>
        <p class="cc-status" data-filestatus aria-live="polite"></p>
      </section>

      <section class="cc-step" data-step="2" aria-disabled="true">
        <div class="cc-head"><span class="cc-num" aria-hidden="true">2</span><h4>Mark the rim</h4></div>
        <p class="cc-sub">Scrub to a frame where the rim is clearly visible, then draw a tight box around it. A tight box is the single biggest accuracy lever.</p>
        <div class="cc-tools">
          <button type="button" class="cc-btn ghost small" data-suggest>Suggest rim automatically</button>
          <button type="button" class="cc-btn ghost small" data-nextsuggest hidden>Not the rim? Next suggestion</button>
        </div>
        <div class="cc-scrub">
          <label for="ccScrub">Frame</label>
          <input id="ccScrub" type="range" min="0" max="0" step="0.01" value="0" data-scrub />
          <span class="cc-time" data-scrubtime>0:00</span>
        </div>
        <div class="cc-stage" data-stage>
          <video data-player playsinline muted preload="auto"></video>
          <canvas data-overlay tabindex="0" role="application" aria-label="Rim marking canvas. Drag to draw a box around the rim. Arrow keys move the box, Shift plus arrows resize it, Delete clears it."></canvas>
        </div>
        <p class="cc-status" data-rimstatus aria-live="polite">No rim box yet: drag on the frame to draw one.</p>
        <p class="cc-hint">Keyboard: <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Shift</kbd>+arrows resize · <kbd>Delete</kbd> clear. Or set exact pixel values:</p>
        <div class="cc-fields">
          ${["x", "y", "w", "h"].map((k) => `<label>${{ x: "X (px)", y: "Y (px)", w: "Width (px)", h: "Height (px)" }[k]}<input type="number" min="0" step="1" data-boxf="${k}" /></label>`).join("")}
        </div>
      </section>

      <section class="cc-step" data-step="3" aria-disabled="true">
        <div class="cc-head"><span class="cc-num" aria-hidden="true">3</span><h4>Choose what to clip</h4></div>
        <fieldset class="cc-fieldset"><legend>Which shots?</legend>
          <label><input type="radio" name="ccmode" value="made" /> Made baskets only</label>
          <label><input type="radio" name="ccmode" value="miss" /> Missed shots only</label>
          <label><input type="radio" name="ccmode" value="all" checked /> Every attempt</label>
        </fieldset>
        <div class="cc-row">
          <label>Seconds before the shot<input type="number" min="0" max="30" step="0.5" value="3" data-before /><span class="cc-hint">Captures the move that set it up</span></label>
          <label>Seconds after the shot<input type="number" min="0" max="30" step="0.5" value="1" data-after /><span class="cc-hint">Captures the reaction</span></label>
          <label>Frames to analyze<select data-stride>
            <option value="1">Every frame (most accurate)</option>
            <option value="2">Every 2nd frame (faster)</option>
            <option value="3">Every 3rd frame (fastest)</option>
          </select><span class="cc-hint" data-stridehint></span></label>
        </div>
        <div class="cc-run">
          <button type="button" class="cc-btn" data-start>Find my highlights</button>
          <button type="button" class="cc-btn ghost" data-cancel hidden>Cancel</button>
        </div>
        <div class="cc-track" data-track hidden><div class="cc-fill" data-fill role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Processing progress"></div></div>
        <p class="cc-status" data-jobstatus aria-live="polite"></p>
        <ul class="cc-feed" data-feed aria-label="Shots detected so far"></ul>
        <p class="cc-alert" data-error role="alert" hidden></p>
      </section>

      <section class="cc-step" data-step="4" aria-disabled="true">
        <div class="cc-head"><span class="cc-num" aria-hidden="true">4</span><h4>Your highlights</h4></div>
        <p class="cc-sub" data-summary></p>
        <video class="cc-clipplayer" data-clipplayer playsinline controls preload="auto"></video>
        <div class="cc-clips" data-clips></div>
        <div class="cc-coach">
          <section class="cc-court-panel" aria-label="Shot chart">
            <h5>Shot chart</h5>
            <div class="cc-court" data-court>
              <svg viewBox="0 0 50 47" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <rect x="0.2" y="0.2" width="49.6" height="46.6" fill="none" stroke="var(--cc-line)" stroke-width="0.35"/>
                <rect x="17" y="0.2" width="16" height="18.8" fill="none" stroke="var(--cc-line)" stroke-width="0.22"/>
                <circle cx="25" cy="19" r="6" fill="none" stroke="var(--cc-line)" stroke-width="0.22"/>
                <path d="M 3 0.2 L 3 14.2 A 23.75 23.75 0 0 0 47 14.2 L 47 0.2" fill="none" stroke="var(--cc-line)" stroke-width="0.22"/>
                <line x1="22" y1="4.25" x2="28" y2="4.25" stroke="var(--cc-chalk-dim)" stroke-width="0.3"/>
                <circle cx="25" cy="5.25" r="0.75" fill="none" stroke="var(--cc-chalk-dim)" stroke-width="0.28"/>
              </svg>
            </div>
            <p class="cc-hint">Locations are approximate: estimated from a single camera angle, scaled by the 18-inch rim.</p>
            <p class="cc-status" data-courtstatus aria-live="polite"></p>
            <ul class="cc-legend"><li><span class="cc-sw made"></span>Made</li><li><span class="cc-sw miss"></span>Missed</li></ul>
          </section>
          <section class="cc-stats" aria-label="Stats"><h5>Stats</h5><div data-stats></div>
            <button type="button" class="cc-btn ghost small" data-csv>Download CSV</button>
          </section>
        </div>
        <p class="cc-hint">Honest limits: made/miss from one 2D camera angle has an accuracy ceiling. A ball passing just in front of the rim can look like one passing through it, so <b>medium</b>-confidence calls are worth a second look. The full app (FastAPI + Python) adds batch queues, player tagging, frame-accurate clip cutting with audio, vertical 9:16 clips and PDF reports.</p>
      </section>
    </div>

    <div data-pane="example" hidden></div>`;

  const q = (s) => el.querySelector(s);
  const player = q("[data-player]"), overlay = q("[data-overlay]"), octx = overlay.getContext("2d");
  const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`; };
  const stepOn = (n, on) => q(`[data-step="${n}"]`).setAttribute("aria-disabled", String(!on));

  /* ── Tabs ── */
  let exampleCleanup = null;
  el.querySelector(".cc-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    el.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === b)));
    q('[data-pane="real"]').hidden = b.dataset.tab !== "real";
    q('[data-pane="example"]').hidden = b.dataset.tab !== "example";
    if (b.dataset.tab === "example" && !exampleCleanup) exampleCleanup = mountExample(q('[data-pane="example"]'));
  });

  /* ── Step 1: pick a video ── */
  const fileInput = q("[data-file]"), drop = q("[data-drop]");
  fileInput.addEventListener("change", () => fileInput.files[0] && openFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) openFile(f); });

  function openFile(file) {
    if (st.running) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) { q("[data-filestatus]").textContent = "That doesn't look like a video file."; return; }
    if (st.url) URL.revokeObjectURL(st.url);
    Object.assign(st, { file, url: URL.createObjectURL(file), box: null, result: null });
    st.probe = probe(file).catch(() => null); // frame rate, frame count and colour matrix, read in the background
    q("[data-filestatus]").textContent = `Loading ${file.name}…`;
    player.src = st.url;
    q("[data-clipplayer]").src = st.url;
    player.addEventListener("loadedmetadata", () => {
      st.w = player.videoWidth; st.h = player.videoHeight; st.duration = player.duration;
      q("[data-filestatus]").innerHTML = `<b>${escapeHtml(file.name)}</b> · ${st.w}×${st.h} · ${fmt(st.duration)} · ${(file.size / 1048576).toFixed(1)} MB`;
      const scrub = q("[data-scrub]");
      scrub.max = String(Math.max(0, st.duration - 0.05));
      scrub.value = String(Math.min(st.duration / 2, st.duration - 0.05));
      player.currentTime = Number(scrub.value);
      stepOn(2, true); stepOn(3, false); stepOn(4, false);
      syncBox(); resizeOverlay();
      updateStrideHint();
    }, { once: true });
    player.addEventListener("error", () => { q("[data-filestatus]").textContent = "This browser can't play that video. Try an MP4 (H.264) file."; }, { once: true });
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ── Step 2: mark the rim (drag, keys or exact fields) ── */
  const scrub = q("[data-scrub]");
  scrub.addEventListener("input", () => { player.currentTime = Number(scrub.value); q("[data-scrubtime]").textContent = fmt(Number(scrub.value)); });
  player.addEventListener("seeked", drawOverlay);
  window.addEventListener("resize", resizeOverlay);
  function resizeOverlay() {
    const r = player.getBoundingClientRect();
    overlay.width = Math.max(1, Math.round(r.width * devicePixelRatio));
    overlay.height = Math.max(1, Math.round(r.height * devicePixelRatio));
    drawOverlay();
  }
  const toVideo = () => (st.w ? st.w / overlay.width : 1);
  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (!st.box) return;
    const k = 1 / toVideo(), [x, y, w, h] = st.box;
    octx.save();
    octx.shadowColor = "rgba(0,0,0,.6)"; octx.shadowBlur = 6;
    octx.strokeStyle = "#f2c14e"; octx.lineWidth = Math.max(2, 3 * devicePixelRatio);
    octx.strokeRect(x * k, y * k, w * k, h * k);
    octx.restore();
  }
  function setBox(b, message) {
    if (b) {
      let [x, y, w, h] = b.map((v) => Math.round(v));
      w = Math.max(4, Math.min(w, st.w)); h = Math.max(4, Math.min(h, st.h));
      x = Math.max(0, Math.min(x, st.w - w)); y = Math.max(0, Math.min(y, st.h - h));
      st.box = [x, y, w, h];
    } else st.box = null;
    syncBox();
    drawOverlay();
    q("[data-rimstatus]").textContent = message || (st.box ? `Rim box: x ${st.box[0]}, y ${st.box[1]}, ${st.box[2]}×${st.box[3]} px.` : "No rim box yet: drag on the frame to draw one.");
    stepOn(3, !!st.box);
  }
  function syncBox() {
    ["x", "y", "w", "h"].forEach((k, i) => { const f = q(`[data-boxf="${k}"]`); if (document.activeElement !== f) f.value = st.box ? st.box[i] : ""; });
  }
  let dragStart = null;
  const vpoint = (e) => { const r = overlay.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * st.w, ((e.clientY - r.top) / r.height) * st.h]; };
  overlay.addEventListener("pointerdown", (e) => { if (!st.w) return; overlay.setPointerCapture(e.pointerId); dragStart = vpoint(e); });
  overlay.addEventListener("pointermove", (e) => {
    if (!dragStart) return;
    const p = vpoint(e);
    st.box = [Math.min(p[0], dragStart[0]), Math.min(p[1], dragStart[1]), Math.abs(p[0] - dragStart[0]), Math.abs(p[1] - dragStart[1])];
    drawOverlay();
  });
  overlay.addEventListener("pointerup", () => {
    if (!dragStart) return;
    dragStart = null;
    if (st.box && st.box[2] > 4 && st.box[3] > 4) setBox(st.box); else setBox(null);
  });
  overlay.addEventListener("keydown", (e) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"];
    if (!keys.includes(e.key) || !st.w) return;
    e.preventDefault();
    if (e.key === "Delete" || e.key === "Backspace") return setBox(null, "Rim box cleared.");
    const b = st.box ? st.box.slice() : [st.w / 2 - 50, st.h / 3, 100, 34];
    const step = e.altKey ? 1 : Math.max(2, Math.round(st.w / 400));
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (e.shiftKey) { b[2] += dx; b[3] += dy; } else { b[0] += dx; b[1] += dy; }
    setBox(b);
  });
  el.querySelectorAll("[data-boxf]").forEach((f) => f.addEventListener("change", () => {
    const vals = ["x", "y", "w", "h"].map((k) => Number(q(`[data-boxf="${k}"]`).value));
    if (vals.every((v) => Number.isFinite(v) && v >= 0) && vals[2] >= 4 && vals[3] >= 4) setBox(vals);
  }));

  // Port of suggest_hoop_box: sample 6 frames across the middle of the video.
  q("[data-suggest]").addEventListener("click", async () => {
    if (!st.w || st.running) return;
    const btn = q("[data-suggest]");
    btn.disabled = true;
    q("[data-rimstatus]").textContent = "Scanning frames for something rim-shaped…";
    // Full-resolution frames at the same times as the Python version (duration = frames / fps),
    // in OpenCV's colours; each frame is scanned and then dropped.
    const keep = player.currentTime, info = await st.probe;
    const duration = info ? info.frames / info.fps : st.duration;
    const c = document.createElement("canvas");
    c.width = st.w; c.height = st.h;
    const cx = c.getContext("2d", { willReadFrequently: true }), perFrame = [];
    for (let i = 0; i < 6; i++) {
      await seek(player, (0.15 + (0.7 * i) / 5) * duration);
      cx.drawImage(player, 0, 0, c.width, c.height);
      const img = cx.getImageData(0, 0, c.width, c.height);
      if (bt709(info)) E.toOpenCvColors(img.data);
      perFrame.push(E.rimCandidates(img, 1).slice(0, 5));
      q("[data-rimstatus]").textContent = `Scanning frames for something rim-shaped… ${i + 1}/6`;
      await new Promise((r) => setTimeout(r, 0));
    }
    await seek(player, keep);
    const s = E.suggestHoopBox(perFrame);
    btn.disabled = false;
    st.suggestions = s ? s.ranked : [];
    st.suggestionAt = 0;
    if (s) showSuggestion();
    else q("[data-rimstatus]").textContent = "Couldn't find the rim with confidence. Please draw the box yourself.";
    q("[data-nextsuggest]").hidden = st.suggestions.length < 2;
  });
  function showSuggestion() {
    const s = st.suggestions[st.suggestionAt], n = st.suggestions.length;
    setBox([s.x, s.y, s.w, s.h], `Suggestion ${st.suggestionAt + 1} of ${n} (seen in ${s.framesAgreeing} of ${s.framesSampled} frames). Check it's around the rim and adjust if needed.`);
  }
  q("[data-nextsuggest]").addEventListener("click", () => {
    if (!st.suggestions || st.suggestions.length < 2) return;
    st.suggestionAt = (st.suggestionAt + 1) % st.suggestions.length;
    showSuggestion();
  });
  function seek(v, t) {
    return new Promise((res) => {
      if (Math.abs(v.currentTime - t) < 1e-3 && v.readyState >= 2) return res();
      v.addEventListener("seeked", () => res(), { once: true });
      v.currentTime = t;
    });
  }

  /* ── Step 3: run ── */
  q("[data-before]").addEventListener("change", (e) => { cfg.clipBeforeSeconds = Math.max(0, Number(e.target.value) || 0); if (st.result) renderResults(); });
  q("[data-after]").addEventListener("change", (e) => { cfg.clipAfterSeconds = Math.max(0, Number(e.target.value) || 0); if (st.result) renderResults(); });
  el.querySelectorAll('input[name="ccmode"]').forEach((r) => r.addEventListener("change", () => { st.mode = r.value; if (st.result) renderResults(); }));
  q("[data-stride]").addEventListener("change", updateStrideHint);
  function updateStrideHint() {
    const gpu = !!navigator.gpu;
    q("[data-stridehint]").textContent = gpu ? "Your browser supports WebGPU, so every frame is quick." : "No WebGPU here, so analysis runs on the CPU. Every 2nd frame is a good balance.";
    if (!gpu && !q("[data-stride]").dataset.touched) q("[data-stride]").value = "2";
  }
  q("[data-stride]").addEventListener("input", (e) => (e.target.dataset.touched = "1"));
  q("[data-cancel]").addEventListener("click", () => { st.cancel = true; });
  q("[data-start]").addEventListener("click", run);

  const scripts = {};
  function loadScript(src) {
    return (scripts[src] = scripts[src] || new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error("Couldn't load " + src));
      document.head.appendChild(s);
    }));
  }
  let session = null, backend = "";
  async function getSession(status) {
    if (session) return session;
    await loadScript(ORT_DIR + "ort.webgpu.min.js");
    window.ort.env.wasm.wasmPaths = ORT_DIR;
    status("Downloading the YOLOv8s ball detector (45 MB, only the first time)…");
    const res = await fetch(MODEL_URL);
    const total = Number(res.headers.get("content-length")) || 45e6, reader = res.body.getReader(), parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length;
      status(`Downloading the YOLOv8s ball detector… ${Math.min(100, Math.round((got / total) * 100))}%`);
    }
    const model = new Uint8Array(got);
    let o = 0;
    for (const p of parts) { model.set(p, o); o += p.length; }
    status("Starting the detector…");
    if (navigator.gpu) {
      try { session = await window.ort.InferenceSession.create(model, { executionProviders: ["webgpu"] }); backend = "GPU (WebGPU)"; } catch (e) { session = null; }
    }
    if (!session) { session = await window.ort.InferenceSession.create(model, { executionProviders: ["wasm"] }); backend = "CPU (WebAssembly)"; }
    return session;
  }

  // Letterbox like ultralytics (auto=True): keep aspect, pad to a multiple of 32 with grey 114.
  const lb = document.createElement("canvas"), lctx = lb.getContext("2d", { willReadFrequently: true });
  let colorFix = false; // set per run: convert to OpenCV's BT.601 colours before YOLO
  // Shrink a big frame in halving steps until it's within 2× of the target size.
  // Repeated 2× bilinear steps average neighbouring pixels (like cv2.INTER_AREA),
  // so a small, blurry ball isn't lost to aliasing in one giant downscale.
  const steps = [document.createElement("canvas"), document.createElement("canvas")];
  function halve(src, tw, th) {
    let w = src.displayWidth || src.videoWidth || src.width, h = src.displayHeight || src.videoHeight || src.height, cur = src, k = 0;
    while (w / 2 >= tw && h / 2 >= th) {
      const c = steps[k++ % 2];
      w = Math.round(w / 2); h = Math.round(h / 2);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      c.getContext("2d").drawImage(cur, 0, 0, w, h);
      cur = c;
    }
    return cur;
  }
  function preprocess(src, sw, sh, rot) {
    const r = Math.min(640 / sh, 640 / sw), nw = Math.round(sw * r), nh = Math.round(sh * r);
    const dw = ((640 - nw) % 32) / 2, dh = ((640 - nh) % 32) / 2;
    const left = Math.round(dw - 0.1), top = Math.round(dh - 0.1), W = nw + left + Math.round(dw + 0.1), H = nh + top + Math.round(dh + 0.1);
    if (lb.width !== W || lb.height !== H) { lb.width = W; lb.height = H; }
    lctx.fillStyle = "rgb(114,114,114)"; lctx.fillRect(0, 0, W, H);
    lctx.save();
    lctx.translate(left + nw / 2, top + nh / 2);
    lctx.rotate((rot * Math.PI) / 180);
    const dwid = rot % 180 ? nh : nw, dhei = rot % 180 ? nw : nh;
    lctx.drawImage(halve(src, dwid, dhei), -dwid / 2, -dhei / 2, dwid, dhei);
    lctx.restore();
    const px = lctx.getImageData(0, 0, W, H).data, n = W * H, data = new Float32Array(3 * n);
    if (colorFix) E.toOpenCvColors(px);
    for (let i = 0, p = 0; i < n; i++, p += 4) { data[i] = px[p] / 255; data[n + i] = px[p + 1] / 255; data[2 * n + i] = px[p + 2] / 255; }
    return { tensor: new window.ort.Tensor("float32", data, [1, 3, H, W]), r, left, top };
  }
  // Like ultralytics' non_max_suppression with classes=[32]: a box counts only if
  // "sports ball" is its best class and that score clears the threshold; IoU 0.7.
  function postprocess(out, pre) {
    const d = out.data, N = out.dims[2], cand = [];
    for (let i = 0; i < N; i++) {
      let best = 0, bj = -1;
      for (let c = 0; c < 80; c++) { const v = d[(4 + c) * N + i]; if (v > best) { best = v; bj = c; } }
      if (bj !== cfg.sportsBallClass || best < cfg.yoloConf) continue;
      const cx = d[i], cy = d[N + i], bw = d[2 * N + i], bh = d[3 * N + i];
      const clampX = (v) => Math.max(0, Math.min(st.w, v)), clampY = (v) => Math.max(0, Math.min(st.h, v));
      cand.push([clampX((cx - bw / 2 - pre.left) / pre.r), clampY((cy - bh / 2 - pre.top) / pre.r), clampX((cx + bw / 2 - pre.left) / pre.r), clampY((cy + bh / 2 - pre.top) / pre.r), best]);
    }
    cand.sort((a, b) => b[4] - a[4]);
    const keep = [];
    for (const b of cand) {
      if (keep.some((k) => { const ix = Math.max(0, Math.min(b[2], k[2]) - Math.max(b[0], k[0])), iy = Math.max(0, Math.min(b[3], k[3]) - Math.max(b[1], k[1])), inter = ix * iy; const u = (b[2] - b[0]) * (b[3] - b[1]) + (k[2] - k[0]) * (k[3] - k[1]) - inter; return u > 0 && inter / u > 0.7; })) continue;
      keep.push(b);
      if (keep.length >= 300) break;
    }
    const maxBall = cfg.maxBallFrac * st.w;
    return keep.filter((b) => b[2] - b[0] <= maxBall && b[3] - b[1] <= maxBall).map((b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, b[2] - b[0], b[3] - b[1], b[4]]);
  }

  // Reads just the MP4/MOV header: frame rate, frame count and the colour matrix tag.
  async function probe(file) {
    await loadScript(MP4BOX_JS);
    const mp4 = window.MP4Box.createFile();
    let info = null, bad = false;
    mp4.onReady = (i) => (info = i);
    mp4.onError = () => (bad = true);
    const CHUNK = 8 << 20;
    for (let off = 0; off < file.size && !info && !bad; ) {
      const buf = await file.slice(off, off + CHUNK).arrayBuffer();
      buf.fileStart = off; off += buf.byteLength;
      mp4.appendBuffer(buf);
    }
    const track = info && info.videoTracks[0];
    if (!track) return null;
    const entry = mp4.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0] || {};
    const colr = entry.colr || (entry.boxes || []).find((b) => b.type === "colr");
    return { fps: track.nb_samples / (track.duration / track.timescale), frames: track.nb_samples, height: track.video.height, matrix: colr && colr.matrix_coefficients };
  }
  // Which colour matrix the browser decoded with: the file's tag, or (like browsers) BT.709 for HD.
  const bt709 = (info) => (info && info.matrix ? info.matrix === 1 : st.h >= 720);

  // Every frame, in order: mp4box demuxes, WebCodecs decodes.
  async function demux(file) {
    await loadScript(MP4BOX_JS);
    const mp4 = window.MP4Box.createFile(), samples = [];
    let track = null, err = null;
    mp4.onError = (e) => (err = e);
    mp4.onReady = (info) => {
      track = info.videoTracks[0];
      if (track) { mp4.setExtractionOptions(track.id, null, { nbSamples: 1000 }); mp4.start(); }
    };
    mp4.onSamples = (id, user, s) => { for (const x of s) samples.push(x); };
    const CHUNK = 8 << 20;
    for (let off = 0; off < file.size && !err; ) {
      const buf = await file.slice(off, off + CHUNK).arrayBuffer();
      buf.fileStart = off; off += buf.byteLength;
      mp4.appendBuffer(buf);
    }
    mp4.flush();
    if (err || !track) return null;
    let description;
    for (const entry of mp4.getTrackById(track.id).mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) { const s = new window.DataStream(undefined, 0, window.DataStream.BIG_ENDIAN); box.write(s); description = new Uint8Array(s.buffer, 8); break; }
    }
    const m = track.matrix || [65536, 0, 0, 0, 65536, 0];
    const rot = (((Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI / 90) * 90) % 360) + 360) % 360;
    const secs = track.duration / track.timescale;
    return { track, samples, description, rot, fps: samples.length / secs, codedW: track.video.width, codedH: track.video.height };
  }
  async function decodeFrames(dm, stride, onFrame) {
    const config = { codec: dm.track.codec, codedWidth: dm.codedW, codedHeight: dm.codedH, description: dm.description };
    const sup = await VideoDecoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (!sup.supported) throw new Error("UNSUPPORTED_CODEC");
    const queue = [];
    let error = null, wake = null, flushed = false, flushDone = false, si = 0, idx = 0;
    const decoder = new VideoDecoder({ output: (f) => { queue.push(f); if (wake) wake(); }, error: (e) => { error = e; if (wake) wake(); } });
    decoder.configure(config);
    try {
      for (;;) {
        if (error) throw error;
        if (st.cancel || !alive) break;
        while (si < dm.samples.length && decoder.decodeQueueSize < 4 && queue.length < 4) {
          const s = dm.samples[si++];
          decoder.decode(new EncodedVideoChunk({ type: s.is_sync ? "key" : "delta", timestamp: (1e6 * s.cts) / s.timescale, duration: (1e6 * s.duration) / s.timescale, data: s.data }));
        }
        if (si >= dm.samples.length && !flushed) { flushed = true; decoder.flush().then(() => { flushDone = true; if (wake) wake(); }, (e) => { error = e; }); }
        if (queue.length) {
          const f = queue.shift();
          try { if (idx % stride === 0) await onFrame(f, idx); } finally { f.close(); }
          idx++;
          continue;
        }
        if (flushDone) break;
        await new Promise((r) => { wake = r; setTimeout(r, 40); });
        wake = null;
      }
    } finally {
      queue.forEach((f) => f.close());
      if (decoder.state !== "closed") decoder.close();
    }
    return idx;
  }
  // Fallback for files WebCodecs can't read (e.g. WebM): seek the video element frame by frame.
  async function seekFrames(fps, stride, onFrame) {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.src = st.url;
    await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
    const n = Math.floor(v.duration * fps);
    let i = 0;
    for (; i < n && !st.cancel && alive; i += stride) { await seek(v, (i + 0.5) / fps); await onFrame(v, i); }
    return n;
  }
  async function estimateFps() {
    if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) return 30;
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.src = st.url;
    await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
    const times = [];
    await new Promise((res) => {
      const cb = (now, meta) => { times.push(meta.mediaTime); if (times.length < 12) v.requestVideoFrameCallback(cb); else res(); };
      v.requestVideoFrameCallback(cb);
      v.play().catch(res);
      setTimeout(res, 2000);
    });
    v.pause();
    const diffs = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0).sort((a, b) => a - b);
    return diffs.length ? Math.round(1 / diffs[Math.floor(diffs.length / 2)]) : 30;
  }

  async function run() {
    if (st.running || !st.box || !st.file) return;
    st.running = true; st.cancel = false; st.result = null;
    const status = (t) => (q("[data-jobstatus]").textContent = t);
    const fill = q("[data-fill]");
    const setProg = (p) => { fill.style.width = `${(p * 100).toFixed(1)}%`; fill.setAttribute("aria-valuenow", String(Math.round(p * 100))); };
    q("[data-start]").disabled = true; q("[data-cancel]").hidden = false; q("[data-track]").hidden = false;
    q("[data-error]").hidden = true; q("[data-feed]").innerHTML = ""; setProg(0); stepOn(4, false);
    const stride = Number(q("[data-stride]").value);
    const events = [];
    try {
      const sess = await getSession(status);
      status("Reading the video…");
      let dm = null;
      if ("VideoDecoder" in window) dm = await demux(st.file).catch(() => null);
      const fps = dm ? dm.fps : await estimateFps();
      colorFix = bt709(await st.probe);
      const total = dm ? dm.samples.length : Math.floor(st.duration * fps);
      const tracker = new E.BallTracker(st.w, cfg), detector = new E.HoopShotDetector(st.box, fps, cfg);
      const t0 = performance.now();
      let done = 0;
      const onFrame = async (src, i) => {
        const pre = preprocess(src, st.w, st.h, dm ? dm.rot : 0);
        const out = await sess.run({ [sess.inputNames[0]]: pre.tensor });
        const dets = postprocess(out[sess.outputNames[0]], pre);
        const [point, kind] = tracker.update(dets, i);
        const ev = detector.update(point, kind, i);
        if (ev) {
          events.push(ev);
          const li = document.createElement("li");
          li.className = ev.result;
          li.textContent = `Shot ${events.length} at ${fmt(ev.time_s)}: ${ev.result === "made" ? "MADE" : "MISS"} (${ev.confidence} confidence)`;
          q("[data-feed]").appendChild(li);
        }
        done++;
        if (done % 3 === 0 || i + stride >= total) {
          const p = Math.min(0.999, (i + 1) / total), elapsed = (performance.now() - t0) / 1000;
          const left = (elapsed / Math.max(1, done)) * Math.max(0, (total - i - 1) / stride);
          setProg(p);
          status(`Analyzing frame ${(i + 1).toLocaleString()} of ${total.toLocaleString()} on ${backend} · about ${left < 60 ? Math.ceil(left) + " s" : Math.ceil(left / 60) + " min"} left`);
        }
      };
      let decoded;
      try {
        decoded = dm ? await decodeFrames(dm, stride, onFrame) : await seekFrames(fps, stride, onFrame);
      } catch (e) {
        if (e.message !== "UNSUPPORTED_CODEC") throw e;
        status("This browser can't decode that codec directly, so frames are read by seeking (slower)…");
        decoded = await seekFrames(fps, stride, onFrame);
      }
      if (st.cancel) { status("Cancelled."); return; }
      st.result = { events, fps, frames: decoded, backend };
      setProg(1);
      status(`Analysis complete: ${decoded.toLocaleString()} frames on ${backend} in ${Math.round((performance.now() - t0) / 1000)} s.`);
      renderResults();
    } catch (e) {
      const box = q("[data-error]");
      box.hidden = false;
      box.textContent = `Something went wrong: ${e && e.message ? e.message : e}. Try an MP4 (H.264) file or a recent version of Chrome, Edge or Safari.`;
      status("");
    } finally {
      st.running = false;
      if (alive) { q("[data-start]").disabled = false; q("[data-cancel]").hidden = true; }
    }
  }

  /* ── Step 4: results ── */
  function renderResults() {
    const { events } = st.result;
    stepOn(4, true);
    const made = events.filter((e) => e.result === "made").length;
    const windows = E.clipWindows(events, st.mode, st.duration, cfg);
    q("[data-summary]").textContent = events.length
      ? `${events.length} shot${events.length === 1 ? "" : "s"} found: ${made} made, ${events.length - made} missed. ${windows.length} clip${windows.length === 1 ? "" : "s"} below (${{ all: "every attempt", made: "made baskets only", miss: "missed shots only" }[st.mode]}).`
      : "No shots detected. Check that the rim box is tight and the ball is visible as it reaches the rim.";
    const canSave = typeof MediaRecorder !== "undefined" && (HTMLMediaElement.prototype.captureStream || HTMLMediaElement.prototype.mozCaptureStream);
    q("[data-clips]").innerHTML = windows.map((w, i) => {
      const label = [...new Set(w.events.map((e) => e.result))].sort().join("-");
      const name = `clip_${String(i + 1).padStart(2, "0")}_${label}_${String(Math.floor(w.start / 60)).padStart(2, "0")}m${String(Math.floor(w.start % 60)).padStart(2, "0")}s`;
      return `<article class="cc-clip">
        <div class="cc-clip-top"><b>${name}</b><span class="cc-time">${fmt(w.start)} – ${fmt(w.end)}</span></div>
        <div class="cc-tags">${w.events.map((e) => `<span class="cc-tag ${e.result}">${e.result === "made" ? "Made" : "Miss"} · ${e.confidence}</span>`).join("")}</div>
        <div class="cc-clip-actions">
          <button type="button" class="cc-btn small" data-watch="${i}">▶ Watch</button>
          ${canSave ? `<button type="button" class="cc-btn ghost small" data-save="${i}" data-name="${name}">Save clip</button>` : ""}
        </div>
      </article>`;
    }).join("");
    st.windows = windows;

    // Shot chart (courtPct from the real app's static/app.js)
    const court = q("[data-court]");
    court.querySelectorAll(".cc-marker").forEach((m) => m.remove());
    events.forEach((ev, i) => {
      if (ev.ball_x === null || ev.ball_y === null) return;
      const [xf, df] = E.approxShotLocationFt(ev.ball_x, ev.ball_y, st.box);
      ev.court_x_ft = xf; ev.court_dist_ft = df;
      const m = document.createElement("button");
      m.type = "button";
      m.className = `cc-marker ${ev.result}`;
      m.style.left = `${((25 + Math.max(-24, Math.min(24, xf))) / 50) * 100}%`;
      m.style.top = `${((5.25 + Math.max(0, Math.min(41, df))) / 47) * 100}%`;
      const label = `Shot ${i + 1}: ${ev.result === "made" ? "made" : "missed"} at ${fmt(ev.time_s)}`;
      m.setAttribute("aria-label", label + ". Activate to watch it.");
      m.addEventListener("mouseenter", () => (q("[data-courtstatus]").textContent = label));
      m.addEventListener("focus", () => (q("[data-courtstatus]").textContent = label));
      m.addEventListener("click", () => playWindow(Math.max(0, ev.time_s - cfg.clipBeforeSeconds), Math.min(st.duration, ev.time_s + cfg.clipAfterSeconds)));
      court.appendChild(m);
    });
    q("[data-courtstatus]").textContent = events.length ? "Hover or tab to a marker to see the shot." : "No shots detected.";

    // Stats card (tally + close/mid/deep from the real app)
    const tally = (evs) => { const m = evs.filter((e) => e.result === "made").length; return { att: evs.length, made: m, pct: evs.length ? Math.round((100 * m) / evs.length) : null }; };
    const t = tally(events), buckets = { close: [], mid: [], deep: [] };
    events.forEach((e) => { if (e.court_x_ft != null) buckets[E.locationBucket(e.court_x_ft, e.court_dist_ft)].push(e); });
    q("[data-stats]").innerHTML = `<article class="cc-stat"><h6>Team</h6><p class="cc-pct">${t.pct == null ? "—" : t.pct + "%"}</p>
      <p class="cc-detail">${t.made} made / ${t.att - t.made} missed (${t.att} shot${t.att === 1 ? "" : "s"})</p>
      <p class="cc-detail">${["close", "mid", "deep"].map((b) => { const x = tally(buckets[b]); return `${b[0].toUpperCase()}${b.slice(1)} ${x.made}/${x.att}`; }).join(" · ")}</p></article>`;
  }

  const clipPlayer = q("[data-clipplayer]");
  let stopAt = null;
  clipPlayer.addEventListener("timeupdate", () => { if (stopAt !== null && clipPlayer.currentTime >= stopAt) { clipPlayer.pause(); stopAt = null; } });
  async function playWindow(start, end) {
    clipPlayer.scrollIntoView({ block: "center", behavior: "smooth" });
    await seek(clipPlayer, start);
    stopAt = end;
    clipPlayer.play().catch(() => {});
  }
  q("[data-clips]").addEventListener("click", async (e) => {
    const w = e.target.closest("[data-watch]");
    if (w) { const win = st.windows[Number(w.dataset.watch)]; return playWindow(win.start, win.end); }
    const s = e.target.closest("[data-save]");
    if (s) {
      // Records the clip as it plays (real time), keeping the audio.
      const win = st.windows[Number(s.dataset.save)];
      s.disabled = true; s.textContent = "Recording…";
      await seek(clipPlayer, win.start);
      const stream = (clipPlayer.captureStream || clipPlayer.mozCaptureStream).call(clipPlayer);
      const rec = new MediaRecorder(stream), chunks = [];
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      rec.onstop = () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
        a.download = `${s.dataset.name}.${(rec.mimeType || "").includes("mp4") ? "mp4" : "webm"}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        s.disabled = false; s.textContent = "Save clip";
      };
      rec.start();
      stopAt = null;
      await clipPlayer.play().catch(() => {});
      const tick = () => { if (clipPlayer.currentTime >= win.end || clipPlayer.paused) { clipPlayer.pause(); if (rec.state !== "inactive") rec.stop(); } else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
  });
  // export.csv, same columns as export.py (no players or drills in the browser version)
  q("[data-csv]").addEventListener("click", () => {
    const rows = [["player_name", "result", "time_s", "shot_x_ft", "shot_dist_ft", "confidence", "drill_tag"]];
    st.result.events.forEach((e) => rows.push(["", e.result, e.time_s.toFixed(2), e.court_x_ft ?? "", e.court_dist_ft ?? "", e.confidence, ""]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n") + "\n"], { type: "text/csv" }));
    a.download = "export.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  /* ── Example game (simulated, for visitors without footage) ── */
  function mountExample(host) {
    const RIM = { x: 250, y: 52 };
    let shots = [], filter = "all", game = 0;
    host.innerHTML = `
      <div class="p-row">
        <div class="p-main">
          <div class="court" data-xcourt>
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
        </div>
        <div class="p-side">
          <div class="btn-row" role="group" aria-label="Filter shots" data-xfilters></div>
          <dl class="p-metrics" data-xtotals></dl>
          <div class="p-box" data-xzones></div>
          <button type="button" class="p-btn p-btn-primary" data-xnew>Simulate another game</button>
          <p class="p-note">A simulated game, so you can see the kind of shot chart and zone stats ClipCourt produces without uploading anything.</p>
        </div>
      </div>`;
    const xq = (s) => host.querySelector(s);
    const zoneOf = (x, y) => (x >= 170 && x <= 330 && y <= 190 ? "Paint" : Math.hypot(x - RIM.x, y - RIM.y) > 220 || (y <= 52 && (x < 30 || x > 470)) ? "Three" : "Mid-range");
    const visible = (s) => filter === "all" || (filter === "made" ? s.made : !s.made);
    function simulate() {
      game++;
      const pMake = { Paint: 0.57, "Mid-range": 0.41, Three: 0.35 };
      shots = Array.from({ length: 26 + Math.floor(Math.random() * 10) }, () => {
        const roll = Math.random();
        let x, y;
        if (roll < 0.4) { x = 185 + Math.random() * 130; y = 15 + Math.random() * 165; }
        else { const a = Math.random() * Math.PI, r = roll < 0.65 ? 110 + Math.random() * 95 : 232 + Math.random() * 40; x = RIM.x + Math.cos(a) * r; y = RIM.y + Math.sin(a) * r; }
        x = Math.min(488, Math.max(12, x)); y = Math.min(455, Math.max(10, y));
        const zone = zoneOf(x, y);
        return { x, y, zone, made: Math.random() < pMake[zone] };
      });
      render();
    }
    function render() {
      const court = xq("[data-xcourt]");
      court.querySelectorAll(".shot").forEach((s) => s.remove());
      shots.forEach((s) => {
        const d = document.createElement("span");
        d.className = `shot ${s.made ? "made" : "miss"}${visible(s) ? "" : " hide"}`;
        d.style.left = `${s.x / 5}%`; d.style.top = `${s.y / 4.7}%`;
        d.title = `${s.zone}: ${s.made ? "made" : "missed"}`;
        court.appendChild(d);
      });
      xq("[data-xfilters]").innerHTML = [["all", "All"], ["made", "Made"], ["miss", "Missed"]].map(([id, l]) => `<button type="button" class="p-btn" data-xf="${id}" aria-pressed="${filter === id}">${l}</button>`).join("");
      const made = shots.filter((s) => s.made).length, threes = shots.filter((s) => s.zone === "Three");
      xq("[data-xtotals]").innerHTML = [["Field goals", `${made}/${shots.length}`], ["FG%", Math.round((made / shots.length) * 100) + "%"], ["3-pointers", `${threes.filter((s) => s.made).length}/${threes.length}`], ["Points", String(shots.reduce((a, s) => a + (s.made ? (s.zone === "Three" ? 3 : 2) : 0), 0))]]
        .map(([k, v]) => `<div class="p-metric"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      xq("[data-xzones]").innerHTML = `<p class="p-note" style="margin-bottom:10px">Shooting by zone · game ${game}</p>` + ["Paint", "Mid-range", "Three"].map((z) => {
        const zs = shots.filter((s) => s.zone === z), zm = zs.filter((s) => s.made).length, pc = zs.length ? Math.round((zm / zs.length) * 100) : 0;
        return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px"><span>${z}</span><span>${zm}/${zs.length} · ${pc}%</span></div><div class="zone-bar"><span style="width:${pc}%"></span></div></div>`;
      }).join("");
    }
    host.addEventListener("click", (e) => {
      const f = e.target.closest("[data-xf]");
      if (f) { filter = f.dataset.xf; render(); }
      if (e.target.closest("[data-xnew]")) simulate();
    });
    simulate();
    return () => {};
  }

  return () => {
    alive = false;
    st.cancel = true;
    window.removeEventListener("resize", resizeOverlay);
    if (st.url) URL.revokeObjectURL(st.url);
    if (session && session.release) session.release().catch(() => {});
  };
};
