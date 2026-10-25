// Hangman: the classic, drawn in chalk, with finance vocabulary.
window.DEMOS = window.DEMOS || {};
window.DEMOS.hangman = function (el) {
  const WORDS = [
    ["VOLATILITY", "How much a price swings around"],
    ["ARBITRAGE", "Profiting from a price difference between markets"],
    ["PORTFOLIO", "A collection of investments"],
    ["MOMENTUM", "The tendency of trends to continue"],
    ["DERIVATIVE", "A contract whose value comes from another asset"],
    ["DIVIDEND", "A share of profits paid to shareholders"],
    ["LIQUIDITY", "How easily something can be bought or sold"],
    ["HEDGE", "A trade that offsets risk"],
    ["BACKTEST", "Testing a strategy on historical data"],
    ["DRAWDOWN", "The fall from a peak to a trough"],
  ];
  const LIVES = 6;
  let order = WORDS.map((_, i) => i).sort(() => Math.random() - 0.5), idx = 0, word, hint, guessed, wins = 0, streak = 0;

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px">
      <div class="hm-top">
        <div class="hm-draw">
          <svg viewBox="0 0 150 170" role="img" aria-label="Hangman drawing" data-svg
               fill="none" stroke="var(--p-text)" stroke-width="4" stroke-linecap="round">
            <path d="M10 160 H100 M35 160 V12 H100 V30" opacity=".85"></path>
            <circle class="part" cx="100" cy="45" r="15" stroke="var(--p-accent)"></circle>
            <path class="part" d="M100 60 V105" stroke="var(--p-accent)"></path>
            <path class="part" d="M100 72 L80 92" stroke="var(--p-accent)"></path>
            <path class="part" d="M100 72 L120 92" stroke="var(--p-accent)"></path>
            <path class="part" d="M100 105 L84 135" stroke="var(--p-accent)"></path>
            <path class="part" d="M100 105 L116 135" stroke="var(--p-accent)"></path>
          </svg>
        </div>
        <div style="flex:1 1 280px;min-width:0;display:flex;flex-direction:column;gap:10px">
          <p class="hm-word" data-word aria-live="polite"></p>
          <p class="p-note" data-hint></p>
          <p data-msg aria-live="polite"></p>
        </div>
      </div>
      <div class="keys" role="group" aria-label="Letters" data-keys></div>
      <div class="btn-row" style="justify-content:space-between">
        <button type="button" class="p-btn p-btn-primary" data-new>New word</button>
        <span class="p-note" data-stats></span>
      </div>
    </div>`;

  const q = (s) => el.querySelector(s);

  function next() {
    const [w, h] = WORDS[order[idx++ % order.length]];
    word = w; hint = h; guessed = new Set();
    render();
  }

  function state() {
    const wrong = [...guessed].filter((c) => !word.includes(c)).length;
    const won = [...word].every((c) => guessed.has(c));
    return { wrong, won, lost: wrong >= LIVES };
  }

  function guess(ch) {
    const s = state();
    if (s.won || s.lost || guessed.has(ch)) return;
    guessed.add(ch);
    const after = state();
    if (after.won) { wins++; streak++; }
    if (after.lost) streak = 0;
    render();
  }

  function render() {
    const { wrong, won, lost } = state();
    q("[data-word]").textContent = [...word].map((c) => (guessed.has(c) || lost ? c : "_")).join("");
    q("[data-hint]").textContent = "Hint: " + hint;
    q("[data-msg]").textContent = won ? `Solved with ${LIVES - wrong} ${LIVES - wrong === 1 ? "life" : "lives"} to spare.` : lost ? `Out of lives. The word was ${word}.` : `${LIVES - wrong} ${LIVES - wrong === 1 ? "life" : "lives"} left. Click a letter or type on your keyboard.`;
    q("[data-svg]").querySelectorAll(".part").forEach((p, i) => p.classList.toggle("on", i < wrong));
    q("[data-keys]").innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => {
      const used = guessed.has(c), hit = used && word.includes(c);
      return `<button type="button" class="key ${used ? (hit ? "hit" : "miss") : ""}" data-k="${c}" ${used || won || lost ? "disabled" : ""} aria-label="${c}${used ? (hit ? ", in the word" : ", not in the word") : ""}">${c}</button>`;
    }).join("");
    q("[data-stats]").textContent = `Solved: ${wins} · Streak: ${streak}`;
  }

  el.addEventListener("click", (e) => {
    const k = e.target.closest("[data-k]");
    if (k) guess(k.dataset.k);
    if (e.target.closest("[data-new]")) next();
  });

  // Physical keyboard, only while this demo is on screen and nothing else has focus.
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = document.activeElement;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (document.querySelector("dialog[open]")) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    if (/^[a-z]$/i.test(e.key)) guess(e.key.toUpperCase());
  }
  document.addEventListener("keydown", onKey);

  next();
  return () => document.removeEventListener("keydown", onKey);
};
