// Deterministic 3D reel. window.frame(t) renders exactly one frame at time t (seconds),
// so the recorder can step through the film without any real-time playback.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let W = innerWidth, H = innerHeight; const T = 28, TAU = Math.PI * 2;
const X_DAY = 60, X_SVC = 120, X_TOOLS = 180;

// ---------------------------------------------------------------- utils
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeIO = k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = k => 1 - Math.pow(1 - clamp(k), 3);
const win = (t, a, b, f = .5) => smooth(a, a + f, t) * (1 - smooth(b - f, b, t));
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(11);
const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

const C = { violet: '#8B5CF6', cyan: '#22D3EE', pink: '#F472B6', lime: '#A3E635', orange: '#FB923C', sky: '#38BDF8' };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl'); window.NOUI = true;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
scene.fog = new THREE.FogExp2('#000000', 0.02);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 600);

// ---------------------------------------------------------------- starfield
{
  const N = 4500, pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N),
    fr = new Float32Array(N), cl = new Float32Array(N * 3);
  const pal = ['#ffffff', '#ffffff', '#ffffff', C.violet, C.cyan].map(c => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -80 + R() * 340; pos[i * 3 + 1] = -25 + R() * 60; pos[i * 3 + 2] = -90 + R() * 130;
    size[i] = 0.5 + Math.pow(R(), 3) * 3.2; ph[i] = R() * TAU; fr[i] = 1 + Math.floor(R() * 3);
    const c = pal[Math.floor(R() * pal.length)]; cl.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('aFr', new THREE.BufferAttribute(fr, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(cl, 3));
  window.starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uP: { value: 0 } },
    vertexShader: `attribute float aSize,aPh,aFr; attribute vec3 aCol; uniform float uP; varying vec3 vC; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); float tw=.55+.45*sin(uP*6.2831853*aFr+aPh);
      vC=aCol*.9; vA=tw*.7; gl_PointSize=clamp(aSize*(260./-mv.z),1.,9.); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,0.,d); gl_FragColor=vec4(vC*vA,a*a*vA); }`,
  });
  scene.add(new THREE.Points(g, window.starMat));
}

// ---------------------------------------------------------------- neon grid floor
const gridMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uP: { value: 0 } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `varying vec3 vW; uniform float uP;
    void main(){ vec2 p=vW.xz/3.; vec2 g=abs(fract(p-.5)-.5)/fwidth(p); float l=1.-min(min(g.x,g.y),1.);
      float dist=length(cameraPosition-vW); float fade=exp(-dist*.028);
      vec3 c=mix(vec3(.55,.36,.96),vec3(.13,.83,.93),smoothstep(-1.,1.,sin(vW.x*.04)));
      float pulse=smoothstep(.82,1.,sin(vW.x*.09-uP*6.2831853*6.))*1.6+smoothstep(.9,1.,sin(vW.z*.2+uP*6.2831853*3.))*.6;
      gl_FragColor=vec4(c*l*fade*(.18+pulse*.35),l*fade*.5); }`,
});
{
  const m = new THREE.Mesh(new THREE.PlaneGeometry(520, 160), gridMat);
  m.rotation.x = -Math.PI / 2; m.position.set(90, -3.4, 0); scene.add(m);
}

// ---------------------------------------------------------------- lights per station
function stationLights(x) {
  const g = new THREE.Group(); g.position.x = x;
  [[C.violet, -6, 4, 6], [C.cyan, 7, 3, 5], [C.pink, 0, -2, 8]].forEach(([c, lx, ly, lz]) => {
    const l = new THREE.PointLight(c, 120, 40, 2); l.position.set(lx, ly, lz); g.add(l);
  });
  scene.add(g);
}
[0, X_DAY, X_SVC, X_TOOLS].forEach(stationLights);

// ================================================================ HERO
const hero = new THREE.Group(); scene.add(hero);
const glass = (hex, o = {}) => new THREE.MeshPhysicalMaterial({
  color: hex, metalness: 0.05, roughness: 0.1, transmission: 1, thickness: 1.6, ior: 1.45,
  iridescence: 1, iridescenceIOR: 1.6, envMapIntensity: 1.3, flatShading: true, ...o,
});
const hGlass = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), glass('#9db4ff'));
hero.add(hGlass);
const hWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.26, 1)),
  new THREE.LineBasicMaterial({ color: col(C.cyan, 2.4), transparent: true, opacity: .95, blending: THREE.AdditiveBlending }));
