/* Thavanai: clay 3D objects that travel with the scroll.
   Each object takes the place of a flat clay icon in the page (.clay[data-obj]); the icon stays as the fallback.
   Built with three.js and bundled into assets/js/scene3d.js by tools/build-scene.sh. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Group, Mesh, MeshPhysicalMaterial,
  Shape, Path, ExtrudeGeometry, CylinderGeometry, TorusGeometry, SphereGeometry, CapsuleGeometry, LatheGeometry,
  TubeGeometry, CurvePath, LineCurve3, Vector2, Vector3, PlaneGeometry, MeshBasicMaterial, CanvasTexture,
  SRGBColorSpace, ACESFilmicToneMapping, MathUtils
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const anchors = Array.from(document.querySelectorAll(".clay[data-obj]"));
if (!reduce && anchors.length) start();

function start() {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { return; }
  const canvas = renderer.domElement;
  canvas.className = "scene3d";
  canvas.setAttribute("aria-hidden", "true");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  document.body.append(canvas);
  document.documentElement.classList.add("three-on");

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 14);
  scene.add(new HemisphereLight(0xffffff, 0x2c5e3f, 1.25));
  const key = new DirectionalLight(0xffffff, 2.3); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new DirectionalLight(0x9cd3af, 1.4); rim.position.set(5, -2, -6); scene.add(rim);
  const fill = new DirectionalLight(0xfff1d6, 0.6); fill.position.set(6, 2, 4); scene.add(fill);

  const clay = (hex, rough = 0.58) => new MeshPhysicalMaterial({ color: hex, roughness: rough, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.55, sheen: 0.7, sheenRoughness: 0.75, sheenColor: 0xffffff });
  const M = {
    mint: clay(0x9cd3af), green: clay(0x3f7b56), paper: clay(0xf3f1ea, 0.65), amber: clay(0xe2a24a), red: clay(0xc9574c),
    grey: clay(0xd3d8d0, 0.5), wood: clay(0xd7b88a, 0.7), ink: clay(0x1c3527, 0.7)
  };
  const puff = (shape, depth, bevel) => {
    const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 8, curveSegments: 28 });
    g.center(); return g;
  };
  const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 5, r);
  const disc = (radius, height, r) => {
    const pts = [new Vector2(0, -height / 2)];
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push(new Vector2(radius - r + Math.cos(a) * r, -height / 2 + r + Math.sin(a) * r)); }
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push(new Vector2(radius - r + Math.cos(a) * r, height / 2 - r + Math.sin(a) * r)); }
    pts.push(new Vector2(0, height / 2));
    return new LatheGeometry(pts, 48);
  };
  const roundedPoly = (pts, r) => {
    const s = new Shape();
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      const v1 = new Vector2(p0[0] - p1[0], p0[1] - p1[1]).normalize(), v2 = new Vector2(p2[0] - p1[0], p2[1] - p1[1]).normalize();
      const a = [p1[0] + v1.x * r, p1[1] + v1.y * r], b = [p1[0] + v2.x * r, p1[1] + v2.y * r];
      if (i === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
      s.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
    }
    s.closePath();
    return s;
  };
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new Mesh(g, m); o.position.set(x, y, z); return o; };

  // the Thavanai tag: the logo outline, a punched hole and three bars
  function makeTag(body = M.mint) {
    const P = (x, y) => [(x - 61) / 40, -(y - 63) / 40];
    const s = roundedPoly([P(22, 30), P(78, 30), P(100, 52), P(100, 96), P(22, 96)], 0.12);
    const hole = new Path(); hole.absarc(P(84, 44)[0], P(84, 44)[1], 0.15, 0, Math.PI * 2, true); s.holes.push(hole);
    const g = new Group();
    g.add(mesh(puff(s, 0.16, 0.13), body));
    [[-0.125, 0.0875, 1.1], [-0.275, -0.2375, 0.8], [-0.425, -0.5625, 0.5]].forEach(([x, y, w]) => g.add(mesh(rbox(w, 0.17, 0.12, 0.06), M.paper, x, y, 0.2)));
    return g;
  }
  function makeStopwatch() {
    const g = new Group();
    const body = mesh(disc(0.95, 0.42, 0.18), M.amber); body.rotation.x = Math.PI / 2; g.add(body);
    const face = mesh(disc(0.7, 0.1, 0.05), M.paper, 0, 0, 0.2); face.rotation.x = Math.PI / 2; g.add(face);
    g.add(mesh(new CapsuleGeometry(0.13, 0.16, 6, 16), M.grey, 0, 1.08, 0));
    const h1 = mesh(rbox(0.08, 0.46, 0.06, 0.03), M.ink, 0, 0.2, 0.28); g.add(h1);
    const h2 = mesh(rbox(0.06, 0.36, 0.06, 0.03), M.red, 0.14, -0.08, 0.3); h2.rotation.z = -1.1; g.add(h2);
    return g;
  }
  function makeCalendar() {
    const g = new Group();
    g.add(mesh(rbox(1.6, 1.45, 0.34, 0.16), M.paper));
    g.add(mesh(rbox(1.6, 0.46, 0.38, 0.16), M.amber, 0, 0.5, 0.02));
    [-0.42, 0.42].forEach((x) => g.add(mesh(new CapsuleGeometry(0.075, 0.3, 6, 12), M.grey, x, 0.78, 0.05)));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const due = r === 1 && c === 1;
      g.add(mesh(rbox(0.32, 0.26, 0.1, 0.05), due ? M.red : M.mint, -0.42 + c * 0.42, 0.02 - r * 0.38, 0.2));
    }
    return g;
  }
  function makeShield() {
    const P = (x, y) => [(x - 100) / 70, -(y - 102) / 70];
    const s = roundedPoly([P(100, 30), P(158, 52), P(158, 104), P(100, 174), P(42, 104), P(42, 52)], 0.16);
    const g = new Group();
    g.add(mesh(puff(s, 0.2, 0.14), M.paper));
    g.add(mesh(rbox(0.82, 0.58, 0.14, 0.08), M.mint, 0, 0.18, 0.24));
    const slash = mesh(new CapsuleGeometry(0.085, 1.05, 6, 12), M.red, 0, 0.12, 0.34); slash.rotation.z = -Math.PI / 4; g.add(slash);
    return g;
  }
  function makeDatabase() {
    const g = new Group();
    [-0.5, 0, 0.5].forEach((y, i) => g.add(mesh(disc(0.9, 0.38, 0.14), i === 1 ? M.green : M.mint, 0, y, 0)));
    return g;
  }
  function makeCheck() {
    const g = new Group();
    const b = mesh(disc(0.95, 0.34, 0.15), M.green); b.rotation.x = Math.PI / 2; g.add(b);
    const path = new CurvePath();
    const a = new Vector3(-0.42, 0.02, 0.24), m = new Vector3(-0.12, -0.28, 0.24), e = new Vector3(0.44, 0.32, 0.24);
    path.add(new LineCurve3(a, m)); path.add(new LineCurve3(m, e));
    g.add(new Mesh(new TubeGeometry(path, 32, 0.1, 16, false), M.paper));
    [a, m, e].forEach((p) => g.add(mesh(new SphereGeometry(0.1, 20, 14), M.paper, p.x, p.y, p.z)));
    return g;
  }
  function makeStamp() {
    const g = new Group();
    g.add(mesh(rbox(1.5, 0.26, 0.9, 0.1), M.red, 0, -0.62, 0));
    g.add(mesh(rbox(1.24, 0.34, 0.72, 0.12), M.wood, 0, -0.34, 0));
    g.add(mesh(new CylinderGeometry(0.13, 0.2, 0.5, 24), M.wood, 0, 0.06, 0));
    g.add(mesh(new SphereGeometry(0.34, 32, 20), M.wood, 0, 0.5, 0));
    return g;
  }
  function makeTags() {
    const g = new Group();
    [[M.amber, -0.35, 0.28, -0.5, 0.22], [M.paper, -0.1, 0.12, -0.25, 0.1], [M.mint, 0.18, -0.08, 0, -0.05]].forEach(([m, x, y, z, r]) => {
      const t = makeTag(m); t.position.set(x, y, z); t.rotation.z = r; t.scale.setScalar(0.85); g.add(t);
    });
    return g;
  }
  const MAKERS = { tag: makeTag, watch: makeStopwatch, cal: makeCalendar, shield: makeShield, db: makeDatabase, check: makeCheck, stamp: makeStamp, tags: makeTags };

  // a soft contact shadow under each object
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d"); const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(15,36,24,0.55)"); gr.addColorStop(1, "rgba(15,36,24,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
  })();

  const items = anchors.map((el, i) => {
    const make = MAKERS[el.dataset.obj] || makeTag;
    const obj = make();
    const holder = new Group(); holder.add(obj);
    const sh = new Mesh(new PlaneGeometry(2.4, 0.7), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 }));
    sh.position.set(0, -1.45, -0.6); holder.add(sh);
    holder.visible = false;
    scene.add(holder);
    return { el, holder, obj, shadow: sh, seed: i * 1.7, s: 0, seen: false, spin: (i % 2 ? -1 : 1) };
  });

  let W = 0, H = 0, k = 1;
  const size = () => {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    k = (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / H;
  };
  size();
  addEventListener("resize", size, { passive: true });

  let px = 0, py = 0, tpx = 0, tpy = 0;
  addEventListener("pointermove", (e) => { tpx = e.clientX / W - 0.5; tpy = e.clientY / H - 0.5; }, { passive: true });

  const t0 = performance.now();
  let running = false, blank = false;
  function frame(now) {
    if (document.hidden) { running = false; return; }
    const t = (now - t0) / 1000;
    px += (tpx - px) * 0.05; py += (tpy - py) * 0.05;
    let any = false;
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      const visible = r.bottom > -220 && r.top < H + 220 && r.width > 0;
      it.holder.visible = visible;
      if (!visible) { it.seen = false; it.s = 0; continue; }
      any = true;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const p = cy / H - 0.5;
      it.s += ((r.top < H * 0.98 ? 1 : 0) - it.s) * 0.07;
      const base = (r.width * k) / 2.3;
      const pop = 1 + Math.sin(Math.min(1, it.s) * Math.PI) * 0.12;
      it.holder.position.set((cx - W / 2) * k, -(cy - H / 2) * k + Math.sin(t * 1.1 + it.seed) * 0.06, 0);
      it.holder.scale.setScalar(Math.max(0.0001, base * it.s * pop));
      it.obj.rotation.set(-p * 0.9 + py * 0.35 + 0.12, it.spin * (p * 2.4) + px * 0.6 + Math.sin(t * 0.6 + it.seed) * 0.12, Math.sin(t * 0.8 + it.seed) * 0.05);
      it.shadow.material.opacity = 0.45 * it.s;
    }
    // render() also applies the transparent clear colour; a bare clear() before the first render would paint black
    if (any) { renderer.render(scene, camera); blank = false; }
    else if (!blank) { renderer.render(scene, camera); blank = true; }
    requestAnimationFrame(frame);
  }
  const go = () => { if (!running && !document.hidden) { running = true; requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", go);
  go();
}
