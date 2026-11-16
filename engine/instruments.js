/* BXTrades instrument profiles  (window.BXInstruments / require("./instruments.js"))
 *
 * One profile = everything the engine needs to know about a market.
 * To add a market, add a profile to PROFILES below (or call BXInstruments.add at
 * runtime). The engine itself never needs to change.
 *
 * Profile fields
 *   id, name
 *   type            "future" | "cfd" | "forex" | "stock" | "crypto"
 *   currency        currency that valuePerPoint is paid in ("USD", "GBP", ...)
 *   tickSize        smallest price step (NQ 0.25, EURUSD 0.00001)
 *   pointSize       price move that counts as ONE point (1 for NQ, 0.0001 = a pip for EURUSD)
 *   pointName       "point" | "pip"
 *   valuePerPoint   money made/lost per point, per ONE size unit (NQ $20 per contract)
 *   sizeUnit        "contracts" | "lots" | "per point" | "shares" | "coins"
 *   minSize, sizeStep
 *   spread          in points. Buys fill at the ask, sells at the bid.
 *   slippage        in points, added against you on market and stop fills
 *   commission      { type:"perUnit", value, min? }  charged per side, per size unit
 *                   { type:"percent", value }        % of trade value, per side
 *   margin          { type:"fixed", value }          per size unit (futures day margin)
 *                   { type:"percent", value }        % of position value (5% = 20:1 leverage)
 *   overnightFinancing   yearly %, charged per night held past rollover.
 *                   A number, or { long, short }. Negative = you get paid.
 *   rollover        { tz, time }  the daily cut-off: financing is charged here and
 *                   the "trading day" for daily loss limits starts here
 *   sessionHours    "24/7"  or  { tz, open, close, days }  (days = weekdays a session STARTS on, 0 = Sunday)
 *
 * The numbers are typical retail values so the maths is realistic. They are not
 * any one broker's price list. Change them to match the broker or firm you use.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BXInstruments = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NY = "America/New_York", LDN = "Europe/London";
  var CME   = { tz: NY,  open: "18:00", close: "17:00", days: [0, 1, 2, 3, 4] };   // Sun 6pm to Fri 5pm, 1h break daily
  var FX    = { tz: NY,  open: "17:00", close: "17:00", days: [0, 1, 2, 3, 4] };   // Sun 5pm to Fri 5pm, non-stop
  var SB    = { tz: LDN, open: "23:00", close: "22:00", days: [0, 1, 2, 3, 4] };   // UK spread bet index hours
  var NYSE  = { tz: NY,  open: "09:30", close: "16:00", days: [1, 2, 3, 4, 5] };

  function future(id, name, tick, vpp, comm, margin) {
    return { id: id, name: name, type: "future", currency: "USD", tickSize: tick, pointSize: 1, pointName: "point",
             valuePerPoint: vpp, sizeUnit: "contracts", minSize: 1, sizeStep: 1, spread: 0, slippage: tick,
             commission: { type: "perUnit", value: comm }, margin: { type: "fixed", value: margin },
             overnightFinancing: 0, rollover: { tz: NY, time: "17:00" }, sessionHours: CME };
  }
  // Spread betting style: you stake pounds per point, the cost is the spread, no commission.
  function spreadBet(id, name, tick, spread, marginPct) {
    return { id: id, name: name, type: "cfd", currency: "GBP", tickSize: tick, pointSize: 1, pointName: "point",
             valuePerPoint: 1, sizeUnit: "per point", minSize: 0.5, sizeStep: 0.1, spread: spread, slippage: 0,
             commission: { type: "perUnit", value: 0 }, margin: { type: "percent", value: marginPct },
             overnightFinancing: { long: 7.0, short: 2.0 }, rollover: { tz: LDN, time: "22:00" }, sessionHours: SB };
  }
  function forex(id, name, spreadPips) {
    return { id: id, name: name, type: "forex", currency: "USD", tickSize: 0.00001, pointSize: 0.0001, pointName: "pip",
             valuePerPoint: 10, sizeUnit: "lots", lotSize: 100000, minSize: 0.01, sizeStep: 0.01,   // 1 = standard, 0.1 = mini, 0.01 = micro
             spread: spreadPips, slippage: 0, commission: { type: "perUnit", value: 0 },
             margin: { type: "percent", value: 3.33 },                                               // 30:1
             overnightFinancing: { long: 2.5, short: 0.5 }, rollover: { tz: NY, time: "17:00" }, sessionHours: FX };
  }

  var PROFILES = [
    future("NQ",  "Nasdaq 100 futures (E-mini)",  0.25, 20,  2.00, 1000),
    future("MNQ", "Nasdaq 100 futures (Micro)",   0.25, 2,   0.60, 100),
    future("ES",  "S&P 500 futures (E-mini)",     0.25, 50,  2.00, 500),
    future("MES", "S&P 500 futures (Micro)",      0.25, 5,   0.60, 50),
    future("GC",  "Gold futures",                 0.10, 100, 2.00, 1500),

    spreadBet("US100", "US 100 (spread bet)", 0.1,  1.0, 5),
    spreadBet("UK100", "UK 100 (spread bet)", 0.1,  1.0, 5),
    spreadBet("GOLD",  "Gold (spread bet)",   0.01, 0.3, 5),

    forex("EURUSD", "Euro / US dollar",          0.8),
    forex("GBPUSD", "British pound / US dollar", 1.0),

    { id: "STOCK", name: "Generic stock", type: "stock", currency: "USD", tickSize: 0.01, pointSize: 1, pointName: "point",
      valuePerPoint: 1, sizeUnit: "shares", minSize: 1, sizeStep: 1, spread: 0.02, slippage: 0,
      commission: { type: "perUnit", value: 0 }, margin: { type: "percent", value: 100 },
      overnightFinancing: 0, rollover: { tz: NY, time: "17:00" }, sessionHours: NYSE },

    { id: "BTCUSD", name: "Bitcoin / US dollar", type: "crypto", currency: "USD", tickSize: 0.5, pointSize: 1, pointName: "point",
      valuePerPoint: 1, sizeUnit: "coins", minSize: 0.0001, sizeStep: 0.0001, spread: 1, slippage: 0,
      commission: { type: "percent", value: 0.1 }, margin: { type: "percent", value: 100 },
      overnightFinancing: 0, rollover: { tz: "UTC", time: "00:00" }, sessionHours: "24/7" }
  ];

  var TYPES = ["future", "cfd", "forex", "stock", "crypto"];
  var byId = {};

  function pos(x) { return typeof x === "number" && isFinite(x) && x > 0; }
  function num(x) { return typeof x === "number" && isFinite(x); }

  /* Checks a profile and fills in the optional fields. Throws with a readable message. */
  function validate(p) {
    if (!p || typeof p !== "object") throw new Error("Instrument profile must be an object");
    var bad = function (m) { throw new Error("Instrument " + (p.id || "?") + ": " + m); };
    if (!p.id || typeof p.id !== "string") bad("needs an id");
    if (TYPES.indexOf(p.type) < 0) bad("type must be one of " + TYPES.join(", "));
    ["tickSize", "valuePerPoint", "minSize", "sizeStep"].forEach(function (k) { if (!pos(p[k])) bad(k + " must be a number above 0"); });
    var q = {};
    for (var k in p) q[k] = p[k];
    q.name = q.name || q.id;
    q.currency = q.currency || "USD";
    q.pointSize = pos(q.pointSize) ? q.pointSize : 1;
    q.pointName = q.pointName || "point";
    q.sizeUnit = q.sizeUnit || "units";
    q.spread = num(q.spread) ? q.spread : 0;
    q.slippage = num(q.slippage) ? q.slippage : 0;
    if (q.spread < 0 || q.slippage < 0) bad("spread and slippage cannot be negative");
    q.commission = q.commission || { type: "perUnit", value: 0 };
    if (["perUnit", "percent"].indexOf(q.commission.type) < 0 || !num(q.commission.value)) bad("commission must be { type: perUnit|percent, value }");
    q.margin = q.margin || { type: "percent", value: 100 };
    if (["fixed", "percent"].indexOf(q.margin.type) < 0 || !num(q.margin.value) || q.margin.value < 0) bad("margin must be { type: fixed|percent, value }");
    var f = q.overnightFinancing;
    q.overnightFinancing = num(f) ? { long: f, short: f } : { long: (f && num(f.long)) ? f.long : 0, short: (f && num(f.short)) ? f.short : 0 };
    q.rollover = q.rollover || { tz: "UTC", time: "00:00" };
    q.sessionHours = q.sessionHours || "24/7";
    q.leverage = q.margin.type === "percent" && q.margin.value > 0 ? 100 / q.margin.value : null;
    q.multiplier = q.valuePerPoint / q.pointSize;      // money per 1.00 of price, per size unit
    return q;
  }

  function add(profile) { var q = validate(profile); byId[q.id] = q; return q; }
  function get(id) {
    var p = byId[String(id)];
    if (!p) throw new Error("Unknown instrument: " + id);
    return p;
  }
  function has(id) { return Object.prototype.hasOwnProperty.call(byId, String(id)); }
  function list() { return Object.keys(byId).map(function (k) { return byId[k]; }); }

  /* ---------- time helpers (time zones, so daylight saving is handled) ---------- */
  var fmtCache = {};
  var DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function localParts(tsSec, tz) {
    var f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }));
    var o = {};
    f.formatToParts(new Date(tsSec * 1000)).forEach(function (x) { o[x.type] = x.value; });
    return { dow: DOW[o.weekday], y: +o.year, m: +o.month, d: +o.day, minutes: (+o.hour % 24) * 60 + (+o.minute) };
  }
  function hm(s) { var a = String(s).split(":"); return (+a[0]) * 60 + (+a[1] || 0); }

  /* A counter that goes up by one each time the daily rollover passes.
     Two timestamps with the same number are in the same trading day. */
  function tradingDay(profile, tsSec) {
    var r = profile.rollover, lp = localParts(tsSec, r.tz);
    return Math.floor(Date.UTC(lp.y, lp.m - 1, lp.d) / 86400000) + (lp.minutes >= hm(r.time) ? 1 : 0);
  }

  function isOpen(profile, tsSec) {
    var s = profile.sessionHours;
    if (!s || s === "24/7") return true;
    var lp = localParts(tsSec, s.tz), o = hm(s.open), c = hm(s.close), days = s.days || [0, 1, 2, 3, 4, 5, 6];
    if (o < c) return days.indexOf(lp.dow) >= 0 && lp.minutes >= o && lp.minutes < c;
    return (days.indexOf(lp.dow) >= 0 && lp.minutes >= o) || (days.indexOf((lp.dow + 6) % 7) >= 0 && lp.minutes < c);
  }

  /* ---------- number helpers ---------- */
  function decimals(step) { var s = String(step), i = s.indexOf("."); return s.indexOf("e-") > 0 ? +s.split("e-")[1] : (i < 0 ? 0 : s.length - i - 1); }
  function snap(x, step) { return +(Math.round(x / step) * step).toFixed(Math.min(12, decimals(step) + 2)); }
  function roundPrice(profile, price) { return snap(price, profile.tickSize); }
  function roundSize(profile, size) { return snap(size, profile.sizeStep); }
  function toPoints(profile, priceDiff) { return priceDiff / profile.pointSize; }
  function notional(profile, price, size) { return price * size * profile.multiplier; }   // in profile.currency

  PROFILES.forEach(add);

  return { add: add, get: get, has: has, list: list, validate: validate, TYPES: TYPES,
           localParts: localParts, tradingDay: tradingDay, isOpen: isOpen,
           roundPrice: roundPrice, roundSize: roundSize, toPoints: toPoints, notional: notional, decimals: decimals };
});