hero.add(hWire);
const hCore = new THREE.Mesh(new THREE.IcosahedronGeometry(.8, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.1, 1.7) }));
hero.add(hCore);
const hCube = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 1.7, 1.7)),
  new THREE.LineBasicMaterial({ color: col(C.pink, 2.8), transparent: true, blending: THREE.AdditiveBlending }));
hero.add(hCube);
const rings = [[3.1, C.violet, .5, 1.2], [3.8, C.cyan, 1.25, -.5], [4.5, C.pink, .15, .9]].map(([r, c, rx, rz], i) => {
  const pivot = new THREE.Group(); pivot.rotation.set(rx, 0, rz);
  const spin = new THREE.Group(); pivot.add(spin);
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(r, .016, 8, 220), new THREE.MeshBasicMaterial({ color: col(c, 2.2) })));
  const sat = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 16), new THREE.MeshBasicMaterial({ color: col(c, 5) }));
  sat.position.set(r, 0, 0); spin.add(sat);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.3, 16, 16), new THREE.MeshBasicMaterial({ color: col(c, .5), transparent: true, opacity: .35, blending: THREE.AdditiveBlending }));
  halo.position.copy(sat.position); spin.add(halo);
  hero.add(pivot); return { pivot, spin, k: [2, -3, 4][i] };
});
// orbiting shards
const SH = 150;
const shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.13),
  new THREE.MeshStandardMaterial({ metalness: .7, roughness: .25, emissive: '#223', emissiveIntensity: .6 }), SH);
const shardData = [];
for (let i = 0; i < SH; i++) {
  shardData.push({ r: 5 + R() * 4.5, inc: (R() - .5) * 1.3, a0: R() * TAU, k: (R() < .5 ? -1 : 1) * (1 + Math.floor(R() * 2)), s: .6 + R() * 1.6, sp: 1 + Math.floor(R() * 3) });
  shards.setColorAt(i, new THREE.Color([C.cyan, C.violet, C.pink, '#ffffff'][i % 4]));
}
hero.add(shards);
const dummy = new THREE.Object3D();

function updateHero(P) {
  hGlass.rotation.set(P * TAU * 1, P * TAU * 2, 0); hWire.rotation.copy(hGlass.rotation);
  hCore.scale.setScalar(1 + .12 * Math.sin(P * TAU * 14)); hCore.rotation.y = P * TAU * 3;
  hCube.rotation.set(P * TAU * 2, -P * TAU * 3, P * TAU);
  rings.forEach(r => { r.spin.rotation.y = P * TAU * r.k; r.pivot.rotation.y = P * TAU * (r.k > 0 ? 1 : -1); });
  for (let i = 0; i < SH; i++) {
    const d = shardData[i], a = d.a0 + P * TAU * d.k;
    dummy.position.set(Math.cos(a) * d.r, Math.sin(a * 1.0 + d.inc) * d.r * d.inc * .5, Math.sin(a) * d.r);
    dummy.rotation.set(P * TAU * d.sp, P * TAU * d.sp * 2, 0); dummy.scale.setScalar(d.s); dummy.updateMatrix();
    shards.setMatrixAt(i, dummy.matrix);
  }
  shards.instanceMatrix.needsUpdate = true;
}

// ================================================================ DAY (six glass cubes on a pipeline)
const dayG = new THREE.Group(); dayG.position.x = X_DAY; scene.add(dayG);
const STEPS = [
  ['Analyse', C.cyan, 'Read the numbers, logs and needs to find what matters'],
  ['Design', C.violet, 'Plan the data, the screens and how they connect'],
  ['Build', C.pink, 'Write clean web, mobile and backend code'],
  ['Test', C.lime, 'Automated checks catch bugs before anyone sees them'],
  ['Ship', C.orange, 'Release safely through automated pipelines'],
  ['Monitor', C.sky, 'Watch the jobs that run on a schedule and fix drift'],
];
const SP = 4.4, cubes = STEPS.map(([, c], i) => {
  const g = new THREE.Group(); g.position.x = (i - 2.5) * SP;
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), glass(c, { thickness: 2, flatShading: false, roughness: .05 }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.04, 2.04, 2.04)),
    new THREE.LineBasicMaterial({ color: col(c, 2.2), transparent: true, blending: THREE.AdditiveBlending }));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(.42), new THREE.MeshBasicMaterial({ color: col(c, 4) }));
  const pad = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 64), new THREE.MeshBasicMaterial({ color: col(c, 2), side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = -2.2;
  g.add(box, edge, core, pad); dayG.add(g); return { g, box, edge, core, pad, c };
});
{ // pipeline rail + packets
  const pts = [new THREE.Vector3(-2.5 * SP - 2, -2.2, 0), new THREE.Vector3(2.5 * SP + 2, -2.2, 0)];
  dayG.add(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 5 * SP + 4, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: col(C.violet, 2) })));
  dayG.children[dayG.children.length - 1].position.y = -2.2;
}
const packets = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 6) })); dayG.add(m); return m; });

