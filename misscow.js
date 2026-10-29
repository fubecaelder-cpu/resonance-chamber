// v25: "Miss Moo" — a sweet, wholesome young woman in a cozy cow-print hoodie dress (hood down, long sleeves, knee-length, black leggings, boots), a cow-ear headband with
// little ivory horns, long dark hair with rose-pink tips, big warm eyes, rosy cheeks, a soft smile, a brass cowbell on a pink ribbon and a small plush cow tail.
// Stylised, fully clothed, ~1.6 m tall (a slender chibi-ish proportion). She walks toward the listener during the Moo Track, waves, tilts her head and rings her bell on cowbell cues.
// Built from merged three.js primitives with the kit's shaders (face paint, cow print, hair gradient are fragment shaders), twice: the figure and a y-flipped twin for the glossy mirrors.
import { THREE, makeKit, clipMirror } from './shared.js?v=29';
import { BARN_GLSL } from './barnroom.js?v=29';

const PI = Math.PI;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const ell = (rx, ry, rz, ws = 14, hs = 10) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
function merge(list) {   // [[geometry, matrix?], ...] -> one non-indexed BufferGeometry (position, normal, uv)
  const P = [], N = [], U = [];
  for (const [g, m] of list) {
    const n = g.index ? g.toNonIndexed() : g.clone(); if (m) n.applyMatrix4(m);
    P.push(...n.attributes.position.array); N.push(...n.attributes.normal.array); U.push(...(n.attributes.uv ? n.attributes.uv.array : new Float32Array((n.attributes.position.count) * 2)));
    n.dispose();
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return o;
}

export function createMissMoo() {
  const K = makeKit('barn', new THREE.Matrix4()), { mat } = K;   // identity: "room" coords = world coords (she walks through the corridor and the barn)
  const shade = `vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); float ndl = 0.5 + 0.5 * dot(N, normalize(vec3(0.3, 0.85, 0.45))); float fr = pow(1.0 - abs(dot(N, V)), 2.5);`;
  const flat = (rgb, k = 0.0, pinkRim = 0.2, side) => mat(`uniform vec3 uC; void main(){ ${shade} vec3 c = uC * (0.6 + 0.55 * ndl) + PINK * fr * ${pinkRim.toFixed(2)} + WHITE * pow(max(dot(reflect(-V, N), normalize(vec3(0.3, 0.8, 0.5))), 0.0), 24.0) * ${k.toFixed(2)};
      gl_FragColor = vec4(fogit(c, vW), 1.0); }`, { uniforms: { uC: { value: new THREE.Color(...rgb) } }, side });
  // crisp black-and-cream cow print (the cream is bright, the spots near-black, the edges anti-aliased)
  const printM = (scale, off) => mat(`${BARN_GLSL} void main(){ ${shade}
      float sp = cowB(vL * ${scale.toFixed(1)} + vec3(${off})); vec3 base = mix(vec3(1.0, 0.965, 0.9), vec3(0.03, 0.026, 0.03), sp);
      vec3 c = base * (0.6 + 0.55 * ndl) + PINK * fr * 0.22 * (1.0 - sp) + WHITE * fr * 0.05; gl_FragColor = vec4(fogit(c, vW), 1.0); }`);
  const dressM = printM(11, '2.3, 5.1, 1.7'), sleeveM = printM(13, '7.1, 1.3, 4.4');
  const earM = mat(`void main(){ ${shade} float o = smoothstep(0.052, 0.058, abs(vL.x)); vec3 base = mix(vec3(1.0, 0.965, 0.9), vec3(0.03, 0.026, 0.03), o);
      vec3 c = base * (0.6 + 0.55 * ndl) + PINK * fr * 0.2 * (1.0 - o); gl_FragColor = vec4(fogit(c, vW), 1.0); }`);
  const skinM = mat(`void main(){ ${shade} vec3 c = vec3(1.0, 0.84, 0.76) * (0.62 + 0.5 * ndl) + vec3(1.0, 0.5, 0.55) * fr * 0.22; gl_FragColor = vec4(fogit(c, vW), 1.0); }`);
  // the face is painted onto the head: rosy cheeks, soft closed smile, tiny nose, gentle brows (head-local metres, +z = front)
  const faceM = mat(`void main(){ ${shade}
      vec3 base = vec3(1.0, 0.84, 0.76); float fz = smoothstep(0.0, 0.03, vL.z); vec2 q = vec2(abs(vL.x), vL.y);
      float bl = 1.0 - smoothstep(0.0, 1.0, length((q - vec2(0.066, -0.03)) / vec2(0.034, 0.021))); base = mix(base, vec3(1.0, 0.42, 0.52), bl * 0.62 * fz);
      float mx = vL.x; float my = -0.07 + 26.0 * mx * mx; float ml = (1.0 - smoothstep(0.0016, 0.0034, abs(vL.y - my))) * (1.0 - smoothstep(0.024, 0.028, abs(mx))) * fz;
      base = mix(base, vec3(0.66, 0.2, 0.27), ml);
      float nz = 1.0 - smoothstep(0.0, 1.0, length(vec2(vL.x, vL.y + 0.03) / vec2(0.007, 0.0045))); base = mix(base, vec3(0.92, 0.55, 0.5), nz * 0.5 * fz);
      float dx = q.x - 0.05; float by = 0.05 + 0.006 * (1.0 - (dx * dx) / 0.000256) - 0.002 * dx / 0.016; float bw = (1.0 - smoothstep(0.0012, 0.0026, abs(q.y - by))) * (1.0 - smoothstep(0.013, 0.017, abs(dx))) * fz;
      base = mix(base, vec3(0.3, 0.16, 0.13), bw * 0.85);
      vec3 c = base * (0.64 + 0.5 * ndl) + vec3(1.0, 0.5, 0.55) * fr * 0.2; gl_FragColor = vec4(fogit(c, vW), 1.0); }`);
  const irisM = mat(`void main(){ ${shade} vec2 e = vec2((abs(vL.x) - 0.047) / 0.0245, (vL.y - 0.003) / 0.031); float r = length(e);
      vec3 iris = mix(vec3(0.96, 0.6, 0.52), vec3(0.34, 0.13, 0.16), smoothstep(-0.9, 0.85, e.y)); iris = mix(iris, vec3(0.2, 0.07, 0.09), smoothstep(0.72, 1.0, r));
      gl_FragColor = vec4(fogit(iris * (0.85 + 0.25 * ndl), vW), 1.0); }`);
  const hairShade = `vec3 dark = vec3(0.17, 0.09, 0.09), rose = vec3(1.0, 0.56, 0.7); float g = smoothstep(-0.2, -0.46, vL.y); vec3 base = mix(dark, rose, g);
      float sh = pow(max(dot(reflect(-V, N), normalize(vec3(0.2, 0.9, 0.5))), 0.0), 9.0) * 0.5;
      vec3 c = base * (0.58 + 0.6 * ndl) + vec3(1.0, 0.82, 0.82) * sh * (1.0 - 0.4 * g) + PINK * fr * 0.28; gl_FragColor = vec4(fogit(c, vW), 1.0);`;
  const hairM = mat(`void main(){ ${shade} ${hairShade} }`);
  const hairCapM = mat(`void main(){ ${shade}
      float hl = 0.07 - 2.5 * max(abs(vL.x) - 0.075, 0.0); bool keep = vL.y > -0.035 && (vL.z < 0.0 || vL.y > hl); if (!keep) discard; ${hairShade} }`);
  const pinkM = flat([1.0, 0.6, 0.72], 0.35, 0.12), darkM = flat([0.05, 0.04, 0.05], 0.4, 0.1), whiteM = flat([1.0, 0.99, 0.96], 0.5, 0.05), hornM = flat([1.0, 0.92, 0.74], 0.3, 0.1),
    leggM = flat([0.07, 0.06, 0.08], 0.25, 0.18), bootM = flat([0.36, 0.2, 0.15], 0.3, 0.12), furM = flat([1.0, 0.97, 0.94], 0.1, 0.1);
  const brassM = mat(`${BARN_GLSL} uniform float uRing; void main(){ ${shade} vec3 Rf = reflect(-V, N); float up = 0.5 + 0.5 * Rf.y;
      vec3 c = mix(vec3(0.3, 0.17, 0.05), vec3(1.0, 0.8, 0.42), up * up) + HOT * pow(max(dot(Rf, normalize(vec3(0.3, 0.8, 0.5))), 0.0), 18.0) * 0.9 + HOT * uRing * 0.35;
      gl_FragColor = vec4(fogit(c * 0.95, vW), 1.0); }`, { uniforms: { uRing: { value: 0 } }, side: THREE.DoubleSide });
  const ringU = brassM.uniforms.uRing;

  // ---------------- geometry (built once, shared by the figure and its mirror twin). World metres; the body group pivots at the hips (y = 0.6) so its geometry is shifted down by 0.6 ----------------
  const HY = 0.6;
  const geos = (() => {
    const T = {};
    // hoodie dress: a lathe (round, a little flattened front-to-back), loose A-line, hem below the knee
    const prof = [[0.205, 0.5], [0.2, 0.56], [0.185, 0.7], [0.15, 0.9], [0.126, 1.02], [0.13, 1.12], [0.15, 1.22], [0.165, 1.28], [0.142, 1.322], [0.1, 1.345], [0.078, 1.352]].map(([r, y]) => new THREE.Vector2(r, y - HY));
    const lathe = new THREE.LatheGeometry(prof, 30).scale(1, 1, 0.82);
    T.dress = merge([[lathe], [new THREE.TorusGeometry(0.062, 0.027, 8, 22).rotateX(PI / 2), M4(0, 0.735, 0, 0, 0, 0, 1.05, 1, 0.95)],
      [ell(0.118, 0.066, 0.09, 16, 10), M4(0, 0.765, -0.095)]]);
    T.neck = new THREE.CylinderGeometry(0.034, 0.038, 0.16, 12).translate(0, 0.76, 0);
    T.bodyPink = merge([[new THREE.TorusGeometry(0.205, 0.012, 6, 30).rotateX(PI / 2), M4(0, 0.5 - HY, 0, 0, 0, 0, 1, 1, 0.82)],
      [new THREE.TorusGeometry(0.053, 0.007, 6, 18).rotateX(PI / 2), M4(0, 0.778, 0, 0, 0, 0, 1, 1, 0.95)],            // ribbon
      [ell(0.022, 0.013, 0.008), M4(-0.02, 0.775, 0.056, 0, 0, 0.45)], [ell(0.022, 0.013, 0.008), M4(0.02, 0.775, 0.056, 0, 0, -0.45)], [ell(0.008, 0.008, 0.008), M4(0, 0.775, 0.058)],
      [new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6), M4(-0.032, 0.66, 0.108, -0.06)], [new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6), M4(0.032, 0.66, 0.108, -0.06)],
      [ell(0.011, 0.011, 0.011), M4(-0.032, 0.605, 0.104)], [ell(0.011, 0.011, 0.011), M4(0.032, 0.605, 0.104)]]);
    // arms: shoulder pivot (±0.175, 0.69); upper sleeve, forearm sleeve (long, slightly flared), pink cuff, small hand
    T.upper = merge([[ell(0.057, 0.057, 0.057, 12, 8)], [new THREE.CylinderGeometry(0.054, 0.049, 0.27, 12).translate(0, -0.135, 0)], [ell(0.05, 0.05, 0.05, 10, 8), M4(0, -0.27, 0)]]);
    T.fore = new THREE.CylinderGeometry(0.049, 0.054, 0.25, 12).translate(0, -0.125, 0);
    T.cuff = new THREE.TorusGeometry(0.052, 0.011, 6, 16).rotateX(PI / 2).translate(0, -0.248, 0);
    T.hand = merge([[ell(0.03, 0.036, 0.026), M4(0, -0.285, 0.004)], [ell(0.012, 0.012, 0.012), M4(0.026 * 0.6, -0.282, 0.018)]]);
    // legs: black leggings, boots with cream fur cuffs
    T.leg = merge([[new THREE.CylinderGeometry(0.054, 0.04, 0.42, 12).translate(0, -0.21, 0)], [ell(0.049, 0.049, 0.049, 8, 6), M4(0, 0, 0)]]);
    T.boot = merge([[new THREE.CylinderGeometry(0.05, 0.054, 0.2, 12).translate(0, -0.5, 0)], [ell(0.054, 0.04, 0.088, 12, 8), M4(0, -0.566, 0.05)]]);
    T.fur = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14).translate(0, -0.405, 0);
    // tail
    T.tailStick = new THREE.CylinderGeometry(0.014, 0.011, 0.26, 8).translate(0, -0.13, 0);
    T.tailTuft = merge([[ell(0.034, 0.075, 0.034), M4(0, -0.31, 0)]]);
    // bell
    T.bell = merge([[new THREE.CylinderGeometry(0.02, 0.04, 0.05, 14, 1, true).translate(0, -0.035, 0)], [new THREE.SphereGeometry(0.02, 12, 6, 0, PI * 2, 0, PI / 2).translate(0, -0.01, 0)]]);
    T.clap = ell(0.012, 0.012, 0.012, 8, 6).translate(0, -0.066, 0);
    // head (head-centre coordinates): rounded skull with a softly tapered chin
    const hg = new THREE.SphereGeometry(1, 30, 22).scale(0.118, 0.128, 0.118); const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) { const k = 1 - 0.2 * Math.pow(-y / 0.128, 1.6); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
    hg.computeVertexNormals(); T.head = hg;
    // hair: cap (with bangs), long back curtain and two long side locks. Pieces use the same head-centre coordinates.
    const surfZ = (x, y) => 0.118 * Math.sqrt(Math.max(0, 1 - (x / 0.118) ** 2 - (y / 0.128) ** 2));
    const capY = (x) => 0.008 + 0.139 * Math.sqrt(Math.max(0, 1 - (x / 0.129) ** 2));
    const bangs = [[-0.092, 0.4], [-0.062, 0.2], [-0.03, 0.05], [0.002, -0.08], [0.034, -0.2], [0.066, -0.36], [0.094, -0.5]]
      .map(([x, tz], i) => { const ry = 0.044 + 0.004 * (i % 2), y = capY(x) - ry * 0.9 - 0.004; return [ell(0.026, ry, 0.016, 10, 8), M4(x, y, surfZ(x, y) + 0.006, 0.18, Math.asin(clamp(x / 0.125, -1, 1)), tz)]; });
    T.hairCap = merge([[ell(0.129, 0.139, 0.128, 28, 18), M4(0, 0.008, -0.012)], ...bangs]);
    T.hairLong = merge([[ell(0.118, 0.31, 0.052, 16, 14), M4(0, -0.25, -0.145, 0.1)], [ell(0.13, 0.1, 0.08, 14, 10), M4(0, -0.04, -0.1)],
      [ell(0.03, 0.2, 0.036, 10, 12), M4(-0.122, -0.2, 0.05, 0, 0, 0.05)], [ell(0.03, 0.2, 0.036, 10, 12), M4(0.122, -0.2, 0.05, 0, 0, -0.05)]]);
    // eyes (eye-local, +z outward): white, warm iris, pupil, glints, lashes
    const eyeParts = (s) => {
      const m = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().multiplyMatrices(M4(s * 0.047, 0.003, 0.1065, 0, s * 0.4, 0), M4(x, y, z, rx, ry, rz, sx, sy, sz));
      return { white: [[ell(0.031, 0.038, 0.009, 14, 10), m(0, 0, 0)], [ell(0.0075, 0.009, 0.004, 8, 6), m(-0.008, 0.012, 0.0125)], [ell(0.0034, 0.0034, 0.0034, 6, 5), m(0.01, -0.013, 0.0108)]],
        iris: [[ell(0.0245, 0.031, 0.0095, 14, 10), m(0, 0, 0.0022)]], dark: [[ell(0.012, 0.018, 0.0098, 10, 8), m(0, -0.001, 0.0045)],
          [new THREE.TorusGeometry(0.032, 0.0032, 6, 20, PI * 1.02).rotateZ(-0.01), m(0, -0.001, 0.0075, 0, 0, 0, 1, 1.18, 0.6)],
          [new THREE.ConeGeometry(0.0034, 0.017, 5), m(s * 0.034, 0.014, 0.0075, 0, 0, -s * 0.95)]] };
    };
    const eL = eyeParts(-1), eR = eyeParts(1);
    T.eyeWhite = merge([...eL.white, ...eR.white]); T.eyeIris = merge([...eL.iris, ...eR.iris]); T.eyeDark = merge([...eL.dark, ...eR.dark]);
    // headband with cow ears and little horns
    const band = new THREE.TorusGeometry(0.146, 0.0075, 6, 36, PI).rotateZ(0); // arc over the head in the x-y plane
    T.band = merge([[band, M4(0, 0.01, -0.012, 0, 0, 0, 0.96, 1.0, 1)]]);
    T.horns = merge([-1, 1].map((s) => [new THREE.ConeGeometry(0.0125, 0.052, 8).translate(0, 0.026, 0), M4(s * 0.047, 0.138, -0.012, 0, 0, -s * 0.32)]));
    T.ear = (s) => ell(0.054, 0.035, 0.0155, 12, 8).translate(s * 0.04, 0, 0);
    T.earIn = (s) => ell(0.036, 0.022, 0.01, 10, 6).translate(s * 0.042, 0, 0.009);
    return T;
  })();

  const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.frustumCulled = false; parent.add(o); return o; };

  function build() {
    const root = new THREE.Group(), P = {};
    P.body = new THREE.Group(); P.body.position.y = HY; root.add(P.body);
    mesh(geos.dress, dressM, P.body); mesh(geos.neck, skinM, P.body); mesh(geos.bodyPink, pinkM, P.body);
    // head (pivot at the neck; the head centre sits 0.09 above it)
    P.neckP = new THREE.Group(); P.neckP.position.set(0, 1.37 - HY, 0); P.body.add(P.neckP);
    P.head = new THREE.Group(); P.head.position.y = 0.09; P.neckP.add(P.head);
    mesh(geos.head, faceM, P.head); mesh(geos.hairCap, hairCapM, P.head);
    P.hair = new THREE.Group(); P.hair.position.set(0, 0.0, -0.06); P.head.add(P.hair); mesh(geos.hairLong, hairM, P.hair, 0, 0, 0.06);
    P.eyes = new THREE.Group(); P.eyes.position.y = 0.003; P.head.add(P.eyes);
    for (const [g, m] of [[geos.eyeWhite, whiteM], [geos.eyeIris, irisM], [geos.eyeDark, darkM]]) { const o = mesh(g, m, P.eyes); o.position.y = -0.003; }
    mesh(geos.band, pinkM, P.head); mesh(geos.horns, hornM, P.head);
    P.ears = [-1, 1].map((s) => { const e = new THREE.Group(); e.position.set(s * 0.108, 0.082, -0.012); e.userData.s = s; P.head.add(e); mesh(geos.ear(s), earM, e); mesh(geos.earIn(s), pinkM, e); return e; });
    // arms
    P.arms = [-1, 1].map((s) => {
      const up = new THREE.Group(); up.position.set(s * 0.175, 1.29 - HY, 0); up.userData.s = s; P.body.add(up); mesh(geos.upper, sleeveM, up);
      const fo = new THREE.Group(); fo.position.y = -0.27; up.add(fo); mesh(geos.fore, sleeveM, fo); mesh(geos.cuff, pinkM, fo); mesh(geos.hand, skinM, fo);
      return { up, fo, s };
    });
    // bell on the ribbon
    P.bell = new THREE.Group(); P.bell.position.set(0, 1.352 - HY - 0.012, 0.09); P.body.add(P.bell); P.bell.scale.setScalar(1.35);
    mesh(geos.bell, brassM, P.bell); mesh(geos.clap, darkM, P.bell);
    // tail
    P.tail = new THREE.Group(); P.tail.position.set(0, 0.8 - HY, -0.145); P.body.add(P.tail); mesh(geos.tailStick, dressM, P.tail); mesh(geos.tailTuft, darkM, P.tail);
    // legs from the root so the body bob never lifts the boots
    P.legs = [-1, 1].map((s) => { const lg = new THREE.Group(); lg.position.set(s * 0.075, 0.6, 0); lg.userData.s = s; root.add(lg);
      mesh(geos.leg, leggM, lg); mesh(geos.boot, bootM, lg); mesh(geos.fur, furM, lg); return lg; });
    return { root, P };
  }
  const real = build(), twin = build();
  const rig = new THREE.Group(); rig.name = 'missMoo'; rig.add(real.root);
  const mirrorRig = new THREE.Group(); mirrorRig.name = 'missMooMirror'; mirrorRig.scale.y = -1; mirrorRig.add(twin.root); clipMirror(mirrorRig);
  const S = { x: 0, z: 0, yaw: 0, walk: 0, phase: 0, t: 0, blink: 2.5, blinkT: 0, look: 0, lookP: 0, tilt: 0, near: 0, bellE: 0, ringT: 99, ear: 0, earAt: 3, wave: 0, waveW: 0, waveCool: 1.5, waveT: 0, hair: 0, hairV: 0 };

  function apply(P, st) {
    const w = st.walk, ph = st.phase, t = st.t, sw = Math.sin(ph), idle = 1 - w;
    for (const lg of P.legs) lg.rotation.x = -lg.userData.s * sw * 0.5 * w;
    P.body.position.y = HY + 0.012 * Math.abs(Math.cos(ph)) * w + 0.004 * Math.sin(t * 1.7) * idle;
    P.body.rotation.z = 0.03 * Math.sin(ph) * w + 0.018 * Math.sin(t * 0.8) * idle;           // a gentle sway
    P.body.rotation.y = 0.05 * Math.sin(ph) * w + 0.03 * Math.sin(t * 0.55) * idle;
    P.body.rotation.x = 0.02 * w + 0.01 * Math.sin(t * 1.1);
    P.neckP.rotation.set(st.lookP * 0.8 + 0.05 * st.bellE * Math.sin(st.ringT * 18) + 0.03 * st.near, st.look * 0.85, st.tilt + 0.02 * Math.sin(t * 0.9));   // head tilt as she gets closer
    const bl = st.blinkT > 0 ? Math.max(0.08, Math.abs(st.blinkT / 0.14 - 1)) : 1; P.eyes.scale.y = bl;
    for (const e of P.ears) e.rotation.z = -e.userData.s * (0.3 + 0.07 * Math.sin(t * 1.3 + e.userData.s)) + (e.userData.s > 0 ? st.ear : 0);
    P.hair.rotation.x = 0.05 * Math.abs(sw) * w + 0.03 * Math.sin(t * 1.2) + st.hairV * 0.0; P.hair.rotation.z = 0.03 * Math.sin(ph) * w + 0.02 * Math.sin(t * 0.9 + 1);
    for (const a of P.arms) {
      const s = a.s, wv = s < 0 ? st.waveW : 0, sg = st.t * 9;
      a.up.rotation.x = ease(s * sw * 0.42 * w, -0.2, wv); a.up.rotation.z = ease(s * (0.1 + 0.02 * Math.sin(t * 1.5 + s)), s * 2.35, wv);
      a.fo.rotation.x = ease(-0.38 - 0.25 * Math.max(0, -s * sw) * w, 0, wv); a.fo.rotation.z = ease(0, s * (0.2 + 0.5 * Math.sin(sg)), wv);
    }
    P.bell.rotation.x = 0.1 * Math.sin(ph * 2 + 1.0) * w + st.bellE * 0.8 * Math.sin(st.ringT * 24); P.bell.rotation.z = st.bellE * 0.4 * Math.sin(st.ringT * 19 + 1);
    P.tail.rotation.z = 0.3 * Math.sin(t * 1.9) + 0.25 * Math.sin(ph) * w; P.tail.rotation.x = -0.45 + 0.1 * Math.sin(t * 2.3);
  }
  const API = {
    group: rig, mirror: mirrorRig, state: S,
    /** world position on the floor + heading (radians, 0 = facing +z) */
    place(x, z, yaw) { S.x = x; S.z = z; S.yaw = yaw; for (const g of [rig, mirrorRig]) { g.position.set(x, 0, z); g.rotation.y = yaw; } },
    ring(power = 1) { S.bellE = Math.min(1.4, S.bellE + power); S.ringT = 0; ringU.value = 1; },
    waveNow(sec = 2.6) { S.wave = sec; },
    /** dt s, moving 0..1 (how fast she is walking right now), cam: THREE.Vector3 (world position of the viewer's head) */
    update(dt, moving, cam, t) {
      S.t = t; S.walk = ease(S.walk, moving, 1 - Math.exp(-dt * 4)); S.phase += dt * (2.2 + 4.2 * S.walk) * (S.walk > 0.02 ? 1 : 0.0);
      S.ringT += dt; S.bellE *= Math.exp(-dt * 1.6); ringU.value *= Math.exp(-dt * 3.5);
      S.blink -= dt; if (S.blink < 0) { S.blinkT = 0.14; S.blink = 2.2 + Math.random() * 3.2; } if (S.blinkT > 0) S.blinkT = Math.max(0, S.blinkT - dt);
      S.earAt -= dt; if (S.earAt < 0) { S.earAt = 3 + Math.random() * 4; S.ear = 0.5; } S.ear *= Math.exp(-dt * 3);
      let ty = 0, tp = 0, near = 0, d = 99;
      if (cam) {
        const dx = cam.x - S.x, dz = cam.z - S.z; d = Math.hypot(dx, dz);
        if (d < 7) { const a = wrap(Math.atan2(dx, dz) - S.yaw); ty = clamp(a, -0.95, 0.95); tp = clamp(-Math.atan2(cam.y - 1.45, Math.max(d, 0.5)) * 0.9, -0.2, 0.25); }
        near = clamp(1 - (d - 2) / 5, 0, 1);
      }
      S.look = ease(S.look, ty, 1 - Math.exp(-dt * 3)); S.lookP = ease(S.lookP, tp, 1 - Math.exp(-dt * 3));
      S.near = ease(S.near, near, 1 - Math.exp(-dt * 2)); S.tilt = ease(S.tilt, 0.2 * S.near * (0.75 + 0.25 * Math.sin(t * 0.7)), 1 - Math.exp(-dt * 2));
      // a little wave hello when she is close and not striding
      S.waveCool -= dt; if (S.wave > 0) S.wave -= dt;
      if (S.wave <= 0 && S.waveCool <= 0 && d < 6.5 && S.walk < 0.4) { S.wave = 2.6; S.waveCool = 8 + Math.random() * 4; }
      S.waveW = ease(S.waveW, S.wave > 0 ? 1 : 0, 1 - Math.exp(-dt * 5));
      apply(real.P, S); apply(twin.P, S);
    },
  };
  return API;
}
