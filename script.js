/* =========================================================
   EDIT THIS PART TO UPDATE YOUR SITE
   You only need to change the lists below. The rest of the
   file draws everything automatically.
   ========================================================= */

// Your paper account starting balance and eval profit target
const ACCOUNT = {
  start: 50000,
  target: 3000,      // profit needed to "pass" (change to your firm's rule)
  maxLoss: 2000      // trailing / max drawdown limit
};

// Set to false once the trades below are your real logged trades
const SHOWING_EXAMPLE_TRADES = true;

// Add one line per trade, newest at the bottom.
// result = profit or loss in dollars (use a minus sign for losses)
const TRADES = [
  { date: "2026-10-01", market: "NQ", side: "Long",  result:  420, note: "Equilibrium retest at open" },
  { date: "2026-10-02", market: "NQ", side: "Short", result: -250, note: "Entered early, no confirmation" },
  { date: "2026-10-06", market: "ES", side: "Long",  result:  310, note: "Followed the plan" },
  { date: "2026-10-08", market: "NQ", side: "Short", result:  180, note: "Took partials at 1R" },
  { date: "2026-10-13", market: "NQ", side: "Long",  result: -300, note: "Revenge trade, broke a rule" },
  { date: "2026-10-15", market: "ES", side: "Short", result:  520, note: "Liquidity sweep, clean entry" },
  { date: "2026-10-20", market: "NQ", side: "Long",  result:  260, note: "One and done" }
];

// Your "Trading Made Simple" videos. Paste each TikTok link into "link".
const VIDEOS = [
  { title: "Equilibrium",       desc: "What the middle of a range tells you, and why price keeps coming back to it.", link: "https://www.tiktok.com/@bxtrades_" },
  { title: "Liquidity",         desc: "Where the stop losses sit, and why price loves to hunt them first.",             link: "https://www.tiktok.com/@bxtrades_" },
  { title: "Market Structure",  desc: "Higher highs, lower lows: reading the trend in 60 seconds.",                     link: "https://www.tiktok.com/@bxtrades_" }
];

// Your personal trading rules
const RULES = [
  "Max 2 trades per day",
  "Risk the same amount on every trade",
  "Stop for the day after 2 losses",
  "No trading during major news releases",
  "Every trade gets logged, no exceptions"
];

// Words that scroll along the top strip
const TICKER = ["NQ", "ES", "PAPER ACCOUNT: $50K", "TRADING MADE SIMPLE", "CANDLE CLASH DAILY", "DISCIPLINE > PREDICTION", "@BXTRADES_"];


/* =========================================================
   YOU DON'T NEED TO EDIT BELOW HERE
   ========================================================= */

const money = n => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();

// --- Ticker strip (doubled so the loop is seamless) ---
document.getElementById("ticker").innerHTML =
  [...TICKER, ...TICKER].map((t, i) => `<span class="${i % 3 === 0 ? "green" : ""}">${t}</span>`).join("");

// --- Videos ---
document.getElementById("videos").innerHTML = VIDEOS.map((v, i) => `
  <a class="video" href="${v.link}" target="_blank" rel="noopener">
    <span class="ep">EP ${String(i + 1).padStart(2, "0")}</span>
    <h4>${v.title}</h4>
    <p>${v.desc}</p>
    <span class="watch green">▶ Watch</span>
  </a>`).join("");

// --- Rules ---
document.getElementById("rules").innerHTML = RULES.map(r => `<li>${r}</li>`).join("");

// --- Journal stats ---
const pnl = TRADES.reduce((sum, t) => sum + t.result, 0);
const wins = TRADES.filter(t => t.result > 0).length;
const winRate = TRADES.length ? Math.round((wins / TRADES.length) * 100) : 0;
const progress = Math.max(0, Math.min(100, Math.round((pnl / ACCOUNT.target) * 100)));

document.getElementById("stats").innerHTML = [
  ["BALANCE", money(ACCOUNT.start + pnl), ""],
  ["TOTAL P&L", money(pnl), pnl >= 0 ? "green" : "red"],
  ["WIN RATE", winRate + "%", ""],
  ["TO TARGET", progress + "%", "green"]
].map(([label, value, cls]) => `
  <div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`).join("");

document.getElementById("target-label").textContent =
  `TARGET ${money(ACCOUNT.start + ACCOUNT.target)}` + (SHOWING_EXAMPLE_TRADES ? " · EXAMPLE DATA" : "");

