/* Puffy clay 3D objects, drawn by ray marching signed distance fields in a WebGL fragment shader.
   Two shapes: the Thavanai tag and a padlock whose shackle can lock. No library, no network, no images. */
(function (T) {
  "use strict";
  const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const FS = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "uniform vec2 uRes;uniform float uTime;uniform vec2 uRot;uniform float uShape;uniform float uLock;uniform float uDrop;",
    "uniform vec3 uBody;uniform vec3 uTrim;uniform vec3 uRim;",
    "mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}",
    "float box2(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}",
    "float rbox(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;}",
    "float extr(vec3 p,float d2,float h,float r){vec2 w=vec2(d2+r,abs(p.z)-h+r);return min(max(w.x,w.y),0.)+length(max(w,0.))-r;}",
    "float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}",
    // the tag: rectangle with the top-right corner cut, a punched hole and three raised bars
    "vec2 tagMap(vec3 p){",
    " vec2 q=p.xy;",
    " float d2=box2(q,vec2(.975,.825));",
    " d2=max(d2,(q.x+q.y-1.25)*.7071);",
    " d2=max(d2,-(length(q-vec2(.56,.47))-.15));",
    " float body=extr(p,d2,.2,.16);",
    " float b=1e3;",
    " b=min(b,rbox(p-vec3(-.125,.09,.2),vec3(.55,.085,.07),.07));",
    " b=min(b,rbox(p-vec3(-.275,-.24,.2),vec3(.40,.085,.07),.07));",
    " b=min(b,rbox(p-vec3(-.425,-.56,.2),vec3(.25,.085,.07),.07));",
    " float d=smin(body,b,.03);",
    " return vec2(d,b<body+.01?2.:1.);",
    "}",
    // the padlock: body with a keyhole, shackle lifted by uLock (0 locked, 1 open)
    "vec2 lockMap(vec3 p){",
    " vec3 bp=p-vec3(0.,-.38,0.);",
    " float body=rbox(bp,vec3(.78,.6,.34),.24);",
    " vec2 k=bp.xy-vec2(0.,.02);",
    " float kh=min(length(k-vec2(0.,.08))-.11,box2(k-vec2(0.,-.12),vec2(.045,.15)));",
    " body=max(body,-max(kh,-(bp.z-.22)));",
    " float c=.18+uLock*.34;",
    " vec3 q=p-vec3(0.,c,0.);",
    " float sh;",
    " if(q.y>0.){vec2 t=vec2(length(q.xy)-.46,q.z);sh=length(t)-.13;}",
    " else{sh=max(length(vec2(abs(q.x)-.46,q.z))-.13,-(q.y+c+.05));}",
    " return sh<body?vec2(sh,2.):vec2(body,1.);",
    "}",
    "vec2 map(vec3 p){",
    " p.y+=sin(uTime*1.3)*.045+uDrop;",
    " p.xz=rot(uRot.x)*p.xz;p.yz=rot(uRot.y)*p.yz;",
    " return uShape<.5?tagMap(p):lockMap(p);",
    "}",
    "vec3 nor(vec3 p){vec2 e=vec2(.0015,0.);return normalize(vec3(map(p+e.xyy).x-map(p-e.xyy).x,map(p+e.yxy).x-map(p-e.yxy).x,map(p+e.yyx).x-map(p-e.yyx).x));}",
    "float ao(vec3 p,vec3 n){float o=0.,s=1.;for(int i=1;i<=5;i++){float h=.02+.07*float(i);o+=(h-map(p+n*h).x)*s;s*=.72;}return clamp(1.-1.8*o,0.,1.);}",
    "void main(){",
    " vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);",
    " vec3 ro=vec3(0.,0.,4.1),rd=normalize(vec3(uv,-1.75));",
    " float t=0.,md=1e3;vec2 h=vec2(0.);bool hit=false;",
    " for(int i=0;i<96;i++){h=map(ro+rd*t);md=min(md,h.x);if(h.x<.0012){hit=true;break;}t+=h.x*.9;if(t>8.)break;}",
    " if(!hit){float a=1.-smoothstep(0.,.018,md);gl_FragColor=vec4(uRim*.9,a*.0);return;}",
    " vec3 p=ro+rd*t,n=nor(p),v=-rd;",
    " vec3 l=normalize(vec3(-.55,.75,.65)),l2=normalize(vec3(.7,-.2,.5));",
    " float nl=dot(n,l);float wrap=pow(clamp(nl*.5+.5,0.,1.),1.5);",
    " float a=ao(p,n);",
    " float rim=pow(1.-clamp(dot(n,v),0.,1.),2.6);",
    " float sp=pow(clamp(dot(reflect(-l,n),v),0.,1.),22.)*.32;",
    " vec3 base=h.y>1.5?uTrim:uBody;",
    " vec3 col=base*(.30+.78*wrap)*mix(.55,1.,a);",
    " col+=base*.18*clamp(dot(n,l2),0.,1.);",
    " col+=sp+rim*.32*uRim;",
    " col=pow(col,vec3(.95));",
    " gl_FragColor=vec4(col,1.);",
    "}"
  ].join("\n");

  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  /** Clay3D(canvas, { shape: "tag" | "lock", interactive, spin, body, trim, rim }) -> controller or null if WebGL is missing. */
  function Clay3D(canvas, opts) {
    const o = Object.assign({ shape: "tag", interactive: false, spin: 0.35, body: "#9cd3af", trim: "#f3f3ee", rim: "#ffffff" }, opts || {});
    let gl = null;
    try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: "low-power" }); } catch (e) { gl = null; }
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch (e) { return null; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ["uRes", "uTime", "uRot", "uShape", "uLock", "uDrop", "uBody", "uTrim", "uRim"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    const setColors = (b, t, r) => { gl.uniform3fv(U.uBody, hex(b)); gl.uniform3fv(U.uTrim, hex(t)); gl.uniform3fv(U.uRim, hex(r)); };
    setColors(o.body, o.trim, o.rim);
    gl.uniform1f(U.uShape, o.shape === "lock" ? 1 : 0);
    gl.clearColor(0, 0, 0, 0);

    const S = { yaw: -0.5, pitch: 0.18, vy: o.spin, tyaw: null, tpitch: 0.18, lock: 0, tlock: 0, drop: 0, tdrop: 0, drag: null, visible: true, running: false, t0: performance.now(), dead: false };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(U.uRes, w, h);
    }
    function draw(now) {
      size();
      const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now;
      if (!S.drag) {
        if (S.tyaw != null) { S.yaw += (S.tyaw - S.yaw) * 0.08; }
        else S.yaw += S.vy * dt;
        S.pitch += (S.tpitch - S.pitch) * 0.06;
      }
      S.lock += (S.tlock - S.lock) * 0.16;
      S.drop += (S.tdrop - S.drop) * 0.12;
      gl.uniform1f(U.uTime, reduce ? 0 : (now - S.t0) / 1000);
      gl.uniform2f(U.uRot, S.yaw, S.pitch);
      gl.uniform1f(U.uLock, S.lock);
      gl.uniform1f(U.uDrop, S.drop);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function loop(now) {
      if (S.dead) return;
      if (!S.visible || document.hidden) { S.running = false; return; }
      draw(now);
      if (reduce && !S.drag && Math.abs(S.tlock - S.lock) < 0.002) { S.running = false; return; }
      requestAnimationFrame(loop);
    }
    function start() { if (!S.running && !S.dead) { S.running = true; S.last = 0; requestAnimationFrame(loop); } }
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { S.visible = es[0].isIntersecting; if (S.visible) start(); }).observe(canvas);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });

    if (o.interactive) {
      canvas.style.touchAction = "pan-y";
      canvas.addEventListener("pointerdown", (e) => { S.drag = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch, moved: 0 }; canvas.setPointerCapture(e.pointerId); start(); });
      canvas.addEventListener("pointermove", (e) => {
        if (!S.drag) return;
        const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
        S.drag.moved = Math.max(S.drag.moved, Math.abs(dx) + Math.abs(dy));
        S.yaw = S.drag.yaw + dx * 0.012;
        S.pitch = Math.max(-0.9, Math.min(0.9, S.drag.pitch + dy * 0.01));
        S.tpitch = S.pitch; S.tyaw = null; S.vy = 0;
        start();
      });
      const end = () => { if (!S.drag) return; const tap = S.drag.moved < 6; S.drag = null; S.vy = o.spin * 0.6; if (tap && api.onTap) api.onTap(); };
      canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    }

    const api = {
      setLock(v) { S.tlock = v ? 0 : 1; start(); },
      isLocked() { return S.tlock === 0; },
      lift(v) { S.tlock = Math.max(0, Math.min(1, v)); start(); },
      face(yaw) { const k = Math.PI * 2; S.tyaw = yaw + Math.round((S.yaw - yaw) / k) * k; S.tpitch = 0.12; start(); },
      yaw() { return S.yaw; },
      spin(v) { S.tyaw = null; S.vy = v; start(); },
      drop(v) { S.tdrop = v; start(); },
      colors(b, t, r) { setColors(b, t, r); start(); },
      redraw() { start(); },
      destroy() { S.dead = true; const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); },
      onTap: null
    };
    start();
    return api;
  }
  (window.Thavanai = window.Thavanai || {}).Clay3D = Clay3D;
})();
