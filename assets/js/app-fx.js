/* Live demo and tests page motion: slim top bar, screen and row entrances, count-up tiles and the glass spotlight.
   It only adds classes to what app.js has already built; it never changes text other than animating a tile's own number. */
(function () {
  "use strict";
  const top = document.querySelector(".top");
  const onScroll = () => { if (top) top.classList.toggle("slim", scrollY > 8); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

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
    if (fine) document.querySelectorAll(".win:not(.spot), .act:not(.spot), .tile:not(.spot)").forEach((el) => el.classList.add("spot"));
  }
  let queued = false;
  const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; process(); }); };
  new MutationObserver(queue).observe(view, { childList: true, subtree: true });
  const modalRoot = document.getElementById("modal-root");
  if (modalRoot) new MutationObserver(queue).observe(modalRoot, { childList: true });
  process();

  if (fine) {
    let pend = null, busy = false;
    document.addEventListener("pointermove", (e) => {
      pend = e;
      if (busy) return;
      busy = true;
      requestAnimationFrame(() => {
        busy = false;
        const ev = pend; pend = null; if (!ev || !ev.target.closest) return;
        const el = ev.target.closest(".spot");
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", (ev.clientX - r.left).toFixed(0) + "px");
        el.style.setProperty("--my", (ev.clientY - r.top).toFixed(0) + "px");
      });
    }, { passive: true });
  }
})();
