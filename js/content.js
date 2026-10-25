// ─────────────────────────────────────────────────────────────
//  EDIT THIS FILE to update the site. Everything else reads from it.
//  Entries with `placeholder: true` show as dashed draft cards while
//  `showPlaceholders` is true. Set it to false before going live and
//  any section with no real entries hides itself.
// ─────────────────────────────────────────────────────────────

window.SITE = {
  showPlaceholders: false,

  profile: {
    name: "Ishaan Gupta",
    github: "Ishaan7497",
    email: "ishaan7497@gmail.com",
    linkedin: "", // full URL, if you make one later. A button appears automatically.
    resume: "",   // e.g. "assets/resume.pdf". Drop the PDF in assets/ and a button appears.
  },

  // Each project gets its own colour theme (see css/style.css → [data-theme]).
  // `demo` names the file in js/demos/ that powers its playable version.
  projects: [
    {
      id: "backtester",
      repo: "backtester",
      name: "Strategy Backtester",
      kind: "Quant · Python, pandas",
      theme: "quant",
      blurb:
        "Does a simple trading rule beat just buying and holding a stock? This is my Python backtester running in your browser " +
        "on real prices, with the same settings, modes, printout and charts.",
      stack: ["Python", "pandas", "yfinance", "matplotlib"],
      howToTitle: "How it works",
      howTo: [
        "<b>The rule:</b> hold the stock while its fast moving average (the average price over the last few days) is above its slow moving average, and sit in cash otherwise.",
        "<b>No cheating:</b> each trade happens the day after the signal, so the strategy only uses information it would really have had. Every trade pays the fee.",
        "<b>Pick a MODE:</b> <code>single</code> tests one pair of averages and draws its trades; <code>sweep</code> tests many pairs and colours a heatmap; <code>multi_stock</code> runs the same settings on several stocks and ranks them.",
        "<b>Change any setting</b> and it re-runs instantly. The command line updates too, so you can paste it into the real Python tool and get the same numbers.",
        "<b>Reading it:</b> the question is always \"did it beat buy &amp; hold?\" In a sweep, a green cluster suggests a real pattern; one lone green cell is probably luck.",
      ],
    },
    {
      id: "clipcourt",
      repo: "ClipCourt",
      name: "ClipCourt",
      kind: "Computer vision · YOLOv8",
      theme: "court",
      blurb:
        "Turns any basketball footage into made/miss highlight clips, a shot chart and stats. " +
        "Upload a video below: the same YOLOv8 detector and shot logic run right in your browser, and the video never leaves your device.",
      stack: ["YOLOv8", "OpenCV", "FastAPI", "WebGPU"],
      howToTitle: "How to use it",
      howTo: [
        "<b>Upload</b> a basketball video (MP4 or MOV works best). It stays on your device.",
        "<b>Mark the rim:</b> scrub to a frame where the hoop is clear and drag a tight box around the rim, or press <b>Suggest rim automatically</b>.",
        "<b>Find my highlights:</b> YOLOv8 finds the ball in every frame, a tracker follows it, and a shot counts as <b>made</b> only if the ball is measured dropping through the rim. The first run downloads the 45 MB detector.",
        "<b>Watch the results:</b> play or save each clip, see where shots came from on the chart, and download a CSV. <b>Medium</b>-confidence calls are worth a second look.",
        "No footage handy? Open the <b>Example game</b> tab to see a simulated shot chart.",
      ],
    },
    {
      id: "sat",
      repo: "SAT-VOCAB-LAB",
      name: "SAT Vocab Lab",
      kind: "Web app · live",
      theme: "study",
      blurb:
        "A vocabulary trainer built around opposites: 349 words, 672 linked synonyms and antonyms, " +
        "7 study modes. Try a quick round in its style.",
      stack: ["JavaScript", "CI/CD", "accessibility"],
      live: "https://ishaan7497.github.io/SAT-VOCAB-LAB/",
      howTo: [
        "Read the sentence and decide which way it leans before looking at the choices: positive or negative, more or less.",
        "Click the word that fits the blank. You'll hear whether you were right and see the pair of opposites the app teaches.",
        "Five questions per round. The full app adds flashcards, matching, meaning groups and all 349 words.",
      ],
    },
    {
      id: "cricket",
      repo: "Odd_or_Eve_CV",
      name: "Hand Cricket CV",
      kind: "Computer vision · webcam game",
      theme: "cricket",
      blurb:
        "Hand cricket against an adaptive CPU, controlled only by your fingers through a webcam. " +
        "This is the real game ported to the browser: same screens, gestures and match engine.",
      stack: ["MediaPipe", "OpenCV", "Python", "state machine"],
      howTo: [
        "<b>Controls:</b> press <b>Turn on camera</b>, show a number with your fingers and hold it until the ring in the top-right fills (about a second). No camera? Click the cards, use the buttons under the game, or press number keys (0 = 10).",
        "<b>Set up:</b> choose a format (Classic 1–6, Extended 1–10 or Crazy) and how smart the CPU is.",
        "<b>Toss:</b> call odd or even, then throw 1 or 2. The CPU throws too and the total decides who wins. The winner picks bat or bowl.",
        "<b>Batting:</b> you score the number you show, unless the CPU shows the same number. Then you're out and the innings ends.",
        "<b>Bowling:</b> try to show the same number as the CPU to get it out. The second innings chases the first score; a tie goes to a 6-ball super over.",
        "<b>Crazy mode:</b> numbers next to each other (like 4 and 5, or 10 and 1) are out, and the same number scores its square (7 and 7 = 49 runs).",
      ],
    },
    {
      id: "oddoreve",
      repo: "Odd-Or-Eve",
      name: "Odd or Eve",
      kind: "Python · command-line game",
      theme: "terminal",
      blurb:
        "The original command-line version of hand cricket that Hand Cricket CV grew from: three modes, " +
        "an odd/eve toss and super overs, running here in a terminal.",
      stack: ["Python", "standard library", "pytest"],
      howTo: [
        "Type an answer and press Enter, or tap one of the quick answers under the terminal.",
        "<b>Mode:</b> 1 for numbers 1 to 6, 2 for 1 to 10, 3 for CRAZY.",
        "<b>Toss:</b> type <code>odd</code> or <code>eve</code>, then 1 or 2. The computer adds its number; if the total matches your call, you choose <code>bat</code> or <code>bowl</code>.",
        "<b>Batting:</b> type a number and you score it, unless the computer bowled the same number. Then you're out.",
        "<b>Bowling:</b> type a number to try to match the computer's and get it out. The second innings chases the first score; a tie goes to a super over.",
      ],
    },
    {
      id: "hangman",
      repo: "Hangman",
      name: "Hangman",
      kind: "Python · classic game",
      theme: "chalk",
      blurb:
        "Hangman with progressive drawings, input validation and win/loss detection. " +
        "This version uses finance vocabulary.",
      stack: ["Python"],
      howTo: [
        "Guess the hidden finance word one letter at a time: click the letters or type them on your keyboard.",
        "Each wrong letter adds a part to the drawing. Six wrong guesses and the round is lost.",
        "Use the hint if you're stuck, then press <b>New word</b> to play again.",
      ],
    },
  ],

  research: [
    {
      placeholder: true,
      title: "[Paper title]",
      venue: "[Journal / conference / preprint]",
      year: "[Year]",
      status: "[Status]",
      abstract: "[Two or three plain-English sentences: the question, the method, the finding.]",
      pdf: "",
      cite: "",
    },
  ],

  experience: [
    {
      placeholder: true,
      role: "[Role]",
      org: "[Organisation]",
      dates: "[Dates]",
      points: ["[What you built or analysed]", "[A measurable result]"],
    },
    {
      placeholder: true,
      role: "[Role]",
      org: "[Organisation]",
      dates: "[Dates]",
      points: ["[What you did]", "[Impact]"],
    },
  ],
};
