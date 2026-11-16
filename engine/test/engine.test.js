/* Run with:  node --test engine/test/engine.test.js
   Checks the engine with hand-made candles where the right answer is known. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const E = require("../replay.js");
const Inst = require("../instruments.js");

const T0 = Date.UTC(2026, 2, 3, 15, 0) / 1000;            // Tuesday 3 March 2026, 15:00 UTC (10:00 New York)
/* rows of [o,h,l,c], one candle every `gap` seconds */
function candles(rows, gap, t0) { return rows.map((r, n) => [(t0 || T0) + n * (gap || 300), r[0], r[1], r[2], r[3], 100]); }
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= (tol == null ? 0.011 : tol), (msg || "") + " expected " + b + ", got " + a); }
function types(events) { return events.map(e => e.type); }

test("ships every required market and each profile is valid", () => {
  ["NQ", "MNQ", "ES", "MES", "GC", "US100", "UK100", "GOLD", "EURUSD", "GBPUSD", "STOCK", "BTCUSD"].forEach(id => {
    const p = Inst.get(id);
    assert.equal(Inst.validate(p).id, id);
  });
  assert.deepEqual([...new Set(Inst.list().map(p => p.type))].sort(), ["cfd", "crypto", "forex", "future", "stock"]);
  assert.equal(Inst.get("US100").sizeUnit, "per point");
  near(Inst.get("EURUSD").leverage, 30.03, 0.01);
});

test("futures: market buy slips one tick, take profit pays points x $20 minus commission", () => {
  const s = E.createSession({ instrument: "NQ", candles: candles([[100, 100, 100, 100], [100, 112, 99, 111]]) });
  const r = s.buy(1, { sl: 95, tp: 110 });
  assert.ok(r.ok);
  assert.equal(r.order.fillPrice, 100.25);
  assert.equal(s.position().size, 1);
  s.step();
  assert.equal(s.position(), null);
  const t = s.trades[0];
  assert.equal(t.exitPrice, 110); assert.equal(t.reason, "tp");
  near(t.points, 9.75); near(t.grossPnl, 195); near(t.netPnl, 191);          // $2 in, $2 out
  near(s.account().balance, 50191);
  near(t.r, 9.75 / 5.25, 1e-9);
});

test("inside one candle the level nearer the open is hit first", () => {
  // Up candle: open 100, dips to 94 first, then runs to 112. Stop at 95 goes before target at 110.
  const up = E.createSession({ instrument: "NQ", candles: candles([[100, 100, 100, 100], [100, 112, 94, 111]]) });
  up.buy(1, { sl: 95, tp: 110 }); up.step();
  assert.equal(up.trades[0].reason, "sl");
  assert.equal(up.trades[0].exitPrice, 94.75);                               // stop 95 minus a tick of slippage
  // Down candle: open 100, spikes to 112 first, then falls. Target goes first.
  const dn = E.createSession({ instrument: "NQ", candles: candles([[100, 100, 100, 100], [100, 112, 94, 96]]) });
  dn.buy(1, { sl: 95, tp: 110 }); dn.step();
  assert.equal(dn.trades[0].reason, "tp");
});

test("a gap through a stop fills at the open, not the stop price", () => {
  const s = E.createSession({ instrument: "NQ", candles: candles([[100, 100, 100, 100], [90, 91, 89, 90]]) });
  s.buy(1, { sl: 95 }); s.step();
  assert.equal(s.trades[0].exitPrice, 89.75);                                // open 90 minus a tick
});

test("limit and stop entry orders", () => {
  const s = E.createSession({ instrument: "NQ", candles: candles([[100, 100, 100, 100], [100, 101, 97, 98], [98, 106, 98, 105], [105, 105, 105, 105]]) });
  assert.ok(s.placeOrder({ side: "buy", type: "limit", size: 2, price: 98, sl: 96, tp: 104 }).ok);
  assert.ok(s.placeOrder({ side: "sell", type: "stop", size: 1, price: 90 }).ok);
  assert.equal(s.openOrders().length, 2);
  s.step();
  assert.equal(s.position().avgPrice, 98);                                   // limit fills at its price, no slippage
  assert.equal(s.position().size, 2);
  const ev = s.step();
  assert.ok(types(ev).includes("trade"));
  assert.equal(s.trades[0].exitPrice, 104);
  assert.equal(s.openOrders().length, 1);
  assert.ok(s.cancelOrder(s.openOrders()[0].id));
  // bad orders are refused with a reason
  assert.equal(s.placeOrder({ side: "buy", size: 1.5 }).ok, false);
  assert.equal(s.buy(1, { sl: 200 }).ok, false);
  assert.equal(s.placeOrder({ side: "buy", type: "limit", size: 1 }).ok, false);
});

