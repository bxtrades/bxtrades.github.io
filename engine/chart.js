/* BXTrades chart  (window.BXChart)
 *
 * The drawing side of the replay: a candlestick chart you can drag, zoom and
 * annotate. It knows nothing about trading. The engine (replay.js) stays pure
 * logic; the page hands this file candles and lines to show.
 *
 *   var chart = BXChart.create(canvas, { onTool: function (name) {} });
 *   chart.setFormat({ decimals: 2, tick: 0.25, pointSize: 1, pointName: "point" });
 *   chart.setData(candles, mode, seconds);  // [{t,o,h,l,c}], call again as candles are revealed
 *   chart.setMarkers([{ t, price, side: "buy" | "sell" }]);
 *   chart.setLines([{ price, label, kind: "entry" | "stop" | "target" }]);
 *   chart.setTool("cursor" | "line" | "hline" | "zone" | "measure" | "long" | "short" | "fib" | "erase");
 *   chart.undo(); chart.clearDrawings(); chart.removeSelected(); chart.resetView();
 *
 * Editing drawings (with the Move tool): click one to select it, drag it to move it, drag a round
 * grab point to reshape it, press Delete to remove it, Escape to let go.
 *
 * Mouse / touch
 *   drag the chart          move it (sideways and up/down)
 *   wheel or pinch          zoom in and out around the pointer
 *   drag the price scale    stretch or squash prices     (double-click it = back to auto)
 *   drag the time scale     stretch or squash time
 *   double-click the chart  reset the view
 */
