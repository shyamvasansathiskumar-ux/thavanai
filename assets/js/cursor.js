/* The pointer. A dot follows the mouse exactly; a ring trails behind it, grows and names things you can use
   ("Open", "Drag", "View"), and wraps itself around buttons. Text fields keep the normal I-beam.
   <body data-cursor="ring"> keeps the system pointer and adds only the ring (the demo, where precision matters). */
(function () {
  "use strict";
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const ringOnly = document.body.dataset.cursor === "ring";
  const wrap = document.createElement("div"); wrap.className = "cur is-hidden"; wrap.setAttribute("aria-hidden", "true");
  const dot = document.createElement("div"); dot.className = "cur-dot";
  const ring = document.createElement("div"); ring.className = "cur-ring";
  const label = document.createElement("span"); label.className = "cur-label"; ring.append(label);
  wrap.append(ring, dot);
  document.body.append(wrap);
  root.classList.add(ringOnly ? "has-cur-ring" : "has-cur");

  const TEXT = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
  const HOT = "a[href], button, label, summary, [role='button'], .lock-gl, .er-t, .shot, .marquee";
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

  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, rw = 34, rh = 34, rr = 17;
  let tw = 34, th = 34, tr = 17, tx = x, ty = y, target = null, seen = false;
  let last = performance.now();

  addEventListener("pointermove", (e) => {
    x = e.clientX; y = e.clientY;
    if (!seen) { seen = true; rx = x; ry = y; wrap.classList.remove("is-hidden"); }
    sense(e.target);
  }, { passive: true });
  // when the page scrolls under a still mouse, look again at what is under it
  let sq = false;
  addEventListener("scroll", () => { if (!seen || sq) return; sq = true; requestAnimationFrame(() => { sq = false; sense(document.elementFromPoint(x, y)); }); }, { passive: true });
  function sense(node) {
    const el = node && node.closest ? node : null;
    const typing = el && el.closest(TEXT);
    wrap.classList.toggle("is-hidden", !!typing);
    const hot = el && el.closest(HOT);
    target = hot && hot.classList.contains("btn") ? hot : null;
    const name = hot && !target ? nameOf(hot) : "";
    label.textContent = name;
    wrap.classList.toggle("has-label", !!name);
    wrap.classList.toggle("is-btn", !!target);
    if (target) return;
    const size = name ? 72 : hot ? 52 : 34;
    tw = th = size; tr = size / 2;
  }
  addEventListener("pointerdown", () => wrap.classList.add("is-down"), { passive: true });
  addEventListener("pointerup", () => wrap.classList.remove("is-down"), { passive: true });
  document.addEventListener("pointerleave", () => wrap.classList.add("is-hidden"));
  document.addEventListener("pointerenter", () => { if (seen) wrap.classList.remove("is-hidden"); });

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    const k = reduce ? 1 : 1 - Math.exp(-dt * 16), ks = reduce ? 1 : 1 - Math.exp(-dt * 14);
    if (target && !target.isConnected) { target = null; tw = th = 34; tr = 17; wrap.classList.remove("is-btn"); }
    if (target) {
      const r = target.getBoundingClientRect();
      tx = r.left + r.width / 2; ty = r.top + r.height / 2;
      tw = r.width + 12; th = r.height + 12;
      tr = Math.min(th / 2, parseFloat(getComputedStyle(target).borderRadius) + 6 || 14);
      tx += (x - tx) * 0.12; ty += (y - ty) * 0.12;
    } else { tx = x; ty = y; }
    rx += (tx - rx) * k; ry += (ty - ry) * k;
    rw += (tw - rw) * ks; rh += (th - rh) * ks; rr += (tr - rr) * ks;
    ring.style.width = rw.toFixed(1) + "px"; ring.style.height = rh.toFixed(1) + "px"; ring.style.borderRadius = rr.toFixed(1) + "px";
    ring.style.transform = "translate3d(" + (rx - rw / 2).toFixed(1) + "px," + (ry - rh / 2).toFixed(1) + "px,0)";
    dot.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
