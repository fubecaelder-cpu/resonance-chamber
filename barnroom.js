// Room 4 (v22): "Little Moo Barn" — a stylized, playful, people-free dairy barn. Cream and soft pink with black cow-print walls, cow-spot
// floor tiles that slowly morph, mirrored wooden stalls with brass rails, hay bales and glowing lanterns, a hanging brass bell, glowing
// glass milk-bottle pods and a swirling milk-and-cream spiral vortex where the main screen's tunnel would be.
// Built on top of buildChamber (walls / floor / doorways / mirror / monitor bay) through its deluxe hooks (head, wallGLSL, ceilGLSL,
// floorGLSL, focalFn, extra), exactly like the pink room. Nothing here depends on how many doorways the room has (it has three).
import { THREE, U, f3, R, H, TY, TR, TZ, LOW, mtx, instanced, glowSprite, canvasTex } from './shared.js?v=32';

const FS = 1.25, FY = 2.25, RM = TR * FS;     // portal scale / centre height / mouth radius (must match chamber.js deluxe)
const PI = Math.PI;

// ---------- shared GLSL: seamless 3-D value noise + cow-print mask, wood and brass shading ----------
export const BARN_GLSL = /* glsl */`
  float hash13b(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vn3b(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13b(i), hash13b(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13b(i + vec3(0.0, 1.0, 0.0)), hash13b(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash13b(i + vec3(0.0, 0.0, 1.0)), hash13b(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13b(i + vec3(0.0, 1.0, 1.0)), hash13b(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
  // 1 inside a black cow spot (anti-aliased)
  float cowB(vec3 p){ float n = vn3b(p * 0.5) * 0.7 + vn3b(p * 1.15 + 7.3) * 0.3; float w = fwidth(n) * 0.75 + 0.003; return smoothstep(0.52 - w, 0.52 + w, n); }
`;
export const MAT_GLSL = /* glsl */`
  vec3 woodCol(vec3 wp, vec3 N, float seed){
    vec3 q = vec3(wp.x, abs(wp.y), wp.z);
    float g = vn3b(vec3(q.x * 14.0 + seed * 9.0, q.y * 1.6, q.z * 14.0)) * 0.6 + vn3b(q * vec3(5.0, 0.8, 5.0) + seed) * 0.4;
    vec3 c = mix(vec3(0.17, 0.085, 0.04), vec3(0.4, 0.225, 0.105), g);
    return c * (0.55 + 0.55 * max(dot(N, normalize(vec3(0.25, 1.0, 0.35))), 0.0) + 0.12 * N.x);
  }
  vec3 brassCol(vec3 N, vec3 V){
    vec3 Rf = reflect(-V, N); float up = 0.5 + 0.5 * Rf.y;
    vec3 c = mix(vec3(0.3, 0.17, 0.05), vec3(1.0, 0.78, 0.4), up * up);
    c += HOT * 0.9 * pow(max(dot(Rf, normalize(vec3(0.3, 0.8, 0.5))), 0.0), 18.0);
    c += PINK * 0.25 * pow(1.0 - abs(dot(N, V)), 3.0);
    return c * 0.85;
  }
`;
const DEFOG = /* glsl */`
  // the shared fog would wash the print towards brown: pre-compensate so cream stays bright and the spots stay black (same formula as fogit)
  vec3 defog(vec3 c, vec3 wp){ float k = (1.0 - exp(-length(wp - CAM) * 0.055)) * 0.5; return max((c - FOGC * (0.7 + 0.5 * uInt + 0.6 * uBeat) * k) / (1.0 - k), 0.0); }
`;
const HEAD = BARN_GLSL;
const HEAD_MAT = BARN_GLSL + DEFOG;   // for the wall / ceiling / floor materials only (they have the camera varying)