// --- Trades table (newest first) ---
document.getElementById("trades").innerHTML = [...TRADES].reverse().map(t => `
  <tr>
    <td class="mono">${t.date}</td>
    <td>${t.market}</td>
    <td>${t.side}</td>
    <td class="res ${t.result >= 0 ? "green" : "red"}">${t.result >= 0 ? "+" : ""}${money(t.result)}</td>
    <td>${t.note}</td>
  </tr>`).join("");

// --- Equity curve chart ---
(function drawEquity() {
  const svg = document.getElementById("equity");
  const W = 800, H = 260, pad = 20;
  const points = [ACCOUNT.start];
  TRADES.forEach(t => points.push(points[points.length - 1] + t.result));

  const goal = ACCOUNT.start + ACCOUNT.target;
  const floor = ACCOUNT.start - ACCOUNT.maxLoss;
  const hi = Math.max(goal, ...points), lo = Math.min(floor, ...points);
  const x = i => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);

  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;

  svg.innerHTML = `
    <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#22c55e" stop-opacity=".35"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="#22c55e" stroke-dasharray="6 6" opacity=".6"/>
    <line x1="${pad}" x2="${W - pad}" y1="${y(floor)}" y2="${y(floor)}" stroke="#ef4444" stroke-dasharray="6 6" opacity=".6"/>
    <line x1="${pad}" x2="${W - pad}" y1="${y(ACCOUNT.start)}" y2="${y(ACCOUNT.start)}" stroke="#8b98a5" opacity=".25"/>
    <path d="${area}" fill="url(#fill)"/>
    <path d="${line}" fill="none" stroke="#22c55e" stroke-width="3" vector-effect="non-scaling-stroke"/>
    ${points.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#0b0e11" stroke="#22c55e" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join("")}`;
})();

// --- Candle Clash vote buttons ---
function vote(side) {
  document.querySelectorAll(".vote button").forEach(b => b.classList.remove("picked"));
  document.querySelector(".vote ." + side).classList.add("picked");
  document.getElementById("vote-msg").innerHTML = side === "up"
    ? '<span class="green">▲ Bullish.</span> Lock it in on the Discord before the open.'
    : '<span class="red">▼ Bearish.</span> Lock it in on the Discord before the open.';
}

// --- Animated candlesticks in the hero background ---
(function candles() {
  const c = document.getElementById("candles");
  const ctx = c.getContext("2d");
  let bars = [], price = 100;

  function newBar() {
    const open = price;
    const close = open + (Math.random() - 0.48) * 6;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;
    price = close;
    return { open, close, high, low };
  }

  function resize() {
    c.width = c.offsetWidth * devicePixelRatio;
    c.height = c.offsetHeight * devicePixelRatio;
    const count = Math.ceil(c.offsetWidth / 18) + 1;
    while (bars.length < count) bars.push(newBar());
    draw();
  }

  function draw() {
    const w = c.width, h = c.height, step = 18 * devicePixelRatio;
    const shown = bars.slice(-Math.ceil(w / step));
    const hi = Math.max(...shown.map(b => b.high)), lo = Math.min(...shown.map(b => b.low));
    const y = v => h * 0.1 + (1 - (v - lo) / (hi - lo || 1)) * h * 0.8;
    ctx.clearRect(0, 0, w, h);
    shown.forEach((b, i) => {
      const cx = i * step + step / 2;
      ctx.strokeStyle = ctx.fillStyle = b.close >= b.open ? "#22c55e" : "#ef4444";
      ctx.lineWidth = devicePixelRatio;
      ctx.beginPath(); ctx.moveTo(cx, y(b.high)); ctx.lineTo(cx, y(b.low)); ctx.stroke();
      const top = y(Math.max(b.open, b.close)), bottom = y(Math.min(b.open, b.close));
      ctx.fillRect(cx - step * 0.3, top, step * 0.6, Math.max(1, bottom - top));
    });
  }

  window.addEventListener("resize", resize);
  resize();
  setInterval(() => { bars.push(newBar()); if (bars.length > 400) bars.shift(); draw(); }, 900);
})();

// --- Footer year + close mobile menu after tapping a link ---
document.getElementById("year").textContent = new Date().getFullYear();
document.querySelectorAll(".links a").forEach(a => a.addEventListener("click", () => document.body.classList.remove("menu-open")));
