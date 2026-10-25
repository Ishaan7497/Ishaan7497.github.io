# ishaan7497.github.io

My personal portfolio: **[ishaan7497.github.io](https://ishaan7497.github.io)**

Every project on the site runs right in the browser, each with its own colour theme:

| Project | What you can do on the site |
|---|---|
| [Strategy Backtester](https://github.com/Ishaan7497/backtester) | Tune a moving-average crossover strategy and backtest it on a simulated market |
| [ClipCourt](https://github.com/Ishaan7497/ClipCourt) | Explore a simulated game's shot chart and zone-by-zone shooting stats |
| [SAT Vocab Lab](https://github.com/Ishaan7497/SAT-VOCAB-LAB) | Play a Words-in-Context round built around opposites |
| [Hand Cricket CV](https://github.com/Ishaan7497/Odd_or_Eve_CV) | Play a full match against an adaptive AI, with buttons or webcam hand gestures (MediaPipe) |
| [Hangman](https://github.com/Ishaan7497/Hangman) | Classic Hangman with finance vocabulary |

## How it's built

Plain HTML, CSS and JavaScript. No framework and no build step.

```
index.html          page structure
css/style.css       design tokens and the per-project themes ([data-theme])
js/content.js       all editable content: projects, research, experience, contact
js/main.js          project switcher, README viewer, section rendering
js/demos/*.js       one file per playable project
assets/             images
```

## Updating

Edit `js/content.js`. To add a research paper or internship, add an entry to `research` or `experience`. The section appears automatically once it has an entry.

## Run locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.
