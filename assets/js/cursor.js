/* The pointer, drawn as a printer's registration mark: a fine crosshair at the tip, and four crop-mark corners
   that trail it and close around whatever you can use (a button, a link, the padlock), naming it when useful.
   No light, no glow. Text fields keep the normal I-beam.
   <body data-cursor="ring"> (the demo and tests pages) keeps the system pointer and shows only the corners on things you can use. */
(function () {
  "use strict";
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const quiet = document.body.dataset.cursor === "ring";
  const make = (cls, parent) => { const e = document.createElement(cls === "cur-label" ? "span" : "div"); e.className = cls; (parent || wrap).append(e); return e; };
  const wrap = document.createElement("div"); wrap.className = "cur is-hidden" + (quiet ? " is-quiet" : ""); wrap.setAttribute("aria-hidden", "true");
  document.body.append(wrap);
  const cross = make("cur-cross");
  const box = make("cur-box");
  ["tl", "tr", "bl", "br"].forEach((c) => make("cur-c " + c, box));
  const label = make("cur-label", box);
  root.classList.add(quiet ? "has-cur-ring" : "has-cur");

  const TEXT = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
  const HOT = "a[href], button, label, summary, [role='button'], .lock-gl, .er-t, .shot, .marquee, .tile, .act, .choice, tr.pick";
  const nameOf = (el) => {
    if (el.dataset.cursor) return el.dataset.cursor;
    if (el.classList.contains("lock-gl")) return "Drag";
    if (el.classList.contains("shot")) return "View";
    if (el.classList.contains("er-t")) return "Keys";
    if (el.classList.contains("marquee")) return "Slow";
    const href = el.getAttribute && el.getAttribute("href");
    if (href && /app\.html|tests\.html/.test(href) && !el.classList.contains("btn")) return "Open";
    return "";
  };

  let x = innerWidth / 2, y = innerHeight / 2, seen = false, target = null;
  // the corner box: current and target centre and size
  let bx = x, by = y, bw = 26, bh = 26, tx = x, ty = y, tw = 26, th = 26;
  let last = performance.now();

  function sense(node) {
    const el = node && node.closest ? node : null;
    const typing = el && el.closest(TEXT);
    wrap.classList.toggle("is-typing", !!typing);
    const hot = typing ? null : el && el.closest(HOT);
    target = hot || null;
    const name = hot ? nameOf(hot) : "";
    label.textContent = name;
    wrap.classList.toggle("has-label", !!name);
    wrap.classList.toggle("is-on", !!hot);
  }
  addEventListener("pointermove", (e) => {
    x = e.clientX; y = e.clientY;
    if (!seen) { seen = true; bx = x; by = y; wrap.classList.remove("is-hidden"); }
    sense(e.target);
  }, { passive: true });
  let sq = false;
  addEventListener("scroll", () => { if (!seen || sq) return; sq = true; requestAnimationFrame(() => { sq = false; sense(document.elementFromPoint(x, y)); }); }, { passive: true });
  addEventListener("pointerdown", () => wrap.classList.add("is-down"), { passive: true });
  addEventListener("pointerup", () => wrap.classList.remove("is-down"), { passive: true });
  document.addEventListener("pointerleave", () => wrap.classList.add("is-hidden"));
  document.addEventListener("pointerenter", () => { if (seen) wrap.classList.remove("is-hidden"); });

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    if (target && !target.isConnected) { target = null; wrap.classList.remove("is-on", "has-label"); }
    if (target) {
      const r = target.getBoundingClientRect();
      tx = r.left + r.width / 2; ty = r.top + r.height / 2; tw = r.width + 14; th = r.height + 14;
      if (tw > innerWidth * 0.9 || th > innerHeight * 0.8) { tx = x; ty = y; tw = th = 44; }
    } else { tx = x; ty = y; tw = th = 26; }
    const k = reduce ? 1 : 1 - Math.exp(-dt * (target ? 20 : 13));
    bx += (tx - bx) * k; by += (ty - by) * k; bw += (tw - bw) * k; bh += (th - bh) * k;
    box.style.width = bw.toFixed(1) + "px"; box.style.height = bh.toFixed(1) + "px";
    box.style.transform = "translate3d(" + (bx - bw / 2).toFixed(1) + "px," + (by - bh / 2).toFixed(1) + "px,0)";
    cross.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
