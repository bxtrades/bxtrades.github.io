/* =========================================================
   EDIT THIS PART TO UPDATE YOUR SITE
   Add new TikTok episodes to VIDEOS and new backtests to BACKTESTS.
   The newest video and backtest show first. The eval tracker is filled
   in by each visitor themselves, so there's nothing to edit.
   ========================================================= */

// Your "Trading Made Simple" videos. Paste each TikTok link into "link".
// Optional: add  thumb: "images/videos/candlesticks.jpg"  to show the video's cover image.
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

// Your backtests. Add a new one by copying a line and changing it.
// Put the image in the "images" folder on GitHub first (.jpg, .png or .webp all work).
const BACKTESTS = [
  { date: "Wed 3 June 2026", market: "NAS100", side: "Long", result: "Loss", img: "images/backtest-2026-06-03.webp",
    note: "Swept liquidity and the 3m bearish gap inversed, so I went long on the 1m retest targeting the engineered liquidity above. Lesson: not enough confluences aligned." },
  { date: "Wed 20 May 2026", market: "NAS100", side: "Long", result: "Win · 2.29R", img: "images/backtest-2026-05-20.webp",
    note: "Bullish SMT divergence with ES, then price swept out liquidity. AMD play: entered on the 1m retest and rejection, targeting the strong highs." },
  { date: "Wed 29 April 2026", market: "NAS100", side: "Long", result: "Win", img: "images/backtest-2026-04-29.webp",
    note: "5m bearish gap inversed, 3m inversed again, then entered on the 1m bullish retest. Draw on liquidity, targeting the London high." }
];

/* =========================================================
   YOU DON'T NEED TO EDIT BELOW HERE
   ========================================================= */

const money = n => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
async function copyText(text, btn, label) {
  try { await navigator.clipboard.writeText(text); btn.textContent = "Copied ✓"; }
  catch (e) { prompt("Copy this link:", text); }
  setTimeout(() => { btn.textContent = label; }, 2000);
}

// --- Videos (newest first, only 3 shown until "Show all") ---
const videoList = document.getElementById("videos");
if (videoList) {
  videoList.innerHTML = VIDEOS.map((v, i) => ({ v, n: i + 1 })).reverse().map(({ v, n }, k) => `
  <li${k >= 3 ? ' class="extra" hidden' : ""}><a href="${v.link}" target="_blank" rel="noopener">
    <span class="poster" aria-hidden="true">${v.thumb ? `<img src="${v.thumb}" alt="" loading="lazy" decoding="async">` : String(n).padStart(2, "0")}</span>
    <h4>${v.title}</h4>
    <p>${v.desc}</p>
    <span class="watch">Watch →</span>
  </a></li>`).join("");
  const more = document.getElementById("show-videos");
  if (more && VIDEOS.length > 3) {
    more.hidden = false;
    more.textContent = `Show all ${VIDEOS.length} videos`;
    more.addEventListener("click", () => {
      const open = more.dataset.open === "1";
      videoList.querySelectorAll(".extra").forEach(li => li.hidden = open);
      more.dataset.open = open ? "" : "1";
      more.textContent = open ? `Show all ${VIDEOS.length} videos` : "Show fewer";
    });
  }
}

