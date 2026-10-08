// Shared helpers for the Resonance Chamber (v3). three.js r169, no build step.
import * as THREE from './lib/three.module.min.js';
export { THREE };

export const Q = new URLSearchParams(location.search);
export const LOW = Q.get('quality') === 'low';
export const OPT = {
  scale: Math.min(2, Math.max(0.5, +(Q.get('scale') || (LOW ? 1.1 : 1.4)))),
  mirror: Q.get('mirror') ? Q.get('mirror') !== '0' : !LOW,
  video: Q.get('video') || 'blend',
  fov: Q.get('fov') !== null ? +Q.get('fov') : 0.6,
  particles: +(Q.get('particles') || (LOW ? 400 : 900)),
  spatial: Q.get('spatial') !== '0',
};
export const BEAT = 4.0;
export const f3 = (n) => (+n).toFixed(3);
export const v3 = (a) => `vec3(${a.map(f3).join(', ')})`;

// chamber layout (room-local coordinates; focal point at local -z, entry door at local +z)
export const R = 7.0, H = 8.0, TY = 1.68, TR = 1.55, TZ = -6.75, TL = 70, START_Z = 1.2;
export const D0 = START_Z - TZ;
export const DW = 1.1, DH = 2.3;           // doorway half-width / height of straight part (arched top, radius DW)
export const VEIL_R = 6.88;                // distance of door veils from room centre

// global animated uniforms (shared by every material)
export const U = {
  uTime: { value: 0 }, uBeat: { value: 0 }, uBeatT: { value: 0 }, uSurge: { value: 0 },
  uInt: { value: 0.5 }, uMirror: { value: OPT.mirror ? 1 : 0 }, uPx: { value: 500 }, uBright: { value: 1 },
};

export const PAL = {
  // true pink (hue ~330-345, sampled against the reference's rose/pink range): hot pink #FF4FA3, bubblegum #FF6EB4,
  // light #FF8FC8, highlight #FFC0DB, warm pink-black shadows #1A0610. VIOL is a warm rose accent here (no purple/magenta).
  pink: { PINK: [1.0, 0.31, 0.62], HOT: [1.0, 0.43, 0.69], DEEP: [0.42, 0.06, 0.19], WHITE: [1.0, 0.80, 0.86], VIOL: [1.0, 0.42, 0.52],
    BASE: [0.07, 0.016, 0.04], BASE2: [0.026, 0.006, 0.015], FLOORC: [0.022, 0.005, 0.012], FOGC: [0.13, 0.03, 0.066], DIM: 1.0,
    hex: { a: 0xff4fa3, b: 0xff6eb4, c: 0xff8fc8, d: 0xffc0db, e: 0xff5c9c, spr: 0xff5aa6, scr: 0xff4f9e } },
  crimson: { PINK: [0.86, 0.02, 0.09], HOT: [1.0, 0.28, 0.36], DEEP: [0.2, 0.0, 0.02], WHITE: [1.0, 0.72, 0.74], VIOL: [0.42, 0.0, 0.07],
    BASE: [0.032, 0.0, 0.006], BASE2: [0.006, 0.0, 0.002], FLOORC: [0.006, 0.0, 0.002], FOGC: [0.06, 0.0, 0.008], DIM: 0.8,
    hex: { a: 0xd8081c, b: 0xff3048, c: 0xff5a66, d: 0xff9aa0, e: 0xe0182c, spr: 0xc80818, scr: 0xb00010 } },
  mono: { PINK: [0.8, 0.8, 0.8], HOT: [1.0, 1.0, 1.0], DEEP: [0.16, 0.16, 0.16], WHITE: [1.0, 1.0, 1.0], VIOL: [0.5, 0.5, 0.5],
    BASE: [0.02, 0.02, 0.02], BASE2: [0.0, 0.0, 0.0], FLOORC: [0.0, 0.0, 0.0], FOGC: [0.03, 0.03, 0.03], DIM: 1.0,
    hex: { a: 0xffffff, b: 0xffffff, c: 0xe8e8e8, d: 0xffffff, e: 0xdddddd, spr: 0xffffff, scr: 0xffffff } },
};