(function (root) {
  "use strict";

  var BLUE = "#2f6fde";
  var fmtTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  var fmtDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
  var fmtFull = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function nice(x) {
    var p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function create(canvas, opts) {
    opts = opts || {};
    var g = canvas.getContext("2d");
    var st = { candles: [], lines: [], drawings: [], tool: "cursor", barW: 9, right: 0, autoY: true, y0: 0, y1: 1,
               hover: null, draft: null, sel: -1, markers: [], dt: 300, fmt: { decimals: 2, tick: 0.01, pointSize: 1, pointName: "point" } };
    var W = 0, H = 0, AX = 84, TX = 28, plotW = 0, plotH = 0, queued = false, fitted = false;
    var ptrs = {}, drag = null;

    /* ---------- coordinates ---------- */
    function xOf(i) { return plotW - (st.right - i + 0.5) * st.barW; }
    function iOf(x) { return st.right + 0.5 - (plotW - x) / st.barW; }
    function yOf(p) { return plotH - (p - st.y0) / (st.y1 - st.y0) * plotH; }
    function pOf(y) { return st.y0 + (plotH - y) / plotH * (st.y1 - st.y0); }
    /* Drawings are pinned to a TIME, not a candle number, so they stay put when the timeframe changes. */
    function tAt(i) {
      var c = st.candles, n = c.length;
      if (!n) return 0;
      if (i <= 0) return c[0].t + i * st.dt;
      if (i >= n - 1) return c[n - 1].t + (i - (n - 1)) * st.dt;
      var k = Math.floor(i);
      return c[k].t + (i - k) * (c[k + 1].t - c[k].t);
    }
    function iAt(t) {
      var c = st.candles, n = c.length;
      if (!n) return 0;
      if (t <= c[0].t) return (t - c[0].t) / st.dt;
      if (t >= c[n - 1].t) return n - 1 + (t - c[n - 1].t) / st.dt;
      var lo = 0, hi = n - 1;
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (c[m].t <= t) lo = m; else hi = m; }
      return lo + (t - c[lo].t) / (c[lo + 1].t - c[lo].t);
    }
    function xT(t) { return xOf(iAt(t)); }
    function price(v) { return v.toLocaleString("en-GB", { minimumFractionDigits: st.fmt.decimals, maximumFractionDigits: st.fmt.decimals }); }
    function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

    function measureSize() {
      var dpr = root.devicePixelRatio || 1;
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.font = "600 13px " + (css("--mono") || "monospace");
      var sample = st.candles.length ? st.candles[st.candles.length - 1].c : 0;
      AX = Math.max(72, Math.ceil(g.measureText(price(sample)).width) + 26);
      plotW = Math.max(50, W - AX); plotH = Math.max(50, H - TX);
    }
    function fit() {
      measureSize();
      var n = st.candles.length;
      st.barW = clamp(plotW / 70, 4, 16);
      st.right = n - 1 + 6;                    // a little empty space after the newest candle
      st.autoY = true; fitted = true;
    }
    function autoRange() {
      var a = Math.floor(iOf(0)) - 1, b = Math.ceil(iOf(plotW)) + 1, lo = Infinity, hi = -Infinity, k;
      for (k = Math.max(0, a); k <= Math.min(st.candles.length - 1, b); k++) { lo = Math.min(lo, st.candles[k].l); hi = Math.max(hi, st.candles[k].h); }
      if (lo === Infinity) st.candles.forEach(function (c) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); });
      if (lo === Infinity) { lo = 0; hi = 1; }
      st.lines.forEach(function (l) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); });
      var pad = (hi - lo) * 0.1 || st.fmt.tick * 10;
      st.y0 = lo - pad; st.y1 = hi + pad;
    }

    /* ---------- drawing ---------- */
    function pill(x, y, text, bg, fg, alignRight) {
      g.font = "600 12px " + css("--mono");
      var w = Math.ceil(g.measureText(text).width) + 12, h = 20, left = alignRight ? x - w : x;
      g.fillStyle = bg; g.beginPath();
      if (g.roundRect) g.roundRect(left, y - h / 2, w, h, 4); else g.rect(left, y - h / 2, w, h);
      g.fill();
      g.fillStyle = fg; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(text, left + 6, y + 0.5);
      return w;
    }
    function axisTag(p, bg, fg) {
      var y = yOf(p);
      if (y < -10 || y > plotH + 10) return;
      g.fillStyle = bg; g.beginPath();
      if (g.roundRect) g.roundRect(plotW + 1, y - 11, AX - 3, 22, 4); else g.rect(plotW + 1, y - 11, AX - 3, 22);
      g.fill();
      g.font = "600 13px " + css("--mono"); g.fillStyle = fg; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(price(p), plotW + 9, y + 0.5);
    }
    function hLine(p, colour, dash, width) {
      var y = Math.round(yOf(p)) + 0.5;
      g.strokeStyle = colour; g.lineWidth = width || 1; g.setLineDash(dash || []);
      g.beginPath(); g.moveTo(0, y); g.lineTo(plotW, y); g.stroke(); g.setLineDash([]);
    }
    function measureText(a, b) {
      var d = b.p - a.p, pts = d / st.fmt.pointSize, pct = a.p ? d / a.p * 100 : 0, bars = Math.round(Math.abs(iAt(b.t) - iAt(a.t)));
      var sign = d >= 0 ? "+" : "−";
      return sign + Math.abs(pts).toLocaleString("en-GB", { maximumFractionDigits: 2 }) + " " + st.fmt.pointName + "s  (" + sign + Math.abs(pct).toFixed(2) + "%)  ·  " + bars + " candle" + (bars === 1 ? "" : "s");
    }
    function drawOne(d, ghost) {
      var x1, y1, x2, y2;
      g.globalAlpha = ghost ? 0.7 : 1; g.lineWidth = 2; g.strokeStyle = BLUE; g.setLineDash([]);
      if (d.type === "hline") { hLine(d.a.p, BLUE, [], 2); g.globalAlpha = 1; return; }
      if (d.type === "long" || d.type === "short") { drawPosition(d, ghost); g.globalAlpha = 1; return; }
      if (d.type === "fib") { drawFib(d, ghost); g.globalAlpha = 1; return; }
      x1 = xT(d.a.t); y1 = yOf(d.a.p); x2 = xT(d.b.t); y2 = yOf(d.b.p);
      if (d.type === "line") {
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.fillStyle = BLUE; [[x1, y1], [x2, y2]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 3, 0, 6.3); g.fill(); });
      } else if (d.type === "zone") {
        g.fillStyle = "rgba(47,111,222,.14)"; g.fillRect(x1, y1, x2 - x1, y2 - y1);
        g.lineWidth = 1.5; g.strokeRect(x1, y1, x2 - x1, y2 - y1);
      } else if (d.type === "measure") {
        var up = d.b.p >= d.a.p, col = css(up ? "--green" : "--red");
        g.globalAlpha = (ghost ? 0.7 : 1) * 0.16; g.fillStyle = col; g.fillRect(x1, y1, x2 - x1, y2 - y1);
        g.globalAlpha = ghost ? 0.7 : 1; g.strokeStyle = col; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo((x1 + x2) / 2, y1); g.lineTo((x1 + x2) / 2, y2); g.stroke();
        var txt = measureText(d.a, d.b);
        g.font = "600 12px " + css("--mono");
        var w = g.measureText(txt).width + 12, cx = clamp((x1 + x2) / 2 - w / 2, 4, plotW - w - 4);
        pill(cx, clamp(up ? y2 - 14 : y2 + 14, 12, plotH - 12), txt, col, "#fff");
      }
      g.globalAlpha = 1;
    }
    function pts(diff) { return Math.abs(diff) / st.fmt.pointSize; }
    function ptsText(diff) {
      var n = pts(diff);
      return n.toLocaleString("en-GB", { maximumFractionDigits: st.fmt.pointName === "pip" ? 1 : 2 }) + " " + st.fmt.pointName + (n === 1 ? "" : "s");
    }
    /* Long / short position tool: entry line, green target box, red stop box, like TradingView. */
    function drawPosition(d, ghost) {
      var xl = xT(d.a.t), xr = Math.max(xT(d.b.t), xl + 12), ye = yOf(d.a.p), ys = yOf(d.s.p), yg = yOf(d.g.p);
      var green = css("--green"), red = css("--red"), ink = css("--ink"), a = ghost ? 0.7 : 1;
      g.globalAlpha = 0.2 * a; g.fillStyle = green; g.fillRect(xl, Math.min(ye, yg), xr - xl, Math.abs(yg - ye));
      g.fillStyle = red; g.fillRect(xl, Math.min(ye, ys), xr - xl, Math.abs(ys - ye));
      g.globalAlpha = a; g.lineWidth = 1; g.setLineDash([]);
      g.strokeStyle = green; g.strokeRect(xl + 0.5, Math.min(ye, yg) + 0.5, xr - xl - 1, Math.abs(yg - ye) - 1);
      g.strokeStyle = red; g.strokeRect(xl + 0.5, Math.min(ye, ys) + 0.5, xr - xl - 1, Math.abs(ys - ye) - 1);
      g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.moveTo(xl, ye); g.lineTo(xr, ye); g.stroke();
      var risk = Math.abs(d.a.p - d.s.p), reward = Math.abs(d.g.p - d.a.p), money = st.fmt.money;
      function pct(x) { return (x / d.a.p * 100).toFixed(2) + "%"; }
      function lab(text, y, bg) {
        g.font = "600 12px " + css("--mono");
        var w = g.measureText(text).width + 12, cx = clamp((xl + xr) / 2 - w / 2, 4, plotW - w - 4);
        pill(cx, clamp(y, 12, plotH - 12), text, bg, "#fff");
      }
      var away = function (y) { return y + (y < ye ? -13 : 13); };
      lab("Target  " + ptsText(reward) + " (" + pct(reward) + ")" + (money ? "  " + money(pts(reward)) : ""), away(yg), green);
      lab("Stop  " + ptsText(risk) + " (" + pct(risk) + ")" + (money ? "  " + money(-pts(risk)) : ""), away(ys), red);
      lab((d.type === "long" ? "Long" : "Short") + "  ·  R:R " + (risk ? (reward / risk).toFixed(2) : "–"), ye + (yg < ye ? 13 : -13), ink);
      g.globalAlpha = 1;
    }
    var FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1];
    function fibPrice(d, r) { return d.b.p + (d.a.p - d.b.p) * r; }
    /* Fib retracement from point A to point B. 0 sits at B, 1 at A, 0.5 is equilibrium (EQ):
       the half nearer the high is premium, the half nearer the low is discount. Lines run on to the right. */
    function drawFib(d, ghost) {
      var xa = xT(d.a.t), xb = xT(d.b.t), xl = Math.min(xa, xb), xr = plotW, a = ghost ? 0.7 : 1, muted = css("--muted"), ink = css("--ink");
      var hi = Math.max(d.a.p, d.b.p), lo = Math.min(d.a.p, d.b.p), eq = (hi + lo) / 2;
      g.globalAlpha = 0.07 * a;
      g.fillStyle = css("--red"); g.fillRect(xl, yOf(hi), xr - xl, yOf(eq) - yOf(hi));
      g.fillStyle = css("--green"); g.fillRect(xl, yOf(eq), xr - xl, yOf(lo) - yOf(eq));
      g.globalAlpha = 0.12 * a; g.fillStyle = BLUE;                                  // the 0.618 to 0.786 pocket (OTE)
      var o1 = yOf(fibPrice(d, 0.618)), o2 = yOf(fibPrice(d, 0.786));
      g.fillRect(xl, Math.min(o1, o2), xr - xl, Math.abs(o2 - o1));
      g.globalAlpha = a; g.font = "500 11px " + css("--mono"); g.textBaseline = "bottom"; g.textAlign = "left";
      FIB.forEach(function (r) {
        var p = fibPrice(d, r), y = Math.round(yOf(p)) + 0.5, isEq = r === 0.5, edge = r === 0 || r === 1;
        g.strokeStyle = isEq ? ink : edge ? BLUE : muted; g.lineWidth = isEq ? 2 : 1; g.setLineDash(isEq || edge ? [] : [4, 3]);
        g.beginPath(); g.moveTo(xl, y); g.lineTo(xr, y); g.stroke(); g.setLineDash([]);
        g.fillStyle = isEq ? ink : muted; g.font = (isEq ? "700 " : "500 ") + "11px " + css("--mono");
        g.fillText((isEq ? "0.5 EQ" : String(r)) + "  " + price(p), xl + 4, y - 2);
      });
      g.font = "600 11px " + css("--mono"); g.textAlign = "right"; g.fillStyle = css("--red");
      g.fillText("PREMIUM", xr - 6, Math.min(yOf(hi) + 16, yOf(eq) - 3));
      g.fillStyle = css("--green"); g.fillText("DISCOUNT", xr - 6, yOf(lo) - 3);
      g.textAlign = "left"; g.textBaseline = "middle";
      g.strokeStyle = BLUE; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(xa, yOf(d.a.p)); g.lineTo(xb, yOf(d.b.p)); g.stroke(); g.setLineDash([]);
    }
    function draw() {
      queued = false;
      measureSize();
      if (!fitted && st.candles.length) fit();
      if (st.autoY) autoRange();
      var ink = css("--ink"), muted = css("--muted"), rule = css("--rule"), card = css("--card"), paper = css("--paper"), green = css("--green"), red = css("--red");
      var mono = css("--mono"), n = st.candles.length, k;
      g.clearRect(0, 0, W, H);

      // grid + price labels on round numbers
      var step = Math.max(nice((st.y1 - st.y0) / Math.max(2, plotH / 52)), st.fmt.tick), labels = [];
      for (var v = Math.ceil(st.y0 / step) * step; v <= st.y1; v += step) {
        var gy = Math.round(yOf(v)) + 0.5;
        g.strokeStyle = rule; g.globalAlpha = 0.6; g.lineWidth = 1; g.beginPath(); g.moveTo(0, gy); g.lineTo(plotW, gy); g.stroke(); g.globalAlpha = 1;
        labels.push(v);
      }
      // time labels
      var every = Math.max(1, Math.ceil(84 / st.barW)), times = [], lastDay = null;
      for (k = Math.max(0, Math.ceil(iOf(0) / every) * every); k < n && xOf(k) <= plotW; k += every) {
        var dt = new Date(st.candles[k].t * 1000), day = fmtDay.format(dt), isNewDay = day !== lastDay;
        times.push({ x: xOf(k), text: isNewDay ? day + " " + fmtTime.format(dt) : fmtTime.format(dt), bold: isNewDay });
        lastDay = day;
        g.strokeStyle = rule; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(Math.round(xOf(k)) + 0.5, 0); g.lineTo(Math.round(xOf(k)) + 0.5, plotH); g.stroke(); g.globalAlpha = 1;
      }

      g.save(); g.beginPath(); g.rect(0, 0, plotW, plotH); g.clip();
      // candles
      var bw = Math.max(1, Math.floor(st.barW * 0.7));
      for (k = Math.max(0, Math.floor(iOf(0)) - 1); k < n && k <= Math.ceil(iOf(plotW)) + 1; k++) {
        var c = st.candles[k], x = Math.round(xOf(k)), up = c.c >= c.o;
        g.strokeStyle = g.fillStyle = up ? green : red; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 0.5, yOf(c.h)); g.lineTo(x + 0.5, yOf(c.l)); g.stroke();
        var top = yOf(Math.max(c.o, c.c)), hgt = Math.max(1, Math.abs(yOf(c.o) - yOf(c.c)));
        g.fillRect(x - Math.floor(bw / 2), top, bw, hgt);
      }
      st.drawings.forEach(function (d) { drawOne(d, false); });
      if (st.draft) drawOne(st.draft, true);
      if (st.drawings[st.sel]) handles(st.drawings[st.sel]).forEach(function (hd) {       // grab points on the selected drawing
        g.fillStyle = card; g.strokeStyle = BLUE; g.lineWidth = 2; g.setLineDash([]);
        g.beginPath(); g.arc(hd.x, hd.y, 6, 0, 6.3); g.fill(); g.stroke();
      });
      // where you got in and out: up arrow = bought, down arrow = sold
      st.markers.forEach(function (m) {
        var mx = xOf(Math.floor(iAt(m.t) + 1e-6)), my = yOf(m.price), u = m.side === "buy" ? 1 : -1;
        g.fillStyle = m.side === "buy" ? green : red; g.strokeStyle = card; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - 6, my + u * 11); g.lineTo(mx + 6, my + u * 11); g.closePath(); g.fill(); g.stroke();
      });
      // position / order lines, with a plain-English label on the left
      var colours = { entry: ink, stop: red, target: green, order: BLUE };
      st.lines.forEach(function (l) {
        var col = colours[l.kind] || ink;
        hLine(l.price, col, l.kind === "entry" ? [] : [6, 4], 1.5);
        if (l.label) pill(6, clamp(yOf(l.price), 12, plotH - 12), l.label, col, l.kind === "entry" ? paper : "#fff");
      });
      // last price line
      var last = n ? st.candles[n - 1] : null;
      if (last) hLine(last.c, last.c >= last.o ? green : red, [2, 3], 1);
      // crosshair
      var hv = st.hover;
      if (hv && hv.x <= plotW && hv.y <= plotH && !drag) {
        g.strokeStyle = muted; g.lineWidth = 1; g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(0, Math.round(hv.y) + 0.5); g.lineTo(plotW, Math.round(hv.y) + 0.5);
        g.moveTo(Math.round(hv.x) + 0.5, 0); g.lineTo(Math.round(hv.x) + 0.5, plotH); g.stroke(); g.setLineDash([]);
      }
      g.restore();

      // scales: solid panels so nothing shows through
      g.fillStyle = card; g.fillRect(plotW, 0, AX, H); g.fillRect(0, plotH, W, TX);
      g.strokeStyle = rule; g.lineWidth = 1; g.beginPath(); g.moveTo(plotW + 0.5, 0); g.lineTo(plotW + 0.5, plotH); g.moveTo(0, plotH + 0.5); g.lineTo(W, plotH + 0.5); g.stroke();
      g.font = "500 13px " + mono; g.fillStyle = ink; g.textAlign = "left"; g.textBaseline = "middle";
      // plain labels step aside for the coloured tags so numbers never sit on top of each other
      var taken = st.lines.map(function (l) { return yOf(l.price); });
      st.drawings.forEach(function (d) { if (d.type === "hline") taken.push(yOf(d.a.p)); });
      if (n) taken.push(yOf(st.candles[n - 1].c));
      if (st.hover && st.hover.x <= plotW && st.hover.y <= plotH && !drag) taken.push(st.hover.y);
      labels.forEach(function (p) {
        var y = yOf(p);
        if (y > 9 && y < plotH - 6 && !taken.some(function (t) { return Math.abs(t - y) < 19; })) g.fillText(price(p), plotW + 9, y + 0.5);
      });
      g.textAlign = "center";
      times.forEach(function (t) { if (t.x > 24 && t.x < plotW - 24) { g.font = (t.bold ? "600" : "500") + " 12px " + mono; g.fillStyle = t.bold ? ink : muted; g.fillText(t.text, t.x, plotH + TX / 2 + 1); } });
      g.textAlign = "left";

      // tags on the price scale: drawings, your levels, then the live price on top
      st.drawings.forEach(function (d) { if (d.type === "hline") axisTag(d.a.p, BLUE, "#fff"); });
      st.lines.forEach(function (l) { axisTag(l.price, colours[l.kind] || ink, l.kind === "entry" ? paper : "#fff"); });
      if (last) axisTag(last.c, last.c >= last.o ? green : red, "#fff");
      if (hv && hv.x <= plotW && hv.y <= plotH && !drag) {
        axisTag(snap(pOf(hv.y)), muted, paper);
        var hi = Math.round(iOf(hv.x));
        if (hi >= 0 && hi < n) {
          var label = fmtFull.format(new Date(st.candles[hi].t * 1000));
          g.font = "600 12px " + mono;
          var tw = g.measureText(label).width + 12;
          pill(clamp(hv.x - tw / 2, 2, plotW - tw - 2), plotH + TX / 2, label, muted, paper);
        }
      }
      if (!st.autoY) pill(plotW + 6, plotH + TX / 2, "Auto fit", ink, paper);   // click to hand the price scale back
    }
    function redraw() { if (!queued) { queued = true; (root.requestAnimationFrame || setTimeout)(draw, 16); } }

    /* ---------- pointer handling ---------- */
    function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function zone(p) { return p.x > plotW ? "price" : p.y > plotH ? "time" : "plot"; }
    function snap(v) { var t = st.fmt.tick; return +(Math.round(v / t) * t).toFixed(st.fmt.decimals + 2); }
    function point(p) { return { t: tAt(iOf(p.x)), p: snap(pOf(p.y)) }; }
    function limitRight() { st.right = clamp(st.right, 3, st.candles.length - 1 + plotW / st.barW - 3); }
    function zoomX(f, atX) {
      var a = iOf(atX);
      st.barW = clamp(st.barW * f, 2, 60);
      st.right = a - 0.5 + (plotW - atX) / st.barW;
      limitRight();
    }
    function segDist(p, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy, t = len ? clamp(((p.x - x1) * dx + (p.y - y1) * dy) / len, 0, 1) : 0;
      return Math.hypot(p.x - x1 - t * dx, p.y - y1 - t * dy);
    }
    function hit(p) {
      for (var k = st.drawings.length - 1; k >= 0; k--) {
        var d = st.drawings[k];
        if (d.type === "hline") { if (Math.abs(p.y - yOf(d.a.p)) < 9) return k; continue; }
        if (d.type === "long" || d.type === "short") {
          var lx = xT(d.a.t), rx = Math.max(xT(d.b.t), lx + 12), ty = Math.min(yOf(d.s.p), yOf(d.g.p)), by = Math.max(yOf(d.s.p), yOf(d.g.p));
          if (p.x >= lx - 6 && p.x <= rx + 6 && p.y >= ty - 6 && p.y <= by + 6) return k;
          continue;
        }
        if (d.type === "fib") {
          var fl = Math.min(xT(d.a.t), xT(d.b.t));
          if (segDist(p, xT(d.a.t), yOf(d.a.p), xT(d.b.t), yOf(d.b.p)) < 9) return k;
          if (p.x >= fl - 6 && FIB.some(function (r) { return Math.abs(p.y - yOf(fibPrice(d, r))) < 6; })) return k;
          continue;
        }
        var x1 = xT(d.a.t), y1 = yOf(d.a.p), x2 = xT(d.b.t), y2 = yOf(d.b.p);
        if (d.type === "line") { if (segDist(p, x1, y1, x2, y2) < 9) return k; }
        else if (p.x >= Math.min(x1, x2) - 6 && p.x <= Math.max(x1, x2) + 6 && p.y >= Math.min(y1, y2) - 6 && p.y <= Math.max(y1, y2) + 6) return k;
      }
      return -1;
    }
    /* The grab points of a drawing. Dragging one calls its set() with the new {t, p}. */
    function handles(d) {
      if (d.type === "hline") return [{ x: plotW / 2, y: yOf(d.a.p), set: function (q) { d.a.p = q.p; } }];
      if (d.type === "long" || d.type === "short") {
        var u = d.type === "long" ? 1 : -1, tk = st.fmt.tick, xl = xT(d.a.t);
        return [
          // entry: moves the entry price and the left edge, staying between stop and target
          { x: xl, y: yOf(d.a.p), set: function (q) {
              var lo = u > 0 ? d.s.p + tk : d.g.p + tk, hi = u > 0 ? d.g.p - tk : d.s.p - tk;
              var w = iAt(d.b.t) - iAt(d.a.t);
              d.a = { t: q.t, p: clamp(q.p, lo, hi) }; d.b = { t: tAt(iAt(q.t) + w), p: d.a.p };
            } },
          { x: xl, y: yOf(d.g.p), set: function (q) { d.g.p = u > 0 ? Math.max(q.p, d.a.p + tk) : Math.min(q.p, d.a.p - tk); } },
          { x: xl, y: yOf(d.s.p), set: function (q) { d.s.p = u > 0 ? Math.min(q.p, d.a.p - tk) : Math.max(q.p, d.a.p + tk); } },
          { x: xT(d.b.t), y: yOf(d.a.p), set: function (q) { d.b = { t: Math.max(q.t, tAt(iAt(d.a.t) + 2)), p: d.a.p }; } }
        ];
      }
      var out = [{ x: xT(d.a.t), y: yOf(d.a.p), set: function (q) { d.a = q; } },
                 { x: xT(d.b.t), y: yOf(d.b.p), set: function (q) { d.b = q; } }];
      if (d.type === "zone") out.push(
        { x: xT(d.a.t), y: yOf(d.b.p), set: function (q) { d.a = { t: q.t, p: d.a.p }; d.b = { t: d.b.t, p: q.p }; } },
        { x: xT(d.b.t), y: yOf(d.a.p), set: function (q) { d.b = { t: q.t, p: d.b.p }; d.a = { t: d.a.t, p: q.p }; } });
      return out;
    }
    function handleAt(p, reach) {
      var d = st.drawings[st.sel];
      if (!d) return null;
      return handles(d).filter(function (hd) { return Math.hypot(p.x - hd.x, p.y - hd.y) < reach; })[0] || null;
    }
    function setCursor(p) {
      var z = zone(p);
      var over = z === "plot" && st.tool === "cursor" && !drag ? (handleAt(p, 10) ? "pointer" : hit(p) >= 0 ? "move" : null) : null;
      canvas.style.cursor = z === "price" ? "ns-resize" : z === "time" ? "ew-resize" : over ? over : st.tool === "cursor" ? (drag ? "grabbing" : "grab") : st.tool === "erase" ? "pointer" : "crosshair";
    }
    function setTool(name, quiet) { st.tool = name; st.draft = null; if (!quiet && opts.onTool) opts.onTool(name); redraw(); }

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", function (e) {
      var p = local(e), ids;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      ptrs[e.pointerId] = p; ids = Object.keys(ptrs);
      if (ids.length === 2) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]];
        st.draft = null;
        drag = { mode: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y) || 1, barW: st.barW, x: (a.x + b.x) / 2 };
        return;
      }
      var z = zone(p);
      if (p.x > plotW && p.y > plotH) { st.autoY = true; redraw(); return; }   // the AUTO corner
      if (z === "price") { st.autoY = false; drag = { mode: "scaleY", y: p.y, y0: st.y0, y1: st.y1 }; }
      else if (z === "time") drag = { mode: "scaleX", x: p.x, barW: st.barW };
      else if (st.tool === "cursor") {
        // a drawing under the pointer is picked up; empty chart is dragged around
        var reach = e.pointerType === "touch" ? 18 : 10, hd = handleAt(p, reach), k2 = hd ? st.sel : hit(p);
        if (hd) drag = { mode: "handle", h: hd };
        else if (k2 >= 0) {
          st.sel = k2;
          drag = { mode: "moveDraw", i: iOf(p.x), p: pOf(p.y), orig: JSON.parse(JSON.stringify(st.drawings[k2])) };
        } else { st.sel = -1; drag = { mode: "pan", x: p.x, y: p.y, right: st.right, y0: st.y0, y1: st.y1 }; }
        if (opts.onSelect) opts.onSelect(st.sel >= 0);
      }
      else if (st.tool === "long" || st.tool === "short") {
        var q0 = point(p), u0 = st.tool === "long" ? 1 : -1;
        var risk0 = Math.max(snap((st.y1 - st.y0) * 0.06), st.fmt.tick * 4);
        st.drawings.push({ type: st.tool, a: q0, b: { t: tAt(iOf(p.x) + Math.max(8, Math.round(120 / st.barW))), p: q0.p },
                           s: { p: snap(q0.p - u0 * risk0) }, g: { p: snap(q0.p + u0 * 2 * risk0) } });
        st.sel = st.drawings.length - 1; setTool("cursor"); if (opts.onSelect) opts.onSelect(true);
      }
      else if (st.tool === "hline") { st.drawings.push({ type: "hline", a: point(p) }); st.sel = st.drawings.length - 1; setTool("cursor"); if (opts.onSelect) opts.onSelect(true); }
      else if (st.tool === "erase") { var k = hit(p); if (k >= 0) { st.drawings.splice(k, 1); st.sel = -1; } }
      else { drag = { mode: "draw", x: p.x, y: p.y }; st.draft = { type: st.tool, a: point(p), b: point(p) }; }
      setCursor(p); redraw();
    });
    canvas.addEventListener("pointermove", function (e) {
      var p = local(e);
      if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      st.hover = e.pointerType === "touch" && !drag ? null : p;
      if (drag) {
        if (drag.mode === "pinch") {
          var ids = Object.keys(ptrs);
          if (ids.length >= 2) {
            var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, old = st.barW;
            st.barW = drag.barW; zoomX(d / drag.d, drag.x);
            if (!isFinite(st.barW)) st.barW = old;
          }
        } else if (drag.mode === "pan") {
          st.right = drag.right - (p.x - drag.x) / st.barW; limitRight();
          if (st.autoY && Math.abs(p.y - drag.y) > 10) { st.autoY = false; drag.y = p.y; drag.y0 = st.y0; drag.y1 = st.y1; }
          if (!st.autoY) { var dp = (p.y - drag.y) / plotH * (drag.y1 - drag.y0); st.y0 = drag.y0 + dp; st.y1 = drag.y1 + dp; }
        } else if (drag.mode === "scaleY") {
          var f = Math.exp((p.y - drag.y) * 0.006), mid = (drag.y0 + drag.y1) / 2, half = (drag.y1 - drag.y0) / 2 * f;
          st.y0 = mid - half; st.y1 = mid + half;
        } else if (drag.mode === "scaleX") {
          st.barW = clamp(drag.barW * Math.exp((drag.x - p.x) * 0.006), 2, 60); limitRight();
        } else if (drag.mode === "draw" && st.draft) st.draft.b = point(p);
        else if (drag.mode === "handle") drag.h.set(point(p));
        else if (drag.mode === "moveDraw" && st.drawings[st.sel]) {
          var dsel = st.drawings[st.sel], di = iOf(p.x) - drag.i, dpr = pOf(p.y) - drag.p;
          ["a", "b", "s", "g"].forEach(function (key) {
            if (drag.orig[key]) dsel[key] = { t: drag.orig[key].t != null ? tAt(iAt(drag.orig[key].t) + di) : undefined, p: snap(drag.orig[key].p + dpr) };
          });
        }
      }
      setCursor(p); redraw();
    });
    function end(e) {
      delete ptrs[e.pointerId];
      if (drag && drag.mode === "draw" && st.draft) {
        var p = local(e);
        if (Math.hypot(p.x - drag.x, p.y - drag.y) > 5) { st.drawings.push(st.draft); st.sel = st.drawings.length - 1; st.draft = null; drag = null; setTool("cursor"); if (opts.onSelect) opts.onSelect(true); }
        st.draft = null;
      }
      if (!Object.keys(ptrs).length || (drag && drag.mode === "pinch")) drag = null;
      setCursor(local(e)); redraw();
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", function () { st.hover = null; redraw(); });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var p = local(e), px = e.deltaMode === 1 ? 30 : 1;
      if (zone(p) === "price") {
        st.autoY = false;
        var f = Math.exp(e.deltaY * px * 0.0015), mid = (st.y0 + st.y1) / 2, half = (st.y1 - st.y0) / 2 * f;
        st.y0 = mid - half; st.y1 = mid + half;
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        st.right += (e.shiftKey ? e.deltaY : e.deltaX) * px / st.barW; limitRight();
      } else zoomX(Math.exp(-e.deltaY * px * 0.0015), Math.min(p.x, plotW));
      redraw();
    }, { passive: false });
    canvas.addEventListener("dblclick", function (e) {
      if (zone(local(e)) === "price") st.autoY = true; else fit();
      redraw();
    });
    function removeSelected() {
      if (!st.drawings[st.sel]) return false;
      st.drawings.splice(st.sel, 1); st.sel = -1;
      if (opts.onSelect) opts.onSelect(false);
      redraw(); return true;
    }
    root.addEventListener("keydown", function (e) {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && removeSelected()) e.preventDefault();
      else if (e.key === "Escape" && (st.sel >= 0 || st.tool !== "cursor")) { st.sel = -1; setTool("cursor"); if (opts.onSelect) opts.onSelect(false); }
    });
    if (root.ResizeObserver) new ResizeObserver(redraw).observe(canvas);
    else root.addEventListener("resize", redraw);

    return {
      setFormat: function (f) { for (var k in f) st.fmt[k] = f[k]; redraw(); },
      /* mode: "reset"   a different chart: fit the view and wipe drawings
               "regroup" same replay shown in another timeframe: keep the same stretch of time on screen
               (none)    more candles of the same chart. The view follows new candles only while the
                         newest one is on screen, so you can scroll back without being yanked forward. */
      setData: function (candles, mode, interval) {
        var before = st.candles.length, oldDt = st.dt, tRight = before ? tAt(st.right) : null;
        st.candles = candles || [];
        if (interval > 0) st.dt = interval;
        else {
          var gaps = [], k;
          for (k = 1; k < st.candles.length; k++) gaps.push(st.candles[k].t - st.candles[k - 1].t);
          gaps.sort(function (x, y) { return x - y; });
          if (gaps.length) st.dt = gaps[Math.floor(gaps.length / 4)] || st.dt;    // the usual gap, ignoring breaks
        }
        if (mode === true || mode === "reset" || !fitted) { fitted = false; st.drawings = []; st.draft = null; st.sel = -1; }
        else if (mode === "regroup" && tRight != null) {
          st.barW = clamp(st.barW * st.dt / oldDt, 2, 60);
          st.right = iAt(tRight);
          limitRight();
        }
        else if (st.candles.length > before && st.right >= before - 1) st.right += st.candles.length - before;
        redraw();
      },
      setMarkers: function (m) { st.markers = m || []; redraw(); },
      setLines: function (lines) { st.lines = (lines || []).filter(function (l) { return l && isFinite(l.price); }); redraw(); },
      setTool: function (name) { setTool(name, true); },
      getTool: function () { return st.tool; },
      undo: function () { st.drawings.pop(); st.sel = -1; if (opts.onSelect) opts.onSelect(false); redraw(); },
      clearDrawings: function () { st.drawings = []; st.draft = null; st.sel = -1; if (opts.onSelect) opts.onSelect(false); redraw(); },
      removeSelected: removeSelected,
      selected: function () { var d = st.drawings[st.sel]; return d ? JSON.parse(JSON.stringify(d)) : null; },
      drawings: function () { return st.drawings.slice(); },
      resetView: function () { fit(); redraw(); },
      view: function () { return { barWidth: st.barW, right: st.right, autoPrice: st.autoY, low: st.y0, high: st.y1 }; },
      draw: draw
    };
  }

  root.BXChart = { create: create };
})(typeof self !== "undefined" ? self : this);