// --- Backtests: stats, filters, show more, full-size view with share links ---
const btList = document.getElementById("backtest-list");
if (btList) {
  const isWin = b => /win/i.test(b.result);
  const btId = b => "bt-" + (b.img.match(/(\d{4}-\d{2}-\d{2})/) || [, b.date.replace(/\W+/g, "-").toLowerCase()])[1];
  const rs = BACKTESTS.map(b => parseFloat((b.result.match(/(-?\d+(?:\.\d+)?)\s*R/i) || [])[1])).filter(isFinite);
  const wins = BACKTESTS.filter(isWin).length;
  const avgR = rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) + "R" : "–";
  document.getElementById("bt-stats").innerHTML = [
    ["Backtests logged", BACKTESTS.length],
    ["Win rate", BACKTESTS.length ? Math.round(wins / BACKTESTS.length * 100) + "%" : "–"],
    ["Average R", avgR + (rs.length && rs.length < BACKTESTS.length ? ` <small>(${rs.length} of ${BACKTESTS.length} recorded)</small>` : "")],
    ["Latest", BACKTESTS.length ? BACKTESTS[0].date.replace(/^\w+ /, "") : "–"]
  ].map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join("");

  const PAGE = 4;
  let filter = "all", shown = PAGE;
  const moreBtn = document.getElementById("bt-more");
  function renderBacktests() {
    const list = BACKTESTS.map((b, i) => ({ b, i })).filter(({ b }) => filter === "all" || (filter === "win") === isWin(b));
    btList.innerHTML = list.slice(0, shown).map(({ b, i }) => `
      <button class="bt" type="button" data-i="${i}" id="${btId(b)}">
        <img src="${b.img}" alt="Annotated backtest, ${b.market}, ${b.date}" loading="lazy" decoding="async">
        <span class="bt-meta"><span class="mono">${b.date} · ${b.market} · ${b.side}</span><span class="bt-res ${isWin(b) ? "green" : "red"}">${b.result}</span></span>
        <span class="bt-note">${b.note}</span>
      </button>`).join("") || `<p class="small">No ${filter === "win" ? "wins" : "losses"} logged yet.</p>`;
    moreBtn.hidden = list.length <= shown;
    moreBtn.textContent = `Show more backtests (${list.length - shown} more)`;
  }
  document.querySelectorAll(".bt-tools .chip-btn").forEach(btn => btn.addEventListener("click", () => {
    filter = btn.dataset.filter; shown = PAGE;
    document.querySelectorAll(".bt-tools .chip-btn").forEach(x => x.setAttribute("aria-pressed", x === btn));
    renderBacktests();
  }));
  moreBtn.addEventListener("click", () => { shown += PAGE; renderBacktests(); });
  renderBacktests();

  const lb = document.getElementById("lightbox");
  function openBacktest(i) {
    const b = BACKTESTS[i], url = location.origin + location.pathname + "#" + btId(b);
    document.getElementById("lb-img").src = b.img;
    document.getElementById("lb-img").alt = `Annotated backtest, ${b.market}, ${b.date}`;
    document.getElementById("lb-cap").textContent = `${b.date} · ${b.market} · ${b.side} · ${b.result}. ${b.note}`;
    const text = `My ${b.market} backtest from ${b.date} (${b.result}) on BXTrades: ${url}`;
    document.getElementById("lb-wa").href = "https://wa.me/?text=" + encodeURIComponent(text);
    const copy = document.getElementById("lb-copy");
    copy.onclick = () => copyText(url, copy, "Copy link");
    const share = document.getElementById("lb-share");
    if (navigator.share) { share.hidden = false; share.onclick = () => navigator.share({ title: "BXTrades backtest", text: `${b.market} backtest, ${b.date}`, url }).catch(() => {}); }
    lb.showModal();
  }
  btList.addEventListener("click", e => { const card = e.target.closest(".bt"); if (card) openBacktest(+card.dataset.i); });
  lb.addEventListener("click", e => { if (e.target.id === "lightbox") lb.close(); });
  // Opened from a shared link like bxtrades.com/#bt-2026-05-20
  function openFromHash() {
    const hit = BACKTESTS.findIndex(b => "#" + btId(b) === location.hash);
    if (hit > -1) { shown = Math.max(shown, hit + 1); renderBacktests(); setTimeout(() => openBacktest(hit), 300); }
  }
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
}

// --- Copy discount code ---
const copyBtn = document.getElementById("copy-code");
if (copyBtn) copyBtn.addEventListener("click", async () => {
  const msg = document.getElementById("copy-msg");
  try { await navigator.clipboard.writeText("BXTRADES"); msg.textContent = "Copied ✓"; }
  catch (e) { msg.textContent = "Code: BXTRADES"; }
  setTimeout(() => { msg.textContent = "Tap to copy"; }, 2500);
});

// --- Discord: live member and online count ---
const dcBox = document.getElementById("dc-count");
if (dcBox) {
  fetch("https://discord.com/api/v9/invites/6UCdDEGptX?with_counts=true")
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => {
      if (!d.approximate_member_count) return;
      document.getElementById("dc-members").textContent = d.approximate_member_count.toLocaleString();
      document.getElementById("dc-online").textContent = (d.approximate_presence_count || 0).toLocaleString();
      dcBox.hidden = false;
    }).catch(() => {});
}