export const env = { maxAniso: 4 };

let GLOW = null;
export function glowTex() {
  if (GLOW) return GLOW;
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  [[0, 1], [0.08, 0.85], [0.2, 0.45], [0.4, 0.16], [0.65, 0.04], [1, 0]].forEach(([o, a]) => grd.addColorStop(o, `rgba(255,255,255,${a})`));
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  GLOW = new THREE.CanvasTexture(c); GLOW.colorSpace = THREE.SRGBColorSpace; GLOW.anisotropy = env.maxAniso; return GLOW;
}
export function glowSprite(hex, sx, sy, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(sx, sy, 1); return s;
}
export const dummy = new THREE.Object3D();
export function mtx(x, y, z, ry = 0, rx = 0, sx = 1, sy = 1, sz = 1) {
  dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, 0, 'YXZ'); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); return dummy.matrix.clone();
}
export function instanced(geo, material, matrices, parent) {
  const m = new THREE.InstancedMesh(geo, material, matrices.length);
  matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
  m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; parent.add(m); return m;
}
export function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.anisotropy = env.maxAniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return { c, g: c.getContext('2d'), t };
}
// doorway outline in a plane (x right, y up), z offset
export function archCurve(z = 0, hw = DW, h = DH, n = 48) {
  const pts = [new THREE.Vector3(-hw, 0, z), new THREE.Vector3(-hw, h, z)];
  for (let i = 1; i < n; i++) { const a = Math.PI - (Math.PI * i) / n; pts.push(new THREE.Vector3(Math.cos(a) * hw, h + Math.sin(a) * hw, z)); }
  pts.push(new THREE.Vector3(hw, h, z), new THREE.Vector3(hw, 0, z));
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
}
// horizontal ring around the room (angle 0 = local +z) with gaps at doorways
export function ringCurves(radius, y, gaps = [], n = 160) {
  const segs = []; let cur = [];
  const inGap = (t) => gaps.some((g) => { const [a, w] = Array.isArray(g) ? g : [g, 0.2]; return Math.abs(Math.atan2(Math.sin(t - a), Math.cos(t - a))) < w; });
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    if (inGap(t)) { if (cur.length > 1) segs.push(cur); cur = []; continue; }
    cur.push(new THREE.Vector3(radius * Math.sin(t), y, radius * Math.cos(t)));
  }
  if (cur.length > 1) segs.push(cur);
  if (!gaps.length) return [new THREE.CatmullRomCurve3(segs[0].slice(0, -1), true)];
  return segs.map((p) => new THREE.CatmullRomCurve3(p));
}

