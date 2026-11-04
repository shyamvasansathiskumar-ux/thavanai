/* The loading screen shared by the site and the demo. It only ever shows real progress reported by the page
   (fonts, the database engine download, its fingerprint check), never a fake timer beyond a short minimum. */
(function () {
  "use strict";
  const T = window.Thavanai = window.Thavanai || {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  T.Loader = function (el, opts) {
    const o = Object.assign({ min: 1800 }, opts || {});
    if (reduce) o.min = Math.min(o.min, 300);
    const num = el.querySelector(".ld-num b"), status = el.querySelector(".ld-status"), bar = el.querySelector(".ld-bar i"), canvas = el.querySelector(".ld-gl");
    const t0 = performance.now();
    let target = 0, shown = 0, finishing = null, label = "";
    let clay = null;
    if (canvas && T.Clay3D) {
      clay = T.Clay3D(canvas, { shape: "tag", spin: reduce ? 0 : 7, body: "#9cd3af", trim: "#f3f3ee", rim: "#d9f0e1" });
      if (clay) { el.classList.add("gl-ready"); if (!reduce) { clay.drop(0); } }
    }
    el.classList.add("is-live");
    let spin = 7;
    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
      const cap = Math.min(target, (now - t0) / o.min);
      shown += (cap - shown) * (reduce ? 1 : 1 - Math.exp(-dt * 9));
      if (cap - shown < 0.006) shown = cap;
      const pct = Math.floor(shown * 100 + 0.0001);
      if (num && num.textContent !== String(pct)) num.textContent = String(pct);
      if (bar) bar.style.transform = "scaleX(" + shown.toFixed(4) + ")";
      if (clay && !finishing && !reduce) { spin += (0.8 - spin) * (1 - Math.exp(-dt * 2.2)); clay.spin(spin); }
      if (finishing && shown >= 0.995) { shown = 1; if (num) num.textContent = "100"; if (bar) bar.style.transform = "scaleX(1)"; finishing(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    return {
      log(key, text, ok) {
        const list = el.querySelector(".ld-log"); if (!list) return;
        const li = document.createElement("li");
        const b = document.createElement("b"); b.textContent = key;
        li.append(b, document.createTextNode(" " + text));
        if (ok) li.classList.add("ok");
        list.append(li);
        while (list.children.length > 4) list.firstElementChild.remove();
      },
      set(f, text) {
        target = Math.max(target, Math.min(1, f));
        if (text && text !== label && status) { label = text; status.textContent = text; }
      },
      done(text) {
        if (text && status) status.textContent = text;
        target = 1;
        return new Promise((resolve) => {
          finishing = () => {
            const reveal = () => {
              document.documentElement.dataset.revealed = "1";
              document.dispatchEvent(new CustomEvent("thv:reveal"));
            };
            if (reduce) {
              el.classList.add("is-done", "is-open");
              reveal(); resolve();
              setTimeout(() => { if (clay) clay.destroy(); el.remove(); }, 350);
              return;
            }
            if (clay) clay.face(0);
            setTimeout(() => el.classList.add("is-stamp"), 380);
            setTimeout(() => el.classList.add("is-done"), 1000);
            setTimeout(() => { el.classList.add("is-open"); reveal(); resolve(); }, 1250);
            setTimeout(() => { if (clay) clay.destroy(); el.remove(); }, 2400);
          };
        });
      }
    };
  };
})();