test("partial close and flip use first-in first-out", () => {
  const s = E.createSession({ instrument: "MNQ", candles: candles([[100, 100, 100, 100], [110, 110, 110, 110], [120, 120, 120, 120]]), slippage: 0 });
  s.buy(2); s.step(); s.buy(1);                                              // 2 @ 100, 1 @ 110
  near(s.position().avgPrice, 103.3333, 1e-3);
  s.step();
  s.sell(5);                                                                 // closes 3, opens 2 short @ 120
  assert.equal(s.trades.length, 2);
  near(s.trades[0].grossPnl, 20 * 2 * 2); near(s.trades[1].grossPnl, 10 * 1 * 2);
  assert.equal(s.position().side, "short"); assert.equal(s.position().size, 2);
  assert.equal(s.close(1).ok, true);
  assert.equal(s.position().size, 1);
  s.flatten();
  assert.equal(s.position(), null);
});

test("spread bet: buy at the ask, sell at the bid, pounds per point", () => {
  const s = E.createSession({ instrument: "US100", account: { currency: "GBP", balance: 10000 },
                              candles: candles([[20000, 20000, 20000, 20000], [20000, 20050, 20000, 20050]]) });
  const q = s.quote();
  assert.equal(q.ask, 20000.5); assert.equal(q.bid, 19999.5);
  s.buy(2);                                                                  // £2 a point
  assert.equal(s.position().avgPrice, 20000.5);
  near(s.account().unrealized, -2);                                          // the spread, straight away
  near(s.account().usedMargin, 20000.5 * 2 * 0.05);
  near(s.account().freeMargin, 10000 - 2 - 2000.05);
  s.step(); s.close();
  near(s.trades[0].points, 49); near(s.trades[0].netPnl, 98);                // 50 points minus 1 of spread, x £2
  near(s.account().fees.spread, 2);
  // same trade on a dollar account is converted from pounds
  const usd = E.createSession({ instrument: "US100", account: { currency: "USD", balance: 10000 }, fx: { GBP: 0.8 },
                                candles: candles([[20000, 20000, 20000, 20000], [20000, 20050, 20000, 20050]]) });
  usd.buy(2); usd.step(); usd.close();
  near(usd.trades[0].netPnl, 98 / 0.8);
});

test("margin: too-big orders are refused, margin call then stop-out at the exact level", () => {
  const rows = [[20000, 20000, 20000, 20000], [20000, 20000, 19000, 19000]];
  const s = E.createSession({ instrument: "US100", account: { currency: "GBP", balance: 2000 }, candles: candles(rows) });
  assert.equal(s.buy(3).ok, false);                                          // needs £3,000 of margin
  assert.match(s.buy(3).error, /free margin/);
  assert.ok(s.buy(1.5).ok);                                                  // margin £1,500.04
  const used = s.account().usedMargin;
  const ev = s.step();
  const order = types(ev).filter(t => t === "marginCall" || t === "stopOut");
  assert.deepEqual(order, ["marginCall", "stopOut"]);
  assert.equal(s.position(), null);
  near(s.account().balance, used * 0.5, 0.2, "equity at stop-out is 50% of used margin;");
  assert.equal(s.trades[0].reason, "stopOut");
  // price fell 1,000 points but the loss stopped where the stop-out level was crossed
  assert.ok(s.trades[0].points > -900);
});

test("overnight financing is charged when a position is held past rollover", () => {
  const t0 = Date.UTC(2026, 2, 3, 21, 30) / 1000;                            // 21:30 London, rollover is 22:00
  const s = E.createSession({ instrument: "US100", account: { currency: "GBP", balance: 10000 },
                              candles: candles([[20000, 20000, 20000, 20000], [20000, 20000, 20000, 20000], [20000, 20000, 20000, 20000]], 600, t0) });
  s.buy(1);
  assert.deepEqual(types(s.step(2)).filter(t => t === "financing"), []);     // 21:40 and 21:50: still the same day
  const s2 = E.createSession({ instrument: "US100", account: { currency: "GBP", balance: 10000 },
                               candles: candles([[20000, 20000, 20000, 20000], [20000, 20000, 20000, 20000]], 3600, t0) });
  s2.buy(1);
  const ev = s2.step();
  const fin = ev.find(e => e.type === "financing");
  near(fin.amount, 20000 * 1 * 0.07 / 365);                                  // 7% a year on a £20,000 position
  near(s2.account().fees.financing, 3.84);
  s2.close();
  near(s2.trades[0].financing, 3.84);
  // futures never pay financing
  const f = E.createSession({ instrument: "NQ", candles: candles([[100, 100, 100, 100], [100, 100, 100, 100]], 86400) });
  f.buy(1); assert.equal(f.step().some(e => e.type === "financing"), false);
});

