/* Project site: intro, nav, theme, live numbers, the retention calculator and the personal data guard. */
(function () {
  "use strict";
  const T = window.Thavanai, D = T.Dates;
  const $ = (s) => document.querySelector(s);
  const today = D.today();

  // opening (once per visit): the loader shows what is really loading, then splits open
  const root = document.documentElement;
  const loaderEl = $("#loader");
  const reveal = () => { root.dataset.revealed = "1"; document.dispatchEvent(new CustomEvent("thv:reveal")); };
  if (loaderEl && root.classList.contains("intro-play") && T.Loader) {
    document.body.style.overflow = "hidden";
    const L = T.Loader(loaderEl, { min: 4200 });
    L.set(0.12, "Loading the typefaces");
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(() => { L.set(0.55, "Typefaces ready · preparing the register"); L.log("fonts", "Bricolage Grotesque · Public Sans · Martian Mono · Noto Sans Tamil", true); });
    const loaded = new Promise((r) => { if (document.readyState === "complete") r(); else addEventListener("load", r, { once: true }); });
    loaded.then(() => {
      L.set(0.85, "Starting the retention rules");
      L.log("integrity", document.querySelectorAll("script[integrity], link[integrity]").length + " files checked against their SRI hashes", true);
      L.log("rules", "3 retention policies · never more than " + T.MAX_RETENTION_DAYS + " days", true);
      L.log("guard", "phone · email · ID · register no. · markup", true);
    });
    Promise.all([fonts, loaded]).then(() => L.done("Ready · delete it on time")).then(() => {
      document.body.style.overflow = "";
      try { sessionStorage.setItem("thv-intro", "1"); } catch (e) { /* fine */ }
      setTimeout(stamp, 1000);
    });
  } else {
    if (loaderEl) loaderEl.remove();
    reveal();
    setTimeout(stamp, 1100);
  }

  // hero stamp: the Code Sprint registration's real status today
  function stamp() {
    const s = $("#heroStamp"); if (!s) return;
    const by = "2026-09-21";
    const late = D.between(by, today);
    s.textContent = late > 0 ? "Overdue " + late + (late === 1 ? " day" : " days") : late === 0 ? "Due today" : "Due in " + (-late) + " days";
    s.classList.add("on");
    document.dispatchEvent(new CustomEvent("thv:ready"));
  }
  // second hero tag: RoboRace registrations are kept to the end of semester (30-11-2026)
  const robo = $("#heroRobo");
  if (robo) {
    const left = D.between(today, "2026-11-30");
    robo.textContent = left > 7 ? "Delete by 30-11-2026 · " + left + " days left" : left >= 0 ? "Due in " + left + (left === 1 ? " day" : " days") : "Overdue " + (-left) + " days";
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
      const v = T.TextGuard.clean(gi.value);
      T.TextGuard.check("Purpose", v);
      T.PersonalDataGuard.check("Purpose", v);
      go.className = "guard-out good";
      go.textContent = gi.value.trim() ? "Accepted. This describes the data without copying it." : "Type something.";
    } catch (e) { go.className = "guard-out bad"; go.textContent = "Refused: " + e.message; }
  }
  gi.addEventListener("input", guard); guard();

})();