// ---------- walls: black cow print over cream, a wooden plank wainscot, a brass rail and a thin pink trim ----------
const wallGLSL = /* glsl */`
  {
    float arc = ang * ${f3(R)};
    vec3 wp = vec3(vW.x, y, vW.z);
    float sp = cowB(wp * 0.72);
    vec3 cream = vec3(1.0, 0.975, 0.9);
    vec3 cow = mix(cream, vec3(0.0), sp);
    float pk = arc / 0.27; float pid = floor(pk); float pf = fract(pk);
    float ph = hash12(vec2(pid, 1.0));
    vec3 wood = mix(vec3(0.2, 0.105, 0.05), vec3(0.36, 0.2, 0.095), ph) * (0.82 + 0.18 * sin(y * 55.0 + ph * 40.0 + vn3b(wp * 6.0) * 6.0));
    wood *= 1.0 - (1.0 - smoothstep(0.0, 0.05 + fwidth(pk) * 1.5, min(pf, 1.0 - pf))) * 0.7;
    col = mix(cow, wood, 1.0 - smoothstep(1.12, 1.16, y));
    float pyy = fwidth(y);
    col += vec3(1.0, 0.75, 0.38) * (1.0 - smoothstep(0.03, 0.03 + pyy * 1.5, abs(y - 1.2))) * 0.85;
    col += PINK * (1.0 - smoothstep(0.02, 0.02 + pyy * 1.5, abs(y - 3.95))) * (0.7 + 0.6 * uBeat);
    col += PINK * (1.0 - smoothstep(0.02, 0.02 + pyy * 1.5, abs(y - 7.05))) * 0.5;
    col += HOT * 0.3 * exp(-(dm - ${f3(RM)}) * 0.9) * (0.45 + 0.4 * uInt + 0.7 * uBeat) * (1.0 - sp * 0.8);
    col = defog(col, vW);
  }`;

const ceilGLSL = /* glsl */`
  {
    float sp = cowB(vec3(vW.x, 3.0, vW.z) * 0.55);
    col = mix(vec3(0.96, 0.92, 0.82), vec3(0.0), sp);
    col += PINK * 0.4 * exp(-abs(r - 2.4) * 2.5) * (0.6 + 0.4 * uInt + 0.8 * uBeat) * (1.0 - sp * 0.8);
    col += HOT * 0.25 * exp(-r * 0.8) * (0.6 + 0.8 * uBeat) * (1.0 - sp * 0.8);
    col = defog(col, vW);
  }`;

// ---------- floor: cream tiles with black cow spots; the spots slowly morph (the 3-D noise drifts through its 3rd axis) ----------
const floorGLSL = /* glsl */`
  {
    vec2 tc = p / 1.1; vec2 gf = fract(tc); vec2 ge = min(gf, 1.0 - gf) * 1.1;
    float sm = max(1.0 - smoothstep(0.012, 0.012 + px.x * 1.5, ge.x), 1.0 - smoothstep(0.012, 0.012 + px.y * 1.5, ge.y));
    float sp = cowB(vec3(p * 0.62, uTime * 0.045));
    vec3 cream = vec3(1.0, 0.975, 0.9);
    col = mix(cream, vec3(0.0), sp) * (1.0 - 0.3 * sm);
    col += PINK * ln(rr - 5.35, 0.016) * 0.8 * DIM + HOT * ln(rr - 5.62, 0.008) * 0.6;
    col += PINK * ln(rr - 1.0, 0.012) * 0.45 * DIM;
    col = defog(col, vW);
  }`;

