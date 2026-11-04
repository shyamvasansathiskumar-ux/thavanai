/* Live demo and tests page motion: slim top bar, screen and row entrances, and count-up tiles.
   It only adds classes to what app.js has already built; it never changes text other than animating a tile's own number. */
(function () {
  "use strict";
  const top = document.querySelector(".top");
  const onScroll = () => { if (top) top.classList.toggle("slim", scrollY > 8); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();


  // toasts get a small animated icon: a tick, a cross, or a padlock snapping shut when a record locks
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  function icon(kind) {
    const svg = mk("svg", { viewBox: "0 0 24 24", class: "tx-ico " + kind, "aria-hidden": "true", focusable: "false" });
    if (kind === "lock") {
      svg.append(mk("path", { class: "shackle", d: "M8 11V8.2a4 4 0 0 1 8 0V11" }), mk("rect", { class: "body", x: "4.5", y: "10.5", width: "15", height: "10.5", rx: "3" }), mk("circle", { class: "key", cx: "12", cy: "15.4", r: "1.6" }));
    } else {
      svg.append(mk("circle", { class: "ring", cx: "12", cy: "12", r: "10" }), mk("path", { class: "tick", d: kind === "err" ? "M8.5 8.5l7 7M15.5 8.5l-7 7" : "M7.2 12.4l3.2 3.2 6.4-6.6" }));
    }
    return svg;
  }
  const toastEl = document.getElementById("toast");
  if (toastEl) new MutationObserver(() => {
    const t = toastEl.querySelector(".toast-in");
    if (!t || t.querySelector(".tx-ico")) return;
    const kind = t.classList.contains("err") ? "err" : /locked/i.test(t.textContent) ? "lock" : "ok";
    t.prepend(icon(kind));
  }).observe(toastEl, { childList: true });

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("fx");
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const view = document.getElementById("view") || document.querySelector("main");
  if (!view) return;

  function countUp(el) {
    const to = Number(el.textContent);
    if (!Number.isInteger(to) || to <= 0) return;
    const t0 = performance.now(), dur = 700;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step); else el.textContent = String(to);
    };
    el.textContent = "0";
    requestAnimationFrame(step);
  }

  function process() {
    const first = view.firstElementChild;
    if (first && !first.dataset.fx) { first.dataset.fx = "1"; first.classList.add("enter"); }
    view.querySelectorAll(".tile-n:not([data-fx])").forEach((n) => { n.dataset.fx = "1"; countUp(n); });
    view.querySelectorAll("table:not([data-fx])").forEach((t) => {
      t.dataset.fx = "1";
      Array.from(t.querySelectorAll("tbody tr")).slice(0, 14).forEach((tr, i) => { tr.style.setProperty("--i", i); tr.classList.add("rowin"); });
    });
  }

  // menu labels roll over on hover (the menu is rebuilt on every screen)
  if (fine) {
    const roll = (el) => {
      if (el.querySelector(".roll")) return;
      const tn = Array.from(el.childNodes).find((x) => x.nodeType === 3 && x.textContent.trim());
      if (!tn) return;
      const text = tn.textContent.trim();
      const w = document.createElement("span"); w.className = "roll"; w.dataset.t = text;
      const inner = document.createElement("span"); inner.textContent = text; w.append(inner);
      tn.replaceWith(w);
    };
    const menu = document.getElementById("menu");
    const wrapMenu = () => menu.querySelectorAll("a").forEach(roll);
    if (menu) { new MutationObserver(wrapMenu).observe(menu, { childList: true }); wrapMenu(); }
    document.querySelectorAll(".foot-links a, .top a:not(.brand)").forEach(roll);
  }

  let queued = false;
  const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; process(); }); };
  new MutationObserver(queue).observe(view, { childList: true, subtree: true });
  const modalRoot = document.getElementById("modal-root");
  if (modalRoot) new MutationObserver(queue).observe(modalRoot, { childList: true });
  process();

})();
