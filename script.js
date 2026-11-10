/* =========================================================
   EDIT THIS PART TO UPDATE YOUR SITE
   Add new TikTok episodes to VIDEOS, and change the words in
   the scrolling strip with TICKER. The eval tracker is filled
   in by each visitor themselves, so there's nothing to edit.
   ========================================================= */

// Your "Trading Made Simple" videos. Paste each TikTok link into "link".
const VIDEOS = [
  { title: "Candlesticks",                  desc: "How to read a candle: open, close, wicks, and what each one tells you about buyers and sellers.", link: "https://www.tiktok.com/@bxtrades_/video/7695536751363853600" },
  { title: "How and why the market moves",  desc: "What actually pushes price up and down, explained in plain English.",                            link: "https://www.tiktok.com/@bxtrades_/video/7695926986182561057" },
  { title: "Timeframes",                    desc: "Daily, 4H, 1-minute: how zooming in and out changes what you see, and which one to trust.",       link: "https://www.tiktok.com/@bxtrades_/video/7696507411435113760" },
  { title: "Trends and ranges",             desc: "Is price trending or stuck in a range? How to tell the difference, and why it matters.",          link: "https://www.tiktok.com/@bxtrades_/video/7696940688981773600" },
  { title: "Support and resistance",        desc: "The floors and ceilings on a chart, and why price keeps reacting at the same levels.",            link: "https://www.tiktok.com/@bxtrades_/video/7697252144562326816" },
  { title: "Liquidity",                     desc: "Where the stop losses sit, and why price loves to hunt them before making its real move.",        link: "https://www.tiktok.com/@bxtrades_/video/7697676474819677472" },
  { title: "Break of structure",            desc: "When price breaks a key high or low, and how it signals the trend is continuing or changing.",    link: "https://www.tiktok.com/@bxtrades_/video/7698082653949414688" },
  { title: "Fair value gaps",               desc: "The gaps a fast move leaves behind, and why price often comes back to fill them.",                link: "https://www.tiktok.com/@bxtrades_/video/7699208707934145824" },
  { title: "Trading sessions",              desc: "Asia, London, New York: when each session runs and why the time of day changes how price moves.", link: "https://www.tiktok.com/@bxtrades_/video/7700027724538055958" }
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

// =========================================================
// EVAL TRACKER: each visitor's own account, trades and rules.
// Saved in their browser only (localStorage).
// =========================================================
const TKEY = "bxt-eval-tracker-v1";
const DEFAULT_TRACKER = {
  account: { start: 50000, target: 3000, maxLoss: 2000 },
  rules: [],
  trades: []
};
let T, firstVisit = true;
try { const raw = localStorage.getItem(TKEY); firstVisit = !raw; T = JSON.parse(raw) || null; } catch (e) { T = null; }
if (!T || !T.account || !Array.isArray(T.trades)) T = JSON.parse(JSON.stringify(DEFAULT_TRACKER));
if (!Array.isArray(T.rules)) T.rules = [];
const saveT = () => { try { localStorage.setItem(TKEY, JSON.stringify(T)); } catch (e) {} };

const $ = id => document.getElementById(id);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const flash = (id, text, ok = true) => {
  const el = $(id); el.textContent = text; el.style.color = ok ? "var(--green)" : "var(--red)";
  setTimeout(() => { el.textContent = ""; }, 2500);
};

// Fill the settings form
function fillSetup() {
  $("acc-start").value = T.account.start;
  $("acc-target").value = T.account.target;
  $("acc-maxloss").value = T.account.maxLoss;
  $("acc-rules").value = T.rules.join("\n");
}
$("acc-save").addEventListener("click", () => {
  const start = parseFloat($("acc-start").value), target = parseFloat($("acc-target").value), maxLoss = parseFloat($("acc-maxloss").value);
  if (!(start > 0) || !(target > 0) || !(maxLoss > 0)) { flash("acc-msg", "Enter numbers above 0 for all three.", false); return; }
  T.account = { start, target, maxLoss };
  T.rules = $("acc-rules").value.split("\n").map(r => r.trim()).filter(Boolean);
  saveT(); renderTracker(); flash("acc-msg", "Saved.");
});
// First visit: open the settings so people set up their own account
if (firstVisit) $("setup").open = true;

// Add a trade
$("t-date").value = new Date().toISOString().slice(0, 10);
$("t-add").addEventListener("click", () => {
  const result = parseFloat($("t-result").value);
  if (!isFinite(result)) { flash("t-msg", "Enter the result in dollars.", false); $("t-result").focus(); return; }
  T.trades.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: $("t-date").value || new Date().toISOString().slice(0, 10),
    market: $("t-market").value.trim() || "–",
    side: $("t-side").value,
    result,
    note: $("t-note").value.trim()
  });
  saveT();
  $("t-result").value = ""; $("t-note").value = "";
  renderTracker(); flash("t-msg", "Trade added.");
});
// Delete one trade
$("trades").addEventListener("click", e => {
  const b = e.target.closest(".del-btn"); if (!b) return;
  if (!confirm("Delete this trade?")) return;
  T.trades = T.trades.filter(t => t.id !== b.dataset.id); saveT(); renderTracker();
});
// Clear everything
$("t-clear").addEventListener("click", () => {
  if (!T.trades.length) return;
  if (!confirm("Delete ALL your trades? This can't be undone.")) return;
  T.trades = []; saveT(); renderTracker();
});

