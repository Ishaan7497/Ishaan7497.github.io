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
        "Tests a moving-average crossover strategy against buy-and-hold on real stock prices, with no lookahead bias. " +
        "Pick a stock and dates, then drag the averages or tap a preset to re-run it.",
      stack: ["Python", "pandas", "yfinance", "risk management"],
    },
    {
      id: "clipcourt",
      repo: "ClipCourt",
      name: "ClipCourt",
      kind: "Computer vision · YOLOv8",
      theme: "court",
      blurb:
        "Turns basketball footage into made/miss highlight clips, a shot chart and per-player stats. " +
        "Mark the rim once and the pipeline does the rest.",
      stack: ["YOLOv8", "OpenCV", "FastAPI"],
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
