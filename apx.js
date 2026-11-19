// v38e: extra anatomy (wings, animal ears, tails ...) on static, un-rigged figures (the STL/OBJ friends have no skeleton).
// Each part is a region of the mesh hinged at its root; a vertex-shader deformation swings it the way Ari's tails move:
// one slow ambient sway whose phase lags from base to tip, a momentum response (speed / turning) that goes through an
// over-damped first-order filter (no spring, no overshoot, no jelly), amplitude growing from 0 at the hinge to full at the tip.
// Regions are given in a normalised frame: x right, y up from the feet, z forward, unit = figure height.
import { THREE } from './shared.js?v=38e';

const S2 = Math.SQRT1_2;
// per character defaults (Drive settings.json "appendages": [...] overrides); side +1 = her left (+x), -1 = her right
const wing = (side, o = {}) => ({ type: 'wing', hinge: [side * (o.hx ?? 0.06), o.hy ?? 0.72, o.hz ?? -0.08], dir: [side * (o.dx ?? 0.9), o.dy ?? 0.25, o.dz ?? -0.35], len: o.len ?? 0.6,
  min: [side > 0 ? (o.x0 ?? 0.05) : -9, o.y0 ?? 0.3, -9], max: [side > 0 ? 9 : -(o.x0 ?? 0.05), 9, o.z1 ?? -0.02],
  axis: [0, 0, side], amp: o.amp ?? 0.07, hz: o.hz ?? 0.22, lag: 0.9, ph: side > 0 ? 0 : 0.35, momAxis: [0, side, 0], mom: o.mom ?? 0.22, lift: o.lift ?? 0.05 });
export const APX_DEFAULTS = {
  angel: [wing(1, { hx: 0.07, hy: 0.7, hz: -0.1, len: 0.68, x0: 0.085, y0: 0.42, z1: -0.065 }), wing(-1, { hx: 0.07, hy: 0.7, hz: -0.1, len: 0.68, x0: 0.085, y0: 0.42, z1: -0.065 })],
  // D-Mon's sculpt is turned / asymmetric: her left wing sweeps forward, her right one back
  'd-mon': [wing(1, { hx: 0.14, hy: 0.66, hz: 0.02, dz: 0.15, len: 0.5, x0: 0.24, y0: 0.2, z1: 0.42 }), wing(-1, { hx: 0.12, hy: 0.66, hz: -0.1, len: 0.5, x0: 0.22, y0: 0.2, z1: 0.3 })],
  'miss-bunny': [
    { type: 'ears', hinge: [0, 0.93, 0.0], dir: [0, 1, -0.15], len: 0.08, min: [-9, 0.93, -9], max: [9, 9, 9], axis: [1, 0, 0], amp: 0.06, hz: 0.3, lag: 0.7, ph: 0, momAxis: [-1, 0, 0], mom: 0.25, lift: 0 },
    { type: 'tail', hinge: [0, 0.59, -0.06], dir: [0, 0, -1], len: 0.025, min: [-0.03, 0.57, -9], max: [0.03, 0.612, -0.072], axis: [0, 1, 0], amp: 0.12, hz: 0.5, lag: 0.4, ph: 0, momAxis: [1, 0, 0], mom: 0.2, lift: 0 }],
};
const MAXR = 4;