// ---------- per-space material kit: palette constants + room-local coordinates ----------
export function makeKit(pal, inv) {
  const P = PAL[pal];
  const uniforms = { uRoomInv: { value: inv } };
  const COMMON = /* glsl */`
    uniform float uTime; uniform float uBeat; uniform float uBeatT; uniform float uSurge; uniform float uInt;
    const vec3 PINK = ${v3(P.PINK)}; const vec3 HOT = ${v3(P.HOT)}; const vec3 DEEP = ${v3(P.DEEP)};
    const vec3 WHITE = ${v3(P.WHITE)}; const vec3 VIOL = ${v3(P.VIOL)};
    const vec3 BASE = ${v3(P.BASE)}; const vec3 BASE2 = ${v3(P.BASE2)}; const vec3 FLOORC = ${v3(P.FLOORC)}; const vec3 FOGC = ${v3(P.FOGC)};
    const float DIM = ${f3(P.DIM)};
    #define CAM vC
    float aline(float c, float hw, float px){ float f = abs(fract(c - 0.5) - 0.5); return 1.0 - smoothstep(hw, hw + px * 1.5, f); }
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    // anti-aliased square-wave stripe in [0,1]; fades to grey where too dense to resolve
    float stripe(float x, float w){ float f = fract(x); float d = min(f, 1.0 - f); float s = smoothstep(0.25 - w, 0.25 + w, d); return mix(0.5, s, clamp(1.0 - w * 2.5, 0.0, 1.0)); }
  `;
  const VSf = (mod = '', head = '') => /* glsl */`
    uniform mat4 uRoomInv; uniform float uTime;
    ${head}
    varying vec3 vW; varying vec2 vUv; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec3 vI; varying float vH; varying vec3 vC;
    void main(){
      vUv = uv; vL = position; vLN = normal; vI = vec3(0.0);
      vec4 lp = vec4(position, 1.0); vec3 n = normal;
      #ifdef USE_INSTANCING
        lp = instanceMatrix * lp; n = mat3(instanceMatrix) * n; vI = instanceMatrix[3].xyz;
      #endif
      vH = fract(sin(dot(vI.xz + vI.y * 3.1, vec2(12.9898, 78.233))) * 43758.5453);
      ${mod}
      vec4 w = modelMatrix * lp; vW = (uRoomInv * w).xyz;
      vN = normalize(mat3(uRoomInv) * (mat3(modelMatrix) * n));
      vC = (uRoomInv * vec4(cameraPosition, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const VS = VSf();
  const LIT = /* glsl */`
    vec3 fogit(vec3 col, vec3 wp){ float d = length(wp - CAM); float f = 1.0 - exp(-d * 0.055);
      return mix(col, FOGC * (0.7 + 0.5 * uInt + 0.6 * uBeat), f * 0.5); }
    vec3 envRefl(vec3 N, vec3 V, vec3 wp){
      vec3 Rf = reflect(-V, N);
      vec3 e = PINK * 0.22 * exp(-abs(Rf.y - 0.05) * 5.0) + DEEP * 0.25 * max(-Rf.y, 0.0);
      vec3 toT = normalize(vec3(0.0, ${f3(TY)}, ${f3(TZ)}) - wp);
      return e + HOT * 0.6 * pow(max(dot(Rf, toT), 0.0), 24.0);
    }
  `;
  const FS_HEAD = COMMON + `varying vec3 vW; varying vec2 vUv; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec3 vI; varying float vH; varying vec3 vC;\n` + LIT;
  function mat(fs, opts = {}) {
    const { additive = false, side = THREE.FrontSide, defines = {}, transparent = additive } = opts;
    return new THREE.ShaderMaterial({
      uniforms: { ...U, ...uniforms, ...(opts.uniforms || {}) }, vertexShader: opts.vs || VS, fragmentShader: FS_HEAD + fs, side, defines,
      transparent, depthWrite: !transparent, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
  const neonCore = (hex, k = 1) => mat(`uniform vec3 uC; void main(){ gl_FragColor = vec4(mix(uC, WHITE, 0.35 + 0.25 * uBeat) * (${f3(k)} * (0.85 + 0.25 * uInt + 0.35 * uBeat)), 1.0); }`,
    { uniforms: { uC: { value: new THREE.Color(hex) } } });
  const glowShell = (hex, k = 1) => mat(`uniform vec3 uC; void main(){ float f = abs(dot(normalize(vN), normalize(CAM - vW)));
    gl_FragColor = vec4(uC * pow(f, 2.2) * ${f3(k)} * (0.55 + 0.35 * uInt + 0.8 * uBeat), 1.0); }`,
    { uniforms: { uC: { value: new THREE.Color(hex) } }, additive: true });
  function neonTorus(parent, radius, tube, hex, pos, rotX = 0, k = 1, shell = 5) {
    const core = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 112), neonCore(hex, k));
    const glow = new THREE.Mesh(new THREE.TorusGeometry(radius, tube * shell, 8, 112), glowShell(hex, 0.55 * k));
    for (const m of [core, glow]) { m.position.copy(pos); m.rotation.x = rotX; parent.add(m); }
    return [core, glow];
  }
  function neonTube(parent, curve, hex, k = 1, tube = 0.035, segs = 64, shell = 4.5) {
    parent.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, tube, 6, curve.closed), neonCore(hex, k)));
    parent.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, tube * shell, 8, curve.closed), glowShell(hex, 0.5 * k)));
  }
  const metalMat = (defines = {}) => mat(/* glsl */`
    void main(){
      vec3 N = normalize(vN); vec3 V = normalize(CAM - vW);
      float fr = pow(1.0 - abs(dot(N, V)), 3.0);
      vec3 col = BASE * 0.6 + envRefl(N, V, vW) * 0.8 + PINK * fr * 0.35;
      #ifdef STRIP_Z
        float pxx = fwidth(vL.x);
        float s = step(STRIP_Z, vL.z) * (1.0 - smoothstep(0.028, 0.028 + pxx * 1.5, abs(vL.x)));
        float flow = pow(0.5 + 0.5 * sin(vW.y * 1.3 - uTime * 2.2 + vI.x * 1.7 + vI.z), 4.0);
        float bw = exp(-abs(vW.y - uBeatT * 3.0) * 2.0) * uBeat;
        col += mix(PINK, WHITE, 0.3) * s * (0.55 + 1.2 * flow * uInt + 2.0 * bw) * DIM;
      #endif
      #ifdef STRIP_Y
        float pxx = fwidth(vL.x);
        float s = step(vL.y, -STRIP_Y) * (1.0 - smoothstep(0.03, 0.03 + pxx * 1.5, abs(vL.x)));
        float flow = pow(0.5 + 0.5 * sin(vL.z * 2.0 + uTime * 2.5), 6.0);
        col += PINK * s * (0.5 + 1.2 * flow * uInt + uBeat) * DIM;
      #endif
      #ifdef GROOVES
        float py = fwidth(vL.y);
        float g = 1.0 - smoothstep(0.006, 0.006 + py * 1.5, abs(vL.y - GROOVES));
        col += HOT * g * (0.9 + 0.8 * uBeat);
      #endif
      gl_FragColor = vec4(fogit(col, vW), 1.0);
    }`, { defines, side: defines.DOUBLE ? THREE.DoubleSide : THREE.FrontSide });
  return { P, pal, uniforms, COMMON, VS, VSf, mat, neonCore, glowShell, neonTorus, neonTube, metalMat, hex: P.hex };
}

// GLSL: discard wall fragments inside doorway arches (angles in room-local frame, 0 = +z)
export function doorDiscardGLSL(angles, radius = R) {
  return angles.map((a) => `{ float da = atan(sin(ang - (${f3(a)})), cos(ang - (${f3(a)}))); float s = da * ${f3(radius)};
      if (abs(s) < ${f3(DW)} && y < ${f3(DH)} + sqrt(max(${f3(DW * DW)} - s * s, 0.0))) discard; }`).join('\n');
}

// GLSL: discard room-floor fragments past a doorway plane (needs vec2 p = local xz)
export function floorDoorDiscardGLSL(angles) {
  return angles.map((a) => `{ vec2 dd = vec2(${f3(Math.sin(a))}, ${f3(Math.cos(a))}); if (dot(p, dd) > ${f3(VEIL_R)} && abs(dot(p, vec2(dd.y, -dd.x))) < 1.45) discard; }`).join('\n');
}

// ---------- doorway veil: shimmering membrane that previews the space behind it ----------
// style: 0 = pink rings, 1 = crimson vortex, 2 = monochrome op-art spiral. end=1 draws a solid end wall around the arch.
export function makeVeil(style, end = 0) {
  const W = end ? 2.6 : 2 * DW + 0.04, Hh = end ? 3.6 : DH + DW + 0.04;
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, uStyle: { value: style }, uEnd: { value: end }, uOpen: { value: 0 } },
    side: THREE.FrontSide,
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uBeat; uniform float uBeatT; uniform float uInt; uniform float uStyle; uniform float uEnd; uniform float uOpen;
      varying vec2 vP;
      float st(float x, float w){ float f = fract(x); float d = min(f, 1.0 - f); return mix(0.5, smoothstep(0.25 - w, 0.25 + w, d), clamp(1.0 - w * 2.5, 0.0, 1.0)); }
      void main(){
        vec2 p = vP;                                    // metres, x centred, y from floor
        float ax = abs(p.x);
        float top = ${f3(DH)} + sqrt(max(${f3(DW * DW)} - p.x * p.x, 0.0));
        float inside = step(ax, ${f3(DW)}) * step(p.y, top);
        float edgeD = ax < ${f3(DW)} ? min(${f3(DW)} - ax, top - p.y) : -1.0;
        if (inside < 0.5) {
          if (uEnd < 0.5) discard;
          // end wall around the arch
          float dd = max(ax - ${f3(DW)}, p.y - top);
          vec3 wc = uStyle > 1.5 ? vec3(0.03) : (uStyle > 0.5 ? vec3(0.03, 0.0, 0.006) : vec3(0.085, 0.02, 0.048));
          vec3 ac = uStyle > 1.5 ? vec3(1.0) : (uStyle > 0.5 ? vec3(1.0, 0.2, 0.3) : vec3(1.0, 0.36, 0.64));
          wc += ac * exp(-max(dd, 0.0) * 18.0) * (0.8 + 0.6 * uBeat);
          gl_FragColor = vec4(wc, 1.0); return;
        }
        vec2 c = p - vec2(0.0, 1.7);
        float r = length(c) + 1e-3; float a = atan(c.y, c.x); float a2 = atan(-c.y, -c.x);
        // iris: the membrane dilates open as you approach, revealing the real space behind it
        float ir = uOpen * 2.3 + 0.035 * sin(a * 7.0 + uTime * 1.1) * step(0.001, uOpen) - 0.04;
        if (r < ir) discard;
        float irisEdge = step(0.001, uOpen) * exp(-(r - ir) * 16.0);
        float lr = log(r);
        vec3 col;
        if (uStyle < 0.5) {
          float v = lr * 4.0 - uTime * 0.5 + a * 3.0 / 6.2831; float vb = lr * 4.0 + a2 * 3.0 / 6.2831;
          float w = min(fwidth(v), fwidth(vb));
          float b = 1.0 - smoothstep(0.4 - w, 0.4 + w, abs(fract(v) - 0.5) * 2.0);
          col = mix(vec3(0.06, 0.012, 0.03), mix(vec3(1.0, 0.33, 0.62), vec3(0.42, 0.06, 0.19), fract(v)), b);
          col += vec3(1.0, 0.5, 0.72) * exp(-r * 2.5) * (0.6 + 0.8 * uBeat);
        } else if (uStyle < 1.5) {
          float hb = exp(-uBeatT * 6.0) + 0.7 * exp(-max(uBeatT - 0.28, 0.0) * 6.0) * step(0.28, uBeatT);
          float v = lr * 3.0 - (a + uTime * 0.4) * 5.0 / 6.2831 + 0.6 / (r + 0.3) - uTime * 0.2;
          float vb = lr * 3.0 - (a2 + uTime * 0.4) * 5.0 / 6.2831 + 0.6 / (r + 0.3);
          float w = min(fwidth(v), fwidth(vb));
          float b = 1.0 - smoothstep(0.35 - w, 0.35 + w, abs(fract(v) - 0.5) * 2.0);
          col = mix(vec3(0.01, 0.0, 0.0), mix(vec3(1.0, 0.2, 0.28), vec3(0.35, 0.0, 0.03), fract(v)), b);
          col += vec3(0.9, 0.05, 0.1) * exp(-r * 2.2) * (0.5 + 1.2 * hb);
        } else {
          float br = 0.85 + 0.15 * (0.5 - 0.5 * cos(6.2831 * uBeatT / ${f3(BEAT)}));
          float v = r * 5.0 + a * 4.0 / 6.2831 - uTime * 0.1; float vb = r * 5.0 + a2 * 4.0 / 6.2831;
          float w = min(fwidth(v), fwidth(vb));
          col = vec3(mix(0.03, 0.92, st(v, w))) * br;
        }
        // membrane shimmer + glowing rim
        col *= 0.92 + 0.08 * sin(r * 22.0 - uTime * 1.5);
        vec3 rim = uStyle > 1.5 ? vec3(1.0) : (uStyle > 0.5 ? vec3(1.0, 0.25, 0.32) : vec3(1.0, 0.5, 0.74));
        col += rim * exp(-edgeD * 14.0) * (0.9 + 0.6 * uBeat);
        col += rim * irisEdge * 1.4;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.PlaneGeometry(W, Hh); g.translate(0, Hh / 2, 0);
  const mesh = new THREE.Mesh(g, m); mesh.userData.veil = true; return mesh;
}