test("forex: pips and lots", () => {
  const s = E.createSession({ instrument: "EURUSD", account: { balance: 5000 },
                              candles: candles([[1.1, 1.1, 1.1, 1.1], [1.1, 1.1025, 1.1, 1.1025]]) });
  assert.ok(s.buy(0.1).ok);                                                  // a mini lot
  assert.equal(s.position().avgPrice, 1.10004);                              // half of the 0.8 pip spread
  near(s.account().usedMargin, 1.10004 * 10000 * 0.0333, 0.01);
  s.step(); s.close();
  near(s.trades[0].points, 24.2, 1e-6);                                      // 25 pips minus the spread
  near(s.trades[0].netPnl, 24.2);                                            // $1 a pip on 0.1 lots
  assert.equal(s.trades[0].pointName, "pip");
  assert.equal(s.buy(0.001).ok, false);                                      // below a micro lot
  assert.equal(s.sizeForRisk(100, 20), 0.5);                                 // $100 risk, 20 pip stop
});

test("crypto: fractional size and a percentage fee", () => {
  const s = E.createSession({ instrument: "BTCUSD", account: { balance: 10000 }, spread: 0,
                              candles: candles([[60000, 60000, 60000, 60000], [60000, 61000, 60000, 61000]]) });
  assert.ok(s.buy(0.05).ok);
  near(s.account().fees.commission, 3);                                      // 0.1% of $3,000
  s.step(); s.close();
  near(s.trades[0].grossPnl, 50); near(s.trades[0].netPnl, 50 - 3 - 3.05);
  assert.equal(Inst.isOpen(Inst.get("BTCUSD"), Date.UTC(2026, 2, 7, 12) / 1000), true);   // Saturday
  assert.equal(Inst.isOpen(Inst.get("NQ"), Date.UTC(2026, 2, 7, 12) / 1000), false);
  assert.equal(Inst.isOpen(Inst.get("NQ"), T0), true);
});

test("a brand new market only needs a profile", () => {
  Inst.add({ id: "CL", name: "Crude oil futures", type: "future", currency: "USD", tickSize: 0.01, valuePerPoint: 1000,
             sizeUnit: "contracts", minSize: 1, sizeStep: 1, slippage: 0, commission: { type: "perUnit", value: 2 }, margin: { type: "fixed", value: 1000 } });
  const s = E.createSession({ instrument: "CL", candles: candles([[70, 70, 70, 70], [70, 70.5, 70, 70.5]]) });
  s.buy(1); s.step(); s.close();
  near(s.trades[0].netPnl, 500 - 4);
});

test("futures prop rules: max contracts, daily loss lock, end-of-day trailing drawdown, pass", () => {
  const day = 86400, rows = [[100, 100, 100, 100], [100, 100, 40, 45], [45, 45, 45, 45], [45, 45, 45, 45], [45, 250, 45, 250], [250, 250, 250, 250]];
  const cs = [T0, T0 + 300, T0 + 600, T0 + day, T0 + day + 300, T0 + 2 * day].map((t, n) => [t, ...rows[n], 1]);
  const s = E.createSession({ instrument: "NQ", candles: cs, slippage: 0, propRules: E.PropRules.presets.futures50k });
  assert.equal(s.account().balance, 50000);
  assert.match(s.buy(6).error, /max position size/);
  s.buy(1);
  let ev = s.step();                                                         // falls 60 points: the $1,000 daily limit is 50 points away
  assert.ok(types(ev).includes("propStatus"));
  assert.equal(s.position(), null);
  assert.equal(s.trades[0].reason, "dailyLoss");
  near(s.trades[0].grossPnl, -996, 5.01);                                    // closed at the limit, not at the low
  let st = s.propStatus();
  assert.equal(st.status, "active"); assert.equal(st.dayLocked, true);
  assert.match(s.buy(1).error, /locked/);
  s.step(2);                                                                 // next trading day
  assert.equal(s.propStatus().dayLocked, false);
  assert.ok(s.buy(1).ok);
  s.step(); s.close();                                                       // +205 points = $4,100
  s.step();
  st = s.propStatus();
  assert.equal(st.status, "passed");
  assert.equal(st.tradingDays, 2);
  assert.equal(st.drawdownFloor, 50000);                                     // trailed up with the closing balance, then locked at the start balance
  assert.match(s.buy(1).error, /passed/);
});