function renderTracker() {
  const A = T.account;
  const trades = [...T.trades].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  // Rules
  $("rules").innerHTML = T.rules.length
    ? T.rules.map(r => `<li>${esc(r)}</li>`).join("")
    : `<li class="small" style="list-style:none">No rules yet. Open "⚙ Your account &amp; rules" above to add your own.</li>`;

  // Stats
  const pnl = trades.reduce((sum, t) => sum + t.result, 0);
  const wins = trades.filter(t => t.result > 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) + "%" : "–";
  const progress = Math.max(0, Math.min(100, Math.round((pnl / A.target) * 100)));
  $("stats").innerHTML = [
    ["BALANCE", money(A.start + pnl), ""],
    ["TOTAL P&L", money(pnl), pnl >= 0 ? "green" : "red"],
    ["WIN RATE", winRate, ""],
    ["TO TARGET", progress + "%", "green"]
  ].map(([label, value, cls]) => `
    <div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`).join("");
  $("target-label").textContent = `TARGET ${money(A.start + A.target)} · FAIL LEVEL ${money(A.start - A.maxLoss)}`;

  // Table (newest first)
  $("trades").innerHTML = trades.length ? [...trades].reverse().map(t => `
    <tr>
      <td class="mono">${esc(t.date)}</td>
      <td>${esc(t.market)}</td>
      <td>${esc(t.side)}</td>
      <td class="res ${t.result >= 0 ? "green" : "red"}">${t.result >= 0 ? "+" : ""}${money(t.result)}</td>
      <td>${esc(t.note)}</td>
      <td><button class="del-btn" data-id="${esc(t.id)}">Delete</button></td>
    </tr>`).join("")
    : `<tr class="empty-row"><td colspan="6">No trades yet. Log your first trade above and your stats and chart will build themselves.</td></tr>`;

  // Equity curve
  const svg = $("equity");
  const W = 800, H = 260, pad = 20;
  const points = [A.start];
  trades.forEach(t => points.push(points[points.length - 1] + t.result));
  const goal = A.start + A.target, floor = A.start - A.maxLoss;
  const hi = Math.max(goal, ...points), lo = Math.min(floor, ...points);
  const x = i => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;
  svg.innerHTML = `
    <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#22c55e" stop-opacity=".35"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="#22c55e" stroke-dasharray="6 6" opacity=".6"/>
    <line x1="${pad}" x2="${W - pad}" y1="${y(floor)}" y2="${y(floor)}" stroke="#ef4444" stroke-dasharray="6 6" opacity=".6"/>
    <line x1="${pad}" x2="${W - pad}" y1="${y(A.start)}" y2="${y(A.start)}" stroke="#8b98a5" opacity=".25"/>
    ${points.length > 1 ? `<path d="${area}" fill="url(#fill)"/>
    <path d="${line}" fill="none" stroke="#22c55e" stroke-width="3" vector-effect="non-scaling-stroke"/>` : ""}
    ${points.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#0b0e11" stroke="#22c55e" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join("")}`;
}

fillSetup();
renderTracker();

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