// ---------- focal: swirling milk-and-cream spiral vortex (a funnel, like the crimson one, but soft and creamy) ----------
function focalFn(K, fg) {
  const VL = 26;
  const VSX = /* glsl */`
    uniform float uTime; uniform float uBeat; uniform float uBeatT; varying vec3 vP;
    void main(){
      vP = position; float d = -position.z; float k = clamp(d / ${f3(VL)}, 0.0, 1.0);
      float rf = pow(1.0 - k, 0.8) * 0.97 + 0.03;
      rf *= 1.0 + 0.03 * sin(uTime * 0.9 + d * 0.3) * (1.0 - k) + 0.035 * exp(-uBeatT * 5.0) * uBeat * (1.0 - k);
      vec3 p = position; p.xy *= rf * (1.0 + 0.16 * (1.0 - smoothstep(0.0, 1.2, d)));
      p.xy += vec2(sin(d * 0.15 + uTime * 0.35), cos(d * 0.12 + uTime * 0.28)) * k * 0.6;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const FSX = K.COMMON + HEAD + /* glsl */`
    varying vec3 vP;
    void main(){
      float d = -vP.z; float k = clamp(d / ${f3(VL)}, 0.0, 1.0);
      float a = atan(vP.y, vP.x);
      float ld = log(0.5 + d);
      float sw = a + uTime * 0.38 + 2.3 * ld;
      float arms = 0.5 + 0.5 * sin(sw * 3.0 + ld * 5.0 - uTime * 0.55);           // 3 creamy spiral arms
      float arms2 = 0.5 + 0.5 * sin(sw * 5.0 - ld * 7.0 + uTime * 0.4);
      float w = (length(fwidth(vec2(cos(a), sin(a)))) + fwidth(ld) * 2.3) * 3.0; float kk = clamp(1.3 - w * 0.9, 0.0, 1.0);
      vec3 cream = vec3(1.0, 0.94, 0.8), pink = vec3(1.0, 0.6, 0.72), gold = vec3(1.0, 0.76, 0.4);
      float mb = vn3b(vec3(cos(a) * 1.6, sin(a) * 1.6, ld * 2.2 - uTime * 0.25)) ;   // marbled, seamless around the barrel
      vec3 col = mix(pink, cream, smoothstep(0.18, 0.78, arms));
      col = mix(col, gold, 0.35 * smoothstep(0.55, 0.9, arms2) * (1.0 - arms * 0.5));
      col = mix(col, cream, 0.35 * mb);
      col = mix(vec3(0.85, 0.68, 0.62), col, kk);
      float hz = hash12(floor(vec2(a * 18.0 / 6.2831 * 3.0, ld * 24.0)));
      col += vec3(1.0, 0.95, 0.85) * step(0.97, hz) * (0.5 + 0.5 * sin(uTime * 2.0 + hz * 90.0)) * 0.5 * (1.0 - k);   // creamy sparkles
      float wv = exp(-abs((${f3(VL)} - d) - uBeatT * 9.0) * 0.3) * uBeat;
      col *= (0.78 + 0.35 * uInt + wv * 0.8) * mix(1.0, 0.7, k);
      col += gold * exp(-(${f3(VL)} - d) * 0.2) * (0.5 + 0.9 * uBeat);
      col += pink * 0.3 * exp(-d * 1.4) * (0.7 + 0.6 * uBeat);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const geo = new THREE.CylinderGeometry(TR, TR, VL, 64, 70, true); geo.rotateX(PI / 2); geo.translate(0, 0, -VL / 2);
  const t = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: VSX, fragmentShader: FSX, side: THREE.BackSide }));
  t.position.set(0, TY, TZ); t.frustumCulled = false; fg.add(t);
  // soft creamy back cap
  const cg = new THREE.CircleGeometry(TR, 48); cg.translate(0, 0, -VL);
  const cap = new THREE.Mesh(cg, new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: VSX, fragmentShader: K.COMMON + `varying vec3 vP; void main(){ float r = length(vP.xy) / ${f3(TR)};
    gl_FragColor = vec4(mix(vec3(1.0, 0.86, 0.6), vec3(1.0, 0.6, 0.72), smoothstep(0.0, 0.9, r)) * (0.7 + 0.6 * uBeat), 1.0); }` }));
  cap.position.set(0, TY, TZ); cap.frustumCulled = false; fg.add(cap);
}

// ---------- lathe profiles ----------
const BOTTLE = [[0, 0], [0.3, 0], [0.34, 0.03], [0.36, 0.12], [0.36, 0.58], [0.34, 0.66], [0.26, 0.74], [0.16, 0.8], [0.115, 0.86], [0.11, 0.94], [0.13, 0.955], [0.13, 0.985], [0.1, 1.0], [0, 1.0]];
const BELL = [[0.03, 1.0], [0.09, 0.97], [0.14, 0.9], [0.2, 0.7], [0.26, 0.45], [0.34, 0.18], [0.4, 0.0], [0.42, -0.05], [0.37, -0.05], [0.3, 0.08], [0.22, 0.2], [0.0, 0.2]];
const lathe = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

