/* Decide before first paint whether the opening plays (once per visit, never with reduced motion). */
(function () {
  "use strict";
  var seen = false;
  try { seen = sessionStorage.getItem("thv-intro") === "1"; } catch (e) { seen = true; }
  if (seen || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) document.documentElement.classList.add("intro-seen");
  else document.documentElement.classList.add("intro-play");
})();
