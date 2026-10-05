/* =========================================================
   AQTIS · 3D-моляр, который ведёт историю при прокрутке
   u — позиция в «экранах» внутри #journey:
     0      hero, зуб крутится, его можно тянуть
     1..2   анатомия: срез плоскостью, видны эмаль, дентин, пульпа
     3..4   имплантация: корни уходят, имплант вкручивается
     5..6   отбеливание: оттенок от A3.5 до BL2
   Срез сделан стенсил-шапками (clipping + stencil caps).
   ========================================================= */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const journey = document.getElementById("journey");
const host = document.getElementById("tooth3d");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (cur, target, k, dt) => lerp(cur, target, 1 - Math.exp(-k * dt));
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

/* ---------- геометрия ---------- */
function smoothNormals(g) {
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

function crownGeometry() {
  const g = new THREE.SphereGeometry(1, 200, 150);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const cusps = [
    [-0.42, -0.34, 1.0], [0.4, -0.36, 0.9],
    [-0.4, 0.34, 1.08], [0.42, 0.32, 0.94],
    [0.05, -0.5, 0.55],
  ];
  const E = 0.68;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const hr = Math.hypot(v.x, v.z);
    const dx = hr > 1e-6 ? v.x / hr : 0;
    const dz = hr > 1e-6 ? v.z / hr : 0;
    const phi = Math.atan2(dz, dx);
    const box = Math.pow(Math.pow(Math.abs(Math.cos(phi)), 3) + Math.pow(Math.abs(Math.sin(phi)), 3), -1 / 3);
    let H = Math.pow(hr, E);
    const Y = Math.sign(v.y) * Math.pow(Math.abs(v.y), E);
    if (Y < 0) H *= 1 - 0.26 * smooth(0.1, 1, -Y);
    else H *= 1 - 0.08 * smooth(0.45, 1, Y);
    H *= 1 + 0.05 * Math.exp(-((Y - 0.15) ** 2) / 0.08);
    const X = dx * H * box * 1.12;
    const Z = dz * H * box * 0.98;
    let y;
    if (Y > 0) {
      const w = smooth(0.3, 0.92, Y);
      let h = 0;
      for (const [cx, cz, a] of cusps) h += a * Math.exp(-((X - cx) ** 2 + (Z - cz) ** 2) / 0.07);
      h *= 0.2;
      const groove =
        0.11 * Math.exp(-(Z * Z) / 0.008) * (1 - smooth(0.45, 0.85, Math.abs(X))) +
        0.07 * Math.exp(-(X * X) / 0.006) * (1 - smooth(0.35, 0.7, Math.abs(Z)));
      y = Y * 0.62 + w * (h - groove - 0.06);
    } else {
      y = Y * 1.02;
    }
    p.setXYZ(i, X, y, Z);
  }
  return smoothNormals(g);
}

function scaled(geo, sx, sy, sz, oy = 0) {
  const g = geo.clone();
  g.scale(sx, sy, sz);
  g.translate(0, oy, 0);
  g.computeVertexNormals();
  return g;
}

// корень: lathe с закрытым верхом (нужно для стенсила)
function rootGeometry(len, R, bend, splay) {
  const pts = [new THREE.Vector2(1e-4, 0.08)];
  const N = 56;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = R * (1 - 0.6 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 6)));
    pts.push(new THREE.Vector2(Math.max(r, 1e-4), -t * len));
  }
  const g = new THREE.LatheGeometry(pts, 72);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = clamp(-y / len, 0, 1);
    x *= 0.74;
    z *= 1.22;
    x += splay * Math.sin(t * Math.PI * 0.8) * 0.32 + bend * t * t;
    p.setXYZ(i, x, y, z);
  }
  return smoothNormals(g);
}

function implantGroup(mat, matAbut) {
  const g = new THREE.Group();
  const L = 2.0;
  const coreR = t => lerp(0.3, 0.2, t);
  const pts = [new THREE.Vector2(1e-4, 0.02), new THREE.Vector2(0.31, 0.02)];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(new THREE.Vector2(Math.max(coreR(t) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 10))), 1e-4), -t * L));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 56), mat));
  const turns = 9;
  class Helix extends THREE.Curve {
    getPoint(u, target = new THREE.Vector3()) {
      const t = 0.07 + u * 0.83;
      const a = u * turns * Math.PI * 2;
      const r = coreR(t) + 0.03 - 0.03 * smooth(0.85, 1, u);
      return target.set(Math.cos(a) * r, -t * L, Math.sin(a) * r);
    }
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(), 1100, 0.05, 8, false), mat));
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.31, 0.16, 56), mat);
  collar.position.y = 0.08;
  g.add(collar);
  const abut = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.75, 56), matAbut);
  abut.position.y = 0.52;
  g.add(abut);
  return g;
}

