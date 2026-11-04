/* Runs first on every page: refuse to be framed (clickjacking) and apply a saved theme. */
(function () {
  "use strict";
  if (window.top !== window.self) {
    document.documentElement.classList.add("framed");
    document.addEventListener("DOMContentLoaded", function () {
      var a = document.createElement("a");
      a.href = window.location.href; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Open Thavanai in its own tab";
      a.className = "framed-link";
      document.body.replaceChildren(a);
    });
  }
  // watchdog: if a loading screen never starts (a script failed to load or was blocked), offer a fresh copy
  // instead of leaving the screen up forever
  document.addEventListener("DOMContentLoaded", function () {
    var demo = document.getElementById("splash"), site = document.getElementById("loader");
    if (demo) setTimeout(function () {
      if (!document.body.contains(demo) || demo.classList.contains("is-live")) return;
      var st = demo.querySelector(".ld-status");
      if (st) st.textContent = "The demo did not start. A fresh copy usually fixes this.";
      var a = document.createElement("a");
      a.className = "ld-retry"; a.href = location.pathname + "?fresh=" + Date.now(); a.textContent = "Reload the demo";
      var foot = demo.querySelector(".ld-foot") || demo; foot.appendChild(a);
    }, 9000);
    if (site && document.documentElement.classList.contains("intro-play")) setTimeout(function () {
      if (!document.body.contains(site) || site.classList.contains("is-live")) return;
      site.remove(); document.body.style.overflow = "";
      document.documentElement.dataset.revealed = "1";
    }, 9000);
  });
  try {
    var t = localStorage.getItem("thv-theme");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* storage blocked: follow the system theme */ }
})();