test("an order that would end up too big does nothing at all", () => {
  const s = E.createSession({ instrument: "NQ", propRules: E.PropRules.presets.futures50k, candles: candles([[100, 100, 100, 100], [100, 100, 100, 100]]) });
  s.sell(1);
  const r = s.buy(7);                                                        // would close 1 short and open 6 long, over the max of 5
  assert.equal(r.ok, false); assert.match(r.error, /max position size/);
  assert.equal(s.position().side, "short"); assert.equal(s.trades.length, 0);
  assert.ok(s.buy(6).ok);                                                    // close 1, open 5: allowed
  assert.equal(s.position().size, 5);
});

test("intraday trailing drawdown follows open profit and fails the account", () => {
  const s = E.createSession({ instrument: "NQ", slippage: 0, propRules: E.PropRules.presets.futures50kIntradayTrail,
                              candles: candles([[100, 100, 100, 100], [100, 200, 100, 190], [190, 190, 50, 60]]) });
  s.buy(1); s.step();                                                        // open profit peaked at +$2,000
  near(s.propStatus().drawdownFloor, 49498, 0.01);                           // 50,000 - 2 commission + 2,000 - 2,500
  s.step();
  const st = s.propStatus();
  assert.equal(st.status, "failed"); assert.equal(st.reason, "maxDrawdown");
  near(s.account().balance, 49496, 5.01);                                    // closed where the floor was crossed
});

test("forex-style prop rules: daily loss %, overall loss %, target % and minimum days", () => {
  const P = E.PropRules.presets.forex100k;
  // 5% daily loss fails the account outright
  const a = E.createSession({ instrument: "EURUSD", spread: 0, propRules: P, account: { margin: false },
                              candles: candles([[1.1, 1.1, 1.1, 1.1], [1.1, 1.1, 1.0, 1.0]]) });
  a.buy(10); a.step();
  assert.equal(a.propStatus().status, "failed"); assert.equal(a.propStatus().reason, "dailyLoss");
  near(a.account().balance, 95000, 1);
  // overall 10% loss, built up over days that each stay inside the daily limit
  const day = 86400, cs = [];
  for (let d = 0; d < 4; d++) { cs.push([T0 + d * day, 1.1, 1.1, 1.1, 1.1, 1], [T0 + d * day + 300, 1.1, 1.1, 1.096, 1.096, 1]); }
  const b = E.createSession({ instrument: "EURUSD", spread: 0, propRules: P, account: { margin: false }, candles: cs });
  let status = "active";
  for (let d = 0; d < 4 && status === "active"; d++) { b.buy(10); b.step(); if (b.position()) b.close(); b.step(); status = b.propStatus().status; }
  assert.equal(status, "failed"); assert.equal(b.propStatus().reason, "maxDrawdown");
  // hitting the target is not a pass until enough days have been traded
  const up = [];
  for (let d = 0; d < 5; d++) { up.push([T0 + d * day, 1.1, 1.1, 1.1, 1.1, 1], [T0 + d * day + 300, 1.1, 1.103, 1.1, 1.103, 1]); }
  const c = E.createSession({ instrument: "EURUSD", spread: 0, propRules: P, account: { margin: false }, candles: up });
  const seen = [];
  for (let d = 0; d < 4; d++) { c.buy(10); c.step(); c.close(); seen.push(c.propStatus().status); c.step(); }
  assert.deepEqual(seen, ["active", "active", "active", "passed"]);          // +$3,000 a day: target hit on day 4, which is also the 4th day
  assert.equal(c.propStatus().tradingDays, 4);
});

