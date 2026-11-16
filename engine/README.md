# BXTrades replay engine

| File | What it is |
|---|---|
| `instruments.js` | One profile per market (tick size, value per point, spread, margin, hours). `window.BXInstruments` |
| `replay.js` | The engine: replay, orders, fills, account, trade log, prop rules, data loader. `window.BXEngine` |
| `data/index.json` | The list of markets that have candle data |
| `data/NQ/*.json` | Real NQ candles (5m, 15m, 1h) |
| `demo.html` | Test page: bxtrades.com/engine/demo |
| `test/engine.test.js` | Checks. Run `node --test engine/test/engine.test.js` |

## Add a market

1. **Profile:** copy a line in `instruments.js` (for example `future("CL", "Crude oil futures", 0.01, 1000, 2.00, 1000)`) or add a full object.
2. **Data:** put a file in `data/<ID>/`, then list it in `data/index.json`:

```json
"EURUSD": { "timeframes": { "5m": "EURUSD/5m.csv" } }
```

Nothing in `replay.js` changes. The demo page only shows markets that have both a profile and data.

## Data files

CSV with a header row works as is (a TradingView export is fine):

```
time,open,high,low,close,volume
2026-03-03T15:00:00Z,1.1000,1.1012,1.0995,1.1008,1520
```

Or JSON: `{ "sessions": [ { "id": "any-name", "candles": [[unixSeconds, open, high, low, close, volume], ...] } ] }`.
Each session is one stretch of candles that gets replayed on its own.

`"MNQ": { "sameAs": "NQ" }` in `index.json` lets one market reuse another's candles (MNQ and NQ trade at the same price).
