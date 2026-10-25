// SAT Vocab Lab: a short Words-in-Context round in the app's "opposites" style.
window.DEMOS = window.DEMOS || {};
window.DEMOS.sat = function (el) {
  const BANK = [
    { q: "The new levee did not stop the flooding, but it did ____ the damage.", o: ["mitigate", "exacerbate", "embellish", "corroborate"], a: 0, pair: "mitigate ↔ exacerbate" },
    { q: "Critics warned the policy would ____ inequality rather than reduce it.", o: ["alleviate", "exacerbate", "assuage", "abate"], a: 1, pair: "exacerbate ↔ alleviate" },
    { q: "Her ____ reply, a single word, ended the interview.", o: ["verbose", "garrulous", "laconic", "effusive"], a: 2, pair: "laconic ↔ verbose" },
    { q: "Once the storm began to ____, the ferries resumed service.", o: ["intensify", "escalate", "amplify", "abate"], a: 3, pair: "abate ↔ intensify" },
    { q: "The findings were ____ by three independent studies.", o: ["corroborated", "refuted", "undermined", "disputed"], a: 0, pair: "corroborate ↔ refute" },
    { q: "Though usually ____, the senator spoke at length about her childhood.", o: ["reticent", "candid", "loquacious", "forthcoming"], a: 0, pair: "reticent ↔ forthcoming" },
    { q: "The coach's ____ praise, rare as it was, meant a great deal to the team.", o: ["lavish", "grudging", "effusive", "unstinting"], a: 1, pair: "grudging ↔ lavish" },
    { q: "Far from being ____, the theory has been revised dozens of times.", o: ["dynamic", "malleable", "immutable", "provisional"], a: 2, pair: "immutable ↔ malleable" },
    { q: "Investors grew ____ after the second quarter of losses, pulling their funds.", o: ["sanguine", "wary", "complacent", "credulous"], a: 1, pair: "wary ↔ complacent" },
    { q: "The author's ____ style, packed with detail, frustrated some readers.", o: ["terse", "succinct", "prolix", "pithy"], a: 2, pair: "prolix ↔ terse" },
  ];
  const ROUND = 5;
  let round, i, score, picked, actx = null;

  // The same little sound effects as the SAT Vocab Lab app (Web Audio, no files).
  const SFX = {
    correct: [[660, 0, 0.12, 0.11], [990, 0.08, 0.24, 0.11]],
    wrong: [[247, 0, 0.16, 0.09, "triangle"], [196, 0.1, 0.26, 0.08, "triangle"]],
    complete: [[523, 0, 0.14, 0.09], [659, 0.1, 0.14, 0.09], [784, 0.2, 0.14, 0.09], [1047, 0.3, 0.4, 0.11]],
  };
  function sound(name) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = actx || new AC();
    if (actx.state === "suspended") actx.resume();
    const t0 = actx.currentTime + 0.01;
    for (const [freq, at, dur, vol, type = "sine"] of SFX[name]) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0 + at);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(actx.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  }

  function newRound() {
    round = BANK.slice().sort(() => Math.random() - 0.5).slice(0, ROUND);
    i = 0; score = 0; picked = null;
    render();
  }

  function render() {
    if (i >= ROUND) {
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px;max-width:640px">
          <div class="quiz-progress"><span style="width:100%"></span></div>
          <p class="quiz-q">Round complete: <strong>${score} / ${ROUND}</strong> correct.</p>
          <p class="p-note">${score === ROUND ? "Perfect round." : "Every miss is a pair of opposites worth learning."} The full app has 349 words, 35 themed batches and 7 study modes.</p>
          <div class="btn-row">
            <button type="button" class="p-btn p-btn-primary" data-again>Play another round</button>
            <a class="p-btn" href="https://ishaan7497.github.io/SAT-VOCAB-LAB/" target="_blank" rel="noopener">Open the full app ↗</a>
          </div>
        </div>`;
      return;
    }
    const it = round[i];
    const answered = picked !== null;
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;max-width:680px">
        <div style="display:flex;justify-content:space-between;font-size:14px;color:var(--p-muted)">
          <span>Question ${i + 1} of ${ROUND}</span><span>Score ${score}</span>
        </div>
        <div class="quiz-progress"><span style="width:${(i / ROUND) * 100}%"></span></div>
        <p class="quiz-q">${it.q.replace("____", '<span style="display:inline-block;min-width:90px;border-bottom:2px solid var(--p-accent)">&nbsp;</span>')}</p>
        <div class="quiz-opts">
          ${it.o.map((w, j) => {
            const cls = answered && j === it.a ? "right" : answered && j === picked ? "wrong" : "";
            return `<button type="button" class="quiz-opt ${cls}" data-pick="${j}" ${answered ? "disabled" : ""}>${w}</button>`;
          }).join("")}
        </div>
        ${answered ? `
          <div class="p-box" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center">
            <span>${picked === it.a ? "Correct." : `Not quite. The answer is <strong>${it.o[it.a]}</strong>.`} Opposites pair: <strong>${it.pair}</strong></span>
            <button type="button" class="p-btn p-btn-primary" data-next>${i === ROUND - 1 ? "See score" : "Next question"}</button>
          </div>` : `<p class="p-note">Tip: decide which way the sentence leans before reading the options.</p>`}
      </div>`;
    const nb = el.querySelector("[data-next]");
    if (nb) nb.focus({ preventScroll: true });
  }

  el.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pick]");
    if (p && picked === null) {
      picked = Number(p.dataset.pick);
      if (picked === round[i].a) score++;
      sound(picked === round[i].a ? "correct" : "wrong");
      render();
    }
    if (e.target.closest("[data-next]")) { i++; picked = null; if (i >= ROUND) sound("complete"); render(); }
    if (e.target.closest("[data-again]")) newRound();
  });

  newRound();
  return () => { if (actx) actx.close().catch(() => {}); };
};