// ================================================================ SERVICES (3D panels with real text)
const svcG = new THREE.Group(); svcG.position.x = X_SVC; scene.add(svcG);
const SERV = [
  ['Web apps and dashboards', C.cyan, ['Fast, easy-to-use sites, admin', 'panels and internal tools.'], 'React · TypeScript · Node.js'],
  ['Mobile apps', C.pink, ['Apps for iPhone that feel smooth,', 'from first idea to the store.'], 'Swift · iOS'],
  ['AI and smart features', C.violet, ['Chatbots, document helpers and', 'computer vision that save time.'], 'LLMs · Python · Vision'],
  ['APIs and backends', C.sky, ['Secure, reliable services and', 'databases behind your product.'], 'Spring Boot · Node.js · Postgres'],
  ['Data and analysis', C.lime, ['Turn raw numbers into scores,', 'reports and clear decisions.'], 'Python · SQL · Reports'],
  ['Automation and quality', C.orange, ['Scheduled jobs, release pipelines', 'and automated testing.'], 'GitHub Actions · Jenkins · Selenium'],
];
const SANS = '"Geist", "Segoe UI", system-ui, sans-serif', MONO = '"Geist Mono", Consolas, monospace';
try { await Promise.race([Promise.all(['600 64px Geist', '400 36px Geist', '500 26px "Geist Mono"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
function panelTexture([title, c, desc, tags], idx) {
  const cv = document.createElement('canvas'); cv.width = 800; cv.height = 1000; const x = cv.getContext('2d');
  const R = 40;
  x.fillStyle = 'rgba(6,6,6,.9)'; x.beginPath(); x.roundRect(0, 0, 800, 1000, R); x.fill();
  const rg = x.createRadialGradient(400, 230, 0, 400, 230, 420); rg.addColorStop(0, c + '38'); rg.addColorStop(1, c + '00');
  x.fillStyle = rg; x.beginPath(); x.roundRect(0, 0, 800, 1000, R); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 3; x.beginPath(); x.roundRect(1.5, 1.5, 797, 997, R); x.stroke();
  const tg = x.createLinearGradient(120, 0, 680, 0); tg.addColorStop(0, c + '00'); tg.addColorStop(.5, c); tg.addColorStop(1, c + '00');
  x.fillStyle = tg; x.fillRect(120, 0, 560, 3);
  x.font = `500 26px ${MONO}`; x.fillStyle = '#8A8A8A'; x.fillText(String(idx + 1).padStart(2, '0') + ' — SERVICE', 56, 80);
  x.textAlign = 'right'; x.fillText(String(idx + 1).padStart(2, '0') + ' / 06', 744, 80); x.textAlign = 'left';
  x.fillStyle = '#EDEDED'; x.font = `600 62px ${SANS}`;
  const words = title.split(' '); let lines = [], cur = '';
  words.forEach(w => { const t = (cur + ' ' + w).trim(); if (x.measureText(t).width > 690) { lines.push(cur); cur = w; } else cur = t; }); lines.push(cur);
  lines.forEach((l, i) => x.fillText(l, 56, 560 + i * 70));
  const dy = 560 + lines.length * 70 + 14;
  x.fillStyle = '#A1A1A1'; x.font = `400 35px ${SANS}`;
  desc.forEach((l, i) => x.fillText(l, 56, dy + 30 + i * 50));
  x.font = `500 24px ${MONO}`; let tx = 56;
  tags.split(' · ').forEach(tag => {
    const w = x.measureText(tag).width + 32;
    x.fillStyle = 'rgba(255,255,255,.06)'; x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(tx, 892, w, 50, 10); x.fill(); x.stroke();
    x.fillStyle = '#D4D4D4'; x.fillText(tag, tx + 16, 926); tx += w + 12;
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
}
function glyph(kind, c) {
  const g = new THREE.Group();
  const m = () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, metalness: .3, roughness: .35 });
  const b = (w, h, d, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m()); k.position.set(x, y, z); g.add(k); return k; };
  if (kind === 0) { b(1.7, 1.1, .08, 0, 0, 0); b(1.7, .18, .1, 0, .5, .05); b(.6, .5, .1, -.45, -.1, .05); b(.5, .1, .1, .4, .0, .05); b(.5, .1, .1, .4, -.25, .05); }
  if (kind === 1) { b(.85, 1.6, .14); b(.3, .06, .16, 0, .66, .03); b(.62, .3, .16, 0, .12, .03); b(.62, .3, .16, 0, -.35, .03); }
  if (kind === 2) { const P = [[-.8, .5, 0], [-.8, -.5, 0], [0, .8, .2], [0, 0, -.2], [0, -.8, .2], [.8, 0, 0]];
    P.forEach(p => { const s = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 16), m()); s.position.set(...p); g.add(s); });
    [[0, 2], [0, 3], [1, 3], [1, 4], [2, 5], [3, 5], [4, 5]].forEach(([a, z]) => { const v = new THREE.Vector3(...P[z]).sub(new THREE.Vector3(...P[a])); const l = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, v.length(), 6), m()); l.position.copy(new THREE.Vector3(...P[a]).add(v.clone().multiplyScalar(.5))); l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.add(l); }); }
  if (kind === 3) { [.55, 0, -.55].forEach(y => { b(1.7, .42, .8, 0, y, 0); b(.1, .1, .12, -.6, y, .42); }); }
  if (kind === 4) { [.6, 1.1, .8, 1.5].forEach((h, i) => b(.3, h, .3, (i - 1.5) * .45, h / 2 - .75, 0)); }
  if (kind === 5) { const t = new THREE.Mesh(new THREE.TorusGeometry(.6, .28, 6, 8), m()); g.add(t); g.userData.spin = t; const i = new THREE.Mesh(new THREE.OctahedronGeometry(.28), m()); g.add(i); }
  return g;
}
const RING_R = 6.4;
const panels = SERV.map((s, i) => {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4, 5, .12), glass(s[1], { thickness: .8, flatShading: false, roughness: .15, transmission: .85, color: new THREE.Color(s[1]).lerp(new THREE.Color('#0b0d14'), .6) }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.04, 5.04, .14)), new THREE.LineBasicMaterial({ color: col(s[1], 2.4), transparent: true, blending: THREE.AdditiveBlending }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), new THREE.MeshBasicMaterial({ map: panelTexture(s, i), transparent: true, toneMapped: false }));
  face.position.z = .075;
  const gl = glyph(i, s[1]); gl.position.set(0, 1.35, .55); gl.scale.setScalar(1.15);
  g.add(slab, edge, face, gl); svcG.add(g); return { g, gl, edge };
});
function ringAngle(u) { // u in [0,6]: hold each panel facing front, then ease to the next; stop on the last
  const n = Math.min(5, Math.floor(u)), f = u - n; return (n + (n < 5 ? easeIO(clamp((f - .55) / .45)) : 0)) * (TAU / 6);
}

