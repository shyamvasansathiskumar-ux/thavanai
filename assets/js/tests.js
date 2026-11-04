(function () {
  "use strict";
  const out = document.getElementById("out"), groups = document.getElementById("groups"), btn = document.getElementById("run");
  const line = (cls, text) => { const p = document.createElement("p"); p.className = "term-line " + cls; p.textContent = text; out.append(p); out.scrollTop = out.scrollHeight; return p; };
  let SQL = null;
  async function run() {
    btn.disabled = true; btn.textContent = "Running…";
    out.replaceChildren(); groups.replaceChildren();
    const tally = new Map(); let current = null;
    try {
      SQL = SQL || await window.Thavanai.loadSql();
      await window.Thavanai.runSelfTest(SQL, (m) => {
        if (m.type === "section") { current = m.text; tally.set(current, { p: 0, f: 0 }); line("sec", "\n== " + m.text); }
        else if (m.type === "pass") { tally.get(current).p++; line("ok", "  PASS  " + m.text); }
        else if (m.type === "fail") { tally.get(current).f++; line("err", "  FAIL  " + m.text + "  ->  " + m.extra); }
        else if (m.type === "note") line("note", "          " + m.text);
        else if (m.type === "result") line(m.extra.failed ? "err big" : "ok big", "\n" + m.text);
      });
      tally.forEach((v, k) => {
        const card = document.createElement("div"); card.className = "tg " + (v.f ? "bad" : "good");
        const n = document.createElement("strong"); n.textContent = String(v.p + v.f);
        const l = document.createElement("span"); l.textContent = k;
        const s = document.createElement("small"); s.textContent = v.f ? v.f + " failed" : "all passed";
        card.append(n, l, s); groups.append(card);
      });
    } catch (e) { line("err", "Could not run: " + (e && e.message || e)); }
    btn.disabled = false; btn.textContent = "Run again";
  }
  btn.addEventListener("click", run);
  setTimeout(run, 400);
})();
