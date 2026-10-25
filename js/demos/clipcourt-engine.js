// ClipCourt engine, ported from engine.py in the ClipCourt repo:
// EngineConfig, BallTracker, HoopShotDetector, rim suggestion, shot location
// and clip windows. Pure logic with no DOM, so it can be tested in Node
// against the Python engine frame by frame.
(function (root) {
  const DEFAULTS = {
    yoloConf: 0.15, sportsBallClass: 32,
    maxJumpRatio: 0.18, trackLostFrames: 8, coastFrames: 6, emaAlpha: 0.55, maxBallFrac: 0.20,
    armXPadRatio: 0.5, attemptZonePadRatio: 0.6, makeConfirmSeconds: 0.8, shotCooldownSeconds: 2.0, directionGapFrames: 3,
    clipBeforeSeconds: 3.0, clipAfterSeconds: 1.0,
  };

  class BallTracker {
    constructor(frameW, cfg) {
      this.cfg = cfg;
      this.maxJumpPx = cfg.maxJumpRatio * frameW;
      this.rawPos = null; this.measuredPos = null; this.smoothPos = null;
      this.lastSeenFrame = null; this.velocity = [0, 0]; this.coastedLeft = 0;
      this.lastUpdateFrame = null;
    }
    _accept(cx, cy, f) {
      if (this.measuredPos && this.lastSeenFrame !== null) {
        const gap = Math.max(1, f - this.lastSeenFrame);
        this.velocity = [(cx - this.measuredPos[0]) / gap, (cy - this.measuredPos[1]) / gap];
      }
      this.rawPos = [cx, cy]; this.measuredPos = [cx, cy]; this.lastSeenFrame = f;
      this.coastedLeft = this.cfg.coastFrames;
      const a = this.cfg.emaAlpha;
      this.smoothPos = this.smoothPos === null ? [cx, cy] : [a * cx + (1 - a) * this.smoothPos[0], a * cy + (1 - a) * this.smoothPos[1]];
    }
    // detections: [[cx, cy, w, h, conf], ...] → [point|null, "measured"|"coasted"|"lost"]
    update(dets, f) {
      // Frames skipped by a sampling stride still count as time passing (1 when every frame is analyzed).
      const step = this.lastUpdateFrame === null ? 1 : Math.max(1, f - this.lastUpdateFrame);
      this.lastUpdateFrame = f;
      let best = null;
      if (dets.length && this.lastSeenFrame !== null && f - this.lastSeenFrame > this.cfg.trackLostFrames) {
        this.rawPos = this.measuredPos = this.smoothPos = null;
        this.velocity = [0, 0];
      }
      if (dets.length) {
        if (this.rawPos === null) best = dets.reduce((a, b) => (b[4] > a[4] ? b : a));
        else {
          const gap = Math.max(1, f - (this.lastSeenFrame || f)); // `or` like the Python: frame 0 counts as unset
          const allowed = this.maxJumpPx * gap;
          let bestScore = -Infinity;
          for (const d of dets) {
            const dist = Math.hypot(d[0] - this.rawPos[0], d[1] - this.rawPos[1]);
            if (dist <= allowed) {
              const sc = d[4] - 0.5 * (dist / Math.max(allowed, 1e-6));
              if (sc > bestScore) { bestScore = sc; best = d; }
            }
          }
        }
      }
      if (best) { this._accept(best[0], best[1], f); return [this.smoothPos, "measured"]; }
      if (this.rawPos !== null && this.coastedLeft > 0) {
        this.coastedLeft -= step;
        this.rawPos = [this.rawPos[0] + this.velocity[0] * step, this.rawPos[1] + this.velocity[1] * step];
        this.smoothPos = this.rawPos;
        return [this.smoothPos, "coasted"];
      }
      return [null, "lost"];
    }
  }

  class HoopShotDetector {
    constructor(box, fps, cfg) {
      const [x, y, w, h] = box;
      this.rimLeft = x; this.rimRight = x + w; this.rimTop = y; this.rimBottom = y + h;
      this.cfg = cfg; this.fps = fps;
      const padX = w * cfg.armXPadRatio;
      this.armLeft = x - padX; this.armRight = x + w + padX;
      const zpad = w * cfg.attemptZonePadRatio;
      this.zoneLeft = x - zpad; this.zoneRight = x + w + zpad; this.zoneTop = y - h * 3.0;
      this.state = "idle"; this.armedFrame = null; this.passedThroughBand = false;
      this.lastX = null; this.lastY = null; this.lastYFrame = null; this.cooldownUntil = -1;
      this.makeConfirmFrames = Math.trunc(cfg.makeConfirmSeconds * fps);
      this.cooldownFrames = Math.trunc(cfg.shotCooldownSeconds * fps);
    }
    _direction(y, f) {
      if (this.lastY === null || this.lastYFrame === null) return null;
      if (f - this.lastYFrame > this.cfg.directionGapFrames) return null;
      return (y - this.lastY) / Math.max(1, f - this.lastYFrame);
    }
    update(point, kind, f) {
      let event = null;
      if (point) {
        const [x, y] = point, dy = this._direction(y, f);
        if (this.state === "idle" && f >= this.cooldownUntil) {
          const descending = dy !== null && dy > 0;
          const inZone = this.zoneLeft <= x && x <= this.zoneRight && this.zoneTop <= y && y <= this.rimTop;
          if (descending && inZone) { this.state = "armed"; this.armedFrame = f; this.passedThroughBand = false; }
        } else if (this.state === "armed") {
          const inBand = this.rimTop <= y && y <= this.rimBottom && this.rimLeft <= x && x <= this.rimRight;
          const descending = dy === null || dy >= 0;
          if (inBand && descending && kind === "measured") this.passedThroughBand = true;
          const below = y > this.rimBottom, lateral = x < this.armLeft || x > this.armRight;
          if (below && kind === "measured") event = this._resolve(f, this.passedThroughBand ? "made" : "miss", this.passedThroughBand ? "high" : "medium", x, y);
          else if (lateral && y < this.rimTop) event = this._resolve(f, "miss", "high", x, y);
          else if (f - this.armedFrame > this.makeConfirmFrames) event = this._resolve(f, this.passedThroughBand ? "made" : "miss", "medium", x, y);
        }
        this.lastX = x; this.lastY = y; this.lastYFrame = f;
      } else if (this.state === "armed" && f - this.armedFrame > this.makeConfirmFrames) {
        event = this._resolve(f, this.passedThroughBand ? "made" : "miss", "medium", this.lastX, this.lastY);
      }
      return event;
    }
    _resolve(f, result, confidence, ballX, ballY) {
      this.state = "idle";
      this.cooldownUntil = f + this.cooldownFrames;
      return { frame: f, time_s: f / this.fps, result, confidence, ball_x: ballX ?? null, ball_y: ballY ?? null };
    }
  }

  // approx_shot_location_ft: offset from the rim in feet, scaled by the 18-inch rim width.
  function approxShotLocationFt(bx, by, box) {
    const [x, y, w, h] = box;
    if (w <= 0) return [0, 0];
    const pxPerFt = w / 1.5;
    return [Math.round(((bx - (x + w / 2)) / pxPerFt) * 100) / 100, Math.round((Math.abs(by - (y + h)) / pxPerFt) * 100) / 100];
  }

  function locationBucket(xFt, distFt) {
    const d = Math.hypot(xFt, distFt);
    return d < 8 ? "close" : d <= 20 ? "mid" : "deep";
  }

  // cut_clips' windowing: one window per wanted shot, overlapping windows merged.
  function clipWindows(events, mode, duration, cfg) {
    const wins = events.filter((e) => mode === "all" || e.result === mode)
      .map((e) => [Math.max(0, e.time_s - cfg.clipBeforeSeconds), Math.min(duration, e.time_s + cfg.clipAfterSeconds), [e]])
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e, evs] of wins) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) { last[1] = Math.max(last[1], e); last[2] = last[2].concat(evs); }
      else merged.push([s, e, evs]);
    }
    return merged.map(([start, end, evs]) => ({ start, end, events: evs }));
  }

  // _rim_candidates + suggest_hoop_box. `frames` are {data, width, height} RGBA images,
  // `scale` maps their pixels back to the full-resolution video.
  const RIM_HSV_LOW = [3, 90, 60], RIM_HSV_HIGH = [23, 255, 255];
  function rimMask(img) {
    const { data, width: w, height: h } = img, m = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < m.length; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      // cv2.COLOR_BGR2HSV for 8-bit images: H in 0–180 and S in 0–255, both rounded to integers.
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, s = mx ? Math.round((255 * (mx - mn)) / mx) : 0;
      let hue = 0;
      if (mx !== mn) {
        if (mx === r) hue = (60 * (g - b)) / (mx - mn);
        else if (mx === g) hue = 120 + (60 * (b - r)) / (mx - mn);
        else hue = 240 + (60 * (r - g)) / (mx - mn);
        if (hue < 0) hue += 360;
      }
      const H = Math.round(hue / 2);
      m[i] = H >= RIM_HSV_LOW[0] && H <= RIM_HSV_HIGH[0] && s >= RIM_HSV_LOW[1] && v >= RIM_HSV_LOW[2] ? 1 : 0;
    }
    return m;
  }
  // cv2.morphologyEx(MORPH_CLOSE) with getStructuringElement(MORPH_ELLIPSE, (5, 5)).
  // That ellipse is a 5×3 block plus a 1×5 column, so each pass is two separable box passes.
  function boxPass(src, w, h, kx, ky, dilate) {
    const rx = (kx - 1) / 2, ry = (ky - 1) / 2, tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
    const edge = dilate ? 0 : 1; // OpenCV's default border never changes the result
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let d = -rx; d <= rx; d++) { const xx = x + d, s = xx < 0 || xx >= w ? edge : src[y * w + xx]; if (dilate ? s : !s) { v = dilate ? 1 : 0; break; } }
      tmp[y * w + x] = v;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let d = -ry; d <= ry; d++) { const yy = y + d, s = yy < 0 || yy >= h ? edge : tmp[yy * w + x]; if (dilate ? s : !s) { v = dilate ? 1 : 0; break; } }
      out[y * w + x] = v;
    }
    return out;
  }
  function morphClose(m, w, h) {
    const a = boxPass(m, w, h, 5, 3, true), b = boxPass(m, w, h, 1, 5, true);
    for (let i = 0; i < a.length; i++) a[i] = a[i] | b[i];
    const c = boxPass(a, w, h, 5, 3, false), d = boxPass(a, w, h, 1, 5, false);
    for (let i = 0; i < c.length; i++) c[i] = c[i] & d[i];
    return c;
  }
  // Candidates for one full-resolution frame (scale 1), or a shrunk one (scale > 1).
  function rimCandidates(img, scale = 1) {
    const { width: w, height: h } = img;
    const m = morphClose(rimMask(img), w, h);
    const label = new Int32Array(w * h), out = [], fullW = w * scale, fullH = h * scale;
    let next = 0;
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || label[s]) continue;
      // One 8-connected blob, like an external contour from cv2.findContours.
      const id = ++next;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      const stack = [s]; label[s] = id;
      while (stack.length) {
        const p = stack.pop(), px = p % w, py = (p - px) / w;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx, yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const qi = yy * w + xx;
          if (m[qi] && !label[qi]) { label[qi] = id; stack.push(qi); }
        }
      }
      // contourArea counts everything inside the outer boundary, holes included:
      // flood the box from its edges through non-blob pixels; what isn't reached is inside.
      const bwp = x1 - x0 + 1, bhp = y1 - y0 + 1, outside = new Uint8Array(bwp * bhp), q2 = [];
      const isBlob = (lx, ly) => label[(y0 + ly) * w + x0 + lx] === id;
      for (let lx = 0; lx < bwp; lx++) for (const ly of [0, bhp - 1]) if (!isBlob(lx, ly) && !outside[ly * bwp + lx]) { outside[ly * bwp + lx] = 1; q2.push(ly * bwp + lx); }
      for (let ly = 0; ly < bhp; ly++) for (const lx of [0, bwp - 1]) if (!isBlob(lx, ly) && !outside[ly * bwp + lx]) { outside[ly * bwp + lx] = 1; q2.push(ly * bwp + lx); }
      while (q2.length) {
        const p = q2.pop(), lx = p % bwp, ly = (p - lx) / bwp;
        for (const [ax, ay] of [[lx - 1, ly], [lx + 1, ly], [lx, ly - 1], [lx, ly + 1]]) {
          if (ax < 0 || ay < 0 || ax >= bwp || ay >= bhp) continue;
          const k = ay * bwp + ax;
          if (!outside[k] && !isBlob(ax, ay)) { outside[k] = 1; q2.push(k); }
        }
      }
      // Filled area, minus half the outer boundary: contourArea measures between pixel centres.
      let area = bwp * bhp, edgePx = 0;
      for (let k = 0; k < outside.length; k++) area -= outside[k];
      for (let ly = 0; ly < bhp; ly++) for (let lx = 0; lx < bwp; lx++) {
        if (!isBlob(lx, ly)) continue;
        if (lx === 0 || ly === 0 || lx === bwp - 1 || ly === bhp - 1 || outside[ly * bwp + lx - 1] || outside[ly * bwp + lx + 1] || outside[(ly - 1) * bwp + lx] || outside[(ly + 1) * bwp + lx]) edgePx++;
      }
      area = Math.max(0, area - edgePx / 2 - 1);
      const bx = x0 * scale, by = y0 * scale, bw = bwp * scale, bh = bhp * scale;
      if (bh < 3 || bw < 8) continue;
      if (bw < 0.02 * fullW || bw > 0.25 * fullW) continue;
      if (by > 0.72 * fullH) continue;
      const aspect = bw / bh;
      if (aspect < 1.2 || aspect > 7.0) continue;
      const fill = (area * scale * scale) / (bw * bh);
      let score = (Math.min(aspect, 4.0) / 4.0) * 0.5;
      score += (1.0 - Math.min(fill, 1.0)) * 0.3;
      score += (1.0 - by / (0.72 * fullH)) * 0.2;
      out.push([Math.round(score * 1e4) / 1e4, bx, by, bw, bh]);
    }
    return out.sort((a, b) => b[0] - a[0]);
  }
  // perFrame: the top-5 rimCandidates() of each sampled frame.
  function suggestHoopBox(perFrame) {
    const flat = perFrame.flat();
    if (!flat.length) return null;
    const scored = flat.map(([score, x, y, w, h]) => {
      const cx = x + w / 2, cy = y + h / 2;
      let agree = 0;
      for (const other of perFrame) {
        if (other.some(([, ox, oy, ow, oh]) => Math.abs(ox + ow / 2 - cx) < Math.max(w, 12) && Math.abs(oy + oh / 2 - cy) < Math.max(h, 12))) agree++;
      }
      return { x, y, w, h, framesAgreeing: agree, framesSampled: perFrame.length, score: Math.round(score * (1.0 + 0.45 * (agree - 1)) * 1000) / 1000 };
    });
    // The best one is exactly suggest_hoop_box's answer. The rest (distinct places that
    // also pass its checks, best first) are offered as "next suggestion" in the browser.
    const ranked = [];
    for (const c of scored.sort((a, b) => b.score - a.score)) {
      if (c.framesAgreeing < 2 || c.score < 0.45) continue;
      if (ranked.some((r) => Math.abs(r.x + r.w / 2 - (c.x + c.w / 2)) < Math.max(r.w, 12) && Math.abs(r.y + r.h / 2 - (c.y + c.h / 2)) < Math.max(r.h, 12))) continue;
      ranked.push(c);
    }
    if (!ranked.length || ranked[0] !== scored[0]) return null; // the overall best failed the checks: don't guess
    return { ...ranked[0], ranked };
  }

  // Browsers decode HD video with the BT.709 colour matrix; OpenCV (what the Python app
  // sees) always uses BT.601. This maps browser RGB to OpenCV's RGB, in place.
  const M709TO601 = [0.9136, 0.078478, 0.007922, -0.10504, 1.172167, -0.067127, 0.009578, 0.032222, 0.9582];
  function toOpenCvColors(data) {
    const m = M709TO601;
    for (let p = 0; p < data.length; p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      data[p] = m[0] * r + m[1] * g + m[2] * b;
      data[p + 1] = m[3] * r + m[4] * g + m[5] * b;
      data[p + 2] = m[6] * r + m[7] * g + m[8] * b;
    }
    return data; // a Uint8ClampedArray rounds and clamps for us
  }

  const api = { DEFAULTS, toOpenCvColors, BallTracker, HoopShotDetector, approxShotLocationFt, locationBucket, clipWindows, suggestHoopBox, rimCandidates, rimMask, morphClose };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ClipCourtEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
