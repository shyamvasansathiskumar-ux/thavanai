/* Project site: intro, nav, theme, live numbers, the retention calculator and the personal data guard. */
(function () {
  "use strict";
  const T = window.Thavanai, D = T.Dates;
  const $ = (s) => document.querySelector(s);
  const today = D.today();

  // opening (once per visit)
  const intro = $("#intro");
  if (intro && !document.documentElement.classList.contains("intro-seen")) {
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      intro.classList.add("out");
      document.body.style.overflow = "";
      try { sessionStorage.setItem("thv-intro", "1"); } catch (e) { /* fine */ }
      setTimeout(() => { intro.remove(); stamp(); }, 900);
    }, 2200);
  } else { if (intro) intro.remove(); setTimeout(stamp, 500); }

  // hero stamp: the Code Sprint registration's real status today
  function stamp() {
    const s = $("#heroStamp"); if (!s) return;
    const by = "2026-09-21";
    const late = D.between(by, today);
    s.textContent = late > 0 ? "Overdue " + late + (late === 1 ? " day" : " days") : late === 0 ? "Due today" : "Due in " + (-late) + " days";
    s.classList.add("on");
  }

  // nav
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 10);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const burger = $("#burger"), links = $("#navLinks");
  burger.addEventListener("click", () => { const o = links.classList.toggle("open"); burger.setAttribute("aria-expanded", String(o)); });
  links.addEventListener("click", (e) => { if (e.target.closest("a")) { links.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); } });

  // theme
  $("#theme").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("thv-theme", next); } catch (e) { /* not saved */ }
  });

  // countdown to the erasure duty
  const cd = $("#countdown");
  if (cd) {
    const n = D.between(today, "2027-05-13");
    cd.textContent = n > 0 ? n + " days from today" : n === 0 ? "Starts today" : "In force since " + D.format("2027-05-13");
  }

  // retention calculator: the same RetentionPolicy code the demo uses
  const ev = $("#cEvent"), co = $("#cColl"), pol = $("#cPol"), days = $("#cDays"), out = $("#cOut");
  function calc() {
    const needs = pol.value !== "END_OF_SEMESTER";
    days.disabled = !needs;
    out.classList.remove("bad");
    try {
      if (!D.valid(ev.value) || !D.valid(co.value)) throw new T.ValidationError("Choose both dates.");
      const p = T.RetentionPolicy.of(pol.value, needs ? days.value : null);
      const by = p.deleteBy(co.value, ev.value);
      const keep = D.between(co.value, by);
      if (by < co.value) throw new T.ValidationError("Delete-by " + D.format(by) + " is before the collection date. Increase the days.");
      if (keep > T.MAX_RETENTION_DAYS) throw new T.ValidationError("Keeps data " + keep + " days. The limit is 365.");
      out.textContent = "Delete by " + D.format(by) + " · " + keep + " days after collection";
    } catch (e) { out.classList.add("bad"); out.textContent = e.message; }
  }
  [ev, co, pol, days].forEach((x) => { x.addEventListener("input", calc); x.addEventListener("change", calc); });
  calc();

  // personal data guard: the same check the demo runs on every text field
  const gi = $("#guardIn"), go = $("#guardOut");
  function guard() {
    try {
      T.PersonalDataGuard.check("Purpose", gi.value);
      go.className = "guard-out good";
      go.textContent = gi.value.trim() ? "Accepted. This describes the data without copying it." : "Type something.";
    } catch (e) { go.className = "guard-out bad"; go.textContent = "Refused — " + e.message; }
  }
  gi.addEventListener("input", guard); guard();

  // reveal
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".rv").forEach((el) => { if (el.getBoundingClientRect().top > innerHeight) io.observe(el); });
  }

  // hero label follows the pointer, a little
  const art = $("#heroArt");
  if (art && matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const labels = art.querySelectorAll(".label");
    art.addEventListener("pointermove", (e) => {
      const r = art.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      labels.forEach((l, i) => {
        const depth = [10, 6, 3][i] || 3;
        const base = l.classList.contains("front") ? "rotate(-3deg)" : l.classList.contains("back1") ? "rotate(4deg) translate(12px, 2px)" : "rotate(9deg) translate(26px, 8px)";
        l.style.transform = base + " translate(" + (x * depth) + "px," + (y * depth) + "px) rotateY(" + (x * 6) + "deg) rotateX(" + (-y * 6) + "deg)";
      });
    });
    art.addEventListener("pointerleave", () => labels.forEach((l) => { l.style.transform = ""; }));
  }
})();
