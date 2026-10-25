// Odd or Eve: odd_or_eve.py running in a browser terminal. The game is a
// line-by-line port of the Python script: same prompts, same validation,
// same rules (three modes, odd/eve toss, CRAZY scoring, super over).
window.DEMOS = window.DEMOS || {};
window.DEMOS.oddoreve = function (el) {
  let alive = true, pending = null;

  el.innerHTML = `
    <div class="term" data-term>
      <div class="term-bar" aria-hidden="true"><span></span><span></span><span></span><em>python odd_or_eve.py</em></div>
      <div class="term-body" data-body role="log" aria-live="polite">
        <pre class="term-out" data-out></pre>
        <form class="term-line" data-form autocomplete="off">
          <label class="term-prompt" data-prompt for="termIn"></label>
          <input id="termIn" class="term-in" data-in spellcheck="false" autocapitalize="off" enterkeyhint="send" />
        </form>
      </div>
    </div>
    <div class="term-suggest" data-suggest aria-label="Quick answers"></div>
    <p class="p-note">This is the actual game logic from <code>odd_or_eve.py</code>, ported to JavaScript so it runs here. Type your answers and press Enter, or tap a quick answer.</p>`;

  const q = (s) => el.querySelector(s);
  const out = q("[data-out]"), body = q("[data-body]"), input = q("[data-in]");

  function print(text = "") {
    out.textContent += text + "\n";
    body.scrollTop = body.scrollHeight;
  }

  function ask(prompt, suggestions = []) {
    const lines = prompt.split("\n");
    for (const l of lines.slice(0, -1)) print(l);
    q("[data-prompt]").textContent = lines[lines.length - 1];
    q("[data-suggest]").innerHTML = suggestions.map((s) => `<button type="button" class="p-chip" data-say="${s}">${s}</button>`).join("");
    q("[data-form]").hidden = false;
    body.scrollTop = body.scrollHeight;
    return new Promise((resolve) => { pending = { resolve, prompt: lines[lines.length - 1] }; });
  }

  function submit(value) {
    if (!pending) return;
    const p = pending;
    pending = null;
    print(p.prompt + value);
    input.value = "";
    q("[data-prompt]").textContent = "";
    q("[data-suggest]").innerHTML = "";
    p.resolve(value);
  }

  q("[data-form]").addEventListener("submit", (e) => { e.preventDefault(); submit(input.value); });
  q("[data-suggest]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-say]");
    if (b) { submit(b.dataset.say); input.focus({ preventScroll: true }); }
  });
  q("[data-term]").addEventListener("click", () => input.focus({ preventScroll: true }));

  const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

  /* ── Port of odd_or_eve.py ── */
  async function askNumber(prompt, valid) {
    while (alive) {
      const answer = (await ask(prompt, valid.length <= 10 ? valid.map(String) : [])).trim();
      if (/^\d+$/.test(answer) && valid.includes(Number(answer))) return Number(answer);
      print(`Please enter a number within the range ${valid[0]} to ${valid[valid.length - 1]}.`);
    }
  }

  async function askChoice(prompt, options, shown) {
    while (alive) {
      const answer = (await ask(prompt, shown)).trim().toUpperCase();
      if (answer in options) return options[answer];
      print(`Please type one of: ${Object.keys(options).join(", ")}.`);
    }
  }

  async function selectMode() {
    while (alive) {
      const mode = await ask("\nChoose a Mode:\n (1) 1 to 6 \n (2) 1 to 10 \n (3) *CRAZY* \n\n Enter: ", ["1", "2", "3"]);
      if (mode === "1") return ["1 to 6", range(1, 7)];
      if (mode === "2") return ["1 to 10", range(1, 11)];
      if (mode === "3") return ["CRAZY", range(1, 11)];
      print("Invalid choice. Please type 1, 2, or 3.");
    }
  }

  const isAdjacent = (a, b) => Math.abs(a - b) === 1 || (Math.min(a, b) === 1 && Math.max(a, b) === 10);

  function resolveBall(bat, bowl, mode) {
    if (mode === "CRAZY") {
      if (isAdjacent(bat, bowl)) return [0, true];
      if (bat === bowl) return [bat ** 2, false];
      return [bat, false];
    }
    if (bat === bowl) return [0, true];
    return [bat, false];
  }

  async function playInnings(runRange, mode, userBatting, target = null) {
    let runs = 0;
    const balls = mode === "super_over" ? 6 : null;
    let ball = 0;
    const lo = runRange[0], hi = runRange[runRange.length - 1];
    while (alive && (balls === null || ball < balls)) {
      ball += 1;
      const computer = randint(lo, hi);
      let bat, bowl;
      if (userBatting) {
        const user = await askNumber(`\nBatting (${lo} to ${hi}): `, runRange);
        bat = user; bowl = computer;
      } else {
        const user = await askNumber(`Bowling (${lo} to ${hi}): `, runRange);
        bat = computer; bowl = user;
      }
      const [scored, out] = resolveBall(bat, bowl, mode);
      if (out) {
        print(userBatting ? `OUT! The computer bowled you out! The computer bowled ${computer}.` : `OUT! You bowled the computer out! The computer batted ${computer}.`);
        if (balls === null) {
          print(target === null ? `Target to win: ${runs + 1}\n\n` : `Final score: ${runs}\n\n`);
          break;
        }
        print(`No runs scored. Balls remaining: ${balls - ball}\n`);
        continue;
      }
      runs += scored;
      if (mode === "CRAZY" && bat === bowl) print("Runs Squared!");
      print(`${userBatting ? "You" : "Computer"} scored ${scored}\nTotal runs: ${runs}`);
      if (balls !== null) print(`Balls remaining: ${balls - ball}`);
      print();
      if (target !== null && runs > target) {
        print(`${userBatting ? "You" : "The computer"} passed the target of ${target}!\n`);
        break;
      }
    }
    return runs;
  }

  const batting = (r, m, t = null) => playInnings(r, m, true, t);
  const bowling = (r, m, t = null) => playInnings(r, m, false, t);

  async function decideWinner(userScore, computerScore, runRange, mode) {
    if (userScore > computerScore) print(`\nYou win! Your score: ${userScore} | Computer's score: ${computerScore}`);
    else if (computerScore > userScore) print(`\nYou lose! Your score: ${userScore} | Computer's score: ${computerScore}`);
    else {
      print(`\nIt's a tie! Your score: ${userScore} | Computer's score: ${computerScore}`);
      print("SUPER OVER");
      print("\n~~RULES~~\n\n- Each player will receive 6 balls (1 Over) to score as many runs as they can.\n- If the batsman is bowled out by the bowler they receive no runs but continue batting.");
      mode = "super_over";
      userScore = await batting(runRange, mode);
      print("\n\nYOU ARE NOW BOWLING");
      computerScore = await bowling(runRange, mode, userScore);
      if (userScore > computerScore) print(`\nYou win! Your score: ${userScore} | Computer's score: ${computerScore}`);
      else if (computerScore > userScore) print(`\nYou lose! Your score: ${userScore} | Computer's score: ${computerScore}`);
      else print(`\nIt's a tie even after the super over! Your score: ${userScore} | Computer's score: ${computerScore}`);
    }
  }

  async function play() {
    const [mode, runRange] = await selectMode();
    const cToss = randint(1, 2);
    print("\n\nTOSS ~~~ Odd or Eve ~~~  \n");
    const uChoice = await askChoice("Odd or Eve?: ", { ODD: "ODD", EVE: "EVE", EVEN: "EVE" }, ["odd", "eve"]);
    const tossInput = await askNumber("Enter a number for the toss (1 or 2): ", range(1, 3));
    const add = cToss + tossInput;
    const tossResult = add % 2 === 0 ? "EVE" : "ODD";
    let userScore, computerScore;

    if (tossResult === uChoice) {
      print(`You won the toss!\nResult: ${add} (${tossResult})`);
      const decision = await askChoice("Do you choose BAT or BOWL? (BAT / BOWL): ", { BAT: "BAT", BOWL: "BOWL" }, ["bat", "bowl"]);
      if (decision === "BAT") {
        userScore = await batting(runRange, mode);
        print("\nYOU ARE NOW BOWLING");
        computerScore = await bowling(runRange, mode, userScore);
      } else {
        computerScore = await bowling(runRange, mode);
        print("\nYOU ARE NOW BATTING");
        userScore = await batting(runRange, mode, computerScore);
      }
    } else {
      print(`You lost the toss! Result: ${add} (${tossResult}).`);
      const cpu = Math.random() < 0.5 ? "BAT" : "BOWL";
      print(`The computer chooses to ${cpu}!\n`);
      if (cpu === "BAT") {
        computerScore = await bowling(runRange, mode);
        print("\n\nYOU ARE NOW BATTING");
        userScore = await batting(runRange, mode, computerScore);
      } else {
        userScore = await batting(runRange, mode);
        print("\n\nYOU ARE NOW BOWLING");
        computerScore = await bowling(runRange, mode, userScore);
      }
    }
    if (alive) await decideWinner(userScore, computerScore, runRange, mode);
  }

  async function main() {
    print("$ python odd_or_eve.py");
    await play();
    while (alive) {
      const p = (await ask("\nPlay again? (y/n): ", ["y", "n"])).toLowerCase();
      if (p === "y") await play();
      else if (p === "n") { print("Exiting..."); break; }
      else print("Please type in 'y' to play again or 'n' to quit.");
    }
    if (!alive) return;
    q("[data-form]").hidden = true;
    q("[data-suggest]").innerHTML = `<button type="button" class="p-chip" data-restart>Run it again</button>`;
    q("[data-restart]").addEventListener("click", () => { out.textContent = ""; main(); });
  }

  main();
  return () => { alive = false; pending = null; };
};
