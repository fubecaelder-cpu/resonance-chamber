// v26: "Miss Moo" — a sleek cyber-sci-fi young woman (stylised, ~1.7 m): short layered white pixie/bob hair with pink-tipped wisps and bangs, a pale calm half-lidded face with pink eye makeup,
// a glossy black high-neck bodysuit with glowing neon-pink circuit/hex lines and a glowing padlock emblem, black gloves (the right one fingerless) and chunky platform boots.
// The cow theme is kept subtle: a cow-print choker with a small brass cowbell. Fully covered, slender and non-sexual by design.
// She walks toward the listener during the Moo Track, then stands in a relaxed contrapposto (breathing, slow sway, head tilt, slow blinks, glow pulsing like a heartbeat),
// flashes the emblem on 'prop' cues and rings the bell on cowbell cues. Built from merged three.js primitives with the kit's shaders (face paint, neon lines and hair gradient are
// fragment shaders), twice: the figure and a y-flipped twin for the glossy mirrors. About 18 meshes per figure.
import { THREE, makeKit, clipMirror } from './shared.js?v=32';
import { BARN_GLSL } from './barnroom.js?v=32';

const PI = Math.PI;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const f3 = (v) => Number(v).toFixed(4);

const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const ell = (rx, ry, rz, ws = 14, hs = 10) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
// [[geometry, matrix?, uvTag?], ...] -> one non-indexed BufferGeometry (position, normal, uv). uvTag = [u, v] overrides the uv of every vertex of that piece (used as a per-piece parameter by the shaders).
function merge(list) {
  const P = [], N = [], U = [];
  for (const [g, m, tag] of list) {
    const n = g.index ? g.toNonIndexed() : g.clone(); if (m) n.applyMatrix4(m);
    P.push(...n.attributes.position.array); N.push(...n.attributes.normal.array);
    if (tag) { const c = n.attributes.position.count; for (let i = 0; i < c; i++) U.push(tag[0], tag[1]); } else U.push(...(n.attributes.uv ? n.attributes.uv.array : new Float32Array(n.attributes.position.count * 2)));
    n.dispose();
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return o;
}
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// neon line patterns, as polylines in (|angle round the part| * K, y) space
const hex = (cx, cy, r) => Array.from({ length: 7 }, (_, i) => [cx + r * Math.cos(i * PI / 3 + 0.5236), cy + r * Math.sin(i * PI / 3 + 0.5236)]);
const TORSO_L = [
  [[0.115, 0.47], [0.095, 0.39], [0.135, 0.31], [0.09, 0.21], [0.12, 0.11], [0.1, 0.0]],
  [[0.095, 0.39], [0.05, 0.35], [0.032, 0.27]], [[0.135, 0.31], [0.19, 0.27], [0.19, 0.16]],
  [[0.0, 0.07], [0.055, 0.115], [0.09, 0.21]],
  [[0.314, 0.47], [0.29, 0.36], [0.314, 0.23], [0.285, 0.1]], [[0.25, 0.46], [0.22, 0.38], [0.26, 0.3]],
  [[0.0, 0.595], [0.32, 0.595]], hex(0.2, 0.42, 0.028), hex(0.16, 0.06, 0.022),
];
const ARM_L = [
  [[0.06, -0.02], [0.075, -0.11], [0.05, -0.19], [0.07, -0.28], [0.045, -0.36], [0.07, -0.44], [0.06, -0.49]], [[0.075, -0.11], [0.12, -0.14], [0.12, -0.22]],
  [[0.0, -0.5], [0.16, -0.5]], hex(0.11, -0.3, 0.022),
];
const LEG_L = [
  [[0.095, -0.02], [0.08, -0.13], [0.105, -0.22], [0.085, -0.32], [0.1, -0.42], [0.09, -0.5], [0.105, -0.56]], [[0.15, -0.06], [0.14, -0.2], [0.16, -0.36]],
  [[0.0, -0.4], [0.06, -0.46], [0.12, -0.4]], [[0.08, -0.13], [0.04, -0.2], [0.045, -0.28]], hex(0.13, -0.27, 0.024),
];
const lineGLSL = (L) => L.map((pl) => pl.slice(1).map((q, i) => `d = min(d, sdl(p, vec2(${f3(pl[i][0])}, ${f3(pl[i][1])}), vec2(${f3(q[0])}, ${f3(q[1])})));`).join(' ')).join('\n');

export function createMissMoo() {
  const K = makeKit('barn', new THREE.Matrix4());
  const mat = (fs, o = {}) => K.mat('uniform float uGlow; uniform float uFlash; uniform float uBlink;\n' + fs, o);   // identity: "room" coords = world coords (she walks through the corridor and the barn)
  const UG = { uGlow: { value: 1 }, uFlash: { value: 0 }, uBlink: { value: 0 } };   // shared by every material (and by the mirror twin)
  const NEON = 'const vec3 NEON = vec3(1.0, 0.2, 0.58); const vec3 NHOT = vec3(1.0, 0.72, 0.9);';
  const shade = `${NEON} vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); float ndl = 0.5 + 0.5 * dot(N, normalize(vec3(0.3, 0.85, 0.45))); float fr = pow(1.0 - abs(dot(N, V)), 2.5);
    float dist = length(vW - CAM); float wd = 1.0 + clamp(dist * 0.1 - 0.3, 0.0, 3.5);`;
  const flat = (rgb, k = 0.0, rim = 0.2) => mat(`uniform vec3 uC; void main(){ ${shade} vec3 c = uC * (0.55 + 0.6 * ndl) + NEON * fr * ${f3(rim)} + vec3(1.0) * pow(max(dot(reflect(-V, N), normalize(vec3(0.3, 0.8, 0.5))), 0.0), 24.0) * ${f3(k)};
      gl_FragColor = vec4(fogit(c, vW), 1.0); }`, { uniforms: { uC: { value: new THREE.Color(...rgb) } } });
  // glossy black latex-like bodysuit with glowing neon circuit lines. uv.x of a piece = extra y offset (so forearm/shin continue the upper arm/thigh pattern)
  const suitM = (K1, lines) => mat(`uniform vec3 uC; float sdl(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
    float lineD(vec2 p){ float d = 1.0; ${lineGLSL(lines)} return d; }
    void main(){ ${shade} vec3 Rf = reflect(-V, N);
      vec2 p = vec2(abs(atan(vL.x, vL.z)) * ${f3(K1)}, vL.y - vUv.x); float d = lineD(p);
      vec3 c = vec3(0.004, 0.003, 0.007) + vec3(0.025, 0.012, 0.03) * ndl * ndl;
      float key = pow(max(dot(Rf, normalize(vec3(0.35, 0.75, 0.55))), 0.0), 36.0), key2 = pow(max(dot(Rf, normalize(vec3(-0.7, 0.3, 0.35))), 0.0), 14.0), key3 = pow(max(dot(Rf, normalize(vec3(0.75, 0.2, -0.4))), 0.0), 20.0);
      c += vec3(1.0, 0.95, 1.0) * key * 0.85 + NEON * (key2 * 0.3 + key3 * 0.45) + NEON * smoothstep(-0.3, -0.95, Rf.y) * 0.16 + NEON * fr * 0.22;
      float gl = uGlow + 1.6 * uFlash; float core = 1.0 - smoothstep(0.0018 * wd, 0.0042 * wd, d); float halo = exp(-d * d / (0.014 * 0.014 * wd * wd)) * 0.75;
      c += (mix(NEON, NHOT, core * 0.8) * core * 2.2 + NEON * halo) * gl;
      gl_FragColor = vec4(fogit(c, vW), 1.0); }`, { uniforms: { ...UG } });
  const torsoM = suitM(0.1, TORSO_L), armM = suitM(0.05, ARM_L), legM = suitM(0.06, LEG_L);
  const emblemM = mat(`void main(){ ${shade} vec3 c = mix(NEON, NHOT, 0.45 + 0.4 * uFlash) * (1.5 + 0.7 * uGlow + 2.2 * uFlash); gl_FragColor = vec4(c, 1.0); }`, { uniforms: { ...UG } });
  const haloM = mat(`void main(){ float r = length(vL.xy) / 0.075; float a = exp(-r * r * 3.0); gl_FragColor = vec4(NEON * a * (0.5 + 0.35 * uGlow + 1.2 * uFlash), 1.0); }`.replace('NEON', 'vec3(1.0, 0.2, 0.58)').replace('NEON', 'vec3(1.0, 0.2, 0.58)'), { additive: true, uniforms: { ...UG } });
  const poolM = mat(`void main(){ float r = length(vL.xz); float a = exp(-r * r * 2.6) * 0.8 + exp(-pow((r - 0.62) / 0.07, 2.0)) * 0.5; vec3 c = vec3(1.0, 0.2, 0.58) * a * (0.55 + 0.5 * uGlow + 1.0 * uFlash); gl_FragColor = vec4(c, 1.0); }`, { additive: true, uniforms: { ...UG } });
  const printM = (scale, off) => mat(`${BARN_GLSL} void main(){ ${shade}
      float sp = cowB(vL * ${f3(scale)} + vec3(${off})); vec3 base = mix(vec3(1.0, 0.965, 0.9), vec3(0.03, 0.026, 0.03), sp);
      vec3 c = base * (0.6 + 0.55 * ndl) + NEON * fr * 0.3 * (1.0 - sp); gl_FragColor = vec4(fogit(c, vW), 1.0); }`);
  const skinC = 'vec3(0.97, 0.9, 0.91)';
  const skinM = mat(`void main(){ ${shade} vec3 c = ${skinC} * (0.6 + 0.5 * ndl) + NEON * fr * 0.3; gl_FragColor = vec4(fogit(c, vW), 1.0); }`);
  // the face is painted onto the head (head-local metres, +z = front): half-lidded eyes with pink makeup, soft brows, small lips. uBlink closes the eyes.
  const faceM = mat(`float sdl2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
    void main(){ ${shade}
      vec3 base = ${skinC}; float fz = smoothstep(0.0, 0.025, vL.z); vec2 q = vec2(abs(vL.x), vL.y);
      float bl = exp(-dot((q - vec2(0.054, -0.034)) / vec2(0.032, 0.017), (q - vec2(0.054, -0.034)) / vec2(0.032, 0.017)) * 1.3); base = mix(base, vec3(1.0, 0.62, 0.74), bl * 0.38 * fz);
      vec2 e = q - vec2(0.041, 0.004); const float w = 0.0275; float xr = e.x / w; e.y += 0.0022 * xr; float inside = max(1.0 - xr * xr, 0.0); float op = 1.0 - uBlink;
      // eyeshadow above the lid and a pink wash under the eye
      float sh = (1.0 - smoothstep(0.004, 0.0175, e.y - 0.002)) * smoothstep(-0.002, 0.003, e.y) * (1.0 - smoothstep(0.85, 1.35, abs(xr + 0.1)));
      base = mix(base, vec3(1.0, 0.4, 0.68), sh * 0.55 * fz);
      float sh2 = exp(-pow((e.y + 0.0135) / 0.0045, 2.0)) * (1.0 - smoothstep(0.7, 1.15, abs(xr))); base = mix(base, vec3(1.0, 0.5, 0.74), sh2 * 0.3 * fz);
      float yTop = 0.0042 * op * (0.35 + 0.65 * inside), yBot = -0.0108 * op * sqrt(inside);
      float inEye = (1.0 - smoothstep(0.0, 0.0008, e.y - yTop)) * (1.0 - smoothstep(0.0, 0.0008, yBot - e.y)) * step(abs(xr), 1.0) * step(0.02, op);
      vec2 ic = vec2(e.x - 0.0008, (e.y + 0.0012) * 1.06); float ir = length(ic); float iris = 1.0 - smoothstep(0.0116, 0.0128, ir);
      vec3 ic1 = mix(vec3(1.0, 0.62, 0.82), vec3(0.62, 0.1, 0.45), smoothstep(-0.012, 0.011, e.y)); ic1 = mix(ic1, vec3(0.2, 0.03, 0.14), 1.0 - smoothstep(0.0042, 0.0058, ir));
      ic1 = mix(ic1, vec3(0.38, 0.04, 0.3), smoothstep(0.0098, 0.0125, ir)); ic1 += vec3(1.0, 0.9, 0.96) * (1.0 - smoothstep(0.0012, 0.0022, length(ic - vec2(-0.0045, 0.0032)))) * 0.9;
      vec3 eyec = mix(vec3(0.97, 0.93, 0.98), ic1, iris); eyec *= 1.0 - 0.35 * smoothstep(yTop - 0.004, yTop, e.y);
      base = mix(base, eyec, inEye * fz);
      // lash line (thicker toward the outer corner) and a little wing
      float ll = 1.0 - smoothstep(0.0009 + 0.0007 * max(xr, 0.0), 0.0021 + 0.0013 * max(xr, 0.0), abs(e.y - yTop - 0.0003)); ll *= step(abs(xr), 1.04) * fz;
      float wing = 1.0 - smoothstep(0.0009, 0.0019, sdl2(e, vec2(w * 0.95, yTop - 0.0004), vec2(w + 0.0085, yTop + 0.0052))); wing *= fz * step(0.1, op + 0.8);
      float lo = (1.0 - smoothstep(0.0003, 0.0012, abs(e.y - yBot))) * step(abs(xr), 0.9) * step(0.05, op) * fz * 0.28;
      base = mix(base, vec3(0.2, 0.05, 0.14), clamp(max(ll, wing) + lo, 0.0, 1.0));
      // brows, nose, lips
      float dx = q.x - 0.046; float by = 0.036 + 0.004 * (1.0 - (dx * dx) / 0.00032) - 0.0012 * dx / 0.018; float bw = (1.0 - smoothstep(0.0008, 0.0021, abs(q.y - by))) * (1.0 - smoothstep(0.015, 0.02, abs(dx))) * fz;
      base = mix(base, vec3(0.82, 0.7, 0.8), bw * 0.55);
      float nz = exp(-dot(vec2(vL.x / 0.006, (vL.y + 0.03) / 0.0045), vec2(vL.x / 0.006, (vL.y + 0.03) / 0.0045))); base = mix(base, vec3(0.9, 0.62, 0.68), nz * 0.5 * fz);
      vec2 mp = vec2(vL.x / 0.0165, (vL.y + 0.066 - 4.0 * vL.x * vL.x) / 0.0062); float lip = (1.0 - smoothstep(0.82, 1.0, length(mp))) * fz;
      base = mix(base, mix(vec3(0.9, 0.42, 0.56), vec3(1.0, 0.62, 0.74), smoothstep(0.0, 1.0, mp.y * 0.5 + 0.5) * 0.5), lip * 0.8);
      float ml = (1.0 - smoothstep(0.0004, 0.0012, abs(vL.y + 0.066 - 4.0 * vL.x * vL.x - 0.0004))) * (1.0 - smoothstep(0.011, 0.0155, abs(vL.x))) * fz; base = mix(base, vec3(0.55, 0.15, 0.3), ml * 0.8);
      vec3 c = base * (0.64 + 0.5 * ndl) + NEON * fr * 0.16; gl_FragColor = vec4(fogit(c, vW), 1.0); }`, { uniforms: { ...UG } });
  // hair: near-white with a faint lilac shade and pink-tipped wisps. uv.x: >1.5 = scalp cap (cut away over the face), else = where the pink starts along the wisp (0..1); uv.y = position along the wisp
  const hairShade = `vec3 root = vec3(0.93, 0.92, 1.0), tip = vec3(1.0, 0.45, 0.78); float g = smoothstep(vUv.x, vUv.x + 0.25, vUv.y) * step(vUv.x, 1.5);
      vec3 base = mix(root, tip, g) * (0.7 + 0.5 * ndl); float sh = pow(max(dot(reflect(-V, N), normalize(vec3(0.2, 0.9, 0.5))), 0.0), 8.0) * 0.5;
      vec3 c = base + vec3(1.0, 0.95, 1.0) * sh + NEON * fr * 0.2 + NEON * g * 0.15; gl_FragColor = vec4(fogit(c, vW), 1.0);`;
  const hairM = mat(`void main(){ ${shade} if (vUv.x > 1.5) { float hl = 0.068 - 2.6 * max(abs(vL.x) - 0.072, 0.0); bool keep = vL.y > -0.03 && (vL.z < 0.0 || vL.y > hl); if (!keep) discard; } ${hairShade} }`);
  const gloveM = flat([0.025, 0.02, 0.03], 0.9, 0.5);
  const brassM = mat(`${BARN_GLSL} uniform float uRing; void main(){ ${shade} vec3 Rf = reflect(-V, N); float up = 0.5 + 0.5 * Rf.y;
      vec3 c = mix(vec3(0.3, 0.17, 0.05), vec3(1.0, 0.8, 0.42), up * up) + vec3(1.0, 0.85, 0.5) * pow(max(dot(Rf, normalize(vec3(0.3, 0.8, 0.5))), 0.0), 18.0) * 0.9 + vec3(1.0, 0.85, 0.5) * uRing * 0.35;
      gl_FragColor = vec4(fogit(c * 0.95, vW), 1.0); }`, { uniforms: { uRing: { value: 0 } }, side: THREE.DoubleSide });
  const ringU = brassM.uniforms.uRing;
  const chokerM = printM(110, '3.1, 1.7, 5.3');

  // ---------------- geometry (built twice: a high-detail set for near views and a light set for far views / the mirror twin). World metres. The body group pivots at the hips (y = 0.86 above the floor) ----------------
  const HY = 0.86, THIGH = 0.45;
  const sp = (pts, n) => new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(n);
  const lathe = (pts, n, rad) => new THREE.LatheGeometry(sp(pts, n), rad);
  // a swept, tapered, slightly flattened tube along a quadratic curve (hair clumps). Indexed with smooth normals; uv = (pink start, t along the clump)
  function sweep(P0, P1, P2, nrm, w, flat, segs, rad, pink) {
    const curve = new THREE.QuadraticBezierCurve3(P0, P1, P2), pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, c = curve.getPoint(t), T = curve.getTangent(t).normalize();
      const zA = nrm.clone().addScaledVector(T, -nrm.dot(T)).normalize(), xA = new THREE.Vector3().crossVectors(T, zA).normalize();
      const a = w * Math.pow(1 - t, 0.85) * (0.75 + 0.25 * Math.sin(Math.min(1, t * 4) * PI / 2)) + 0.0006, b = a * flat;
      for (let j = 0; j < rad; j++) { const th = (j / rad) * PI * 2; const p = c.clone().addScaledVector(xA, Math.cos(th) * a).addScaledVector(zA, Math.sin(th) * b); pos.push(p.x, p.y, p.z); uv.push(pink, t); }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) { const a = i * rad + j, b = i * rad + (j + 1) % rad, c = a + rad, d = b + rad; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const up = new THREE.Vector3(0, 1, 0);
  const capsAlong = (a, b, r, cs, rs) => { const d = b.clone().sub(a), L = d.length(); const g = new THREE.CapsuleGeometry(r, Math.max(0.0005, L), cs, rs);
    return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(up, d.normalize()), new THREE.Vector3(1, 1, 1))); };
  function G(Q) {
    const T = {}, R = (n) => Math.max(6, Math.round(n * Q));
    seed = 11;
    // torso: a smooth slender lathe (flattened front-to-back below the shoulders) that continues into a round neck and high collar
    const lg = lathe([[0.0, -0.085], [0.072, -0.08], [0.108, -0.045], [0.12, 0.0], [0.114, 0.08], [0.1, 0.18], [0.092, 0.26], [0.096, 0.33], [0.107, 0.41], [0.111, 0.46], [0.098, 0.5], [0.062, 0.52], [0.042, 0.538], [0.04, 0.58], [0.043, 0.598], [0.041, 0.606], [0.0, 0.607]], R(24), R(32));
    const lp = lg.attributes.position;
    for (let i = 0; i < lp.count; i++) { const y = lp.getY(i); lp.setZ(i, lp.getZ(i) * (y < 0.44 ? 0.66 : y > 0.53 ? 0.95 : ease(0.66, 0.95, THREE.MathUtils.smoothstep(y, 0.44, 0.53)))); }
    lg.computeVertexNormals(); T.torso = lg;
    T.emblem = merge([[new THREE.BoxGeometry(0.03, 0.022, 0.006), M4(0, 0.43, 0.0765)], [new THREE.TorusGeometry(0.0095, 0.0022, R(6), R(12), PI), M4(0, 0.441, 0.0765)]]);
    T.emblemHalo = new THREE.PlaneGeometry(0.16, 0.16).translate(0, 0.435, 0.0775);
    T.choker = new THREE.TorusGeometry(0.0425, 0.0068, R(8), R(28)).rotateX(PI / 2).applyMatrix4(M4(0, 0.555, 0, 0, 0, 0, 1, 1, 0.96));
    T.bell = merge([[new THREE.CylinderGeometry(0.0125, 0.026, 0.032, R(14), 1, true).translate(0, -0.022, 0)], [new THREE.SphereGeometry(0.0125, R(14), R(6), 0, PI * 2, 0, PI / 2).translate(0, -0.006, 0)], [ell(0.0075, 0.0075, 0.0075, R(8), R(6)).translate(0, -0.04, 0)]]);
    // arms: smooth closed lathes (rounded shoulder and elbow ends overlap so the joints have no seams)
    T.upper = merge([[lathe([[0, 0.042], [0.03, 0.032], [0.04, 0.0], [0.0385, -0.06], [0.036, -0.15], [0.034, -0.235], [0.031, -0.275], [0.016, -0.3], [0, -0.304]], R(18), R(16)), null, [0, 0]]]);
    const hands = (s) => {
      const glove = [], skin = [], cs = R(3), rs = R(8), V = (x, y, z) => new THREE.Vector3(x, y, z);
      const inward = V(-s, 0, 0), onHip = s < 0;
      const chain = (p, d, bend, curls, lens, radii, skinFrom) => {
        p = p.clone(); d = d.clone().normalize();
        for (let j = 0; j < lens.length; j++) {
          d.addScaledVector(bend, Math.tan(curls[j])).normalize(); const q = p.clone().addScaledVector(d, lens[j]);
          (j >= skinFrom ? skin : glove).push([capsAlong(p, q, radii[j], cs, rs)]);
          if (j < lens.length - 1) (j + 1 >= skinFrom ? skin : glove).push([ell(radii[j] * 1.04, radii[j] * 1.04, radii[j] * 1.04, R(8), R(6)).translate(q.x, q.y, q.z)]);   // knuckle
          p = q;
        }
      };
      const fl = s > 0 ? 1 : 99;   // the right glove is fingerless: the middle and tip segments are bare
      const curl = onHip ? [0.32, 0.48, 0.34] : [0.2, 0.34, 0.24];
      [[0.0165, 0.95, 0.12], [0.0056, 1.06, 0.03], [-0.0056, 1.0, -0.04], [-0.0162, 0.8, -0.13]].forEach(([z, k, spread], i) => {
        const rr = (i === 3 ? 0.86 : 1) * 1.0;
        chain(V(-s * 0.001, -0.329, z), V(0, -1, spread), inward, curl.map((c) => c * (1 + i * 0.08)), [0.02 * k, 0.0135 * k, 0.011 * k], [0.0062 * rr, 0.0057 * rr, 0.0051 * rr], fl);
      });
      // thumb: from the base of the palm, forward and across (opposed)
      chain(V(-s * 0.007, -0.296, 0.021), V(-s * 0.45, -0.75, 0.5), V(-s * 0.5, 0, -0.6).normalize(), [0.12, 0.25], [0.021, 0.017], [0.0074, 0.0064], s > 0 ? 1 : 99);
      const fore = lathe([[0, 0.034], [0.026, 0.024], [0.034, 0.0], [0.033, -0.08], [0.029, -0.19], [0.0245, -0.245], [0.0235, -0.262], [0.026, -0.272], [0.0, -0.282]], R(18), R(16));
      const palm = ell(0.0128, 0.033, 0.026, R(14), R(10)); const pp = palm.attributes.position;
      for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); pp.setZ(i, pp.getZ(i) * (1 - 0.18 * Math.max(0, y / 0.033))); }   // narrower at the wrist
      palm.computeVertexNormals();
      return { fore: merge([[fore, null, [0.27, 0]], [palm, M4(0, -0.302, 0.0), [0.6, 0]], ...glove.map(([g]) => [g, null, [0.6, 0]])]), fingers: skin.length ? merge(skin) : null };
    };
    T.handL = hands(-1); T.handR = hands(1);
    // legs: thigh (rounded hip and knee ends), shin + knee-high boot, platform foot
    T.thigh = merge([[lathe([[0, 0.06], [0.042, 0.046], [0.059, 0.0], [0.058, -0.05], [0.053, -0.2], [0.047, -0.36], [0.043, -0.44], [0.03, -0.47], [0, -0.478]], R(20), R(20)), null, [0, 0]]]);
    T.shin = merge([[lathe([[0, 0.036], [0.031, 0.02], [0.044, 0.0], [0.046, -0.05], [0.055, -0.098], [0.0535, -0.122], [0.046, -0.24], [0.04, -0.32], [0.0385, -0.345], [0.02, -0.37], [0, -0.372]], R(22), R(18)), null, [THIGH, 0]],
      [new THREE.TorusGeometry(0.0535, 0.0045, R(6), R(18)).rotateX(PI / 2), M4(0, -0.105, 0), [THIGH, 0]]]);
    const slab = lathe([[0, -0.035], [0.86, -0.035], [0.97, -0.03], [1.0, -0.018], [1.0, 0.018], [0.97, 0.03], [0.86, 0.035], [0, 0.035]], R(10), R(28)).scale(0.056, 1, 0.12);
    T.foot = merge([[ell(0.045, 0.038, 0.09, R(16), R(10)), M4(0, 0.022, 0.05), [THIGH + 0.4, 0]], [slab, M4(0, -0.05, 0.02), [THIGH + 0.4, 0]], [ell(0.04, 0.04, 0.04, R(10), R(8)), null, [THIGH + 0.4, 0]]]);
    // head: slender with a softly pointed chin
    const hg = new THREE.SphereGeometry(1, R(32), R(24)).scale(0.1, 0.115, 0.104); const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) { const k = 1 - 0.3 * Math.pow(-y / 0.115, 1.6); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (1 - 0.14 * Math.pow(-y / 0.115, 1.6))); } }
    hg.computeVertexNormals();
    T.head = merge([[hg], [ell(0.0105, 0.021, 0.008, R(8), R(6)), M4(0.0985, -0.006, 0.0, 0, 0, 0.05)], [ell(0.0105, 0.021, 0.008, R(8), R(6)), M4(-0.0985, -0.006, 0.0, 0, 0, -0.05)]]);
    // hair: a scalp cap + many curved, tapered, softly flattened clumps (smooth normals), white at the root and pink toward the tips
    const C = [0, 0.004, -0.006], HR = [0.107, 0.118, 0.108], pieces = [], hs = Math.max(4, Math.round(4 * Q)), hr = Math.max(5, Math.round(3.4 * Q)), dens = Q > 1.5 ? 0.62 : 1;
    const clump = (az, lat, down, out, tang, len, w, pink, curl = 0.6) => {
      const sa = Math.sin(az), ca = Math.cos(az), cl = Math.cos(lat), sl = Math.sin(lat);
      const pos = new THREE.Vector3(C[0] + HR[0] * cl * sa * 0.975, C[1] + HR[1] * sl * 0.975, C[2] + HR[2] * cl * ca * 0.975);
      const nrm = new THREE.Vector3(cl * sa / HR[0], sl / HR[1], cl * ca / HR[2]).normalize(), tg = new THREE.Vector3(ca, 0, -sa);
      const d0 = new THREE.Vector3(0, -down, 0).addScaledVector(nrm, out).addScaledVector(tg, tang).normalize();
      const P1 = pos.clone().addScaledVector(d0, len * 0.5), d1 = d0.clone().add(new THREE.Vector3(0, -curl, 0)).addScaledVector(nrm, 0.15).normalize(), P2 = P1.clone().addScaledVector(d1, len * 0.55);
      pieces.push([sweep(pos, P1, P2, nrm, w, 0.42, hs, hr, pink)]);
    };
    const D = PI / 180, wq = Q > 1.5 ? 0.8 : 1;
    for (let a = -180; a < 180; a += 11 * dens) { const az = (a + rnd() * 10) * D, lat = (66 + rnd() * 14) * D; clump(az, lat, 1.1 + rnd() * 0.5, 0.7, (rnd() - 0.5) * 0.9, 0.055 + rnd() * 0.03, 0.019 * wq, 0.6 + rnd() * 0.15, 0.4); }
    for (let a = -180; a < 180; a += 9 * dens) { if (Math.abs(a) < 62) continue; const az = (a + rnd() * 8) * D, lat = (46 + rnd() * 10) * D; clump(az, lat, 1, 0.55 + rnd() * 0.3, (rnd() - 0.5) * 0.5, 0.085 + rnd() * 0.035, 0.022 * wq, 0.5 + rnd() * 0.25); }
    for (let a = -180; a < 180; a += 8 * dens) { const aa = Math.abs(a); if (aa < 76) continue; const az = (a + rnd() * 7) * D, lat = (14 + rnd() * 14) * D, side = aa > 55 && aa < 135;
      clump(az, lat, 1, 0.3 + rnd() * 0.3, (rnd() - 0.5) * 0.4, (side ? 0.12 : 0.088) + rnd() * 0.03, 0.023 * wq, 0.4 + rnd() * 0.25, 0.8); }
    for (let a = -180; a < 180; a += 16 * dens) { if (Math.abs(a) < 120) continue; const az = (a + rnd() * 8) * D; clump(az, (-8 + rnd() * 8) * D, 1, 0.25, 0, 0.068 + rnd() * 0.02, 0.022 * wq, 0.4); }
    const nb = Q > 1.5 ? 8 : 5;
    for (let i = -nb; i <= nb; i++) { const az = (i * 9.5 * 5 / nb + (rnd() - 0.5) * 3) * D; clump(az, (44 + rnd() * 4) * D, 1, 0.55, i / nb * 0.35 + (rnd() - 0.5) * 0.25, 0.07 + rnd() * 0.02 - Math.abs(i / nb) * 0.01, 0.017 * wq, 0.4 + rnd() * 0.15, 0.25); }
    for (const s of [-1, 1]) { clump(s * 76 * D, 26 * D, 1, 0.3, s * 0.1, 0.09, 0.017, 0.4, 0.4); clump(s * 66 * D, 38 * D, 1, 0.4, s * 0.2, 0.075, 0.016, 0.4, 0.4); }
    const cap = ell(...HR, R(28), R(18)).translate(...C); const capUv = cap.attributes.uv; for (let i = 0; i < capUv.count; i++) { capUv.setX(i, 2); capUv.setY(i, 0); }
    T.hair = merge([[cap], ...pieces]);
    return T;
  }
  const GH = G(2.2), GL = G(1.25);
  const pick = (T, k) => k.split('.').reduce((o, n) => o && o[n], T);
  const triOf = (T) => { let n = 0; const walk = (o) => { for (const v of Object.values(o)) if (v && v.isBufferGeometry) n += (v.index ? v.index.count : v.attributes.position.count) / 3; else if (v && typeof v === 'object') walk(v); }; walk(T); return n; };
  const lodList = [];   // [mesh, hiGeometry, loGeometry] for the real figure

  const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.frustumCulled = false; parent.add(o); return o; };

  function build(hi) {
    const root = new THREE.Group(), P = {};
    const L = (k, m, parent) => { const gh = pick(GH, k), gl = pick(GL, k); const o = mesh(hi ? gh : gl, m, parent); if (hi) lodList.push([o, gh, gl]); return o; };
    P.body = new THREE.Group(); P.body.position.y = HY; root.add(P.body);
    L('torso', torsoM, P.body); L('emblem', emblemM, P.body); L('emblemHalo', haloM, P.body); L('choker', chokerM, P.body);
    P.bell = new THREE.Group(); P.bell.position.set(0, 0.553, 0.0425); P.body.add(P.bell); L('bell', brassM, P.bell);
    P.neckP = new THREE.Group(); P.neckP.position.set(0, 0.6, 0); P.body.add(P.neckP);
    P.head = new THREE.Group(); P.head.position.y = 0.093; P.neckP.add(P.head);
    L('head', faceM, P.head); L('hair', hairM, P.head);
    P.arms = [-1, 1].map((s) => {
      const up = new THREE.Group(); up.position.set(s * 0.145, 0.465, 0); up.userData.s = s; P.body.add(up); L('upper', armM, up);
      const fo = new THREE.Group(); fo.position.y = -0.27; up.add(fo); const H = s < 0 ? 'handL' : 'handR'; L(H + '.fore', armM, fo); if (pick(GH, H + '.fingers')) L(H + '.fingers', skinM, fo);
      return { up, fo, s };
    });
    P.legs = [-1, 1].map((s) => {
      const th = new THREE.Group(); th.position.set(s * 0.062, HY, 0); th.userData.s = s; root.add(th); L('thigh', legM, th);
      const kn = new THREE.Group(); kn.position.y = -THIGH; th.add(kn); L('shin', legM, kn);
      const ft = new THREE.Group(); ft.position.y = -0.345; kn.add(ft); L('foot', legM, ft);
      return { th, kn, ft, s };
    });
    const pool = mesh(new THREE.CircleGeometry(1.1, 36).rotateX(-PI / 2), poolM, root, 0, 0.03, 0); pool.renderOrder = 20;
    return { root, P };
  }
  const real = build(true), twin = build(false);   // the mirror twin always uses the light set
  let lodHi = true;
  const rig = new THREE.Group(); rig.name = 'missMoo'; rig.add(real.root);
  const mirrorRig = new THREE.Group(); mirrorRig.name = 'missMooMirror'; mirrorRig.scale.y = -1; mirrorRig.add(twin.root); clipMirror(mirrorRig);
  const S = { x: 0, z: 0, yaw: 0, walk: 0, phase: 0, t: 0, blink: 2.5, blinkT: 0, look: 0, lookP: 0, tilt: 0, near: 0, bellE: 0, ringT: 99, wave: 0, waveW: 0, glow: 1, flash: 0 };
  const HB = 60 / 66;

  function apply(P, st) {
    const w = st.walk, ph = st.phase, t = st.t, sw = Math.sin(ph), idle = 1 - w, br = Math.sin(t * 1.35);
    // relaxed contrapposto when she stands: weight on the right leg, hips shifted, shoulders leaning the other way
    const c = idle;
    P.body.position.x = 0.012 * c; P.body.position.y = HY - 0.035 * w + 0.012 * Math.abs(Math.cos(ph)) * w + 0.0015 * br * idle;
    P.body.rotation.z = -0.05 * c + 0.03 * Math.sin(ph) * w + 0.012 * Math.sin(t * 0.55) * idle;
    P.body.rotation.y = -0.07 * c + 0.06 * Math.sin(ph) * w + 0.03 * Math.sin(t * 0.4) * idle;
    P.body.rotation.x = 0.02 * w + 0.008 * Math.sin(t * 0.8);
    P.body.scale.set(1 + 0.0035 * br * idle, 1 + 0.006 * br * idle, 1 + 0.0035 * br * idle);
    P.neckP.rotation.set(st.lookP * 0.8 - 0.05 * idle + 0.05 * st.bellE * Math.sin(st.ringT * 18), st.look * 0.8 + 0.1 * c, st.tilt + 0.05 * c + 0.015 * Math.sin(t * 0.7));
    for (const L of P.legs) {
      const s = L.s, a = -s * sw * 0.36 * w, free = s < 0 ? 1 : 0;
      L.th.rotation.x = a - 0.1 * c * free; L.th.rotation.z = s * 0.025 * c + (free ? -0.085 * c : 0.0);
      const swingBack = Math.max(0, a);
      L.kn.rotation.x = 0.06 * w + 0.9 * swingBack + 0.07 * Math.max(0, -a) + 0.2 * c * free; L.kn.rotation.z = free ? 0.085 * c : 0;
      L.ft.rotation.x = -(L.th.rotation.x + L.kn.rotation.x) * 0.9; L.ft.rotation.z = -(L.th.rotation.z + L.kn.rotation.z) * 0.8;
    }
    for (const a of P.arms) {
      const s = a.s, wv = s > 0 ? st.waveW : 0, sg = st.t * 8, hip = s < 0 ? c : 0;
      a.up.rotation.x = ease(s * sw * 0.3 * w, -0.2, wv); a.up.rotation.z = ease(s * (0.08 + 0.015 * Math.sin(t * 0.9 + s)) - hip * s * 0.5 * 1.0 - (s > 0 ? 0.0 : 0.0), s * 2.3, wv);
      a.fo.rotation.x = ease(-0.22 - 0.2 * Math.max(0, -s * sw) * w - 0.18 * (s > 0 ? c : 0), 0, wv);
      a.fo.rotation.z = ease(-s * 1.55 * hip + 0.0, s * (0.2 + 0.5 * Math.sin(sg)), wv);
    }
    P.bell.rotation.x = 0.06 * Math.sin(ph * 2 + 1.0) * w + st.bellE * 0.9 * Math.sin(st.ringT * 24); P.bell.rotation.z = st.bellE * 0.45 * Math.sin(st.ringT * 19 + 1);
  }
  const API = {
    group: rig, builtin: real.root, builtinTwin: twin.root, ext: null, tris: () => ({ hi: triOf(GH), lo: triOf(GL) }), mirror: mirrorRig, state: S,
    /** world position on the floor + heading (radians, 0 = facing +z) */
    place(x, z, yaw) { S.x = x; S.z = z; S.yaw = yaw; for (const g of [rig, mirrorRig]) { g.position.set(x, 0, z); g.rotation.y = yaw; } },
    ring(power = 1) { S.bellE = Math.min(1.4, S.bellE + power); S.ringT = 0; ringU.value = 1; },
    flash(power = 1) { S.flash = Math.min(1.5, Math.max(S.flash, power)); },     // the padlock emblem and neon lines flare (prop cues)
    waveNow(sec = 2.6) { S.wave = sec; },
    /** dt s, moving 0..1 (how fast she is walking right now), cam: THREE.Vector3 (world position of the viewer's head) */
    update(dt, moving, cam, t) {
      S.t = t; S.walk = ease(S.walk, moving, 1 - Math.exp(-dt * 4)); S.phase += dt * (2.0 + 3.8 * S.walk) * (S.walk > 0.02 ? 1 : 0.0);
      S.ringT += dt; S.bellE *= Math.exp(-dt * 1.6); ringU.value *= Math.exp(-dt * 3.5); S.flash *= Math.exp(-dt * 1.6);
      // slow, dreamy blinks (0.45 s)
      S.blink -= dt; if (S.blink < 0) { S.blinkT = 0.45; S.blink = 3 + Math.random() * 4; } if (S.blinkT > 0) S.blinkT = Math.max(0, S.blinkT - dt);
      UG.uBlink.value = S.blinkT > 0 ? Math.min(1, 1.15 * Math.sin(PI * (1 - S.blinkT / 0.45))) : 0;
      // the neon glow pulses slowly, with a heartbeat-like double thump (66 bpm, same as the Moo Track drone)
      const ph = (t % HB) / HB, thump = Math.exp(-Math.pow(ph / 0.07, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.27) / 0.08, 2));
      S.glow = 0.78 + 0.1 * Math.sin(t * 0.8) + 0.28 * thump; UG.uGlow.value = S.glow; UG.uFlash.value = S.flash;
      let ty = 0, tp = 0, near = 0, d = 99;
      if (cam) {
        const dx = cam.x - S.x, dz = cam.z - S.z; d = Math.hypot(dx, dz);
        if (d < 7) { const a = wrap(Math.atan2(dx, dz) - S.yaw); ty = clamp(a, -0.95, 0.95); tp = clamp(-Math.atan2(cam.y - 1.55, Math.max(d, 0.5)) * 0.9, -0.2, 0.25); }
        near = clamp(1 - (d - 2) / 5, 0, 1);
      }
      S.look = ease(S.look, ty, 1 - Math.exp(-dt * 3)); S.lookP = ease(S.lookP, tp, 1 - Math.exp(-dt * 3));
      S.near = ease(S.near, near, 1 - Math.exp(-dt * 2)); S.tilt = ease(S.tilt, 0.17 * S.near * (0.75 + 0.25 * Math.sin(t * 0.5)), 1 - Math.exp(-dt * 2));
      if (S.wave > 0) S.wave -= dt; S.waveW = ease(S.waveW, S.wave > 0 ? 1 : 0, 1 - Math.exp(-dt * 4));
      const wantHi = d < 6.5 || (lodHi && d < 7.5); if (wantHi !== lodHi) { lodHi = wantHi; for (const [o, gh, gl] of lodList) o.geometry = lodHi ? gh : gl; }
      if (API.ext) { API.ext.update(dt, S, cam, t); return; }
      apply(real.P, S); apply(twin.P, S);
    },
  };
  return API;
}