if (document.getElementById("t-add")) {
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
  $("acc-daily").value = T.account.daily || "";
  $("acc-rules").value = T.rules.join("\n");
}
$("acc-save").addEventListener("click", () => {
  const start = parseFloat($("acc-start").value), target = parseFloat($("acc-target").value), maxLoss = parseFloat($("acc-maxloss").value);
  if (!(start > 0) || !(target > 0) || !(maxLoss > 0)) { flash("acc-msg", "Enter numbers above 0 for all three.", false); return; }
  const daily = parseFloat($("acc-daily").value);
  T.account = { start, target, maxLoss, daily: daily > 0 ? daily : 0 };
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
// Backup: download all trades + settings as a file, and restore from one
$("t-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(T, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bxtrades-eval-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flash("backup-msg", "Backup downloaded.");
});
$("t-import-btn").addEventListener("click", () => $("t-import").click());
$("t-import").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !data.account || !Array.isArray(data.trades)) throw new Error("bad");
      if (!confirm(`Replace what's here with the backup (${data.trades.length} trades)?`)) return;
      T = data; if (!Array.isArray(T.rules)) T.rules = [];
      saveT(); fillSetup(); renderTracker(); flash("backup-msg", "Backup restored.");
    } catch (err) { flash("backup-msg", "That file isn't a BXTrades backup.", false); }
    e.target.value = "";
  };
  reader.readAsText(file);
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
    : `<li class="small" style="list-style:none">No rules yet. Open "Your account &amp; rules" above to add your own.</li>`;

  // Stats
  const pnl = trades.reduce((sum, t) => sum + t.result, 0);
  const wins = trades.filter(t => t.result > 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) + "%" : "–";
  const progress = Math.max(0, Math.min(100, Math.round((pnl / A.target) * 100)));
  $("stats").innerHTML = [
    ["BALANCE", money(A.start + pnl), ""],
    ["TOTAL P&L", money(pnl), pnl >= 0 ? "green" : "red"],
    ["WIN RATE", winRate, ""],
    ["TO TARGET", progress + "%", "gold"]
  ].map(([label, value, cls]) => `
    <div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`).join("");
  // Daily loss limit warning (like a real prop firm)
  const today = new Date().toLocaleDateString("en-CA");
  const todayPnl = trades.filter(t => t.date === today).reduce((s, t) => s + t.result, 0);
  const alertEl = $("daily-alert"), D = A.daily || 0;
  alertEl.hidden = true; alertEl.className = "alert";
  if (D > 0 && todayPnl <= -D) {
    alertEl.hidden = false; alertEl.classList.add("bad");
    alertEl.textContent = `Daily loss limit hit: ${money(todayPnl)} today (limit ${money(D)}). In a real evaluation you'd be done for the day. Step away.`;
  } else if (D > 0 && todayPnl <= -0.75 * D) {
    alertEl.hidden = false; alertEl.classList.add("warn");
    alertEl.textContent = `Careful: ${money(todayPnl)} today, ${money(D + todayPnl)} left before your daily limit.`;
  }
  if (A.start + pnl <= A.start - A.maxLoss) {
    alertEl.hidden = false; alertEl.className = "alert bad";
    alertEl.textContent = `Max drawdown reached. On a real evaluation this account would have failed. Reset your settings to start a new attempt.`;
  }

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
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const INK = css("--ink"), CARD = css("--card"), GREEN = css("--green"), RED = css("--red"), MUTED = css("--muted");
  svg.innerHTML = `
    <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}" stop-opacity=".08"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="${GREEN}" stroke-dasharray="6 6" opacity=".6"/>
    <line x1="${pad}" x2="${W - pad}" y1="${y(floor)}" y2="${y(floor)}" stroke="${RED}" stroke-dasharray="6 6" opacity=".6"/>
    <line x1="${pad}" x2="${W - pad}" y1="${y(A.start)}" y2="${y(A.start)}" stroke="${MUTED}" opacity=".35"/>
    ${points.length > 1 ? `<path d="${area}" fill="url(#fill)"/>
    <path d="${line}" fill="none" stroke="${INK}" stroke-width="2" vector-effect="non-scaling-stroke"/>` : ""}
    ${points.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${CARD}" stroke="${INK}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join("")}`;
}

fillSetup();
renderTracker();
window.addEventListener("themechange", renderTracker);
}

