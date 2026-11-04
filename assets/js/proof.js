/* The page proof: IST clock, pointer and scroll readout, registration marks, the section rail and the retention ruler.
   The ruler maps how far you have read to days kept: at 358 it turns amber ("due in 7 days"), at 365 red ("delete by"). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const pad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, "0");

  // clock in India time, whatever the visitor's own zone
  const clock = $("#hudClock");
  if (clock) {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const tick = () => { clock.textContent = f.format(new Date()); };
    tick(); setInterval(tick, 1000);
  }

  // pointer and scroll readout
  const hx = $("#hudX"), hy = $("#hudY"), hp = $("#hudP");
  addEventListener("pointermove", (e) => { if (hx) { hx.textContent = pad(e.clientX, 4); hy.textContent = pad(e.clientY, 4); } }, { passive: true });

  // registration marks at the start of each section, with its rail number
  const sections = $$("#rail a").map((a) => $(a.getAttribute("href"))).filter(Boolean);
  sections.forEach((sec, i) => {
    const l = document.createElement("i"); l.className = "reg l"; l.setAttribute("aria-hidden", "true");
    const r = document.createElement("i"); r.className = "reg r"; r.setAttribute("aria-hidden", "true");
    const n = document.createElement("span"); n.className = "reg-n l"; n.setAttribute("aria-hidden", "true"); n.textContent = pad(i + 1, 2) + " / " + pad(sections.length, 2);
    sec.prepend(l, r, n);
  });

  // ruler scale: a tick every 30 days, labelled every 90, and the limit at 365
  const scale = $("#rulerScale");
  if (scale) {
    for (let d = 0; d <= 365; d += 15) {
      const t = document.createElement("i");
      t.style.top = (d / 365 * 100).toFixed(2) + "%";
      if (d % 90 === 0) t.className = "major";
      scale.append(t);
      if (d % 90 === 0) { const em = document.createElement("em"); em.style.top = (d / 365 * 100).toFixed(2) + "%"; em.textContent = d; scale.append(em); }
    }
    const end = document.createElement("i"); end.className = "major"; end.style.top = "100%"; scale.append(end);
    const em = document.createElement("em"); em.style.top = "100%"; em.textContent = "365"; scale.append(em);
  }
  const mark = $("#rulerMark"), day = $("#rulerDay"), txt = $("#rulerTxt");

  // the rail follows the section in view
  const links = $$("#rail a");
  let current = -1;
  const pick = () => {
    const mid = innerHeight * 0.4;
    let idx = -1;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= mid) idx = i; });
    if (idx !== current) {
      current = idx;
      links.forEach((a, i) => { a.classList.toggle("on", i === idx); a.classList.toggle("done", i < idx); });
    }
  };

  let queued = false;
  const update = () => {
    queued = false;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = Math.min(1, Math.max(0, scrollY / max));
    if (hp) hp.textContent = pad(p * 100, 3);
    if (mark) {
      const d = Math.round(p * 365);
      mark.style.top = (p * 100).toFixed(2) + "%";
      day.textContent = pad(d, 3);
      const left = 365 - d;
      mark.classList.toggle("soon", left <= 7 && left > 0);
      mark.classList.toggle("due", left <= 0);
      txt.textContent = left <= 0 ? "delete by today" : left <= 7 ? "due in " + left + (left === 1 ? " day" : " days") : "days kept";
    }
    pick();
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update, { passive: true });
  update();
})();
