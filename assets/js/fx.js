/* Project site motion: smooth wheel scroll, progress bar, 3D hero, reveals, the pinned "life of a record" story,
   count-ups, the flip clock, the ER diagram, tilt, magnetic buttons and the glass spotlight.
   Everything here is decoration on top of a page that already works without it. Reduced motion turns it all off. */
(function () {
  "use strict";
  const T = window.Thavanai, D = T.Dates;
  const root = document.documentElement;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ------------------------------------------------------------------ flip clock (runs with or without motion)
  const flip = $("#flip");
  if (flip) {
    const target = Date.parse("2027-05-13T00:00:00+05:30");
    const cells = {};
    $$(".flip-n", flip).forEach((b) => { cells[b.dataset.unit] = b; });
    const pad = (n) => String(n).padStart(2, "0");
    let first = true;
    const set = (el, v) => {
      if (el.textContent === v) return;
      if (first || reduce) { el.textContent = v; return; }
      el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick");
      setTimeout(() => { el.textContent = v; }, 190);
    };
    const run = () => {
      let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      set(cells.d, String(d)); set(cells.h, pad(h)); set(cells.m, pad(m)); set(cells.s, pad(s));
      first = false;
    };
    run(); setInterval(run, 1000);
  }

  // ------------------------------------------------------------------ ER diagram: hover or focus a table to see its keys
  const er = $("#erSvg");
  if (er) {
    const edges = $$(".er-e", er);
    edges.forEach((e, i) => e.style.setProperty("--i", i));
    const on = (name) => {
      er.classList.add("hover");
      $$(".er-t", er).forEach((t) => t.classList.toggle("hot", t.dataset.t === name));
      edges.forEach((e) => {
        const hit = e.dataset.a === name || e.dataset.b === name;
        e.classList.toggle("hot", hit);
        if (hit) $$('.er-t[data-t="' + (e.dataset.a === name ? e.dataset.b : e.dataset.a) + '"]', er).forEach((t) => t.classList.add("hot"));
      });
    };
    const off = () => { er.classList.remove("hover"); $$(".hot", er).forEach((x) => x.classList.remove("hot")); };
    $$(".er-t", er).forEach((t) => {
      t.addEventListener("pointerenter", () => on(t.dataset.t));
      t.addEventListener("focus", () => on(t.dataset.t));
      t.addEventListener("blur", off);
    });
    er.addEventListener("pointerleave", off);
  }

  // ------------------------------------------------------------------ the story: works as a static list without motion
  const story = $("#story");
  const S = story && {
    steps: $$("#storySteps li"), dots: $$(".story-dots i", story), list: $("#storySteps"),
    rec: $("#rec"), pill: $("#recPill"), bar: $("#recBar"), today: $("#recToday"), leftK: $("#recLeftK"), left: $("#recLeft"),
    collected: "2026-09-25", by: "2026-11-09", deleted: "2026-11-12",
    ranges: [["2026-09-25", "2026-10-09"], ["2026-10-10", "2026-11-01"], ["2026-11-02", "2026-11-09"], ["2026-11-10", "2026-11-11"], ["2026-11-12", "2026-11-12"], ["2026-11-12", "2026-11-12"]],
    last: ""
  };
  function storyAt(p) {
    const n = S.ranges.length;
    const stage = Math.min(n - 1, Math.floor(p * n));
    const t = clamp(p * n - stage, 0, 1);
    const [a, b] = S.ranges[stage];
    const date = D.plusDays(a, Math.round(t * D.between(a, b)));
    let state, pill, leftK, left, frac;
    const daysLeft = D.between(date, S.by);
    if (stage >= 5) { state = "locked"; pill = "Deleted · locked"; }
    else if (stage === 4) { state = "deleted"; pill = "Deleted"; }
    else if (date > S.by) { state = "overdue"; pill = "Overdue " + (-daysLeft) + (daysLeft === -1 ? " day" : " days"); }
    else if (S.by <= D.plusDays(date, T.DUE_SOON_DAYS)) { state = "due_soon"; pill = daysLeft === 0 ? "Due today" : "Due in " + daysLeft + (daysLeft === 1 ? " day" : " days"); }
    else { state = "active"; pill = "Within retention"; }
    if (state === "deleted" || state === "locked") { leftK = "Deleted on"; left = D.format(S.deleted); frac = 1; }
    else if (state === "overdue") { leftK = "Late by"; left = (-daysLeft) + (daysLeft === -1 ? " day" : " days"); frac = 1; }
    else { leftK = "Left"; left = daysLeft + (daysLeft === 1 ? " day" : " days"); frac = clamp(D.between(S.collected, date) / D.between(S.collected, S.by), 0, 1); }
    const key = stage + "|" + date + "|" + state;
    S.list.style.setProperty("--sp", (p).toFixed(4));
    if (key === S.last) return;
    S.last = key;
    S.rec.dataset.state = state;
    S.pill.textContent = pill;
    S.today.textContent = D.format(date);
    S.leftK.textContent = leftK; S.left.textContent = left;
    S.bar.style.transform = "scaleX(" + frac.toFixed(3) + ")";
    S.steps.forEach((li, i) => li.classList.toggle("on", i === stage));
    S.dots.forEach((d, i) => d.classList.toggle("on", i <= stage));
  }

  if (reduce) {
    // no motion: the story shows its first state, the stats show their real numbers, the clock still ticks
    if (S) storyAt(0);
    return;
  }

  root.classList.add("fx");

  // ------------------------------------------------------------------ split headings into words, the hero title into letters
  function splitWords(el) {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType === 3) {
          const parts = c.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((w) => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.append(document.createTextNode(" ")); return; }
            const o = document.createElement("span"); o.className = "w";
            const n = document.createElement("span"); n.className = "wi"; n.textContent = w; n.style.setProperty("--i", i++);
            o.append(n); frag.append(o);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1) walk(c);
      });
    };
    el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
    walk(el);
    el.classList.add("split");
  }
  $$(".h2, .band-h, .end-h").forEach(splitWords);

  const hero = $(".hero");
  const heroH = $(".hero-h");
  if (heroH) {
    const word = heroH.textContent.trim();
    heroH.setAttribute("aria-label", word);
    heroH.textContent = "";
    Array.from(word).forEach((ch, i) => {
      const c = document.createElement("span"); c.className = "c"; c.textContent = ch; c.style.setProperty("--i", i);
      c.setAttribute("aria-hidden", "true");
      heroH.append(c);
    });
  }
  $$(".hero-copy > *").forEach((el, i) => el.style.setProperty("--d", i));
  const intro = $("#intro");
  const firstVisit = intro && !root.classList.contains("intro-seen");
  setTimeout(() => hero && hero.classList.add("go"), firstVisit ? 2250 : 60);

  // ------------------------------------------------------------------ reveals and count-ups
  const countUp = (b) => {
    const to = Number(b.dataset.count);
    if (!Number.isFinite(to)) return;
    const t0 = performance.now(), dur = to > 1000 ? 1900 : 1300;
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      const e = k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
      b.textContent = Math.round(to * e).toLocaleString("en-US");
      if (k < 1) requestAnimationFrame(step);
    };
    b.textContent = "0";
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target;
    el.classList.add("in");
    $$("[data-count]", el).forEach(countUp);
    io.unobserve(el);
  }), { rootMargin: "0px 0px -10% 0px", threshold: 0.01 });
  $$(".stats .stat").forEach((el, i) => el.style.setProperty("--d", (i * 70) + "ms"));
  $$(".rv, .split, .er-svg").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.9 && r.bottom > 0 && !el.closest(".hero")) { el.classList.add("in"); return; }
    io.observe(el);
  });

  // ------------------------------------------------------------------ smooth wheel scrolling (native keyboard, touch and anchors stay as they are)
  let target = scrollY, cur = scrollY, smoothing = false;
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  if (fine) {
    addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (document.body.style.overflow === "hidden") return;
      if (e.target.closest && e.target.closest("textarea, select, .nav-links.open")) return;
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
      if (!smoothing) { cur = scrollY; target = scrollY; }
      target = clamp(target + d, 0, maxScroll());
      smoothing = true; kick();
    }, { passive: false });
    const stop = () => { smoothing = false; };
    addEventListener("keydown", stop);
    addEventListener("pointerdown", stop);
    document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest('a[href^="#"]')) stop(); });
  }

  // ------------------------------------------------------------------ 3D hero: pointer parallax, phone tilt, scroll float-away
  const stack = $("#stack"), art = $("#heroArt");
  let rx = 0, ry = 0, trx = 0, try_ = 0, heroVisible = true;
  if (stack) {
    new IntersectionObserver((es) => { heroVisible = es[0].isIntersecting; if (heroVisible) kick(); }).observe(art);
    if (fine) {
      addEventListener("pointermove", (e) => {
        if (!heroVisible) return;
        trx = -(e.clientY / innerHeight - 0.5) * 14;
        try_ = (e.clientX / innerWidth - 0.5) * 22;
        kick();
      }, { passive: true });
    } else {
      addEventListener("deviceorientation", (e) => {
        if (e.beta == null || !heroVisible) return;
        trx = clamp((e.beta - 45) / 4, -10, 10);
        try_ = clamp(e.gamma / 3, -14, 14);
        kick();
      }, { passive: true });
    }
  }

  // ------------------------------------------------------------------ the one frame loop: runs only while something is moving
  const nav = $("#nav"), bar = $("#progress"), links = $("#navLinks");
  let lastY = -1, navY = scrollY, looping = false;
  function frame() {
    let busy = false;
    if (smoothing) {
      cur = lerp(cur, target, 0.11);
      if (Math.abs(target - cur) < 0.6) { cur = target; smoothing = false; }
      scrollTo({ top: cur, behavior: "instant" });
      busy = busy || smoothing;
    }
    const y = scrollY;
    if (y !== lastY) {
      const max = Math.max(1, maxScroll());
      if (bar) bar.style.transform = "scaleX(" + (y / max).toFixed(4) + ")";
      if (nav) {
        const open = links && links.classList.contains("open");
        if (y > 260 && y > navY + 4 && !open) nav.classList.add("hide");
        else if (y < navY - 4 || y < 260) nav.classList.remove("hide");
        navY = y;
      }
      if (S) {
        const r = story.getBoundingClientRect();
        const total = story.offsetHeight - innerHeight;
        if (total > 0 && r.top < innerHeight && r.bottom > 0) storyAt(clamp(-r.top / total, 0, 0.9999));
        else if (r.top >= innerHeight) storyAt(0);
        else if (r.bottom <= 0) storyAt(0.9999);
      }
      lastY = y;
    }
    if (stack && heroVisible) {
      rx = lerp(rx, trx, 0.07); ry = lerp(ry, try_, 0.07);
      const s = clamp(y / Math.max(1, art.offsetTop + art.offsetHeight), 0, 1);
      stack.style.transform = "translate3d(0," + (-s * 70).toFixed(1) + "px,0) rotateX(" + (rx + s * 18).toFixed(2) + "deg) rotateY(" + (ry - s * 12).toFixed(2) + "deg)";
      art.style.setProperty("--spread", s.toFixed(3));
      if (Math.abs(rx - trx) > 0.02 || Math.abs(ry - try_) > 0.02) busy = true;
    }
    if (busy) requestAnimationFrame(frame); else looping = false;
  }
  function kick() { if (!looping) { looping = true; requestAnimationFrame(frame); } }
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", () => { lastY = -1; kick(); }, { passive: true });
  kick();

  // ------------------------------------------------------------------ glass: a soft light follows the pointer; cards tilt; main buttons pull
  if (fine) {
    const spots = $$(".glass, .shot, .stat");
    spots.forEach((el) => { el.classList.add("spot"); if (getComputedStyle(el).position === "static") el.style.position = "relative"; });
    let pend = null, queued = false;
    document.addEventListener("pointermove", (e) => {
      pend = e;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const ev = pend; if (!ev) return; pend = null;
        const el = ev.target.closest && ev.target.closest(".spot");
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", (ev.clientX - r.left).toFixed(0) + "px");
        el.style.setProperty("--my", (ev.clientY - r.top).toFixed(0) + "px");
      });
    }, { passive: true });

    $$(".o, .person, .shot").forEach((el) => {
      el.classList.add("tilt");
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        const k = el.classList.contains("shot") ? 3 : 7;
        el.style.transform = "perspective(900px) rotateX(" + (-y * k).toFixed(2) + "deg) rotateY(" + (x * k).toFixed(2) + "deg) translateY(-4px)";
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });

    $$(".btn.primary.big, .nav-links .btn.primary, .end .btn").forEach((b) => {
      b.classList.add("mag");
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
        b.style.transform = "translate(" + (x * 0.22).toFixed(1) + "px," + (y * 0.34).toFixed(1) + "px)";
      });
      b.addEventListener("pointerleave", () => { b.style.transform = ""; });
    });
  }
})();