// ================================================================ TOOLS (word globe)
const toolsG = new THREE.Group(); toolsG.position.x = X_TOOLS; scene.add(toolsG);
const TOOLS = [['TypeScript', C.cyan], ['React', C.cyan], ['Node.js', C.cyan], ['Python', C.violet], ['Swift', C.pink], ['Java', C.pink], ['Spring Boot', C.pink], ['SQL', C.lime],
  ['PostgreSQL', C.sky], ['Docker', C.sky], ['GitHub Actions', C.orange], ['Jenkins', C.orange], ['Selenium', C.lime], ['Cloudflare', C.orange], ['LLMs', C.violet], ['Computer Vision', C.violet]];
const toolPos = TOOLS.map((_, i) => { const k = i + .5, phi = Math.acos(1 - 2 * k / TOOLS.length), th = Math.PI * (1 + Math.sqrt(5)) * k; return new THREE.Vector3(Math.cos(th) * Math.sin(phi), Math.cos(phi), Math.sin(th) * Math.sin(phi)).multiplyScalar(4.4); });
const globe = new THREE.Group(); toolsG.add(globe);
globe.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(4.4, 3)), new THREE.LineBasicMaterial({ color: col(C.violet, 1.3), transparent: true, opacity: .35, blending: THREE.AdditiveBlending })));
globe.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.7, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, .9, 1.5) })));
const toolDots = toolPos.map((p, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 12), new THREE.MeshBasicMaterial({ color: col(TOOLS[i][1], 4) })); m.position.copy(p); globe.add(m);
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), p]), new THREE.LineBasicMaterial({ color: col(TOOLS[i][1], 1.5), transparent: true, opacity: .25, blending: THREE.AdditiveBlending })); globe.add(ln); return m; });

