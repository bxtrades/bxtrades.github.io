/* BXTrades replay engine  (window.BXEngine / require("./replay.js"))
 *
 * Pure logic: no DOM, no network unless you use the data loader. Runs in Node.
 * Everything market-specific comes from an instrument profile (instruments.js),
 * so the same code trades NQ contracts, £-per-point spread bets, forex lots,
 * shares and coins.
 *
 *   var s = BXEngine.createSession({
 *     instrument: "NQ",                       // id or a full profile object
 *     candles: [[t, o, h, l, c, v], ...],     // or {t,o,h,l,c,v} objects, t = unix seconds
 *     startIndex: 30,                         // how many candles are visible at the start
 *     account: { currency: "USD", balance: 50000, marginCallLevel: 100, stopOutLevel: 50 },
 *     propRules: BXEngine.PropRules.presets.futures50k      // optional
 *   });
 *   s.buy(1, { sl: 21490, tp: 21530 });       // market order with stop loss and take profit
 *   s.placeOrder({ side: "sell", type: "limit", size: 1, price: 21550 });
 *   s.step();                                 // reveal the next candle, returns the events it caused
 *   s.account(); s.position(); s.trades; s.stats(); s.propStatus();
 *
 * How fills work
 *   - Candle prices are the mid price. Buys fill at the ask (mid + half the spread),
 *     sells at the bid. Futures have no spread here; they get slippage instead.
 *   - Inside each candle price is walked open -> low -> high -> close for an up candle
 *     and open -> high -> low -> close for a down candle, so whichever of your stop
 *     or target sits nearer the open is hit first.
 *   - Stops fill at the stop price plus slippage, or at the open if price gapped
 *     through them (worse for you). Limits fill at the limit, or better on a gap.
 *   - Margin stop-outs and prop rule breaches close you at the exact price where
 *     the level is crossed, not at the end of the candle.
 *   - One net position per session. An opposite order reduces it, then flips it.
 */