test("data loader lists only markets that have data, and reads JSON and CSV", async () => {
  const dir = path.join(__dirname, "..", "data") + path.sep;
  const loader = E.createDataLoader({ baseUrl: dir, fetchText: f => fs.promises.readFile(f, "utf8") });
  const markets = await loader.listMarkets();
  assert.deepEqual(markets.map(m => m.id).sort(), ["MNQ", "NQ"]);
  assert.deepEqual(markets[0].timeframes, ["5m", "10m", "15m", "30m", "1h", "2h", "4h"]);
  assert.deepEqual(markets[0].builtFrom, { "10m": "5m", "30m": "15m", "2h": "1h", "4h": "1h" });
  const five = (await loader.load("NQ", "5m")).sessions[0].candles, ten = (await loader.load("NQ", "10m")).sessions[0].candles;
  assert.ok(ten.length >= 40 && ten.length <= 50);
  const pair = five.filter(c => Math.floor(c.t / 600) === Math.floor(ten[1].t / 600));
  assert.equal(ten[1].o, pair[0].o); assert.equal(ten[1].c, pair[pair.length - 1].c);
  assert.equal(ten[1].h, Math.max(...pair.map(c => c.h))); assert.equal(ten[1].l, Math.min(...pair.map(c => c.l)));
  assert.ok((await loader.load("NQ", "4h")).sessions[0].candles.length >= 15);
  await assert.rejects(loader.load("NQ", "1m"), /No 1m data/);                // cannot be built from bigger candles
  const d = await loader.load("NQ", "5m");
  assert.ok(d.sessions.length > 50);
  const c = d.sessions[0].candles;
  assert.ok(c.length >= 60 && c[0].h >= c[0].l && c[1].t > c[0].t);
  await assert.rejects(loader.load("EURUSD", "5m"), /No data/);
  // a real session replays end to end
  const s = E.createSession({ instrument: "NQ", candles: c, startIndex: 30, propRules: E.PropRules.presets.futures50k });
  s.buy(1, { sl: s.quote().bid - 40, tp: s.quote().ask + 40 });
  while (!s.isDone()) s.step();
  s.flatten();
  assert.equal(s.position(), null);
  near(s.account().balance - 50000, s.stats().netPnl, 0.02);
  // CSV, like a TradingView export
  const csv = "time,open,high,low,close,Volume\n2026-03-03T15:00:00Z,1.1,1.2,1.0,1.15,10\n2026-03-03T15:05:00Z,1.15,1.3,1.1,1.2,12\n";
  const p = E.parseData(csv, "EURUSD/5m.csv");
  assert.equal(p.sessions[0].candles.length, 2);
  assert.equal(p.sessions[0].candles[0].t, T0);
  assert.equal(p.sessions[0].candles[1].h, 1.3);
});

test("rewind puts everything back, and skipping stops when something happens", () => {
  const rows = [[100, 100, 100, 100], [100, 104, 100, 104], [104, 112, 104, 111], [111, 111, 111, 111], [111, 111, 111, 111], [111, 111, 111, 111]];
  const s = E.createSession({ instrument: "NQ", slippage: 0, propRules: E.PropRules.presets.futures50k, candles: candles(rows) });
  assert.equal(s.canStepBack(), false);
  s.buy(1, { sl: 95, tp: 110 });
  s.placeOrder({ side: "sell", type: "limit", size: 1, price: 150 });
  const before = JSON.stringify([s.account(), s.position(), s.openOrders(), s.propStatus()]);
  const ev = s.stepUntil({ events: ["trade"] });                            // skips to the candle where the target is hit
  assert.equal(s.i, 2); assert.ok(ev.some(e => e.type === "trade"));
  assert.equal(s.trades.length, 1); near(s.account().balance, 50196);
  assert.equal(s.stepBack(2), 2);                                            // back to before either candle played
  assert.equal(s.i, 0); assert.equal(s.trades.length, 0);
  assert.equal(JSON.stringify([s.account(), s.position(), s.openOrders(), s.propStatus()]), before);
  s.step(2);                                                                 // replaying gives the same result again
  assert.equal(s.trades.length, 1); near(s.account().balance, 50196);
  assert.ok(s.cancelOrder(s.openOrders()[0].id));                            // restored orders still work
  s.stepUntil({ time: T0 + 4 * 300 }); assert.equal(s.i, 4);
  s.stepUntil({ maxCandles: 50 }); assert.equal(s.isDone(), true);
  assert.equal(s.stepBack(100), 5);
});

test("the engine files never touch the page", () => {
  ["replay.js", "instruments.js"].forEach(f => {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(/\b(document|window|localStorage|navigator)\s*[.\[]/.test(src), false, f + " uses a browser-only object");
  });
});
