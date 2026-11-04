/* Live background: domain-warped noise in the project palette, drawn by a WebGL fragment shader at low resolution
   behind the glass. It follows the pointer a little and shifts as the page scrolls. Paused when hidden; one still frame
   with reduced motion; the CSS background stays if WebGL is not available. */
(function () {
  "use strict";
  const atmos = document.querySelector(".atmos");
  if (!atmos) return;

  // the technical grid: drifts slowly, moves a little slower than the page, and is clearest around the pointer
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let gmx = 72, gmy = 28, tgx = 72, tgy = 28, lastG = 0;
    const g0 = performance.now();
    addEventListener("pointermove", (e) => { tgx = (e.clientX / innerWidth) * 100; tgy = (e.clientY / innerHeight) * 100; }, { passive: true });
    const grid = (now) => {
      if (!document.hidden && now - lastG > 33) {
        lastG = now;
        const t = (now - g0) / 1000;
        const ox = -((t * 4) % 160), oy = -((t * 2.5 + scrollY * 0.12) % 160);
        gmx += (tgx - gmx) * 0.06; gmy += (tgy - gmy) * 0.06;
        atmos.style.setProperty("--gx", ox.toFixed(1) + "px");
        atmos.style.setProperty("--gy", oy.toFixed(1) + "px");
        atmos.style.setProperty("--gmx", gmx.toFixed(1) + "%");
        atmos.style.setProperty("--gmy", gmy.toFixed(1) + "%");
      }
      requestAnimationFrame(grid);
    };
    requestAnimationFrame(grid);
  }
  const canvas = document.createElement("canvas");
  canvas.className = "bg-gl";
  canvas.setAttribute("aria-hidden", "true");
  let gl = null;
  try { gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" }); } catch (e) { gl = null; }
  if (!gl) return;

  const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const FS = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "uniform vec2 uRes;uniform float uTime;uniform vec2 uMouse;uniform float uScroll;",
    "uniform vec3 uA;uniform vec3 uB;uniform vec3 uC;uniform vec3 uD;",
    "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
    " return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return v;}",
    "void main(){",
    " vec2 uv=gl_FragCoord.xy/uRes;",
    " vec2 p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);",
    " float t=uTime*.035;",
    " p+=vec2(0.,uScroll*.35);",
    " vec2 m=(uMouse-.5*uRes)/min(uRes.x,uRes.y);",
    " p+=(p-m)*.06*exp(-2.5*length(p-m));",
    " vec2 q=vec2(fbm(p*1.3+t),fbm(p*1.3-t+vec2(3.1,1.7)));",
    " vec2 r=vec2(fbm(p*1.5+2.*q+vec2(1.7,9.2)+t*1.2),fbm(p*1.5+2.*q+vec2(8.3,2.8)-t*.8));",
    " float f=fbm(p*1.1+2.4*r);",
    " vec3 col=mix(uA,uB,smoothstep(.32,.82,f));",
    " col=mix(col,uC,smoothstep(.5,.95,r.x)*.6);",
    " col=mix(col,uD,smoothstep(.62,.98,f*1.1*r.y)*.45);",
    " col+=uB*.08*exp(-5.*length(p-m));",
    " col*=1.-.10*length(uv-.5);",
    " gl_FragColor=vec4(col,1.);",
    "}"
  ].join("\n");
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  } catch (e) { return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ["uRes", "uTime", "uMouse", "uScroll", "uA", "uB", "uC", "uD"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const LIGHT = ["#f3f3ee", "#d3e8da", "#efe5cf", "#a9d2b6"];
  const DARK = ["#111713", "#18291f", "#24251b", "#245039"];
  const root = document.documentElement;
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => { const t = root.getAttribute("data-theme"); return t ? t === "dark" : mq.matches; };
  function palette() { const P = isDark() ? DARK : LIGHT; gl.uniform3fv(U.uA, hex(P[0])); gl.uniform3fv(U.uB, hex(P[1])); gl.uniform3fv(U.uC, hex(P[2])); gl.uniform3fv(U.uD, hex(P[3])); draw(performance.now()); }

  const SCALE = 0.4;
  let mx = innerWidth * 0.7, my = innerHeight * 0.3, tmx = mx, tmy = my;
  function size() {
    const w = Math.max(2, Math.round(innerWidth * SCALE)), h = Math.max(2, Math.round(innerHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(U.uRes, w, h);
  }
  const t0 = performance.now();
  function draw(now) {
    size();
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    gl.uniform1f(U.uTime, (now - t0) / 1000 + 40);
    gl.uniform2f(U.uMouse, mx * SCALE, (innerHeight - my) * SCALE);
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    gl.uniform1f(U.uScroll, scrollY / max);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let last = 0, running = false;
  function loop(now) {
    if (document.hidden) { running = false; return; }
    if (now - last > 33) { draw(now); last = now; }
    requestAnimationFrame(loop);
  }
  atmos.prepend(canvas);
  root.classList.add("gl-on");
  palette();
  if (reduce) {
    addEventListener("resize", () => draw(performance.now()), { passive: true });
  } else {
    addEventListener("pointermove", (e) => { tmx = e.clientX; tmy = e.clientY; }, { passive: true });
    const go = () => { if (!running && !document.hidden) { running = true; requestAnimationFrame(loop); } };
    document.addEventListener("visibilitychange", go);
    go();
  }
  mq.addEventListener && mq.addEventListener("change", palette);
  new MutationObserver(palette).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
})();