(function (root, factory) {
  var inst = (typeof module === "object" && module.exports) ? require("./instruments.js") : root.BXInstruments;
  var api = factory(inst);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BXEngine = api;
})(typeof self !== "undefined" ? self : this, function (Inst) {
  "use strict";
  if (!Inst) throw new Error("BXEngine needs instruments.js loaded first");

  var EPS = 1e-9;
  /* Units of each currency per 1 US dollar. Approximate and fixed: pass your own
     as createSession({ fx: { GBP: 0.76 } }) if you want today's rate. */
  var DEFAULT_FX = { USD: 1, GBP: 0.79, EUR: 0.92, JPY: 150, CHF: 0.88, CAD: 1.37, AUD: 1.52 };

  function convert(amount, from, to, rates) {
    if (from === to) return amount;
    rates = rates || DEFAULT_FX;
    if (!rates[from] || !rates[to]) throw new Error("No exchange rate for " + (rates[from] ? to : from));
    return amount / rates[from] * rates[to];
  }
  function money(x) { return Math.round(x * 100) / 100; }

  /* ---------------------------------------------------------------- candles */
  function toTime(x) {
    if (typeof x === "number") return x > 1e11 ? Math.floor(x / 1000) : x;       // ms or seconds
    var s = String(x).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return toTime(+s);
    var ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");   // no zone given = UTC
    if (isNaN(ms)) throw new Error("Cannot read time: " + x);
    return Math.floor(ms / 1000);
  }
  function normaliseCandles(list) {
    if (!Array.isArray(list)) throw new Error("candles must be an array");
    var out = list.map(function (r, n) {
      var c = Array.isArray(r)
        ? { t: toTime(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] || 0 }
        : { t: toTime(r.t != null ? r.t : r.time), o: +(r.o != null ? r.o : r.open), h: +(r.h != null ? r.h : r.high),
            l: +(r.l != null ? r.l : r.low), c: +(r.c != null ? r.c : r.close), v: +(r.v != null ? r.v : r.volume) || 0 };
      if (![c.t, c.o, c.h, c.l, c.c].every(isFinite)) throw new Error("Bad candle at row " + n);
      c.h = Math.max(c.h, c.o, c.c); c.l = Math.min(c.l, c.o, c.c);
      return c;
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }
  /* CSV with a header row (time/date, open, high, low, close, volume in any order)
     or no header (then the order must be time,open,high,low,close,volume). */
  function parseCSV(text) {
    var lines = String(text).split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var sep = lines[0].indexOf("\t") >= 0 ? "\t" : (lines[0].indexOf(";") >= 0 ? ";" : ",");
    var col = { t: 0, o: 1, h: 2, l: 3, c: 4, v: 5 }, start = 0;
    if (/[a-z]/i.test(lines[0].replace(/[TZ]/g, ""))) {
      var names = { t: /^(time|date|datetime|timestamp|t)$/, o: /^(open|o)$/, h: /^(high|h)$/, l: /^(low|l)$/, c: /^(close|c)$/, v: /^(volume|vol|v)$/ };
      var head = lines[0].split(sep).map(function (x) { return x.trim().toLowerCase().replace(/^"|"$/g, ""); });
      col = {};
      Object.keys(names).forEach(function (k) { col[k] = head.findIndex(function (x) { return names[k].test(x); }); });
      ["t", "o", "h", "l", "c"].forEach(function (k) { if (col[k] < 0) throw new Error("CSV is missing a column for " + k); });
      start = 1;
    }
    return normaliseCandles(lines.slice(start).map(function (l) {
      var p = l.split(sep).map(function (x) { return x.trim().replace(/^"|"$/g, ""); });
      return [p[col.t], p[col.o], p[col.h], p[col.l], p[col.c], col.v >= 0 ? p[col.v] : 0];
    }));
  }
  /* "5m" -> 300, "1h" -> 3600, "1d" -> 86400 */
  function timeframeSeconds(tf) {
    var m = /^(\d+)\s*(m|h|d)$/i.exec(String(tf));
    if (!m) throw new Error("Unknown timeframe: " + tf);
    return +m[1] * { m: 60, h: 3600, d: 86400 }[m[2].toLowerCase()];
  }
  /* Builds bigger candles out of smaller ones (5m -> 10m, 1h -> 4h). Buckets line up with the clock. */
  function aggregate(candles, seconds) {
    var out = [], cur = null, key = null;
    candles.forEach(function (c) {
      var b = Math.floor(c.t / seconds);
      if (b !== key) { key = b; cur = { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v || 0 }; out.push(cur); }
      else { if (c.h > cur.h) cur.h = c.h; if (c.l < cur.l) cur.l = c.l; cur.c = c.c; cur.v += c.v || 0; }
    });
    return out;
  }
  /* Turns a data file (JSON or CSV text) into { sessions: [{ id, candles }] }. */
  function parseData(text, name) {
    var s = String(text).trim();
    if (/\.csv$/i.test(name || "") || !/^[\[{]/.test(s)) return { sessions: [{ id: name || "csv", candles: parseCSV(s) }] };
    var j = JSON.parse(s);
    var raw = Array.isArray(j) ? [{ candles: j }] : (j.sessions || [{ candles: j.candles || [] }]);
    var out = { sessions: raw.map(function (x, n) { return { id: x.id || ((name || "data") + "#" + n), candles: normaliseCandles(x.candles) }; }) };
    if (!Array.isArray(j)) { out.interval = j.interval; out.source = j.source; }
    return out;
  }

  /* ---------------------------------------------------------------- data loader
     Reads <baseUrl>index.json, which lists the markets that have candle files:
       { "markets": { "NQ":  { "timeframes": { "5m": "NQ/5m.json", "1h": "NQ/1h.csv" } },
                      "MNQ": { "sameAs": "NQ" } } }
     To add a market's data later: drop the file in, add a line here. Nothing else. */
  function createDataLoader(o) {
    o = o || {};
    var base = o.baseUrl != null ? o.baseUrl : "/engine/data/";
    var fetchText = o.fetchText || function (url) {
      if (typeof fetch !== "function") return Promise.reject(new Error("No fetch here: pass fetchText to createDataLoader"));
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + " returned " + r.status); return r.text(); });
    };
    var manifest = null;
    function index() {
      return manifest || (manifest = Promise.resolve(fetchText(base + "index.json")).then(function (t) { return JSON.parse(t).markets || {}; }));
    }
    function resolve(m, id) {
      var e = m[id], hops = 0;
      while (e && e.sameAs && hops++ < 5) e = m[e.sameAs];
      return e && e.timeframes && Object.keys(e.timeframes).length ? e : null;
    }
    /* Timeframes with no file of their own are built from a smaller one that divides into
       them (at most 4 candles into 1, so there are still enough candles to replay). */
    var wanted = o.derive === false ? [] : (o.derive || ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "1h", "2h", "4h", "1d"]);
    function plan(e) {
      var files = Object.keys(e.timeframes), map = {};
      files.forEach(function (tf) { map[tf] = { base: tf, derived: false }; });
      wanted.forEach(function (tf) {
        if (map[tf]) return;
        var sec = timeframeSeconds(tf), best = null;
        files.forEach(function (b) {
          var bs = timeframeSeconds(b);
          if (sec % bs === 0 && sec / bs <= 4 && (!best || bs > timeframeSeconds(best))) best = b;
        });
        if (best) map[tf] = { base: best, derived: true };
      });
      return map;
    }
    function sorted(map) { return Object.keys(map).sort(function (a, b) { return timeframeSeconds(a) - timeframeSeconds(b); }); }
    return {
      /* Only markets that have BOTH a profile and data. */
      listMarkets: function () {
        return index().then(function (m) {
          return Object.keys(m).filter(function (id) { return Inst.has(id) && resolve(m, id); }).map(function (id) {
            var p = Inst.get(id), map = plan(resolve(m, id)), tfs = sorted(map);
            return { id: id, name: p.name, type: p.type, timeframes: tfs, instrument: p,
                     builtFrom: tfs.reduce(function (acc, tf) { if (map[tf].derived) acc[tf] = map[tf].base; return acc; }, {}) };
          });
        });
      },
      load: function (id, timeframe) {
        return index().then(function (m) {
          var e = resolve(m, id);
          if (!e) throw new Error("No data for " + id);
          var how = plan(e)[timeframe];
          if (!how) throw new Error("No " + timeframe + " data for " + id);
          var file = e.timeframes[how.base];
          return Promise.resolve(fetchText(base + file)).then(function (t) {
            var d = parseData(t, file);
            if (how.derived) {
              var sec = timeframeSeconds(timeframe);
              d.sessions.forEach(function (x) { x.candles = aggregate(x.candles, sec); });
              d.builtFrom = how.base;
            }
            d.interval = timeframeSeconds(timeframe);
            d.instrument = id; d.timeframe = timeframe;
            return d;
          });
        });
      }
    };
  }

  /* ---------------------------------------------------------------- prop rules
     One config covers both styles. Money values can be a number (amount) or { pct }
     of the starting balance.
       profitTarget    3000  |  { pct: 10 }
       drawdown        { type: "static" | "trailing" | "trailingEOD", amount | pct, lockAt }
                         static      floor fixed below the starting balance (forex/CFD "max overall loss")
                         trailing    floor follows your highest equity, including open profit
                         trailingEOD floor follows your highest end-of-day balance
                         lockAt      the floor stops rising here (default: the starting balance)
       dailyLoss       { amount | pct, action: "fail" | "lockDay", basis: "balance" | "equity", of: "initial" | "dayStart" }
       maxSize         biggest position allowed, in the instrument's size unit
       minTradingDays  days with at least one fill needed before a pass counts            */
  function PropRules(cfg, session) {
    var self = this;
    this.cfg = cfg; this.s = session;
    this.style = cfg.style || "futures";
    this.start = cfg.startBalance != null ? cfg.startBalance : session.balance;
    function amt(x, base) {
      if (x == null) return null;
      if (typeof x === "number") return x;
      if (x.amount != null) return x.amount;
      return x.pct != null ? (base != null ? base : self.start) * x.pct / 100 : null;
    }
    this._amt = amt;
    this.target = amt(cfg.profitTarget);
    var dd = cfg.drawdown || {};
    this.ddType = dd.type || "static";
    this.ddAmt = amt(dd);
    this.ddLock = dd.lockAt !== undefined ? dd.lockAt : (this.ddType === "static" ? null : this.start);
    this.peak = this.start;
    this.daily = cfg.dailyLoss || null;
    this.dayStart = this.start;
    this.maxSize = cfg.maxSize || null;
    this.minDays = cfg.minTradingDays || 0;
    this.status = "active"; this.reason = null; this.dayLocked = false;
    this._days = {}; this.dayCount = 0;
  }
  PropRules.prototype.ddFloor = function () {
    if (this.ddAmt == null) return null;
    if (this.ddType === "static") return this.start - this.ddAmt;
    var f = this.peak - this.ddAmt;
    return this.ddLock != null ? Math.min(f, this.ddLock) : f;
  };
  PropRules.prototype.dailyFloor = function () {
    if (!this.daily) return null;
    var a = this._amt(this.daily, this.daily.of === "dayStart" ? this.dayStart : this.start);
    return a == null ? null : this.dayStart - a;
  };
  /* Equity levels that end the day or the account if touched. */
  PropRules.prototype.floors = function () {
    if (this.status !== "active" || this.dayLocked) return [];
    var out = [], a = this.ddFloor(), b = this.dailyFloor();
    if (a != null) out.push({ equity: a, kind: "maxDrawdown" });
    if (b != null) out.push({ equity: b, kind: "dailyLoss" });
    return out;
  };
  PropRules.prototype.breach = function (kind) {
    if (this.status !== "active") return null;
    if (kind === "dailyLoss" && this.daily && this.daily.action === "lockDay") {
      if (this.dayLocked) return null;
      this.dayLocked = true;
      return kind;
    }
    this.status = "failed"; this.reason = kind;
    return kind;
  };
  /* Returns "maxDrawdown" | "dailyLoss" | "passed" when something just changed, else null. */
  PropRules.prototype.evaluate = function (acc) {
    if (this.status !== "active") return null;
    if (this.ddType === "trailing" && acc.equity > this.peak) this.peak = acc.equity;
    var f = this.ddFloor();
    if (f != null && acc.equity <= f + 1e-6) return this.breach("maxDrawdown");
    if (!this.dayLocked) {
      var g = this.dailyFloor();
      if (g != null && acc.equity <= g + 1e-6) return this.breach("dailyLoss");
    }
    if (this.target != null && !this.s.pos && acc.balance - this.start >= this.target - 1e-6 && this.dayCount >= this.minDays) {
      this.status = "passed"; this.reason = "profitTarget";
      return "passed";
    }
    return null;
  };
  PropRules.prototype.onFill = function (time) {
    var d = Inst.tradingDay(this.s.instrument, time);
    if (!this._days[d]) { this._days[d] = 1; this.dayCount++; }
  };
  PropRules.prototype.onRollover = function (acc) {
    if (this.ddType === "trailingEOD" && acc.balance > this.peak) this.peak = acc.balance;
    this.dayStart = this.daily && this.daily.basis === "equity" ? acc.equity : acc.balance;
    this.dayLocked = false;
  };
  PropRules.prototype.lockReason = function () {
    if (this.status === "failed") return "account failed (" + this.reason + ")";
    if (this.status === "passed") return "evaluation passed";
    if (this.dayLocked) return "daily loss limit hit, locked until the next trading day";
    return null;
  };
  PropRules.prototype.report = function (acc) {
    var f = this.ddFloor(), g = this.dailyFloor(), profit = acc.balance - this.start;
    return {
      style: this.style, status: this.status, reason: this.reason, dayLocked: this.dayLocked,
      startBalance: this.start, profit: money(profit),
      profitTarget: this.target, toTarget: this.target != null ? money(Math.max(0, this.target - profit)) : null,
      drawdownType: this.ddAmt != null ? this.ddType : null,
      drawdownFloor: f != null ? money(f) : null, drawdownRoom: f != null ? money(acc.equity - f) : null,
      dailyLossFloor: g != null ? money(g) : null, dailyLossRoom: g != null ? money(acc.equity - g) : null,
      maxSize: this.maxSize, tradingDays: this.dayCount, minTradingDays: this.minDays
    };
  };
  /* Typical shapes, not any one firm's current rules. Copy one and edit it. */
  PropRules.presets = {
    futures50k: { style: "futures", startBalance: 50000, profitTarget: 3000,
                  drawdown: { type: "trailingEOD", amount: 2000, lockAt: 50000 },
                  dailyLoss: { amount: 1000, action: "lockDay" }, maxSize: 5 },
    futures50kIntradayTrail: { style: "futures", startBalance: 50000, profitTarget: 3000,
                  drawdown: { type: "trailing", amount: 2500, lockAt: 50100 }, maxSize: 10 },
    futures50kStatic: { style: "futures", startBalance: 50000, profitTarget: 3000,
                  drawdown: { type: "static", amount: 2000 }, dailyLoss: { amount: 1000, action: "lockDay" }, maxSize: 5 },
    forex100k: { style: "forex", startBalance: 100000, profitTarget: { pct: 10 },
                  drawdown: { type: "static", pct: 10 },
                  dailyLoss: { pct: 5, action: "fail", basis: "balance", of: "initial" }, minTradingDays: 4 }
  };

  /* ---------------------------------------------------------------- session */
  function Session(opts) {
    opts = opts || {};
    var I = typeof opts.instrument === "string" ? Inst.get(opts.instrument) : Inst.validate(opts.instrument);
    var a = opts.account || {}, pr = opts.propRules || null;
    this.instrument = I;
    this.candles = normaliseCandles(opts.candles || []);
    if (!this.candles.length) throw new Error("createSession needs candles");
    this.currency = a.currency || "USD";
    this.fx = {};
    var k;
    for (k in DEFAULT_FX) this.fx[k] = DEFAULT_FX[k];
    for (k in (opts.fx || {})) this.fx[k] = opts.fx[k];
    this._fx = convert(1, I.currency, this.currency, this.fx);
    this._k = I.multiplier * this._fx;                       // account money per 1.00 of price, per size unit
    this._hs = (opts.spread != null ? opts.spread : I.spread) * I.pointSize / 2;
    this._slip = (opts.slippage != null ? opts.slippage : I.slippage) * I.pointSize;
    this._tol = I.tickSize * 1e-6;
    this.useMargin = a.margin !== false;
    this.marginCallLevel = a.marginCallLevel != null ? a.marginCallLevel : 100;   // % of used margin
    this.stopOutLevel = a.stopOutLevel != null ? a.stopOutLevel : 50;
    this.balance = a.balance != null ? a.balance : (pr && pr.startBalance != null ? pr.startBalance : 50000);
    this.startBalance = this.balance;
    this.i = Math.max(0, Math.min(this.candles.length - 1, (opts.startIndex || 1) - 1));
    this.mid = this.candles[this.i].c;
    this.time = this.candles[this.i].t;
    this.pos = null; this.orders = []; this.trades = []; this.log = [];
    this.fees = { commission: 0, spread: 0, financing: 0 };
    this.maxDrawdown = 0;
    this._peakEq = this.balance; this._marginCalled = false;
    this._id = 0; this._buf = null; this._listeners = {}; this._history = [];
    this.rules = pr ? new PropRules(pr, this) : null;
  }
  var S = Session.prototype;

  /* ---- events ---- */
  S.on = function (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); return this; };
  S.off = function (type, fn) { var l = this._listeners[type] || []; var n = l.indexOf(fn); if (n >= 0) l.splice(n, 1); return this; };
  S._emit = function (type, data) {
    var e = { type: type, time: this.time, index: this.i };
    for (var k in data) e[k] = data[k];
    this.log.push(e);
    if (this._buf) this._buf.push(e);
    (this._listeners[type] || []).concat(this._listeners["*"] || []).forEach(function (fn) { fn(e); });
    return e;
  };
  S._run = function (fn) {
    if (this._buf) { fn.call(this); return this._buf; }
    var buf = this._buf = [];
    try { fn.call(this); } finally { this._buf = null; }
    return buf;
  };

  /* ---- prices and money ---- */
  S.quote = function () {
    var I = this.instrument;
    return { mid: this.mid, bid: Inst.roundPrice(I, this.mid - this._hs), ask: Inst.roundPrice(I, this.mid + this._hs), spread: this._hs * 2 / I.pointSize };
  };
  S._side = function (dir, mid) { return (mid == null ? this.mid : mid) + dir * this._hs; };   // +1 = ask, -1 = bid
  S._commission = function (size, price) {
    var c = this.instrument.commission;
    if (c.type === "percent") return c.value / 100 * price * size * this._k;
    return Math.max(c.value * size, c.value > 0 ? (c.min || 0) : 0) * this._fx;
  };
  S._margin = function (size, price) {
    var m = this.instrument.margin;
    return m.type === "fixed" ? m.value * size * this._fx : m.value / 100 * price * size * this._k;
  };
  S._unrealized = function (mid) {
    var p = this.pos;
    return p ? p.dir * (this._side(-p.dir, mid) - p.avg) * p.size * this._k : 0;
  };
  S.pointsToMoney = function (points, size) { return points * this.instrument.pointSize * size * this._k; };
  /* Biggest size that risks no more than riskMoney if stopped out stopPoints away. */
  S.sizeForRisk = function (riskMoney, stopPoints) {
    var I = this.instrument, per = this.pointsToMoney(stopPoints, 1);
    if (!(per > 0)) return 0;
    var n = Math.floor(riskMoney / per / I.sizeStep + 1e-9) * I.sizeStep;
    return n < I.minSize ? 0 : Inst.roundSize(I, n);
  };

  /* ---- read-only views ---- */
  S.account = function () {
    var used = this.pos && this.useMargin ? this._margin(this.pos.size, this.pos.avg) : 0;
    var u = this._unrealized(), eq = this.balance + u;
    return { currency: this.currency, balance: money(this.balance), equity: money(eq), unrealized: money(u),
             realized: money(this.balance - this.startBalance), usedMargin: money(used), freeMargin: money(eq - used),
             marginLevel: used > 0 ? eq / used * 100 : null,
             fees: { commission: money(this.fees.commission), spread: money(this.fees.spread), financing: money(this.fees.financing) } };
  };
  S.position = function () {
    var p = this.pos, I = this.instrument;
    if (!p) return null;
    return { side: p.dir > 0 ? "long" : "short", dir: p.dir, size: p.size, avgPrice: p.avg, sl: p.sl, tp: p.tp,
             points: p.dir * (this._side(-p.dir) - p.avg) / I.pointSize, unrealized: money(this._unrealized()),
             margin: money(this.useMargin ? this._margin(p.size, p.avg) : 0), sizeUnit: I.sizeUnit };
  };
  S.openOrders = function () { return this.orders.slice(); };
  S.visible = function () { return this.candles.slice(0, this.i + 1); };
  S.current = function () { return this.candles[this.i]; };
  S.isDone = function () { return this.i >= this.candles.length - 1; };
  S.remaining = function () { return this.candles.length - 1 - this.i; };
  S.locked = function () { return this.rules ? this.rules.lockReason() : null; };
  S.propStatus = function () { return this.rules ? this.rules.report(this.account()) : null; };
  S.stats = function () {
    var t = this.trades, w = 0, l = 0, gp = 0, gl = 0, pts = 0, rs = 0, rn = 0;
    t.forEach(function (x) {
      if (x.netPnl > 0) { w++; gp += x.netPnl; } else if (x.netPnl < 0) { l++; gl -= x.netPnl; }
      pts += x.points * x.size;
      if (x.r != null) { rs += x.r; rn++; }
    });
    return { trades: t.length, wins: w, losses: l, winRate: t.length ? w / t.length * 100 : null,
             netPnl: money(gp - gl), grossProfit: money(gp), grossLoss: money(gl),
             profitFactor: gl > 0 ? gp / gl : null, avgWin: w ? money(gp / w) : null, avgLoss: l ? money(gl / l) : null,
             totalR: rn ? rs : null, pointsTimesSize: pts, maxDrawdown: money(this.maxDrawdown),
             fees: this.account().fees };
  };

  /* ---- orders ---- */
  S._reject = function (msg, extra) {
    var d = { reason: msg };
    for (var k in (extra || {})) d[k] = extra[k];
    this._emit("orderRejected", d);
    return { ok: false, error: msg };
  };
  S._checkStops = function (dir, ref, sl, tp) {
    if (sl != null && !(isFinite(sl) && dir * (ref - sl) > this._tol)) return "Stop loss must be " + (dir > 0 ? "below" : "above") + " the entry price";
    if (tp != null && !(isFinite(tp) && dir * (tp - ref) > this._tol)) return "Take profit must be " + (dir > 0 ? "above" : "below") + " the entry price";
    return null;
  };
  /* placeOrder({ side: "buy"|"sell", type: "market"|"limit"|"stop", size, price?, sl?, tp?, reduceOnly? })
     Returns { ok: true, order, events } or { ok: false, error }. */
  S.placeOrder = function (o) {
    var self = this, I = this.instrument, res;
    var events = this._run(function () {
      o = o || {};
      var lock = self.locked();
      if (lock) { res = self._reject("Trading is locked: " + lock); return; }
      var dir = o.side === "buy" ? 1 : o.side === "sell" ? -1 : 0, type = o.type || "market";
      if (!dir) { res = self._reject("side must be buy or sell"); return; }
      if (["market", "limit", "stop"].indexOf(type) < 0) { res = self._reject("type must be market, limit or stop"); return; }
      var size = Inst.roundSize(I, +o.size);
      if (!(size > 0) || Math.abs(size - o.size) > 1e-9) { res = self._reject("Size must be in steps of " + I.sizeStep + " " + I.sizeUnit); return; }
      if (size < I.minSize - EPS) { res = self._reject("Smallest size is " + I.minSize + " " + I.sizeUnit); return; }
      var price = null;
      if (type !== "market") {
        if (!(isFinite(o.price) && o.price > 0)) { res = self._reject("A " + type + " order needs a price"); return; }
        price = Inst.roundPrice(I, +o.price);
      }
      if (o.reduceOnly && !(self.pos && self.pos.dir !== dir)) { res = self._reject("Nothing to close"); return; }
      var sl = o.sl != null ? Inst.roundPrice(I, +o.sl) : null, tp = o.tp != null ? Inst.roundPrice(I, +o.tp) : null;
      var err = self._checkStops(dir, type === "market" ? self._side(dir) : price, sl, tp);
      if (err) { res = self._reject(err); return; }
      var order = { id: ++self._id, side: o.side, dir: dir, type: type, size: size, price: price, sl: sl, tp: tp,
                    reduceOnly: !!o.reduceOnly, time: self.time, status: "working" };
      if (type === "market") {
        var f = self._fill({ dir: dir, size: size, sl: sl, tp: tp, reduceOnly: order.reduceOnly, reason: "market", orderId: order.id },
                           self._side(dir) + dir * self._slip);
        if (f.rejected && !f.closed) { order.status = "rejected"; res = { ok: false, error: f.rejected }; return; }
        order.status = "filled"; order.fillPrice = f.price;
      } else {
        self.orders.push(order);
        self._emit("orderPlaced", { order: order });
      }
      res = { ok: true, order: order };
      self._walk(self.mid);                     // anything already through its price fills now
    });
    if (res.ok) res.events = events;
    return res;
  };
  S.buy = function (size, o) { o = o || {}; return this.placeOrder({ side: "buy", type: o.type || "market", size: size, price: o.price, sl: o.sl, tp: o.tp }); };
  S.sell = function (size, o) { o = o || {}; return this.placeOrder({ side: "sell", type: o.type || "market", size: size, price: o.price, sl: o.sl, tp: o.tp }); };
  /* Close all (or part) of the position at market. */
  S.close = function (size) {
    if (!this.pos) return { ok: false, error: "Nothing to close" };
    return this.placeOrder({ side: this.pos.dir > 0 ? "sell" : "buy", type: "market", size: size != null ? size : this.pos.size, reduceOnly: true });
  };
  S.flatten = function () { this.cancelAll("flatten"); return this.pos ? this.close() : { ok: true, events: [] }; };
  S.cancelOrder = function (id, why) {
    var n = this.orders.findIndex(function (x) { return x.id === id; });
    if (n < 0) return false;
    var o = this.orders.splice(n, 1)[0];
    o.status = "cancelled";
    this._emit("orderCancelled", { order: o, reason: why || "user" });
    return true;
  };
  S.cancelAll = function (why) { var self = this; this.orders.slice().forEach(function (o) { self.cancelOrder(o.id, why); }); };
  S.modifyOrder = function (id, ch) {
    var o = this.orders.find(function (x) { return x.id === id; }), I = this.instrument, self = this;
    if (!o) return { ok: false, error: "Order not found" };
    var price = ch.price != null ? Inst.roundPrice(I, +ch.price) : o.price;
    var size = ch.size != null ? Inst.roundSize(I, +ch.size) : o.size;
    var sl = ch.sl !== undefined ? (ch.sl == null ? null : Inst.roundPrice(I, +ch.sl)) : o.sl;
    var tp = ch.tp !== undefined ? (ch.tp == null ? null : Inst.roundPrice(I, +ch.tp)) : o.tp;
    if (!(price > 0) || !(size >= I.minSize - EPS)) return { ok: false, error: "Bad price or size" };
    var err = this._checkStops(o.dir, price, sl, tp);
    if (err) return { ok: false, error: err };
    o.price = price; o.size = size; o.sl = sl; o.tp = tp;
    var events = this._run(function () { self._emit("orderModified", { order: o }); self._walk(self.mid); });
    return { ok: true, order: o, events: events };
  };
  /* Stop loss / take profit for the open position. Pass null to remove one. */
  S.setStops = function (ch) {
    var p = this.pos, I = this.instrument, self = this;
    if (!p) return { ok: false, error: "No open position" };
    var sl = ch.sl !== undefined ? (ch.sl == null ? null : Inst.roundPrice(I, +ch.sl)) : p.sl;
    var tp = ch.tp !== undefined ? (ch.tp == null ? null : Inst.roundPrice(I, +ch.tp)) : p.tp;
    var err = this._checkStops(p.dir, this._side(-p.dir), sl, tp);
    if (err) return { ok: false, error: err.replace("the entry price", "the current price") };
    p.sl = sl; p.tp = tp;
    this._run(function () { self._emit("stopsChanged", { sl: sl, tp: tp }); });
    return { ok: true };
  };

  /* ---- fills ---- */
  S._recalc = function () {
    var p = this.pos, n = 0, v = 0;
    p.lots.forEach(function (l) { n += l.size; v += l.size * l.price; });
    p.size = Inst.roundSize(this.instrument, n);
    p.avg = n > 0 ? v / n : 0;
  };
  S._fill = function (f, rawPrice) {
    var I = this.instrument, self = this, k = this._k;
    var px = Inst.roundPrice(I, rawPrice), pos = this.pos;
    var closeSize = pos && pos.dir !== f.dir ? Math.min(f.size, pos.size) : 0;
    var openSize = f.reduceOnly ? 0 : Inst.roundSize(I, f.size - closeSize);
    var out = { price: px, closed: 0, opened: 0, rejected: null };

    // An order that adds exposure is checked as a whole first: it either all goes through or none of it does.
    if (openSize > 0) {
      var same = pos && pos.dir === f.dir ? pos : null, why = null;
      if (this.rules && this.rules.maxSize && (same ? same.size : 0) + openSize > this.rules.maxSize + EPS) why = "Over the max position size of " + this.rules.maxSize + " " + I.sizeUnit;
      else if (this.useMargin) {
        var need = (same ? this._margin(same.size, same.avg) : 0) + this._margin(openSize, px);
        if (need > this.balance + this._unrealized() + 1e-6) why = "Not enough free margin (needs " + money(need) + " " + this.currency + ")";
      }
      if (why) { out.rejected = why; this._emit("orderRejected", { reason: why, orderId: f.orderId }); return out; }
    }

    if (closeSize > 0) {
      var comm = this._commission(closeSize, px), left = closeSize;
      this.balance -= comm; this.fees.commission += comm;
      while (left > EPS && pos.lots.length) {
        var lot = pos.lots[0], s = Math.min(lot.size, left), share = s / lot.size;
        var cIn = lot.comm * share, fin = lot.fin * share, gross = pos.dir * (px - lot.price) * s * k;
        lot.comm -= cIn; lot.fin -= fin;
        this.balance += gross;
        var pts = pos.dir * (px - lot.price) / I.pointSize;
        var tr = { id: this.trades.length + 1, instrument: I.id, side: pos.dir > 0 ? "long" : "short", size: Inst.roundSize(I, s), sizeUnit: I.sizeUnit,
                   entryTime: lot.time, entryPrice: lot.price, exitTime: this.time, exitPrice: px,
                   points: pts, pointName: I.pointName, grossPnl: money(gross),
                   commission: money(cIn + comm * s / closeSize), financing: money(fin),
                   netPnl: money(gross - cIn - comm * s / closeSize - fin),
                   r: lot.risk ? pts * I.pointSize / lot.risk : null, reason: f.reason, currency: this.currency };
        this.trades.push(tr);
        this._emit("trade", { trade: tr });
        lot.size = Inst.roundSize(I, lot.size - s);
        if (lot.size <= EPS) pos.lots.shift();
        left -= s;
      }
      out.closed = closeSize;
      if (!pos.lots.length) { this.pos = pos = null; this._marginCalled = false; }
      else this._recalc();
    }

    if (openSize > 0) {
      var c2 = this._commission(openSize, px);
      this.balance -= c2; this.fees.commission += c2;
      if (!pos) pos = this.pos = { dir: f.dir, size: 0, avg: 0, lots: [], sl: null, tp: null };
      var stop = f.sl != null ? f.sl : pos.sl;
      pos.lots.push({ size: openSize, price: px, time: this.time, comm: c2, fin: 0, risk: stop != null ? Math.abs(px - stop) : null });
      if (f.sl != null) pos.sl = f.sl;
      if (f.tp != null) pos.tp = f.tp;
      this._recalc();
      out.opened = openSize;
    }

    var done = out.closed + out.opened;
    if (done > 0) {
      this.fees.spread += this._hs * done * k;
      if (this.rules) this.rules.onFill(this.time);
      this._emit("fill", { orderId: f.orderId || null, side: f.dir > 0 ? "buy" : "sell", size: Inst.roundSize(I, done), price: px,
                           reason: f.reason, closed: out.closed, opened: out.opened });
    }
    return out;
  };

  /* Close everything right now because a level was hit (stop-out or prop rule). */
  S._liquidate = function (kind) {
    var p = this.pos;
    this.cancelAll(kind);
    if (p) this._fill({ dir: -p.dir, size: p.size, reduceOnly: true, reason: kind }, this._side(-p.dir) - p.dir * this._slip);
  };

  /* ---- the price walk ---- */
  S._floor = function () {                      // highest equity level that forces a close
    var best = null;
    if (this.useMargin && this.stopOutLevel > 0 && this.pos) best = { equity: this._margin(this.pos.size, this.pos.avg) * this.stopOutLevel / 100, kind: "stopOut" };
    (this.rules ? this.rules.floors() : []).forEach(function (f) { if (!best || f.equity > best.equity) best = f; });
    return best;
  };
  S._midForEquity = function (equity) {         // mid price at which equity equals the given level
    var p = this.pos;
    return p.avg + p.dir * (equity - this.balance) / (p.size * this._k) + p.dir * this._hs;
  };
  /* The first thing that happens while price moves from p to b, or null. */
  S._next = function (p, b) {
    var self = this, best = null, hs = this._hs, tol = this._tol, pos = this.pos;
    function add(m, need, pri, run) {          // fires once need * (mid - m) >= 0
      var d;
      if (need * (p - m) >= -tol) d = 0;
      else if ((b - p) * need > 0 && need * (b - m) >= -tol) d = Math.abs(m - p);
      else return;
      if (!best || d < best.d - tol || (Math.abs(d - best.d) <= tol && pri < best.pri)) best = { d: d, pri: pri, at: d === 0 ? p : m, run: run };
    }
    function orderTrigger(dir, type, price, pri, run) { add(price - dir * hs, type === "stop" ? dir : -dir, pri, run); }
    function fillPrice(dir, type, price) {
      var s = self._side(dir);
      return type === "stop" ? s + dir * self._slip : (dir > 0 ? Math.min(price, s) : Math.max(price, s));
    }
    if (pos) {
      var fl = this._floor();
      if (fl) add(this._midForEquity(fl.equity), -pos.dir, 0, function () {
        if (fl.kind === "stopOut") {
          if (!self._marginCalled) { self._marginCalled = true; self._emit("marginCall", { marginLevel: self.account().marginLevel }); }
          self._liquidate("stopOut");
          self._emit("stopOut", { level: self.stopOutLevel });
        } else {
          self._liquidate(fl.kind);
          self.rules.breach(fl.kind);
          self._emit("propStatus", self.propStatus());
        }
      });
      if (this.useMargin && !this._marginCalled && this.marginCallLevel > 0) {
        add(this._midForEquity(this._margin(pos.size, pos.avg) * this.marginCallLevel / 100), -pos.dir, 0.5, function () {
          self._marginCalled = true;
          self._emit("marginCall", { marginLevel: self.account().marginLevel });
        });
      }
      if (pos.sl != null) orderTrigger(-pos.dir, "stop", pos.sl, 1, function () {
        var q = self.pos; self._fill({ dir: -q.dir, size: q.size, reduceOnly: true, reason: "sl" }, fillPrice(-q.dir, "stop", q.sl));
      });
      if (pos.tp != null) orderTrigger(-pos.dir, "limit", pos.tp, 4, function () {
        var q = self.pos; self._fill({ dir: -q.dir, size: q.size, reduceOnly: true, reason: "tp" }, fillPrice(-q.dir, "limit", q.tp));
      });
    }
    this.orders.forEach(function (o) {
      orderTrigger(o.dir, o.type, o.price, o.type === "stop" ? 2 : 3, function () {
        self.orders.splice(self.orders.indexOf(o), 1);
        if (o.reduceOnly && !(self.pos && self.pos.dir !== o.dir)) { o.status = "cancelled"; self._emit("orderCancelled", { order: o, reason: "nothing to close" }); return; }
        var f = self._fill({ dir: o.dir, size: o.size, sl: o.sl, tp: o.tp, reduceOnly: o.reduceOnly, reason: o.type, orderId: o.id }, fillPrice(o.dir, o.type, o.price));
        o.status = f.closed + f.opened > 0 ? "filled" : "rejected";
        o.fillPrice = f.price;
      });
    });
    return best;
  };
  S._walk = function (target) {
    for (var guard = 0; guard < 10000; guard++) {
      var t = this._next(this.mid, target);
      if (!t) break;
      this.mid = t.at;
      t.run();
      this._check();
    }
    this.mid = target;
    this._check();
  };
  S._check = function () {
    var acc = this.account(), eq = this.balance + this._unrealized();
    if (eq > this._peakEq) this._peakEq = eq;
    if (this._peakEq - eq > this.maxDrawdown) this.maxDrawdown = this._peakEq - eq;
    if (this._marginCalled && (acc.marginLevel == null || acc.marginLevel > this.marginCallLevel + 1)) this._marginCalled = false;
    if (this.rules) {
      var kind = this.rules.evaluate(acc);
      if (kind) {
        if (kind === "passed") this.cancelAll("passed"); else this._liquidate(kind);
        this._emit("propStatus", this.propStatus());
      }
    }
  };

  /* ---- replay ---- */
  S._advance = function () {
    var I = this.instrument, prev = this.candles[this.i], c = this.candles[++this.i];
    var days = Inst.tradingDay(I, c.t) - Inst.tradingDay(I, prev.t);
    if (days > 0) {
      var p = this.pos;
      if (p) {
        var rate = p.dir > 0 ? I.overnightFinancing.long : I.overnightFinancing.short;
        if (rate) {
          var charge = Inst.notional(I, this.mid, p.size) * this._fx * rate / 100 / 365 * days;
          this.balance -= charge; this.fees.financing += charge;
          p.lots.forEach(function (l) { l.fin += charge * l.size / p.size; });
          this._emit("financing", { amount: money(charge), nights: days, currency: this.currency });
        }
      }
      if (this.rules) this.rules.onRollover(this.account());
      this._emit("dayRollover", { days: days });
    }
    this.time = c.t;
    this.mid = c.o;                             // a gap jumps straight to the open
    this._walk(c.o);
    var self = this;
    (c.c >= c.o ? [c.l, c.h, c.c] : [c.h, c.l, c.c]).forEach(function (x) { self._walk(x); });
  };
  /* Reveal the next n candles. Returns every event that happened. */
  S.step = function (n) {
    return this._run(function () {
      for (var k = 0; k < (n || 1) && !this.isDone(); k++) {
        this._history.push(this._snapshot());
        if (this._history.length > 3000) this._history.shift();
        this._advance();
      }
    });
  };
  /* Skip ahead until something happens. Stops at the first of:
       events: ["trade", "fill", "dayRollover", ...]   one of these event types fires
       time:   unix seconds                            the replay clock reaches this time
       maxCandles                                      this many candles have gone by
     or the end of the data. Returns every event on the way. */
  S.stepUntil = function (o) {
    o = o || {};
    var want = o.events || [], max = o.maxCandles || Infinity, self = this;
    return this._run(function () {
      for (var k = 0; k < max && !self.isDone(); k++) {
        var before = self._buf.length;
        self.step(1);
        if (o.time != null && self.time >= o.time) break;
        if (self._buf.slice(before).some(function (e) { return want.indexOf(e.type) >= 0; })) break;
      }
    });
  };
  /* Rewind n candles. Everything goes back to how it was just before those candles played:
     balance, position, orders, trade log and prop rules. Returns how many candles it went back. */
  S.stepBack = function (n) {
    var snap = null, count = 0;
    for (var k = 0; k < (n || 1) && this._history.length; k++) { snap = this._history.pop(); count++; }
    if (snap) { this._restore(snap); this._emit("rewind", { candles: count }); }
    return count;
  };
  S.canStepBack = function () { return this._history.length > 0; };
  S._snapshot = function () {
    var r = this.rules;
    return JSON.stringify({ i: this.i, mid: this.mid, time: this.time, balance: this.balance, pos: this.pos, orders: this.orders,
      trades: this.trades.length, log: this.log.length, fees: this.fees, maxDrawdown: this.maxDrawdown, peakEq: this._peakEq,
      marginCalled: this._marginCalled, id: this._id,
      rules: r ? { peak: r.peak, dayStart: r.dayStart, status: r.status, reason: r.reason, dayLocked: r.dayLocked, days: r._days, dayCount: r.dayCount } : null });
  };
  S._restore = function (json) {
    var z = JSON.parse(json), r = this.rules;
    this.i = z.i; this.mid = z.mid; this.time = z.time; this.balance = z.balance; this.pos = z.pos; this.orders = z.orders;
    this.trades.length = z.trades; this.log.length = z.log; this.fees = z.fees; this.maxDrawdown = z.maxDrawdown; this._peakEq = z.peakEq;
    this._marginCalled = z.marginCalled; this._id = z.id;
    if (r && z.rules) { r.peak = z.rules.peak; r.dayStart = z.rules.dayStart; r.status = z.rules.status; r.reason = z.rules.reason;
                        r.dayLocked = z.rules.dayLocked; r._days = z.rules.days; r.dayCount = z.rules.dayCount; }
  };

  return {
    version: "1.2.0",
    instruments: Inst,
    createSession: function (opts) { return new Session(opts); },
    Session: Session,
    PropRules: PropRules,
    createDataLoader: createDataLoader,
    parseCSV: parseCSV, parseData: parseData, normaliseCandles: normaliseCandles,
    aggregate: aggregate, timeframeSeconds: timeframeSeconds,
    convert: convert, DEFAULT_FX: DEFAULT_FX
  };
});