export function applyApx(model, regions, opts = {}) {
  if (!regions || !regions.length) return null;
  regions = regions.slice(0, MAXR);
  // bake every mesh into model space so one set of region uniforms fits all of them (static meshes only)
  model.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(model.matrixWorld).invert(), mm = new THREE.Matrix4();
  const meshes = []; model.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) return null;
  for (const o of meshes) { mm.multiplyMatrices(inv, o.matrixWorld); o.geometry = o.geometry.clone(); o.geometry.applyMatrix4(mm); o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
    if (o.parent !== model) model.add(o); }
  if (opts.yaw) for (const o of meshes) o.geometry.rotateY(opts.yaw);
  const box = new THREE.Box3(); for (const o of meshes) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox); }
  const H = box.max.y - box.min.y, c = box.getCenter(new THREE.Vector3());
  const P = (n) => new THREE.Vector3(c.x + n[0] * H, box.min.y + n[1] * H, c.z + n[2] * H);
  const D = (n) => new THREE.Vector3(...n).normalize();
  const U = { uApT: { value: 0 }, uApMom: { value: 0 }, uApDbg: { value: opts.debug ? 1 : 0 },
    uApH: { value: regions.map((r) => P(r.hinge)) }, uApDir: { value: regions.map((r) => D(r.dir)) }, uApMin: { value: regions.map((r) => P(r.min.map((v, i) => Math.max(v, -9)))) },
    uApMax: { value: regions.map((r) => P(r.max)) }, uApAx: { value: regions.map((r) => D(r.axis)) }, uApMAx: { value: regions.map((r) => D(r.momAxis)) },
    uApA: { value: regions.map((r) => new THREE.Vector4(r.amp, r.hz * Math.PI * 2, r.lag, r.ph)) }, uApB: { value: regions.map((r) => new THREE.Vector4(r.len * H, r.mom, r.lift || 0, 0.03 * H)) } };
  for (const k of ['uApH', 'uApDir', 'uApMin', 'uApMax', 'uApAx', 'uApMAx']) while (U[k].value.length < MAXR) U[k].value.push(k === 'uApH' ? new THREE.Vector3(0, 1e6, 0) : new THREE.Vector3(0, 1, 0));   // unused slots: weight 0
  while (U.uApA.value.length < MAXR) U.uApA.value.push(new THREE.Vector4()); while (U.uApB.value.length < MAXR) U.uApB.value.push(new THREE.Vector4(1, 0, 0, 1));
  const N = regions.length;
  const GLSL = `
uniform float uApT, uApMom, uApDbg; uniform vec3 uApH[${MAXR}], uApDir[${MAXR}], uApMin[${MAXR}], uApMax[${MAXR}], uApAx[${MAXR}], uApMAx[${MAXR}]; uniform vec4 uApA[${MAXR}], uApB[${MAXR}];
varying float vApW;
vec3 apRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
float apW(int i, vec3 p) { vec3 lo = smoothstep(uApMin[i] - uApB[i].w, uApMin[i] + uApB[i].w, p), hi = 1.0 - smoothstep(uApMax[i] - uApB[i].w, uApMax[i] + uApB[i].w, p);
  float box = lo.x * lo.y * lo.z * hi.x * hi.y * hi.z; return box * clamp(dot(p - uApH[i], uApDir[i]) / uApB[i].x, 0.0, 1.0); }
void apAng(int i, float w, out float a, out float m) { float e = pow(w, 1.3);
  a = e * (uApA[i].x * sin(uApA[i].y * uApT + uApA[i].w - uApA[i].z * w) + uApB[i].z * uApMom); m = e * uApB[i].y * uApMom; }
vec3 apPos(vec3 p) { vec3 q = p; vApW = 0.0; for (int i = 0; i < ${MAXR}; i++) { float w = apW(i, p); if (w <= 0.0) continue; vApW = max(vApW, w); float a, m; apAng(i, w, a, m);
  q = uApH[i] + apRot(apRot(q - uApH[i], uApAx[i], a), uApMAx[i], m); } return q; }
vec3 apNrm(vec3 p, vec3 n) { for (int i = 0; i < ${MAXR}; i++) { float w = apW(i, p); if (w <= 0.0) continue; float a, m; apAng(i, w, a, m); n = apRot(apRot(n, uApAx[i], a), uApMAx[i], m); } return n; }
`;
  const mats = new Set(); for (const o of meshes) for (const m of [].concat(o.material)) mats.add(m);
  for (const m of mats) {
    m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
      sh.vertexShader = GLSL + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = apNrm(position, objectNormal);')
        .replace('#include <begin_vertex>', 'vec3 transformed = apPos(position);');
      sh.fragmentShader = 'uniform float uApDbg; varying float vApW;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n if (uApDbg > 0.5) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.15, 0.1) * (0.4 + 0.6 * vApW), step(0.001, vApW));'); };
    m.customProgramCacheKey = () => 'apx' + MAXR; m.needsUpdate = true;
  }
  for (const o of meshes) { o.geometry.computeBoundingSphere(); o.frustumCulled = false; }
  // momentum: speed / turning through an over-damped filter (rise 0.6 s, settle 1.2 s) - like the tails' TL.mom
  const st = { mom: 0, yaw: null };
  return { regions: regions.map((r) => r.type), U,
    update(dt, t, speed = 0, yaw = 0) { let turn = 0; if (st.yaw !== null && dt > 0) { let d = yaw - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); turn = Math.abs(d) / dt; } st.yaw = yaw;
      const tgt = Math.min(1, Math.max(speed / 1.2, turn / 2.5)); st.mom += (tgt - st.mom) * (1 - Math.exp(-dt / (tgt > st.mom ? 0.6 : 1.2)));
      U.uApT.value = t; U.uApMom.value = st.mom; return st.mom; } };
}