function extra({ K, world, root, fx, out, haze }) {
  const { mat, neonTorus, neonTube, metalMat, hex } = K;
  const PC = new THREE.Vector3(0, FY, TZ + 0.06);
  const at = (z) => PC.clone().setZ(PC.z + z);
  const WOOD = (seed = 0.3) => mat(`${BARN_GLSL}${MAT_GLSL} void main(){ vec3 N = normalize(vN);
    gl_FragColor = vec4(fogit(woodCol(vW, N, ${f3(seed)}), vW), 1.0); }`);
  const BRASS = (opts = {}) => mat(`${BARN_GLSL}${MAT_GLSL} void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); if (!gl_FrontFacing) N = -N;
    gl_FragColor = vec4(fogit(brassCol(N, V) + HOT * 0.12 * uBeat, vW), 1.0); }`, opts);

  // ---------- grand portal: cow-print bezel, brass lips, pink neon rings, chase lights, warm halo ----------
  {
    const bez = new THREE.Mesh(new THREE.TorusGeometry(RM + 0.45, 0.3, 16, 96), mat(`${BARN_GLSL} void main(){ float sp = cowB(vec3(vW.x, abs(vW.y), vW.z) * 1.5);
      vec3 N = normalize(vN); float lit = 0.6 + 0.5 * max(dot(N, normalize(vec3(0.2, 0.7, 0.6))), 0.0);
      vec3 c = mix(vec3(1.0, 0.975, 0.9), vec3(0.0), sp) * (0.8 + 0.3 * lit); c += PINK * pow(1.0 - abs(dot(N, normalize(CAM - vW))), 3.0) * 0.3;
      gl_FragColor = vec4(fogit(c, vW), 1.0); }`));
    bez.position.copy(PC); world.add(bez);
    for (const [r, tube, dz] of [[RM + 0.08, 0.07, 0.08], [RM + 0.86, 0.045, 0.22], [RM + 1.1, 0.03, 0.12]]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 96), BRASS()); t.position.copy(at(dz)); world.add(t);
    }
    neonTorus(world, RM + 0.7, 0.032, hex.a, at(0.18), 0, 1.15, 5);
    neonTorus(world, RM + 0.98, 0.016, hex.c, at(0.14), 0, 0.95, 6);
    const chase = [];
    for (let i = 0; i < 56; i++) { const a = (i / 56) * PI * 2; chase.push(mtx(Math.cos(a) * (RM + 0.45), FY + Math.sin(a) * (RM + 0.45), TZ + 0.45, 0, 0, 1, 1, 1).clone()); }
    // each bulb is a small glowing bead on the bezel
    const bulbs = instanced(new THREE.SphereGeometry(0.055, 10, 8), mat(`void main(){ float a = atan(vI.y - ${f3(FY)}, vI.x);
      float c = pow(0.5 + 0.5 * sin(a * 4.0 - uTime * 2.2), 6.0);
      gl_FragColor = vec4(mix(vec3(0.7, 0.4, 0.2), vec3(1.0, 0.92, 0.7) * 1.4, max(c, uBeat * 0.8)), 1.0); }`), chase, world);
    bulbs.renderOrder = 1;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry((RM + 3.6) * 2, (RM + 3.6) * 2), mat(`void main(){
      vec2 p = (vUv - 0.5) * 2.0 * ${f3(RM + 3.6)}; float r = length(p); float a = atan(p.y, p.x);
      float ring = exp(-abs(r - ${f3(RM + 0.1)}) * 3.5) + 0.5 * exp(-abs(r - ${f3(RM + 0.7)}) * 6.0);
      float outer = exp(-(r - ${f3(RM)}) * 0.7);
      float rays = pow(0.5 + 0.5 * sin(a * 16.0 + uTime * 0.14), 10.0) + 0.7 * pow(0.5 + 0.5 * sin(a * 6.0 - uTime * 0.1), 14.0);
      rays *= exp(-(r - ${f3(RM)}) * 0.45);
      float I = ring * 0.4 + outer * 0.4 + rays * 0.28;
      I *= smoothstep(${f3(RM - 0.05)}, ${f3(RM + 0.08)}, r) * (1.0 - smoothstep(${f3(RM + 2.9)}, ${f3(RM + 3.6)}, r));
      I *= 1.0 - smoothstep(${f3(RM + 1.0)}, ${f3(RM + 1.7)}, p.y) * 0.85;
      gl_FragColor = vec4(mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.7, 0.8), 0.35 + 0.3 * sin(a * 3.0 + uTime * 0.2)) * I * (0.4 + 0.4 * uInt + 0.9 * uBeat), 1.0);
    }`, { additive: true }));
    halo.position.set(0, FY, TZ + 0.5); halo.renderOrder = 24; world.add(halo);
  }

  // ---------- name plaque above the portal ----------
  {
    const { c, g, t } = canvasTex(1024, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#6e3a1a'); grd.addColorStop(0.5, '#8a4d24'); grd.addColorStop(1, '#5a2e14');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(30,12,4,${0.08 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(300, y + 6, 700, y - 6, 1024, y + 2); g.stroke(); }
    g.strokeStyle = '#ffd27a'; g.lineWidth = 9; g.strokeRect(14, 14, 996, 228); g.strokeStyle = '#ff9fbd'; g.lineWidth = 3; g.strokeRect(30, 30, 964, 196);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 700 104px Georgia, "Times New Roman", serif';
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8; g.fillStyle = '#fff0d2'; g.fillText('Little Moo Barn', 512, 120);
    g.shadowBlur = 0; g.fillStyle = '#ff9fbd'; g.font = '700 30px Georgia, serif'; g.fillText('✿   fresh • warm • cozy   ✿', 512, 208);
    t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    const half = 1.75 / (R - 0.1);
    const geo = new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.86, 40, 1, true, PI - half, half * 2);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const pl = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, toneMapped: false }));
    pl.position.y = 5.55; pl.userData.noMirror = true; world.add(pl);
    neonTube(world, new THREE.CatmullRomCurve3([new THREE.Vector3(-1.82, 5.06, -6.614), new THREE.Vector3(0, 5.06, -6.86), new THREE.Vector3(1.82, 5.06, -6.614)]), hex.a, 0.8, 0.02, 12, 4);
  }

  // ---------- mirrored wooden stalls: a continuous row of partitions down both long sides (v23: 6 stalls a side, 12 in all) ----------
  // Every stall: posts with a brass cap and a lantern on an arm, a divider back to the wall, a kick board, three brass pipe rails,
  // a top beam, a hay-filled feed trough on the wall, hay on the stall floor and bales along the front. All instanced (a handful of draw calls).
  const woodM = [], brassBoxM = [], pipeM = [], hayM = [], lampM = [], poolM = [], armM = [];
  const NST = 6, HALF = (7.5 * PI) / 180, A0 = (60 * PI) / 180, RP = 5.25;   // stalls span 60°..150° from the arrival axis (doors sit at 0° and ±45°)
  const CENTERS = Array.from({ length: NST }, (_, k) => A0 + HALF + k * 2 * HALF);
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const PODXY = [[3.1, -2.1], [3.9, -0.4], [4.3, 1.3]];
  const lampPos = [];
  for (const s of [-1, 1]) {
    const P = (a, r) => [s * Math.sin(a) * r, Math.cos(a) * r];
    const posts = Array.from({ length: NST + 1 }, (_, k) => A0 + k * 2 * HALF);
    for (const a of posts) {            // posts, brass caps and a lantern arm on every post
      const [x, z] = P(a, RP);
      woodM.push(mtx(x, 1.2, z, s * a, 0, 0.14, 2.4, 0.14));
      brassBoxM.push(mtx(x, 2.44, z, s * a, 0, 0.18, 0.06, 0.18));
      const [ax, az] = P(a, RP - 0.12); armM.push(mtx(ax, 2.12, az, s * a, 0, 0.035, 0.035, 0.26));
      const [lx, lz] = P(a, RP - 0.24); lampPos.push([lx, 1.9, lz]);
      // divider panel back to the wall (full height rail on top)
      const [dx, dz] = P(a, 6.02);
      woodM.push(mtx(dx, 0.58, dz, s * a, 0, 0.09, 1.16, 1.45));
      brassBoxM.push(mtx(dx, 1.19, dz, s * a, 0, 0.06, 0.05, 1.47));
      brassBoxM.push(mtx(dx, 0.6, dz, s * a, 0, 0.03, 0.03, 1.46));
    }
    for (let si = 0; si < NST; si++) {
      const ac = CENTERS[si];
      const [mx, mz] = P(ac, RP * Math.cos(HALF)), yawT = s * ac + PI / 2, yawK = s * ac, len = 2 * RP * Math.sin(HALF) - 0.14;
      woodM.push(mtx(mx, 0.36, mz, yawK, 0, len, 0.72, 0.07));                       // kick board
      woodM.push(mtx(mx, 2.38, mz, yawK, 0, len + 0.14, 0.1, 0.1));                  // top beam: the posts read as one continuous run
      for (const y of [1.0, 1.45, 1.9]) pipeM.push(mtx(mx, y, mz, yawT, PI / 2, 0.034, len, 0.034));   // brass pipe rails
      brassBoxM.push(mtx(mx, 0.74, mz, yawK, 0, len, 0.04, 0.09));                   // brass kick-board cap
      // feed trough on the wall with a hay mound
      const [tx, tz] = P(ac, 6.5); woodM.push(mtx(tx, 0.72, tz, yawK, 0, 1.2, 0.34, 0.34)); brassBoxM.push(mtx(tx, 0.9, tz, yawK, 0, 1.24, 0.03, 0.06));
      hayM.push(mtx(tx, 0.95, tz, yawK + 0.1 * (si % 2 ? 1 : -1), 0, 1.05, 0.26, 0.26));
      // hay on the stall floor: one to three bales per stall, a little different each time (symmetrical clearances, varied hay)
      const k = rnd(ac * 7 + s * 3 + 1), [hx, hz] = P(ac + (k - 0.5) * 0.05, 6.0);
      hayM.push(mtx(hx, 0.22, hz, s * ac + (k - 0.5) * 0.25, 0, 1.0, 0.44, 0.56));
      if (k > 0.35) { const [h2x, h2z] = P(ac - 0.02, 6.08); hayM.push(mtx(h2x, 0.66, h2z, s * ac + 0.5 * k, 0, 0.75, 0.4, 0.5)); }
      if (k < 0.7) { const [h3x, h3z] = P(ac + 0.07 * (k > 0.5 ? 1 : -1), 5.55); hayM.push(mtx(h3x, 0.17, h3z, s * ac + 1.2 * k, 0, 0.5, 0.34, 0.38)); }
      // loose bale on the walkway in front of every other stall, kept clear of the pods and the doors (the same on both sides)
      {
        const [fx2, fz2] = P(ac, 4.85);
        if (PODXY.every(([px, pz]) => Math.hypot(Math.abs(fx2) - px, fz2 - pz) > 1.2)) {
          hayM.push(mtx(fx2, 0.2, fz2, yawK + PI / 2 + 0.15 * (si - 2), 0, 0.9, 0.4, 0.5));
          if (si === 5) hayM.push(mtx(fx2, 0.58, fz2, yawK + PI / 2 - 0.25, 0, 0.7, 0.36, 0.45));
        }
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  instanced(box, WOOD(0.37), woodM, world);
  instanced(box, BRASS(), brassBoxM.concat(armM), world);
  instanced(cyl, BRASS(), pipeM, world);
  instanced(box, mat(`${BARN_GLSL} void main(){ vec3 N = normalize(vN);
    float st = vn3b(vec3(vL.x * 7.0, vL.y * 90.0 + vH * 20.0, vL.z * 40.0)); float st2 = vn3b(vec3(vL.x * 22.0, vL.y * 30.0, vL.z * 120.0 + vH * 9.0));
    vec3 c = mix(vec3(0.62, 0.42, 0.14), vec3(0.98, 0.78, 0.36), st * 0.6 + st2 * 0.4);
    float twine = (1.0 - smoothstep(0.02, 0.05, abs(abs(vL.x) - 0.24))) * 0.55; c = mix(c, vec3(0.25, 0.12, 0.05), twine);
    c *= 0.62 + 0.45 * max(dot(N, normalize(vec3(0.25, 1.0, 0.35))), 0.0) + 0.08 * N.z;
    gl_FragColor = vec4(fogit(c, vW), 1.0); }`), hayM, world);

  // lanterns: caged glowing amber lamps with brass caps, a soft sprite glow and a warm pool on the floor
  {
    const bodies = [], caps = [], bases = [], rings = [], pools = [];
    for (const [x, y, z] of lampPos) {
      bodies.push(mtx(x, y, z)); caps.push(mtx(x, y + 0.145, z)); bases.push(mtx(x, y - 0.12, z)); rings.push(mtx(x, y + 0.205, z, 0, PI / 2));
      pools.push(mtx(x, 0.016, z, 0, -PI / 2));
      const sp = glowSprite(0xffb255, 1.5, 1.5, 0.5); sp.position.set(x, y, z); sp.renderOrder = 30; world.add(sp);
    }
    instanced(new THREE.CylinderGeometry(0.078, 0.07, 0.2, 12), mat(`void main(){ float a = atan(vL.x, vL.z);
      float bars = 1.0 - smoothstep(0.1, 0.16, abs(fract(a * 8.0 / 6.2831 + 0.5) - 0.5));
      float fl = 0.9 + 0.1 * sin(uTime * 6.0 + vH * 60.0) * sin(uTime * 2.3 + vH * 20.0);
      vec3 c = mix(vec3(1.0, 0.78, 0.4) * 1.5, vec3(0.28, 0.16, 0.06), bars * 0.8) * fl * (0.85 + 0.35 * uBeat);
      gl_FragColor = vec4(c, 1.0); }`), bodies, world);
    instanced(new THREE.ConeGeometry(0.1, 0.08, 12), BRASS(), caps, world);
    instanced(new THREE.CylinderGeometry(0.085, 0.075, 0.04, 12), BRASS(), bases, world);
    instanced(new THREE.TorusGeometry(0.035, 0.008, 6, 14), BRASS(), rings, world);
    const pg = new THREE.PlaneGeometry(2.4, 2.4);
    const pm = instanced(pg, mat(`void main(){ float r = length(vUv - 0.5) * 2.0; float a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.85, 1.0, r));
      gl_FragColor = vec4(vec3(1.0, 0.7, 0.34) * a * (0.3 + 0.06 * sin(uTime * 3.0 + vH * 40.0)), 1.0); }`, { additive: true }), pools, world);
    pm.renderOrder = 12;
  }

  // ---------- milk-bottle pods (glowing glass bottles floating over brass pads) ----------
  const PODS = [[3.1, -2.1], [3.9, -0.4], [4.3, 1.3]].flatMap(([x, z]) => [[-x, z], [x, z]]);
  {
    const bGeo = lathe(BOTTLE, 40);
    const GLASS = (extra = '') => mat(`${BARN_GLSL} void main(){
      vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); if (!gl_FrontFacing) N = -N;
      float f = pow(1.0 - abs(dot(N, V)), 2.2);
      float fillY = 0.72; float inMilk = 1.0 - smoothstep(fillY, fillY + 0.012, vL.y);
      float mer = exp(-abs(vL.y - fillY) * 60.0);
      vec3 milk = vec3(1.0, 0.93, 0.78) * (0.17 + 0.05 * sin(vL.y * 9.0 - uTime * 0.6)) * inMilk;
      vec3 rim = mix(vec3(1.0, 0.62, 0.74), vec3(1.0, 0.92, 0.75), 0.5 + 0.5 * sin(uTime * 0.4 + vL.y * 3.0)) * f * 0.85;
      float hl = pow(max(dot(reflect(-V, N), normalize(vec3(-0.45, 0.65, 0.6))), 0.0), 28.0) * 0.8;
      vec3 c = (milk + rim + vec3(1.0, 0.95, 0.85) * hl + vec3(1.0, 0.8, 0.5) * mer * 0.5) * (0.75 + 0.3 * uInt + 0.5 * uBeat);
      ${extra}
      gl_FragColor = vec4(c, 1.0); }`, { additive: true, side: THREE.DoubleSide });
    // pods
    const podB = [], capM = [], padM = [], colM = [];
    for (const [x, z] of PODS) {
      podB.push(mtx(x, 0.4, z, 0, 0, 1.35, 3.2, 1.35));
      capM.push(mtx(x, 0.4 + 3.2 * 0.97, z, 0, 0, 1, 1, 1));
      padM.push(mtx(x, 0.06, z)); colM.push(mtx(x, 0.12, z));
      const sp = glowSprite(0xffd9a0, 2.4, 4.2, 0.3); sp.position.set(x, 1.7, z); sp.renderOrder = 30; world.add(sp);
    }
    instanced(bGeo, GLASS(), podB, world).renderOrder = 3;
    instanced(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 16), mat(`${BARN_GLSL}${MAT_GLSL} void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW);
      gl_FragColor = vec4(fogit(mix(vec3(0.95, 0.5, 0.65), brassCol(N, V), 0.6), vW), 1.0); }`), capM, world);
    instanced(new THREE.CylinderGeometry(0.62, 0.72, 0.12, 36), mat(`${BARN_GLSL}${MAT_GLSL} void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW);
      vec3 c = brassCol(N, V);
      if (N.y > 0.5) { float r = length(vL.xz) / 0.62; float ring = 1.0 - smoothstep(0.0, 0.05, abs(r - 0.82));
        c = mix(vec3(1.0, 0.92, 0.75) * 0.95, vec3(1.0, 0.6, 0.72), smoothstep(0.5, 0.95, r)) * (0.85 + 0.4 * uBeat) + vec3(1.0) * ring * 0.4; }
      gl_FragColor = vec4(fogit(c, vW), 1.0); }`), padM, world);
    instanced(new THREE.CylinderGeometry(0.46, 0.56, 0.4, 28, 1, true), mat(`void main(){ float k = 1.0 - (vL.y + 0.2) / 0.4; float f = abs(dot(normalize(vN), normalize(CAM - vW)));
      gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * pow(f, 1.2) * k * 0.45 * (0.7 + 0.5 * uBeat), 1.0); }`, { additive: true, side: THREE.DoubleSide }), colM, world).renderOrder = 3;
    out.podSpots = PODS.map(([x, z]) => ({ kind: 'tube', x, z }));   // holo media panels (pods.js) float inside the bottles

    // hanging bottles on brass cords
    const hang = [], cord = [];
    for (const [x, y, z] of [[2.7, 6.3, -0.6], [3.5, 5.5, 1.2], [2.4, 6.7, 2.4], [4.1, 6.2, -1.9]].flatMap(([x, y, z]) => [[-x, y, z], [x, y, z]])) {
      hang.push(mtx(x, y, z, 0, 0, 0.5, 0.8, 0.5)); cord.push(mtx(x, (y + 0.8 + H) / 2, z, 0, 0, 0.012, H - y - 0.8, 0.012));
    }
    instanced(bGeo, GLASS(), hang, world).renderOrder = 3;
    instanced(cyl, BRASS(), cord, world);
  }

  // ---------- rafters and the hanging brass bell ----------
  {
    const bm = [];
    for (const z of [1.0, 3.2, 5.2]) bm.push(mtx(0, H - 0.3, z, 0, 0, 2 * Math.sqrt(R * R - z * z) - 0.3, 0.32, 0.32));
    instanced(box, WOOD(0.71), bm, world);
    const bell = new THREE.Mesh(lathe(BELL, 40), mat(`${BARN_GLSL}${MAT_GLSL} void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); if (!gl_FrontFacing) N = -N;
      gl_FragColor = vec4(fogit(brassCol(N, V) * 1.1 + HOT * 0.25 * exp(-uBeatT * 4.0) * uBeat, vW), 1.0); }`, { side: THREE.DoubleSide,
      vs: K.VSf(`float sa = sin(uTime * 0.9) * 0.07; vec3 q = lp.xyz - vec3(0.0, 1.0, 0.0);
        lp.xyz = vec3(q.x * cos(sa) - q.y * sin(sa), q.x * sin(sa) + q.y * cos(sa), q.z) + vec3(0.0, 1.0, 0.0);`) }));
    bell.scale.setScalar(0.95); bell.position.set(0, 5.75, 1.0); world.add(bell);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 8), BRASS()); chain.scale.y = H - 0.3 - 6.7; chain.position.set(0, 6.7 + chain.scale.y / 2, 1.0); world.add(chain);
    const gl = glowSprite(0xffc477, 2.4, 2.4, 0.22); gl.position.set(0, 6.1, 1.0); gl.renderOrder = 30; world.add(gl);
  }

  // ---------- haze: warm cream veils beside the portal + slow golden bokeh ----------
  {
    const hz = mat(`void main(){ vec2 p = vUv - 0.5; float e = (1.0 - smoothstep(0.1, 0.5, abs(p.x))) * (1.0 - smoothstep(0.0, 0.5, abs(p.y + 0.05)));
      float n = 0.6 + 0.4 * sin(vUv.y * 5.0 + uTime * 0.3 + vUv.x * 3.0) * sin(vUv.x * 4.0 - uTime * 0.2);
      gl_FragColor = vec4(mix(vec3(1.0, 0.78, 0.5), vec3(1.0, 0.7, 0.8), 0.3) * e * n * 0.07 * (0.6 + 0.6 * uInt + 0.8 * uBeat), 1.0); }`, { additive: true, side: THREE.DoubleSide });
    for (const [x, z, ry, w, h] of [[-4.4, -1.4, 0.5, 2.8, 7.0], [4.4, -1.4, -0.5, 2.8, 7.0], [0, -2.6, 0, 9.0, 3.2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), hz); p.position.set(x, z === -2.6 ? 6.6 : h / 2, z); p.rotation.y = ry; p.renderOrder = 31; fx.add(p); haze.push(p);
    }
    const N = LOW ? 50 : 110, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { const r = Math.sqrt(Math.random()) * 5.6, a = Math.random() * PI * 2; pos.set([Math.sin(a) * r, 0.6 + Math.random() * 6.4, Math.cos(a) * r], i * 3); seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const bm = new THREE.ShaderMaterial({ uniforms: { ...U }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime; uniform float uPx; attribute float seed; varying float vA;
        void main(){ vec3 p = position; p.y += sin(uTime * 0.12 + seed * 20.0) * 0.4; p.x += sin(uTime * 0.09 + seed * 11.0) * 0.5; p.z += cos(uTime * 0.07 + seed * 7.0) * 0.5;
          vA = 0.5 + 0.5 * sin(uTime * 0.5 + seed * 30.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp((0.09 + 0.16 * seed) * uPx * projectionMatrix[1][1] / -mv.z, 1.0, 90.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.36, d) * (0.55 + 0.45 * smoothstep(0.25, 0.45, d));
        gl_FragColor = vec4(vec3(1.0, 0.75, 0.45) * a * vA * 0.07, 1.0); }` });
    const bk = new THREE.Points(g, bm); bk.frustumCulled = false; bk.renderOrder = 33; fx.add(bk); haze.push(bk);
  }
}

export function barnRoomCfg(doors) {
  return { name: 'room4', pal: 'barn', focal: 'tunnel', screen: false, deluxe: true, podIdx: [], doors, head: HEAD_MAT,
    wallGLSL, ceilGLSL, floorGLSL, focalFn, extra };
}
