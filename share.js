/* =========================================================
   BXTrades share buttons
   Turns each tool's result into a short emoji card people can
   paste into Discord, TikTok comments, WhatsApp or X.
   Phones get the native share sheet. Computers copy to clipboard.
   Each share is counted in GoatCounter as an event: "share-<tool>".
   ========================================================= */
(function () {
  "use strict";

  var css =
    ".bx-share{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem .9rem;margin-top:1.2rem}" +
    ".bx-share .btn{cursor:pointer}" +
    ".bx-share .bx-msg{font-size:.85rem;color:var(--muted)}" +
    ".bx-share .bx-preview{flex-basis:100%;margin:0;padding:.75rem .9rem;border:1.5px dashed var(--line,var(--rule));" +
    "white-space:pre-wrap;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.82rem;line-height:1.5;" +
    "color:var(--ink);background:transparent;max-width:34rem}" +
    ".bx-share textarea{flex-basis:100%;max-width:34rem;font:inherit;font-size:.85rem;padding:.6rem}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function track(name) {
    try {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: "share-" + name, title: "Share: " + name, event: true });
      }
    } catch (e) {}
  }

  // Phones and tablets get the share sheet. On computers it is usually
  // a clunky system dialog, so they copy to the clipboard instead.
  function useNativeShare() {
    try {
      return !!navigator.share && window.matchMedia("(pointer: coarse)").matches;
    } catch (e) { return false; }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  // Share some text. done(state) gets "shared", "copied", "cancelled" or "manual".
  function share(text, name, done) {
    done = done || function () {};
    if (useNativeShare()) {
      navigator.share({ text: text }).then(function () {
        track(name); done("shared");
      }, function (err) {
        if (err && err.name === "AbortError") { done("cancelled"); return; }
        copyText(text).then(function () { track(name); done("copied"); }, function () { done("manual"); });
      });
      return;
    }
    copyText(text).then(function () { track(name); done("copied"); }, function () { done("manual"); });
  }

  // Bar of 10 squares, e.g. bar(62) -> 🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜
  function bar(pct, on, off) {
    var n = Math.max(0, Math.min(10, Math.round(pct / 10)));
    return new Array(n + 1).join(on || "🟩") + new Array(10 - n + 1).join(off || "⬜");
  }
  // Row of results, e.g. [2, -1, 0] -> 🟢🔴⚪
  function dots(values) {
    return values.map(function (v) { return v > 0 ? "🟢" : v < 0 ? "🔴" : "⚪"; }).join("");
  }

  /* Add a share row to a page.
     opts.after   element to put the row after (or opts.into to append inside)
     opts.name    short tool name for analytics
     opts.text    function returning the share text, or null when there's nothing to share yet
     opts.label   button text */
  function mount(opts) {
    var row = document.createElement("div");
    row.className = "bx-share";
    var pre = document.createElement("pre");
    pre.className = "bx-preview";
    pre.setAttribute("aria-label", "Preview of what you'll share");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn primary";
    btn.textContent = opts.label || "Share my result";
    btn.setAttribute("data-goatcounter-click", "share-btn-" + opts.name);
    var msg = document.createElement("span");
    msg.className = "bx-msg";
    msg.setAttribute("role", "status");
    var box = document.createElement("textarea");
    box.rows = 7; box.readOnly = true; box.hidden = true;
    box.setAttribute("aria-label", "Your result, ready to copy");
    row.appendChild(pre); row.appendChild(btn); row.appendChild(msg); row.appendChild(box);

    if (opts.into) opts.into.appendChild(row);
    else opts.after.parentNode.insertBefore(row, opts.after.nextSibling);

    function current() {
      try { return opts.text(); } catch (e) { return null; }
    }
    function refresh() {
      var t = current();
      row.hidden = !t;
      if (t) pre.textContent = t;
    }
    btn.addEventListener("click", function () {
      var t = current();
      if (!t) return;
      share(t, opts.name, function (state) {
        box.hidden = true;
        if (state === "copied") msg.textContent = "Copied. Paste it in the Discord, your TikTok comments or a group chat.";
        else if (state === "shared") msg.textContent = "Shared. Thanks for spreading the word!";
        else if (state === "manual") {
          box.value = t; box.hidden = false; box.focus(); box.select();
          msg.textContent = "Copy the text below.";
        } else msg.textContent = "";
        clearTimeout(btn._t);
        if (state !== "manual") btn._t = setTimeout(function () { msg.textContent = ""; }, 4000);
      });
    });

    // Keep the preview in step with whatever the visitor changes.
    var timer;
    function soon() { clearTimeout(timer); timer = setTimeout(refresh, 350); }
    ["input", "change", "click"].forEach(function (ev) { document.addEventListener(ev, soon, true); });
    refresh();
    setTimeout(refresh, 800);
    return { refresh: refresh };
  }

  window.BXShare = { share: share, mount: mount, bar: bar, dots: dots, track: track };
})();