// ================================================================ post processing
const composer = new EffectComposer(renderer);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.5, 1.2);
composer.addPass(bloom);
const fx = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uAb: { value: .0012 }, uBlur: { value: 0 }, uGrain: { value: .022 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT,uAb,uBlur,uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 c=vUv-.5; float r=length(c); float ab=uAb*(.3+r*2.2); vec3 acc=vec3(0.);
      for(int i=0;i<10;i++){ float s=1.-uBlur*float(i)/10.*.22; acc.r+=texture2D(tDiffuse,.5+c*s*(1.+ab)).r; acc.g+=texture2D(tDiffuse,.5+c*s).g; acc.b+=texture2D(tDiffuse,.5+c*s*(1.-ab)).b; }
      vec3 col=acc/10.; col*=1.-smoothstep(.3,.9,r*1.25)*.9; col+=(h(vUv*vec2(1280.,720.)+uT)-.5)*uGrain;
      gl_FragColor=vec4(col,1.); }`,
});
composer.addPass(fx);
composer.addPass(new OutputPass());

// ================================================================ camera rig
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const poseHero = t => { const P = (((t % T) + T) % T) / T, a = .6 * Math.sin(P * TAU), e = .5 + .5 * Math.sin(P * TAU * 2);
  return { p: V(Math.sin(a) * 11.5, 1.3 + .8 * Math.sin(P * TAU * 3) * .5, Math.cos(a) * 11.5), l: V(-2.1, 0, 0), fov: 40 }; };
const poseDay = t => { const u = smooth(.0, 1, clamp((t - 6.0) / 5.0)); const x = lerp(-2.5 * SP, 2.5 * SP, u);
  return { p: V(X_DAY + x + Math.sin(u * 3) * 1.2, .8 + Math.sin(u * 5) * .3, 9.5), l: V(X_DAY + x, -.3, 0), fov: 44 }; };
const poseSvc = t => { const k = clamp((t - 12) / 7); return { p: V(X_SVC + Math.sin(k * 2.2 - 1.1) * 2.4, 1.0 + Math.sin(k * 3) * .4, 10.6), l: V(X_SVC - 1.8, .2, 0), fov: 42 }; };
const poseTools = t => { const k = clamp((t - 19.8) / 4); return { p: V(X_TOOLS + Math.sin(k * 2.4 - 1.2) * 2, .8, 14.5), l: V(X_TOOLS - 2.6, 0, 0), fov: 44 }; };
const SECT = [[0, 5.4, poseHero], [5.4, 11.4, poseDay], [11.4, 19.4, poseSvc], [19.4, 23.4, poseTools], [23.4, T, poseHero]];
const TW = .9; // half-width of fly windows
let kick = 0;
function cameraAt(t) {
  let pose = null; kick = 0;
  for (let i = 0; i < SECT.length; i++) {
    const [a, b, fn] = SECT[i];
    if (t >= a && t < b) pose = fn(clamp(t, a, b));
    if (i > 0 && Math.abs(t - a) < TW) { // blend across boundary a between SECT[i-1] and SECT[i]
      const u = easeIO(clamp((t - (a - TW)) / (2 * TW)));
      const A = SECT[i - 1][2](a), B = SECT[i][2](a);
      const pa = SECT[i - 1][2](clamp(t, SECT[i - 1][0], a)), pb = SECT[i][2](clamp(t, a, SECT[i][1]));
      pose = { p: pa.p.clone().lerp(pb.p, u), l: pa.l.clone().lerp(pb.l, u), fov: lerp(pa.fov, pb.fov, u) };
      pose.p.y += Math.sin(Math.PI * u) * 3.5; kick = Math.pow(Math.sin(Math.PI * u), 1.3);
    }
  }
  return pose;
}

// ================================================================ HTML overlay
const ui = document.getElementById('ui');
function el(cls, html, css = '') { const d = document.createElement('div'); d.className = 'a ' + cls; d.innerHTML = html; d.style.cssText = css; ui.appendChild(d); return d; }
const place = (d, o, x = 0, y = 0, s = 1) => { d.style.opacity = o.toFixed(3); d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`; };

