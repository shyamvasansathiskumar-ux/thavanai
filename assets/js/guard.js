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
  try {
    var t = localStorage.getItem("thv-theme");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* storage blocked: follow the system theme */ }
})();
