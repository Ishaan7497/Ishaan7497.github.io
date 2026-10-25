"""Download daily prices for the in-browser backtester.

Uses yfinance with auto_adjust=True, exactly like backtest.py in the
backtester repo, so results on the website match the Python tool.

    pip install yfinance
    python scripts/update_prices.py

Writes data/prices/<TICKER>.json and data/prices/index.json.
Each file stores the first date, the gaps between trading days, and the
adjusted closes, which keeps the files small.
"""

import datetime as dt
import json
import os

import yfinance as yf

TICKERS = {
    "SPY": "S&P 500 ETF",
    "QQQ": "Nasdaq-100 ETF",
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "NVDA": "NVIDIA",
    "AMZN": "Amazon",
    "GOOGL": "Alphabet",
    "META": "Meta",
    "TSLA": "Tesla",
    "NFLX": "Netflix",
    "JPM": "JPMorgan Chase",
    "KO": "Coca-Cola",
    "XOM": "ExxonMobil",
    "MU": "Micron",
    "SNAP": "Snap",
    "ROKU": "Roku",
    "PTON": "Peloton",
}
START = "2000-01-01"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "prices")


def round_sig(x, sig=6):
    return float(f"{x:.{sig}g}")


def main():
    os.makedirs(OUT, exist_ok=True)
    index = []
    for ticker, name in TICKERS.items():
        data = yf.download(ticker, start=START, auto_adjust=True, progress=False)
        close = data["Close"]
        if hasattr(close, "columns"):  # newer yfinance returns two column levels
            close = close[ticker]
        close = close.dropna()
        dates = [d.date() for d in close.index]
        gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
        record = {
            "ticker": ticker,
            "name": name,
            "first": dates[0].isoformat(),
            "last": dates[-1].isoformat(),
            "gaps": gaps,
            "close": [round_sig(v) for v in close.tolist()],
        }
        with open(os.path.join(OUT, f"{ticker}.json"), "w") as f:
            json.dump(record, f, separators=(",", ":"))
        index.append({"ticker": ticker, "name": name, "first": record["first"], "last": record["last"]})
        print(f"{ticker:6} {record['first']} → {record['last']}  {len(dates)} days")

    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"updated": dt.date.today().isoformat(), "tickers": index}, f, indent=1)


if __name__ == "__main__":
    main()