// hero text
const kHero = el('kick mono', 'FULL-STACK ENGINEER', 'left:84px;top:104px');
const nameLines = ['CHANAKYA', 'BUGATA'].map((w, li) => {
  const d = el('', '', `left:${li ? 84 : 80}px;top:${150 + li * 128}px;font-size:134px;font-weight:700;letter-spacing:-6px;line-height:1`);
  d.style.opacity = 1; d.className = 'a';
  d.innerHTML = [...w].map(ch => `<span class="grad" style="display:inline-block;opacity:0">${ch}</span>`).join('');
  return d;
});
const WORDS = [['WEB APPS', C.cyan], ['MOBILE APPS', C.pink], ['AI FEATURES', C.violet], ['AUTOMATION', C.orange], ['DATA TOOLS', C.lime]];
const iBuild = el('mono', 'I BUILD', 'left:86px;top:452px;font-size:22px;letter-spacing:8px;color:#9AA3B5;font-weight:700');
const wordEls = WORDS.map(([w, c]) => el('', w, `left:84px;top:488px;font-size:64px;font-weight:700;letter-spacing:-1.5px;color:${c};text-shadow:0 0 30px ${c}88`));
const chip = el('chip', `<span class="dot" style="background:#A3E635;box-shadow:0 0 12px #A3E635"></span>Available for new work`, 'left:86px;top:600px');

// section headers
function header(kicker, title, sub, x = 84, y = 70) {
  const k = el('kick mono', kicker, `left:${x}px;top:${y}px`);
  const wrap = el('mask', '', `left:${x}px;top:${y + 36}px`); wrap.style.opacity = 1;
  const inner = document.createElement('div'); inner.className = 'h2'; inner.innerHTML = title; wrap.appendChild(inner);
  const s = sub ? el('sub', sub, `left:${x}px;top:${y + 120}px`) : null;
  return (o, p) => { place(k, o, (1 - p) * -30, 0); wrap.style.opacity = o ? 1 : 0; inner.style.transform = `translateY(${(1 - p) * 110}%)`; if (s) place(s, o * smooth(.2, .8, p), 0, (1 - p) * 16); };
}
const hDay = header('01 — EVERY DAY', 'A normal day,<br>step by step', null);
const hSvc = header('02 — WHAT I OFFER', 'Services,<br>in plain words', null);
const hTools = header('03 — TOOLBELT', 'What I<br>build with', null);
// day labels
const dayLabels = STEPS.map(([n, c, d], i) => el('', `<div class="lbl-t" style="color:${c}"><span class="mono" style="font-size:20px;opacity:.7;margin-right:12px">${String(i + 1).padStart(2, '0')}</span>${n}</div><div class="lbl-d">${d}</div>`, ''));
// tools labels
const toolLabels = TOOLS.map(([n, c]) => el('chip', `<span class="dot" style="background:${c}"></span>${n}`, 'left:0;top:0'));
// outro
const oKick = el('kick mono', 'LET\'S TALK', 'left:84px;top:118px');
const oBig = [['Have something', 'top:160px'], ['to build?', 'top:262px']].map(([t, p]) => { const m = el('mask', '', `left:80px;${p}`); m.style.opacity = 1; const i = document.createElement('div'); i.style.cssText = 'font-size:104px;font-weight:700;letter-spacing:-4px;line-height:1.02'; i.className = 'grad'; i.textContent = t; m.appendChild(i); return i; });
const oMail = el('chip mono', 'chanakya.offc@gmail.com', 'left:86px;top:430px;font-size:30px;padding:16px 32px;border-color:#22D3EE88;color:#22D3EE');
const oChip = el('chip', `<span class="dot" style="background:#A3E635;box-shadow:0 0 12px #A3E635"></span>Available for new work`, 'left:86px;top:520px');
// HUD
const hudL = el('hud mono', 'CHANAKYA BUGATA — PORTFOLIO', 'left:40px;bottom:34px');
const hudR = el('hud mono', '', 'right:40px;bottom:34px');
const bars = [['DAILY', 5.4, 11.4], ['OFFER', 11.4, 19.4], ['TOOLS', 19.4, 23.4], ['HELLO', 23.4, 28]].map(([n, a, b]) => {
  const w = el('', `<div style="height:3px;background:rgba(255,255,255,.14);width:${(b - a) * 9}px;position:relative"><div class="fill" style="position:absolute;inset:0;background:linear-gradient(90deg,#8B5CF6,#22D3EE);width:0"></div></div><div class="hud mono" style="margin-top:8px;font-size:12px;letter-spacing:2px">${n}</div>`, `left:${40 + (a - 5.4) * 9 + (a > 5.4 ? 0 : 0)}px;top:0`);
  w.style.top = '40px'; w.style.left = `${790 + (a - 5.4) * 19}px`; w.firstChild.style.width = `${(b - a) * 19 - 8}px`; return { w, a, b, fill: w.querySelector('.fill') };
});

