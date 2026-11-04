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
      $$(".er-dot", er).forEach((d) => d.classList.toggle("hot", d.dataset.a === name || d.dataset.b === name));
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

  // ------------------------------------------------------------------ the 3D padlock: drag it, try to open it, the triggers refuse
  const lockCanvas = $("#lockGl");
  if (lockCanvas && T.Clay3D) {
    const box = lockCanvas.closest(".lockbox");
    const lock = T.Clay3D(lockCanvas, { shape: "lock", interactive: true, spin: 0.45, body: "#4f8f66", trim: "#e9ece6", rim: "#d9f0e1" });
    if (lock) box.classList.add("gl3d");
    const tries = [
      ["UPDATE deletion_log SET deleted_on = '2026-01-01' WHERE collection_id = 2;", "ERROR 1644 (45000): Deletion records cannot be edited."],
      ["DELETE FROM deletion_log WHERE collection_id = 2;", "ERROR 1644 (45000): Deletion records cannot be removed."],
      ["UPDATE data_collection SET record_count = 0 WHERE collection_id = 2;", "ERROR 1644 (45000): This collection is marked as deleted and is locked."],
      ["DELETE FROM data_collection WHERE collection_id = 2;", "ERROR 1644 (45000): A deleted collection is proof of deletion and cannot be removed."]
    ];
    let n = 0;
    const term = $("#lockTerm"), btn = $("#lockBtn"), count = $("#lockCount");
    const attempt = () => {
      const [sql, err] = tries[n % tries.length]; n++;
      term.textContent = "";
      const pr = document.createElement("span"); pr.className = "p"; pr.textContent = "mysql> ";
      const er = document.createElement("span"); er.className = "e"; er.textContent = err;
      term.append(pr, document.createTextNode(sql + "\n"), er);
      if (!reduce) { term.classList.remove("shake"); void term.offsetWidth; term.classList.add("shake"); }
      count.textContent = Math.min(n, 4) + " of 4 tried" + (n >= 4 ? " · every one refused" : "");
      if (lock) { lock.lift(0.45); setTimeout(() => lock.lift(0), 170); }
    };
    if (btn) btn.addEventListener("click", attempt);
    if (lock) lock.onTap = attempt;
  }

  // ------------------------------------------------------------------ rolling labels on links and buttons (pointer devices)
  if (fine) {
    const roll = (el) => {
      if (el.querySelector(".roll")) return;
      const tn = Array.from(el.childNodes).find((x) => x.nodeType === 3 && x.textContent.trim());
      if (!tn) return;
      const raw = tn.textContent, text = raw.trim();
      const w = document.createElement("span"); w.className = "roll"; w.dataset.t = text;
      const inner = document.createElement("span"); inner.textContent = text; w.append(inner);
      const parts = [];
      if (/^\s/.test(raw)) parts.push(document.createTextNode(" "));
      parts.push(w);
      if (/\s$/.test(raw)) parts.push(document.createTextNode(" "));
      tn.replaceWith(...parts);
    };
    $$(".nav-links a, a.btn, button.btn").forEach(roll);
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
  const G = window.gsap, ST = window.ScrollTrigger, SPL = window.SplitText;
  const useG = !!(G && ST && SPL);
  const whenRevealed = (fn) => { if (root.dataset.revealed) fn(); else document.addEventListener("thv:reveal", fn, { once: true }); };
  const hero = $(".hero");
  const heroH = $(".hero-h");
  if (useG) {
    root.classList.add("gs");
    G.registerPlugin(ST, SPL);
    $$(".oop, .team, .layers, .tests, #shots").forEach((el) => el.classList.remove("rv"));
  } else {
    $$(".h2, .band-h, .end-h").forEach(splitWords);
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
    whenRevealed(() => setTimeout(() => hero && hero.classList.add("go"), 60));
  }

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
  // ================================================================== GSAP scenes (ScrollTrigger + SplitText)
  if (useG) {
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();

    // hero: a sharp letter-by-letter fade-up as the page opens; Tamil rises as whole words so its vowel signs stay joined
    let heroChars = [], subWords = [];
    if (heroH) { heroChars = SPL.create(heroH, { type: "chars", charsClass: "ch" }).chars; G.set(heroChars, { yPercent: 105, opacity: 0 }); }
    const sub = $(".hero-sub");
    if (sub) { G.set(sub, { opacity: 1, y: 0 }); subWords = SPL.create(sub, { type: "words", wordsClass: "sw" }).words; G.set(subWords, { y: 14, opacity: 0 }); }
    const heroBits = $$(".hero-copy > :not(.hero-h):not(.hero-sub)");
    G.set(heroBits, { y: 18, opacity: 0 });
    if (art) G.set(art, { y: 60, scale: 0.94, opacity: 0 });
    whenRevealed(() => {
      const tl = G.timeline();
      tl.to(heroChars, { yPercent: 0, opacity: 1, duration: 0.62, ease: "power4.out", stagger: 0.045 }, 0.05)
        .to(subWords, { y: 0, opacity: 1, duration: 0.55, ease: "power3.out", stagger: 0.03 }, 0.3)
        .to(heroBits, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.07 }, 0.18)
        .to(art, { y: 0, scale: 1, opacity: 1, duration: 1.4, ease: "expo.out" }, 0.25);
      setTimeout(() => ST.refresh(), 400);
    });
    G.to(".hero-copy", { yPercent: -12, opacity: 0.3, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

    // headings: on entry every letter shuffles through terminal glyphs and locks in as it rises; widths are held so lines never jump
    const MATRIX = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>=+";
    const shuffle = (chars, step) => {
      const t0 = performance.now();
      const items = chars.map((c, i) => ({ c, final: c.textContent, w: c.getBoundingClientRect().width, start: i * step, end: i * step + 360 }));
      items.forEach((it) => { if (it.final.trim()) { it.c.style.width = it.w + "px"; it.c.style.textAlign = "center"; } });
      const tick = (now) => {
        const t = now - t0; let busy = false;
        for (const it of items) {
          if (!it.final.trim() || it.done) continue;
          if (t >= it.end) { it.c.textContent = it.final; it.c.style.width = ""; it.c.style.textAlign = ""; it.done = true; continue; }
          busy = true;
          if (t >= it.start - 140) it.c.textContent = MATRIX[(Math.random() * MATRIX.length) | 0];
        }
        if (busy) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    fontsReady.then(() => {
      $$(".h2, .band-h, .end-h").forEach((el) => {
        SPL.create(el, {
          type: "words,chars", mask: "words", wordsClass: "wd", charsClass: "ch", autoSplit: true,
          onSplit(self) {
            el._chars = self.chars;
            const tw = G.from(self.chars, { yPercent: 110, opacity: 0, duration: 0.7, ease: "power3.out", stagger: 0.016, paused: !el._played });
            if (el._played) { tw.progress(1); return tw; }
            ST.create({ trigger: el, start: "top 88%", once: true, onEnter: () => { el._played = true; el.classList.add("in"); tw.play(); shuffle(self.chars, 16); } });
            return tw;
          }
        });
        if (fine) el.addEventListener("pointerenter", () => {
          if (el._chars && el._played) G.to(el._chars, { keyframes: { y: [0, -7, 0] }, duration: 0.55, ease: "sine.inOut", stagger: 0.012, overwrite: false });
        });
      });
      ST.refresh();
    });

    // labels decode from random glyphs when they arrive, and again on hover
    const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%+";
    const scramble = (el) => {
      if (el._scr) return;
      const final = el.textContent; el._scr = true;
      const t0 = performance.now(), dur = 700;
      const step = (now) => {
        const k = (now - t0) / dur;
        let out = "";
        for (let i = 0; i < final.length; i++) { const c = final[i]; out += (c === " " || i < k * final.length) ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
        el.textContent = k < 1 ? out : final;
        if (k < 1) requestAnimationFrame(step); else el._scr = false;
      };
      requestAnimationFrame(step);
    };
    $$(".eyebrow").forEach((el) => {
      if (el.children.length || !el.textContent.trim()) return;
      el.setAttribute("aria-label", el.textContent.trim());
      ST.create({ trigger: el, start: "top 92%", once: true, onEnter: () => scramble(el) });
      if (fine) el.addEventListener("pointerenter", () => scramble(el));
    });

    // clay objects drift and turn with the scroll
    $$(".clay:not(.lock-fallback)").forEach((el) => {
      G.fromTo(el, { y: 80, rotate: -10 }, { y: -100, rotate: 10, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 1.2 } });
    });

    let erTables = [], termLines = [];
    // schema: connector lines are drawn by the scroll itself; once drawn, keys flow along them as small dots
    if (er) {
      er.classList.add("in", "scrub");
      const NS = "http://www.w3.org/2000/svg";
      const lines = $$(".er-e", er);
      const firstTable = $(".er-t", er);
      lines.forEach((e, i) => {
        e.id = "erE" + i;
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("r", "3.4"); dot.setAttribute("class", "er-dot");
        dot.dataset.a = e.dataset.a; dot.dataset.b = e.dataset.b;
        const mo = document.createElementNS(NS, "animateMotion");
        mo.setAttribute("dur", (2.4 + (i % 4) * 0.35).toFixed(2) + "s"); mo.setAttribute("repeatCount", "indefinite"); mo.setAttribute("begin", (i * 0.27).toFixed(2) + "s");
        const mp = document.createElementNS(NS, "mpath"); mp.setAttribute("href", "#" + e.id);
        mo.append(mp); dot.append(mo);
        er.insertBefore(dot, firstTable);
      });
      G.fromTo(lines, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "none", stagger: 0.18,
        scrollTrigger: { trigger: er, start: "top 85%", end: "center 40%", scrub: 0.6, onUpdate: (self) => er.classList.toggle("flow", self.progress > 0.97) } });
      erTables = $$(".er-t", er);
    }

    // the green band opens out of a rounded card
    const band = $("#decision");
    if (band) G.fromTo(band, { clipPath: "inset(6% 4% round 44px)" }, { clipPath: "inset(0% 0% round 0px)", ease: "none", scrollTrigger: { trigger: band, start: "top bottom", end: "top 25%", scrub: true } });

    // the law timeline draws as it scrolls in
    $$(".timeline").forEach((tl) => G.fromTo(tl, { "--tl": 0 }, { "--tl": 1, ease: "none", scrollTrigger: { trigger: tl, start: "top 88%", end: "top 50%", scrub: true } }));

    // the test terminal prints line by line
    const termEl = $("#tests .big-term");
    if (termEl) {
      const nodes = Array.from(termEl.childNodes); termEl.textContent = "";
      let line = document.createElement("span"); line.className = "ln";
      const push = () => { termEl.append(line); line = document.createElement("span"); line.className = "ln"; };
      nodes.forEach((nd) => {
        if (nd.nodeType === 3) nd.textContent.split("\n").forEach((part, i) => { if (i > 0) push(); if (part) line.append(document.createTextNode(part)); });
        else line.append(nd);
      });
      push();
      termLines = $$(".ln", termEl);
    }

    // groups arrive in a stagger
    // The trigger only says "show now"; the animation is a separate tween that clears itself when done.
    // (A tween bound to its trigger gets rewound when ScrollTrigger re-measures the page, which left cards stuck.)
    const showWhen = (els, trig, from, to, start) => {
      if (!els.length) return;
      G.set(els, from);
      let shown = false;
      const show = () => { if (shown) return; shown = true; G.to(els, to); };
      ST.create({ trigger: trig, start: start || "top 84%", onEnter: show, onEnterBack: show, onLeave: show, onRefresh: (self) => { if (self.progress > 0) show(); } });
    };
    const batchIn = (sel, from, trig) => {
      const els = $$(sel); if (!els.length) return;
      const stagger = from.stagger || 0.08; const f = Object.assign({ opacity: 0 }, from); delete f.stagger;
      showWhen(els, trig, f, { x: 0, y: 0, scale: 1, rotationX: 0, opacity: 1, duration: 0.95, ease: "expo.out", stagger, clearProps: "transform,opacity" });
    };
    if (erTables.length) showWhen(erTables, er, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out", stagger: 0.07, clearProps: "opacity" }, "top 85%");
    if (termLines.length) showWhen(termLines, termEl, { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.13, ease: "power2.out", clearProps: "transform,opacity" }, "top 80%");
    batchIn(".layers > div", { x: -56 }, ".layers");
    batchIn(".oop .o", { y: 70, rotationX: -38, transformPerspective: 900, stagger: { each: 0.06, grid: "auto" } }, ".oop");
    batchIn(".team .person", { y: 60, scale: 0.95, stagger: 0.12 }, ".team");
    batchIn("#problem tbody tr", { y: 18, stagger: 0.08 }, "#problem table");
    batchIn(".adds li", { y: 26, stagger: 0.07 }, ".adds");
    batchIn(".tally li", { x: -24, stagger: 0.05 }, ".tally");

    // the law strip runs faster while you scroll
    const mt = $(".marquee-track");
    if (mt) {
      const run = G.to(mt, { xPercent: -50, duration: 46, ease: "none", repeat: -1 });
      ST.create({ trigger: ".marquee", start: "top bottom", end: "bottom top", onUpdate: (self) => { run.timeScale(clamp(1 + Math.abs(self.getVelocity()) / 220, 1, 7)); } });
      G.ticker.add(() => { const ts = run.timeScale(); if (ts > 1.001) run.timeScale(ts + (1 - ts) * 0.04); });
      const mq = $(".marquee");
      mq.addEventListener("pointerenter", () => G.to(run, { timeScale: 0.2, duration: 0.5 }));
      mq.addEventListener("pointerleave", () => G.to(run, { timeScale: 1, duration: 0.5 }));
    }

    // the desktop screens scroll sideways while the section is pinned (wide screens)
    const mm = G.matchMedia();
    mm.add("(min-width: 1000px)", () => {
      const sec = $("#inside"), pin = $("#shotsPin"), track = $("#shots"), hb = $("#hsBar");
      if (!sec || !pin || !track) return;
      sec.classList.add("hs");
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      G.to(track, {
        x: () => -dist(), ease: "none",
        scrollTrigger: { trigger: pin, start: "top top", end: () => "+=" + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1, refreshPriority: 10,
          onUpdate: (self) => { if (hb) hb.style.transform = "scaleX(" + self.progress.toFixed(4) + ")"; } }
      });
      return () => sec.classList.remove("hs");
    });
    // the pin adds thousands of pixels: measure it first, then everything below it
    ST.sort(); ST.refresh();

    addEventListener("load", () => ST.refresh(), { once: true });
  }
})();