// --- Candle Clash: countdown to lock-in, remembers your pick, tracks your streak ---
function nyParts(date) {
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
    .formatToParts(date).forEach(x => p[x.type] = x.value);
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: p.weekday };
}
function nyTime(y, m, d, h, mi) {   // the moment it is y-m-d h:mi in New York
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let k = 0; k < 2; k++) { const p = nyParts(new Date(guess)); guess += Date.UTC(y, m - 1, d, h, mi) - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi); }
  return new Date(guess);
}
const isWeekday = wd => !["Sat", "Sun"].includes(wd);
const dayKey = p => `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
function clashRound(now) {
  const p = nyParts(now), mins = p.h * 60 + p.mi;
  if (isWeekday(p.wd) && mins >= 570 && mins < 960) return { locked: true, key: dayKey(p), close: nyTime(p.y, p.m, p.d, 16, 0) };
  for (let k = 0; k < 8; k++) {   // next weekday 9:30am New York
    const q = nyParts(new Date(now.getTime() + k * 864e5));
    const open = nyTime(q.y, q.m, q.d, 9, 30);
    if (isWeekday(q.wd) && open > now) return { locked: false, key: dayKey(q), lock: open };
  }
}
const CKEY = "bxt-candle-clash";
let clashPicks = store.get(CKEY, {});
const fmtLeft = ms => { const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + "h " : "") + m + "m " + String(s).padStart(2, "0") + "s"; };
const fmtClock = d => new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(d);
function showPick(side, locked) {
  document.querySelectorAll(".vote button").forEach(b => { b.classList.toggle("picked", b.classList.contains(side)); b.disabled = !!locked; });
  const msg = document.getElementById("vote-msg");
  if (!side) { msg.textContent = locked ? "Today's round is locked. Come back after the close for the next one." : "Pick a side here, then post it in the Discord."; return; }
  msg.innerHTML = (side === "up" ? '<span class="green">▲ You picked UP.</span> ' : '<span class="red">▼ You picked DOWN.</span> ') +
    (locked ? "Locked in. Results at the New York close." : 'Now <a href="https://discord.gg/6UCdDEGptX" target="_blank" rel="noopener">post it in the Discord</a> before the open.');
}
function streakText() {
  let n = 0, t = new Date();
  const r = clashRound(t); let p = nyParts(t);
  // count back through weekdays from the current round
  for (let k = 0; k < 400; k++) {
    const q = nyParts(new Date(t.getTime() - k * 864e5));
    if (!isWeekday(q.wd)) continue;
    const key = dayKey(q);
    if (key > r.key) continue;
    if (clashPicks[key]) n++; else if (key !== r.key) break;
  }
  const total = Object.keys(clashPicks).length;
  return n >= 2 ? `🔥 ${n}-day streak · ${total} days played here` : total ? `${total} day${total > 1 ? "s" : ""} played here` : "";
}
function vote(side) {
  const r = clashRound(new Date());
  if (r.locked) return;
  clashPicks[r.key] = side; store.set(CKEY, clashPicks);
  showPick(side, false);
  document.getElementById("streak").textContent = streakText();
}
if (document.getElementById("lock")) {
  let lastKey = null;
  const tickClash = () => {
    const now = new Date(), r = clashRound(now);
    if (r.key !== lastKey) { lastKey = r.key; showPick(clashPicks[r.key], r.locked); document.getElementById("streak").textContent = streakText(); }
    const lockEl = document.getElementById("lock");
    lockEl.firstElementChild.textContent = r.locked ? "Today's votes are locked. Result at the close" : "Votes lock at the New York open in";
    document.getElementById("lock-time").textContent = r.locked ? fmtClock(r.close) + " your time" : fmtLeft(r.lock - now);
  };
  tickClash(); setInterval(tickClash, 1000);
}

// --- Glossary: instant search + copy a link to any term ---
const gSearch = document.getElementById("gloss-search");
if (gSearch) {
  const terms = [...document.querySelectorAll(".gloss > div")];
  terms.forEach(div => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "term-link"; b.textContent = "Copy link";
    b.addEventListener("click", () => copyText(location.origin + location.pathname + "#" + div.id, b, "Copy link"));
    div.querySelector("dt").appendChild(b);
  });
  gSearch.addEventListener("input", () => {
    const q = gSearch.value.trim().toLowerCase();
    let any = false;
    terms.forEach(div => { const hit = !q || div.textContent.toLowerCase().includes(q); div.hidden = !hit; any = any || hit; });
    document.querySelectorAll(".gloss").forEach(dl => {
      const vis = [...dl.children].some(d => !d.hidden);
      dl.hidden = !vis; dl.previousElementSibling.hidden = !vis;
    });
    document.querySelector(".jump").hidden = !!q;
    document.getElementById("gloss-empty").hidden = any;
  });
}

// --- Animated candlesticks in the hero background ---
(function candles() {
  const c = document.getElementById("candles");
  if (!c) return;
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
    const count = Math.ceil(c.offsetWidth / 14) + 1;
    while (bars.length < count) bars.push(newBar());
    draw();
  }

  function draw() {
    const w = c.width, h = c.height, step = 14 * devicePixelRatio;
    const shown = bars.slice(-Math.ceil(w / step));
    const hi = Math.max(...shown.map(b => b.high)), lo = Math.min(...shown.map(b => b.low));
    const y = v => h * 0.1 + (1 - (v - lo) / (hi - lo || 1)) * h * 0.8;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(106,100,90,.18)"; ctx.lineWidth = devicePixelRatio;
    for (let g = 1; g < 5; g++) { ctx.beginPath(); ctx.moveTo(0, h * g / 5); ctx.lineTo(w, h * g / 5); ctx.stroke(); }
    shown.forEach((b, i) => {
      const cx = i * step + step / 2, up = b.close >= b.open;
      ctx.strokeStyle = ctx.fillStyle = up ? "#1f7a4d" : "#b5392b";
      ctx.lineWidth = 1.25 * devicePixelRatio;
      ctx.beginPath(); ctx.moveTo(cx, y(b.high)); ctx.lineTo(cx, y(b.low)); ctx.stroke();
      const top = y(Math.max(b.open, b.close)), bottom = y(Math.min(b.open, b.close)), bw = step * 0.56;
      if (up) { ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--card").trim() || "#fbf9f4"; ctx.fillRect(cx - bw / 2, top, bw, Math.max(1, bottom - top)); ctx.strokeRect(cx - bw / 2, top, bw, Math.max(1, bottom - top)); }
      else ctx.fillRect(cx - bw / 2, top, bw, Math.max(1, bottom - top));
    });
  }

  window.addEventListener("resize", resize);
  window.addEventListener("themechange", draw);
  resize();
  if (!reduceMotion) setInterval(() => { bars.push(newBar()); if (bars.length > 400) bars.shift(); draw(); }, 900);
})();


// --- Live TradingView widgets (hero chart + news calendar), re-drawn when dark mode changes ---
function tvWidget(host, file, config) {
  if (!host) return;
  host.querySelectorAll(".tradingview-widget-container").forEach(el => el.remove());
  const wrap = document.createElement("div");
  wrap.className = "tradingview-widget-container";
  wrap.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
  const sc = document.createElement("script");
  sc.src = "https://s3.tradingview.com/external-embedding/" + file;
  sc.async = true;
  sc.textContent = JSON.stringify(config);
  wrap.appendChild(sc);
  host.appendChild(wrap);
}
function drawWidgets() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const card = getComputedStyle(document.documentElement).getPropertyValue("--card").trim();
  const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  const chart = document.getElementById("tv-chart");
  if (chart) tvWidget(chart, "embed-widget-advanced-chart.js", {
    autosize: true, symbol: chart.dataset.symbol, interval: chart.dataset.interval, timezone: userTZ,
    theme: dark ? "dark" : "light", style: "1", locale: "en", backgroundColor: card,
    gridColor: dark ? "rgba(236,230,216,0.06)" : "rgba(29,28,26,0.06)",
    hide_top_toolbar: true, hide_legend: false, hide_volume: true, allow_symbol_change: false,
    save_image: false, calendar: false, withdateranges: false, support_host: "https://www.tradingview.com"
  });
  const news = document.getElementById("tv-news");
  if (news) tvWidget(news, "embed-widget-events.js", {
    colorTheme: dark ? "dark" : "light", isTransparent: true, width: "100%", height: "100%",
    locale: "en", importanceFilter: "0,1", countryFilter: "us"
  });
}
drawWidgets();
window.addEventListener("themechange", drawWidgets);

// --- Hero: live Discord member count next to TikTok followers ---
const heroDc = document.getElementById("hero-dc");
if (heroDc) fetch("https://discord.com/api/v9/invites/6UCdDEGptX?with_counts=true")
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(d => { if (d.approximate_member_count) { document.getElementById("hero-dc-n").textContent = d.approximate_member_count.toLocaleString(); heroDc.hidden = false; } })
  .catch(() => {});

// --- Footer year + close mobile menu after tapping a link ---
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();
document.querySelectorAll(".topbar .links a").forEach(a => a.addEventListener("click", () => document.body.classList.remove("menu-open")));

// --- "Last updated" date in the footer (taken from when GitHub last published this page) ---
const updEl = document.getElementById("updated");
if (updEl) {
  const d = new Date(document.lastModified);
  if (!isNaN(d)) updEl.textContent = "Last updated " + d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// --- Works offline + installs like an app ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
// "Install as an app" button: Android/Chrome shows a real install prompt, iPhone gets instructions.
(function installButton() {
  const box = document.getElementById("install");
  if (!box) return;
  const btn = document.getElementById("install-btn"), msg = document.getElementById("install-msg");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return; // already installed
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; box.hidden = false; });
  if (isIOS) box.hidden = false;
  btn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === "accepted") box.hidden = true;
    } else if (isIOS) {
      msg.textContent = "On iPhone: tap the Share button in Safari, then “Add to Home Screen”.";
    }
  });
  window.addEventListener("appinstalled", () => { box.hidden = true; });
})();

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   PICTURES: video posters, tool cards and glossary diagrams.
   Images live in images/videos, images/tools and images/glossary.
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
(function () {
  // Video posters, matched by the video's title.
  // (New videos: you can also just add  thumb: "images/videos/10-xyz.webp"  in VIDEOS.)
  const VIDEO_PICS = {
    "Candlesticks": "01-candlesticks",
    "How and why the market moves": "02-how-the-market-moves",
    "Timeframes": "03-timeframes",
    "Trends and ranges": "04-trends-and-ranges",
    "Support and resistance": "05-support-and-resistance",
    "Liquidity": "06-liquidity",
    "Break of structure": "07-break-of-structure",
    "Fair value gaps": "08-fair-value-gaps",
    "Trading sessions": "09-trading-sessions"
  };
  document.querySelectorAll("#videos .poster").forEach(function (p) {
    if (p.querySelector("img")) return;
    const h = p.parentElement.querySelector("h4");
    const file = h && VIDEO_PICS[h.textContent.trim()];
    if (file) p.innerHTML = '<img src="images/videos/' + file + '.webp" alt="" loading="lazy" decoding="async">';
  });

  // Tool cards on the home page, matched by link.
  const TOOL_PICS = {
    "tracker.html": "eval-tracker",
    "prop-calculator.html": "risk-calculator",
    "journal.html": "backtest-journal",
    "sessions.html": "session-clock",
    "glossary.html": "glossary"
  };
  const tools = document.querySelector("#tools .episodes");
  if (tools) {
    tools.classList.add("with-posters", "tool-pics");
    tools.querySelectorAll("a").forEach(function (a) {
      const file = TOOL_PICS[a.getAttribute("href")];
      const ep = a.querySelector(".ep");
      if (file && ep) ep.outerHTML = '<span class="poster" aria-hidden="true"><img src="images/tools/' + file + '.webp" alt="" loading="lazy" decoding="async"></span>';
    });
  }

  // Glossary diagrams, added under each definition.
  const GLOSS_PICS = {
    "candlestick": "Candlestick with open, close, high and low labelled",
    "timeframe": "Daily, 4-hour and 1-minute charts nested inside each other",
    "trend-range": "An uptrend above a sideways range",
    "support-resistance": "Price bouncing between support and resistance",
    "sessions": "Clock with the Asia, London and New York sessions",
    "liquidity": "Stop losses above equal highs and below equal lows",
    "liquidity-sweep": "Price poking above a high, taking the stops, then dropping",
    "draw-on-liquidity": "Price heading towards an untouched high",
    "bos": "Price breaking above the last high",
    "fvg": "Three candles leaving a fair value gap",
    "ifvg": "Price closing through a bearish gap, which then acts as support",
    "retest": "Price breaking a level, retesting it, then carrying on",
    "smt": "NQ making a lower low while ES makes a higher low",
    "amd": "Accumulation range, manipulation drop, distribution rally",
    "r": "Entry with 1R risk below and a 2R target above",
    "drawdown": "Account balance between the profit target and the drawdown limit",
    "contracts": "Dollars per point: NQ 20, ES 50, MNQ 2, MES 5"
  };
  Object.keys(GLOSS_PICS).forEach(function (id) {
    const dd = document.querySelector("dl.gloss #" + id + " dd");
    if (!dd || dd.querySelector(".gloss-fig")) return;
    dd.insertAdjacentHTML("beforeend",
      '<img class="gloss-fig" src="images/glossary/' + id + '.webp" alt="Diagram: ' + GLOSS_PICS[id] +
      '" width="1200" height="600" loading="lazy" decoding="async">');
  });
})();
