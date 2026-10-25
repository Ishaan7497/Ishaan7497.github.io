# ishaan7497.github.io

My personal portfolio: **[ishaan7497.github.io](https://ishaan7497.github.io)**

Every project on the site runs right in the browser, each with its own colour theme:

| Project | What you can do on the site |
|---|---|
| [Strategy Backtester](https://github.com/Ishaan7497/backtester) | Backtest a moving-average crossover on 17 real stocks and ETFs, with the same rules as the Python tool |
| [ClipCourt](https://github.com/Ishaan7497/ClipCourt) | Explore a simulated game's shot chart and zone-by-zone shooting stats |
| [SAT Vocab Lab](https://github.com/Ishaan7497/SAT-VOCAB-LAB) | Play a Words-in-Context round built around opposites |
| [Hand Cricket CV](https://github.com/Ishaan7497/Odd_or_Eve_CV) | The webcam game ported to the browser: same screens, gestures and match engine (MediaPipe) |
| [Odd or Eve](https://github.com/Ishaan7497/Odd-Or-Eve) | The original command-line game, running in a browser terminal |
| [Hangman](https://github.com/Ishaan7497/Hangman) | Classic Hangman with finance vocabulary |

## How it's built

Plain HTML, CSS and JavaScript. No framework and no build step.

```
index.html          page structure
css/style.css       design tokens and the per-project themes ([data-theme])
js/content.js       all editable content: projects, research, experience, contact
js/main.js          project switcher, README viewer, section rendering
js/demos/*.js       one file per playable project
data/prices/        adjusted daily closes for the backtester
scripts/            update_prices.py (refreshes data/prices with yfinance)
assets/             images
```

To refresh the stock data: `pip install yfinance && python scripts/update_prices.py`.

## Updating

Edit `js/content.js`. To add a research paper or internship, add an entry to `research` or `experience`. The section appears automatically once it has an entry.

## Run locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.