/* ---------- текстуры ---------- */
function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const shadowTex = () => canvasTexture(256, (x, s) => {
  const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, "rgba(12,24,32,0.5)");
  gr.addColorStop(0.45, "rgba(12,24,32,0.16)");
  gr.addColorStop(1, "rgba(12,24,32,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, s, s);
});
const starTex = () => canvasTexture(128, (x, s) => {
  const c = s / 2;
  const gr = x.createRadialGradient(c, c, 0, c, c, c * 0.5);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, s, s);
  x.fillStyle = "#fff";
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? c * 0.96 : c * 0.1;
    x.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  x.closePath();
  x.fill();
});

/* ---------- раскладка по главам ----------
   fx — смещение по X в долях видимой полуширины, y — вверх/вниз,
   s — масштаб, a — угол поворота, tx — наклон к зрителю */
const DESKTOP = [
  { fx: 0.4, y: 0, s: 1.0, a: 0, tx: 0 },
  { fx: 0.24, y: 0.05, s: 1.08, a: -0.5, tx: 0.05 },
  { fx: -0.36, y: 0, s: 1.0, a: 0.5, tx: 0.08 },
  { fx: 0.36, y: -0.15, s: 1.12, a: -0.25, tx: 0.42 },
];
const MOBILE = [
  { fx: 0, y: 0.55, s: 0.78, a: 0, tx: 0 },
  { fx: -0.12, y: 0.6, s: 0.82, a: -0.5, tx: 0.05 },
  { fx: 0, y: 0.6, s: 0.78, a: 0.5, tx: 0.08 },
  { fx: 0, y: 0.5, s: 0.86, a: -0.25, tx: 0.42 },
];
// [u, глава]: где глава полностью на месте
const KEYS = [[0, 0], [0.12, 0], [1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3]];

function layoutAt(u, L) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [u0, s0] = KEYS[i], [u1, s1] = KEYS[i + 1];
    if (u <= u1 || i === KEYS.length - 2) {
      const t = easeInOut(clamp((u - u0) / (u1 - u0), 0, 1));
      const A = L[s0], B = L[s1];
      return { fx: lerp(A.fx, B.fx, t), y: lerp(A.y, B.y, t), s: lerp(A.s, B.s, t), a: lerp(A.a, B.a, t), tx: lerp(A.tx, B.tx, t) };
    }
  }
  return L[0];
}

