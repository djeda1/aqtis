/* =========================================================
   AQTIS · 3D-моляр в hero
   Процедурная модель: коронка (деформированная сфера с буграми),
   два корня (lathe), титановый имплант с резьбой.
   Режимы приходят событием "aq:mode" из main.js:
   natural | implant | whitening
   ========================================================= */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const hero = document.getElementById("hero");
const host = document.getElementById("tooth3d");
const shadeEl = document.getElementById("shade");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (cur, target, k, dt) => lerp(cur, target, 1 - Math.exp(-k * dt));

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  renderer = null;
}

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
  // бугры моляра: x, z, высота
  const cusps = [
    [-0.42, -0.34, 1.0], [0.4, -0.36, 0.9],
    [-0.4, 0.34, 1.08], [0.42, 0.32, 0.94],
    [0.05, -0.5, 0.55],
  ];
  const E = 0.68; // "квадратность" профиля
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const hr = Math.hypot(v.x, v.z);
    const dx = hr > 1e-6 ? v.x / hr : 0;
    const dz = hr > 1e-6 ? v.z / hr : 0;
    const phi = Math.atan2(dz, dx);
    const box = Math.pow(Math.pow(Math.abs(Math.cos(phi)), 3) + Math.pow(Math.abs(Math.sin(phi)), 3), -1 / 3);

    let H = Math.pow(hr, E);
    const Y = Math.sign(v.y) * Math.pow(Math.abs(v.y), E);
    if (Y < 0) H *= 1 - 0.26 * smooth(0.1, 1, -Y); // сужение к шейке
    else H *= 1 - 0.08 * smooth(0.45, 1, Y);
    H *= 1 + 0.05 * Math.exp(-((Y - 0.15) ** 2) / 0.08); // экватор коронки

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

function rootGeometry(len, R, bend, splay) {
  const pts = [];
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
    const t = -y / len;
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
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 6), mat);
  hex.position.y = 0.92;
  g.add(hex);
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
  gr.addColorStop(0, "rgba(15,29,43,0.55)");
  gr.addColorStop(0.45, "rgba(15,29,43,0.18)");
  gr.addColorStop(1, "rgba(15,29,43,0)");
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