const proj = new THREE.Vector3();
function toScreen(v) { proj.copy(v).project(camera); return { x: (proj.x * .5 + .5) * W, y: (-proj.y * .5 + .5) * H, z: proj.z }; }

// ================================================================ frame
function frame(t) {
  const P = t / T;
  window.starMat.uniforms.uP.value = P; gridMat.uniforms.uP.value = P;
  updateHero(P);

  // camera
  const pose = cameraAt(t);
  camera.position.copy(pose.p); camera.fov = (pose.fov + kick * 14) * (W / H < 1 ? 1.5 : 1);
  const shift = W > 980 ? 0.2 * (1 - smooth(4.6, 6.2, t) + smooth(22.8, 24.4, t)) : 0;
  if (shift > 0.001) camera.setViewOffset(W, H, -W * shift, 0, W, H); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  camera.lookAt(pose.l); camera.updateMatrixWorld();
  fx.uniforms.uAb.value = .0012 + kick * .016; fx.uniforms.uBlur.value = kick * 1.0; fx.uniforms.uT.value = t;

  // ---- hero visibility / intro
  hero.visible = t < 7 || t > 21;
  const heroIn = (t < 5.4 + .6) ? smooth(0, 1.2, t) : 1;

  // ---- day
  dayG.visible = t > 3.8 && t < 13;
  const focusX = camera.position.x - X_DAY;
  cubes.forEach((c, i) => {
    const near = Math.exp(-Math.pow((c.g.position.x - focusX) / 2.6, 2));
    c.g.position.y = Math.sin(P * TAU * 6 + i) * .22 + .15;
    c.g.rotation.set(P * TAU * 2 * (i % 2 ? 1 : -1), P * TAU * 3 + i, 0);
    c.g.scale.setScalar(.8 + .5 * near);
    c.core.scale.setScalar(.7 + 1.2 * near); c.edge.material.opacity = .35 + .65 * near; c.pad.material.opacity = .25 + .75 * near;
  });
  packets.forEach((p, i) => { const u = ((P * 14 + i / 4) % 1); p.position.set(lerp(-2.5 * SP - 2, 2.5 * SP + 2, u), -2.2, 0); });

  // ---- services
  svcG.visible = t > 9.8 && t < 21.2;
  const sv = (t - 12.7) / 1.1, ang = ringAngle(clamp(sv, 0, 6));
  let best = -2;
  panels.forEach((p, i) => {
    const th = i * TAU / 6 - ang; p.g.position.set(Math.sin(th) * RING_R, 0, Math.cos(th) * RING_R - RING_R + 0);
    p.g.rotation.y = th; const f = Math.max(0, Math.cos(th));
    if (Math.cos(th) > best) { best = Math.cos(th); window.svcActive = i; }
    p.g.scale.setScalar(1 + .06 * f); p.edge.material.opacity = .35 + .65 * f;
    p.gl.rotation.y = P * TAU * 2 + i; p.gl.rotation.x = .25 * Math.sin(P * TAU * 4 + i); p.gl.position.y = 1.35 + .1 * Math.sin(P * TAU * 6 + i);
    if (p.gl.userData.spin) p.gl.userData.spin.rotation.z = P * TAU * 4;
  });
  svcG.position.z = RING_R * 0; // panels already offset toward camera via cos term

  // ---- tools
  toolsG.visible = t > 17.8;
  globe.rotation.y = (t - 19.4) * .55; globe.rotation.x = .25;
  globe.updateMatrixWorld(true);

  // render
  composer.render();
  if (window.NOUI) return;

  // ---- overlay (after render so projections use this frame's camera)
  const hp = win(t, 0, 5.4, .6) + win(t, 23.4, T + .001, .6) - 0; // hero text window
  const heroT = t < 14 ? t : t - T;                                 // continuous time around the loop point
  const heroVis = Math.max(win(t, -1, 5.0, .5), 0);
  place(kHero, heroVis * smooth(.2, 1, t), (1 - smooth(.2, 1.1, t)) * -30);
  nameLines.forEach((d, li) => { d.style.opacity = heroVis > .01 ? 1 : 0;
    [...d.children].forEach((s, i) => { const k = easeOut((t - .3 - li * .25 - i * .055) / .7); s.style.opacity = (k * heroVis).toFixed(3); s.style.transform = `translateY(${(1 - k) * 60}px) rotateX(${(1 - k) * -70}deg)`; s.style.backgroundPosition = `${((P * 3) % 1) * 100}% 0`; s.style.filter = k < 1 ? `blur(${(1 - k) * 6}px)` : 'none'; }); });
  place(iBuild, heroVis * smooth(1.4, 2.0, t));
  const wi = clamp(Math.floor((t - 1.7) / .72), 0, WORDS.length - 1), wf = ((t - 1.7) % .72) / .72;
  wordEls.forEach((d, i) => { const on = (i === wi && t > 1.7) ? 1 : 0; const o = on ? Math.min(smooth(0, .22, wf), 1 - smooth(.8, 1, wf)) : 0; place(d, o * heroVis, 0, on ? (1 - smooth(0, .25, wf)) * 40 - smooth(.8, 1, wf) * 30 : 0); });
  place(chip, heroVis * smooth(1.2, 2.0, t), 0, (1 - smooth(1.2, 2.0, t)) * 20);

  const dayVis = win(t, 5.8, 11.4, .7), dp = smooth(5.9, 6.9, t);
  hDay(dayVis, dp);
  dayLabels.forEach((d, i) => { const c = cubes[i]; const q = c.g.getWorldPosition(new THREE.Vector3()); q.y -= 2.6; const s = toScreen(q); const near = Math.exp(-Math.pow((c.g.position.x - focusX) / 3.3, 2));
    d.style.left = '0'; d.style.top = '0'; d.style.width = '300px'; place(d, dayVis * (.22 + .78 * near), s.x - 150, s.y, .72 + .28 * near); d.style.textAlign = 'center'; });

  const svcVis = win(t, 11.8, 19.4, .7), sp = smooth(11.9, 12.9, t);
  hSvc(svcVis, sp);
  const toVis = win(t, 20, 23.4, .7), tp = smooth(20.1, 21.1, t);
  hTools(toVis, tp);
  toolLabels.forEach((d, i) => { const w = toolPos[i].clone().applyMatrix4(globe.matrixWorld); const s = toScreen(w);
    const depth = clamp(1 - (w.distanceTo(camera.position) - 7.6) / 9); d.style.left = '0'; d.style.top = '0';
    const k = smooth(.0, 1, depth); place(d, toVis * (.1 + .9 * k) * smooth(20.2 + i * .04, 20.9 + i * .04, t), s.x - d.offsetWidth / 2, s.y - 22, .55 + .6 * k); d.style.zIndex = Math.round(depth * 100); });
  toolDots.forEach((m, i) => m.scale.setScalar(1 + .3 * Math.sin(P * TAU * 12 + i)));

  const oVis = win(t, 24.3, T - .35, .6), op = smooth(24.3, 25.2, t);
  place(oKick, oVis * op, (1 - op) * -30);
  oBig.forEach((d, i) => { d.style.transform = `translateY(${(1 - smooth(24.5 + i * .25, 25.4 + i * .25, t)) * 110}%)`; d.parentElement.style.opacity = oVis > .01 ? 1 : 0; });
  place(oMail, oVis * smooth(25.2, 25.9, t), 0, (1 - smooth(25.2, 25.9, t)) * 20);
  place(oChip, oVis * smooth(25.5, 26.2, t), 0, (1 - smooth(25.5, 26.2, t)) * 20);

  place(hudL, .9 * smooth(.5, 1.5, t) * (1 - smooth(T - .4, T, t)));
  hudR.textContent = `${String(Math.round(t / T * 100)).padStart(3, '0')}% — KEEP SCROLLING`;
  place(hudR, .9 * smooth(.5, 1.5, t) * (1 - smooth(T - .4, T, t)));
  bars.forEach(b => { const f = clamp((t - b.a) / (b.b - b.a)); b.fill.style.width = (f * 100) + '%'; place(b.w, smooth(5.4, 6, t) * (1 - smooth(T - .4, T, t)) * .95); });
}
window.resize = () => { W = innerWidth; H = innerHeight; renderer.setSize(W, H); composer.setSize(W, H); bloom.setSize(W, H);
  camera.aspect = W / H; camera.updateProjectionMatrix(); };
window.resize();
window.frame = frame;
window.T = T;
window.ready = true;