/* ---------- сцена ---------- */
function init(renderer) {
  const canvas = renderer.domElement;
  host.appendChild(canvas);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const target = new THREE.Vector3(0, -0.4, 0);
  const view = { halfW: 3, halfH: 2.5, mobile: false };

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfdde3, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-4, 5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fdde6, 2.6);
  rim.position.set(4, 1, -5);
  scene.add(rim);
  const under = new THREE.DirectionalLight(0xc8e8ee, 0.5);
  under.position.set(0, -5, 2);
  scene.add(under);

  /* плоскость среза (в мировых координатах, пересчитывается каждый кадр) */
  const cutLocal = new THREE.Plane(new THREE.Vector3(0, 0, -1), 50);
  const cutWorld = new THREE.Plane();
  const clip = [cutWorld];

  const SHADE_YELLOW = new THREE.Color(0xe2cc9b);
  const SHADE_WHITE = new THREE.Color(0xfbfcfd);
  const enamel = new THREE.MeshPhysicalMaterial({
    color: 0xf3eee6, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1,
    sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xd9f1f4),
    envMapIntensity: 0.65, clippingPlanes: clip,
  });
  const cementum = new THREE.MeshPhysicalMaterial({
    color: 0xead9bd, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35,
    envMapIntensity: 0.55, transparent: true, clippingPlanes: clip,
  });
  const titanium = new THREE.MeshStandardMaterial({ color: 0x8f99a4, metalness: 1, roughness: 0.3, transparent: true });
  const abutMat = new THREE.MeshStandardMaterial({ color: 0xc4a467, metalness: 1, roughness: 0.32, transparent: true });

  /* иерархия: stage (раскладка) → spin (поворот) → tooth */
  const stage = new THREE.Group();
  scene.add(stage);
  const spin = new THREE.Group();
  stage.add(spin);
  const tooth = new THREE.Group();
  tooth.rotation.z = 0.09;
  tooth.rotation.x = 0.14;
  tooth.position.y = 0.6;
  spin.add(tooth);

  const crownG = crownGeometry();
  const ROOTS = [
    { len: 2.15, R: 0.5, bend: 0.22, splay: -1, x: -0.5 },
    { len: 2.0, R: 0.48, bend: 0.24, splay: 1, x: 0.52 },
  ];
  const ROOT_Y = -0.62;

  const crown = new THREE.Mesh(crownG, enamel);
  tooth.add(crown);
  const roots = new THREE.Group();
  const rootGeos = ROOTS.map(r => rootGeometry(r.len, r.R, r.bend, r.splay));
  ROOTS.forEach((r, i) => {
    const m = new THREE.Mesh(rootGeos[i], cementum);
    m.position.set(r.x, ROOT_Y, 0);
    roots.add(m);
  });
  tooth.add(roots);

  /* слои среза: внешний (эмаль и цемент), дентин, пульпа */
  const layerDefs = [
    { color: 0xf9f7f2, crown: crownG, roots: rootGeos },
    { color: 0xecd3a2, crown: scaled(crownG, 0.8, 0.84, 0.8, -0.13), roots: ROOTS.map(r => rootGeometry(r.len * 0.95, r.R * 0.62, r.bend, r.splay)) },
    { color: 0xdc6a74, crown: scaled(crownG, 0.42, 0.3, 0.42, -0.36), roots: ROOTS.map(r => rootGeometry(r.len * 0.9, r.R * 0.17, r.bend, r.splay)) },
  ];
  const stencilBase = new THREE.MeshBasicMaterial({ depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc });
  const back = stencilBase.clone();
  back.side = THREE.BackSide;
  back.clippingPlanes = clip;
  back.stencilFail = back.stencilZFail = back.stencilZPass = THREE.IncrementWrapStencilOp;
  const front = stencilBase.clone();
  front.side = THREE.FrontSide;
  front.clippingPlanes = clip;
  front.stencilFail = front.stencilZFail = front.stencilZPass = THREE.DecrementWrapStencilOp;

  const cutGroup = new THREE.Group();
  tooth.add(cutGroup);
  const caps = [];
  layerDefs.forEach((L, i) => {
    const parts = [[L.crown, null], ...L.roots.map((g, k) => [g, ROOTS[k].x])];
    for (const [geo, x] of parts) {
      for (const mat of [back, front]) {
        const m = new THREE.Mesh(geo, mat);
        if (x !== null) m.position.set(x, ROOT_Y, 0);
        m.renderOrder = 10 + i * 2;
        cutGroup.add(m);
      }
    }
    const capMat = new THREE.MeshBasicMaterial({
      color: L.color, toneMapped: false,
      depthFunc: THREE.AlwaysDepth,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    });
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), capMat);
    cap.renderOrder = 10 + i * 2 + 1;
    cap.onAfterRender = r => r.clearStencil();
    cutGroup.add(cap);
    caps.push(cap);
  });

  const implant = implantGroup(titanium, abutMat);
  implant.visible = false;
  tooth.add(implant);
  const IMPLANT_Y = -1.0;

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.45, toneMapped: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.35;
  stage.add(shadow);

  /* искры отбеливания */
  const SPARKS = 70;
  const sp = new Float32Array(SPARKS * 3), phase = new Float32Array(SPARKS), size = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.2 + Math.random() * 0.9;
    sp[i * 3] = Math.cos(a) * r;
    sp[i * 3 + 1] = 0.6 + (Math.random() - 0.35) * 1.8;
    sp[i * 3 + 2] = Math.sin(a) * r;
    phase[i] = Math.random();
    size[i] = 16 + Math.random() * 30;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sparkGeo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  sparkGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const sparkMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAmp: { value: 0 }, uMap: { value: starTex() }, uColor: { value: new THREE.Color(0x3fbccb) }, uPR: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aPhase; attribute float aSize;
      uniform float uTime; uniform float uAmp; uniform float uPR;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = pow(0.5 + 0.5 * sin(uTime * 2.4 + aPhase * 6.2831), 4.0);
        vA = uAmp * tw;
        gl_PointSize = aSize * uPR * (0.35 + 0.65 * tw) * (9.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
      void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vA); }`,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  spin.add(sparks);

  /* выноски: HTML-подписи привязаны к точкам модели */
  const callouts = [...document.querySelectorAll(".callout")].map(el => ({
    el, ch: +el.dataset.ch, pt: el.dataset.pt.split(",").map(s => s.trim()), side: el.dataset.side === "left" ? -1 : 1,
  }));
  const tmp = new THREE.Vector3();

  /* ---------- состояние ---------- */
  const S = {
    free: reduce ? -0.5 : -1.4, spinVel: reduce ? 0 : 0.22, spinBase: reduce ? 0 : 0.22,
    drag: null, tiltX: 0, tiltY: 0, tiltTX: 0, tiltTY: 0,
    intro: reduce ? 1 : 0, u: 0,
  };

  canvas.addEventListener("pointerdown", e => {
    if (S.u > 0.5) return;
    S.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    host.classList.add("is-dragging");
    document.body.classList.add("tooth-touched");
  });
  window.addEventListener("pointermove", e => {
    if (S.drag) {
      const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
      if (!S.drag.moved && e.pointerType !== "mouse" && Math.abs(dy) > Math.abs(dx)) { S.drag = null; host.classList.remove("is-dragging"); return; }
      S.drag.moved = true;
      const now = performance.now();
      const dt = Math.max(1, now - S.drag.t) / 1000;
      S.free += dx * 0.009;
      S.spinVel = clamp((dx * 0.009) / dt, -6, 6);
      S.drag.x = e.clientX; S.drag.y = e.clientY; S.drag.t = now;
    } else if (e.pointerType === "mouse") {
      S.tiltTY = (e.clientX / innerWidth - 0.5) * 0.3;
      S.tiltTX = (e.clientY / innerHeight - 0.5) * 0.2;
    }
  });
  const endDrag = () => { S.drag = null; host.classList.remove("is-dragging"); };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    sparkMat.uniforms.uPR.value = pr;
    camera.aspect = w / h;
    view.mobile = camera.aspect < 0.85;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // на телефоне зуб занимает верхнюю часть экрана, текст внизу
    const dist = view.mobile ? Math.max(3.4 / tanV, 1.75 / (tanV * camera.aspect)) : 2.45 / tanV;
    camera.position.set(0, dist * 0.3, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    view.halfH = dist * tanV;
    view.halfW = view.halfH * camera.aspect;
  }
  new ResizeObserver(resize).observe(host);

  const clock = new THREE.Clock();
  let running = false, visible = true, raf = 0;

  function readU() {
    if (!journey) return 0;
    return -journey.getBoundingClientRect().top / Math.max(1, innerHeight);
  }

  function update(dt, t) {
    const u = (S.u = readU());
    if (S.intro < 1) S.intro = Math.min(1, S.intro + dt / 1.8);
    const intro = easeInOut(S.intro);
    const L = layoutAt(u, view.mobile ? MOBILE : DESKTOP);

    // в hero зуб крутится свободно, в главах угол задаёт сценарий
    if (!S.drag) {
      S.spinVel = damp(S.spinVel, S.spinBase, 1.6, dt);
      S.free += S.spinVel * dt;
    }
    const story = smooth(0.12, 0.85, u);
    const implantTurn = smooth(2.2, 4.2, u) * (1 - smooth(4.3, 5, u)) * 1.2;
    const targetA = L.a + implantTurn;
    spin.rotation.y = S.free + wrapAngle(targetA - S.free) * story;
    if (story > 0.999) S.free = spin.rotation.y; // без рывка при возврате в hero

    S.tiltX = damp(S.tiltX, S.tiltTX * (1 - story), 3, dt);
    S.tiltY = damp(S.tiltY, S.tiltTY * (1 - story), 3, dt);
    const bob = reduce ? 0 : Math.sin(t * 1.1) * 0.06;
    stage.rotation.x = S.tiltX + L.tx;
    stage.rotation.y = S.tiltY;
    stage.position.x = L.fx * view.halfW;
    stage.position.y = L.y * (view.mobile ? view.halfH * 0.5 : 1) + (1 - intro) * -0.6 + bob * 0.4;
    stage.scale.setScalar(L.s * lerp(0.85, 1, intro));
    tooth.position.y = 0.6 + bob;
    shadow.material.opacity = (0.4 - bob * 0.8) * (1 - smooth(4.6, 5.2, u) * 0.6);

    // анатомия: плоскость среза въезжает до середины зуба
    const cut = smooth(0.55, 1.6, u) * (1 - smooth(2.15, 2.75, u));
    const cutZ = lerp(1.7, 0.0, easeInOut(cut));
    cutLocal.constant = cut > 0.001 ? cutZ : 50;
    cutGroup.visible = cut > 0.001;
    for (const c of caps) c.position.z = cutZ;

    // имплант: корни растворяются, имплант вкручивается снизу
    const it = smooth(2.45, 3.9, u) * (1 - smooth(4.15, 4.75, u));
    const rootsOut = smooth(0.0, 0.45, it);
    const implantIn = easeInOut(smooth(0.3, 1, it));
    cementum.opacity = 1 - rootsOut;
    cementum.depthWrite = cementum.opacity > 0.98;
    roots.visible = cementum.opacity > 0.01;
    roots.position.y = -rootsOut * 0.5;
    implant.visible = it > 0.01;
    implant.position.y = lerp(IMPLANT_Y - 3.0, IMPLANT_Y, implantIn);
    implant.rotation.y = (1 - implantIn) * Math.PI * 5;
    titanium.opacity = abutMat.opacity = smooth(0.25, 0.6, it);
    crown.position.y = Math.sin(Math.PI * smooth(0.05, 0.95, it)) * 0.75;

    // отбеливание: сначала «до», потом белеет по прокрутке
    const toYellow = smooth(4.1, 4.7, u);
    const whiten = smooth(4.8, 5.85, u);
    const shade = whiten > 0 ? lerp(0.04, 1, whiten) : lerp(0.72, 0.04, toYellow);
    enamel.color.copy(SHADE_YELLOW).lerp(SHADE_WHITE, shade);
    enamel.sheen = lerp(0.2, 0.7, shade);
    sparkMat.uniforms.uAmp.value = smooth(0.35, 0.9, whiten) * (reduce ? 0.4 : 1);
    sparkMat.uniforms.uTime.value = t;
    sparks.visible = sparkMat.uniforms.uAmp.value > 0.01;

    tooth.updateMatrixWorld(true);
    cutWorld.copy(cutLocal).applyMatrix4(tooth.matrixWorld);

    placeCallouts(cut, it, cutZ);
  }

  function project(x, y, z) {
    tmp.set(x, y, z).applyMatrix4(tooth.matrixWorld).project(camera);
    return [(tmp.x + 1) / 2 * host.clientWidth, (1 - tmp.y) / 2 * host.clientHeight];
  }

  function placeCallouts(cut, it, cutZ) {
    const show = { 1: smooth(0.75, 1, cut), 2: smooth(0.85, 1, it) };
    const col = {
      1: project(view.mobile ? 1.25 : 1.55, 0, cutZ)[0],
      2: project(view.mobile ? -1.3 : -1.95, 0, 0)[0],
    };
    for (const c of callouts) {
      const o = show[c.ch] || 0;
      c.el.style.opacity = o.toFixed(3);
      c.el.style.visibility = o > 0.01 ? "visible" : "hidden";
      if (o <= 0.01) continue;
      const [x, y] = project(+c.pt[0], +c.pt[1], c.pt[2] === "c" ? cutZ : +c.pt[2]);
      const len = Math.max(16, (col[c.ch] - x) * c.side);
      c.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      c.el.style.setProperty("--len", len.toFixed(1) + "px");
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt, clock.elapsedTime);
    renderer.render(scene, camera);
  }
  function start() { if (running) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible && !document.hidden ? start() : stop();
  }).observe(host);
  document.addEventListener("visibilitychange", () => (document.hidden || !visible ? stop() : start()));

  resize();
  update(0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(() => host.classList.add("is-ready"));
  start();
}

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: "high-performance" });
} catch (e) {
  renderer = null;
}
if (renderer && host) init(renderer);
else document.documentElement.classList.add("no-webgl");