/* ---------- сцена ---------- */
function init() {
  const canvas = renderer.domElement;
  host.appendChild(canvas);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const target = new THREE.Vector3(0, -0.6, 0);

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

  /* материалы */
  const SHADE_YELLOW = new THREE.Color(0xe2cc9b);
  const SHADE_WHITE = new THREE.Color(0xfbfcfd);
  const enamel = new THREE.MeshPhysicalMaterial({
    color: 0xf3eee6, roughness: 0.22, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.1,
    sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xd9f1f4),
    envMapIntensity: 0.65,
  });
  const cementum = new THREE.MeshPhysicalMaterial({
    color: 0xead9bd, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35,
    envMapIntensity: 0.55, transparent: true,
  });
  const titanium = new THREE.MeshStandardMaterial({ color: 0x8f99a4, metalness: 1, roughness: 0.3, envMapIntensity: 1.0, transparent: true });
  const abutMat = new THREE.MeshStandardMaterial({ color: 0xc4a467, metalness: 1, roughness: 0.32, envMapIntensity: 1.0, transparent: true });

  /* иерархия: stage (скролл/наклон) → spin (вращение) → tooth */
  const stage = new THREE.Group();
  scene.add(stage);
  const spin = new THREE.Group();
  stage.add(spin);
  const tooth = new THREE.Group();
  tooth.rotation.z = 0.09;
  tooth.rotation.x = 0.14;
  tooth.position.y = 0.6;
  spin.add(tooth);

  const crown = new THREE.Mesh(crownGeometry(), enamel);
  tooth.add(crown);

  const roots = new THREE.Group();
  const rootA = new THREE.Mesh(rootGeometry(2.15, 0.5, 0.22, -1), cementum);
  rootA.position.set(-0.5, -0.62, 0);
  const rootB = new THREE.Mesh(rootGeometry(2.0, 0.48, 0.24, 1), cementum);
  rootB.position.set(0.52, -0.62, 0);
  roots.add(rootA, rootB);
  tooth.add(roots);

  const implant = implantGroup(titanium, abutMat);
  implant.visible = false;
  tooth.add(implant);
  const IMPLANT_Y = -1.0;

  /* мягкая тень */
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.5, toneMapped: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.35;
  stage.add(shadow);

  /* кольцо-сканер */
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x14a8b8, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.007, 8, 220), ringMat);
  ring.rotation.x = Math.PI / 2;
  stage.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.004, 6, 220), ringMat);
  ring2.rotation.x = Math.PI / 2;
  stage.add(ring2);

  /* искры (отбеливание) */
  const SPARKS = 70;
  const sp = new Float32Array(SPARKS * 3);
  const phase = new Float32Array(SPARKS);
  const size = new Float32Array(SPARKS);
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
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uAmp: { value: 0 },
      uMap: { value: starTex() },
      uColor: { value: new THREE.Color(0x1aa9b9) },
      uPR: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase; attribute float aSize;
      uniform float uTime; uniform float uAmp; uniform float uPR;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.5 + 0.5 * sin(uTime * 2.4 + aPhase * 6.2831);
        tw = pow(tw, 4.0);
        vA = uAmp * tw;
        gl_PointSize = aSize * uPR * (0.35 + 0.65 * tw) * (9.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor;
      varying float vA;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(uColor, t.a * vA);
      }`,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  spin.add(sparks);

  /* ---------- состояние ---------- */
  const S = {
    mode: "natural",
    implantT: 0,       // 0 → зуб, 1 → имплант (анимируется)
    implantTarget: 0,
    shade: 0.72,       // 0 жёлтый … 1 белоснежный
    shadeTarget: 0.72,
    shadeSpeed: 3,
    sparkle: 0,
    ring: 1,
    intro: reduce ? 1 : 0,
    spinVel: reduce ? 0 : 0.22,
    spinBase: reduce ? 0 : 0.22,
    drag: null,
    tiltX: 0, tiltY: 0, tiltTX: 0, tiltTY: 0,
  };
  spin.rotation.y = -0.6;

  window.addEventListener("aq:mode", e => setMode(e.detail?.mode));

  function setMode(mode) {
    if (!mode || mode === S.mode) return;
    S.mode = mode;
    S.implantTarget = mode === "implant" ? 1 : 0;
    if (mode === "whitening") {
      S.shade = 0.02;
      S.shadeTarget = 1;
      S.shadeSpeed = 0.9;
    } else {
      S.shadeTarget = 0.72;
      S.shadeSpeed = 3;
    }
    if (!running) renderOnce();
  }

  const VITA = ["A3.5", "A3", "A2", "A1", "B1", "BL3", "BL2"];
  let lastShade = "";
  function updateShadeLabel() {
    if (!shadeEl) return;
    const name = VITA[Math.min(VITA.length - 1, Math.floor(S.shade * VITA.length))];
    if (name !== lastShade) { shadeEl.textContent = "VITA " + name; lastShade = name; }
  }

  /* ---------- вращение мышью/пальцем ---------- */
  canvas.addEventListener("pointerdown", e => {
    S.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    host.classList.add("is-dragging");
  });
  window.addEventListener("pointermove", e => {
    if (S.drag) {
      const dx = e.clientX - S.drag.x;
      const dy = e.clientY - S.drag.y;
      // на тачскрине вертикальный жест оставляем странице
      if (!S.drag.moved && e.pointerType !== "mouse" && Math.abs(dy) > Math.abs(dx)) { S.drag = null; host.classList.remove("is-dragging"); return; }
      S.drag.moved = true;
      const now = performance.now();
      const dt = Math.max(1, now - S.drag.t) / 1000;
      spin.rotation.y += dx * 0.009;
      S.spinVel = clamp((dx * 0.009) / dt, -6, 6);
      S.tiltTX = clamp(S.tiltTX + dy * 0.003, -0.35, 0.35);
      S.drag.x = e.clientX; S.drag.y = e.clientY; S.drag.t = now;
      if (!running) renderOnce();
    } else if (e.pointerType === "mouse" && hero) {
      const r = hero.getBoundingClientRect();
      if (e.clientY < r.bottom) {
        S.tiltTY = ((e.clientX - r.left) / r.width - 0.5) * 0.3;
        S.tiltTX = ((e.clientY - r.top) / r.height - 0.5) * 0.22;
      }
    }
  });
  const endDrag = () => { S.drag = null; host.classList.remove("is-dragging"); };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  /* ---------- размер ---------- */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    sparkMat.uniforms.uPR.value = pr;
    camera.aspect = w / h;
    const halfH = 2.45, halfW = 1.9;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(halfH / tanV, halfW / (tanV * camera.aspect));
    camera.position.set(0, dist * 0.3, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (!running) renderOnce();
  }
  new ResizeObserver(resize).observe(host);

  /* ---------- цикл ---------- */
  const clock = new THREE.Clock();
  let running = false, visible = true, raf = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    update(dt, t);
    renderer.render(scene, camera);
  }

  function update(dt, t) {
    // интро
    if (S.intro < 1) S.intro = Math.min(1, S.intro + dt / 1.8);
    const intro = easeInOut(S.intro);

    // вращение с инерцией
    if (!S.drag) {
      S.spinVel = damp(S.spinVel, S.spinBase, 1.6, dt);
      spin.rotation.y += S.spinVel * dt;
    }
    S.tiltX = damp(S.tiltX, S.tiltTX, 3, dt);
    S.tiltY = damp(S.tiltY, S.tiltTY, 3, dt);
    if (!S.drag) S.tiltTX *= Math.exp(-0.4 * dt);

    // скролл: зуб уходит вверх и поворачивается
    let sp = 0;
    if (hero) {
      const r = hero.getBoundingClientRect();
      sp = clamp(-r.top / Math.max(1, r.height), 0, 1);
    }
    const bob = reduce ? 0 : Math.sin(t * 1.1) * 0.07;
    stage.rotation.x = S.tiltX + sp * 0.5;
    stage.rotation.y = S.tiltY;
    stage.position.y = bob * 0.4 + sp * 1.2 + (1 - intro) * -0.6;
    const sc = lerp(0.82, 1, intro) * (1 - sp * 0.12);
    stage.scale.setScalar(sc);
    tooth.position.y = 0.6 + bob;
    shadow.material.opacity = 0.42 - bob * 0.8;
    shadow.scale.setScalar(1 - bob * 0.6);

    // имплант
    S.implantT = clamp(S.implantT + Math.sign(S.implantTarget - S.implantT) * dt / 1.6, 0, 1);
    const it = S.implantT;
    const rootsOut = smooth(0.0, 0.45, it);
    const implantIn = easeInOut(smooth(0.3, 1, it));
    cementum.opacity = 1 - rootsOut;
    roots.visible = cementum.opacity > 0.01;
    roots.position.y = -rootsOut * 0.5;
    cementum.depthWrite = cementum.opacity > 0.98;
    implant.visible = it > 0.01;
    implant.position.y = lerp(IMPLANT_Y - 3.2, IMPLANT_Y, implantIn);
    titanium.opacity = abutMat.opacity = smooth(0.25, 0.6, it);
    // коронка приподнимается, пока меняются корни, и садится на абатмент
    crown.position.y = Math.sin(Math.PI * smooth(0.05, 0.95, it)) * 0.75;

    // оттенок
    S.shade = damp(S.shade, S.shadeTarget, S.shadeSpeed, dt);
    enamel.color.copy(SHADE_YELLOW).lerp(SHADE_WHITE, S.shade);
    enamel.sheen = lerp(0.2, 0.7, S.shade);
    updateShadeLabel();

    // искры и кольца
    const wantSpark = S.mode === "whitening" ? 0.25 + 0.75 * smooth(0.2, 0.9, S.shade) : 0;
    S.sparkle = damp(S.sparkle, wantSpark, 3, dt);
    sparkMat.uniforms.uAmp.value = S.sparkle;
    sparkMat.uniforms.uTime.value = t;
    sparks.visible = S.sparkle > 0.01;

    S.ring = damp(S.ring, S.mode === "natural" ? 1 : 0, 3, dt);
    const ry = -0.05 + Math.sin(t * 0.7) * 1.8;
    ring.position.y = ry;
    ring2.position.y = ry - 0.05;
    const edge = 1 - smooth(1.2, 1.8, Math.abs(ry + 0.05)); // гаснет у краёв пути
    ringMat.opacity = 0.55 * S.ring * intro * (0.35 + 0.65 * edge);
    ring.visible = ring2.visible = ringMat.opacity > 0.01 && !reduce;
  }

  function renderOnce() {
    update(0, clock.elapsedTime);
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    clock.getDelta();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible && !document.hidden ? start() : stop();
  }, { threshold: 0 });
  io.observe(host);
  document.addEventListener("visibilitychange", () => (document.hidden || !visible ? stop() : start()));

  resize();
  renderOnce();
  requestAnimationFrame(() => host.classList.add("is-ready"));
  start();
}

if (renderer && host) init();
else hero?.classList.add("no-webgl");
