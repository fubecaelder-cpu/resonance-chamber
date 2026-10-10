// v9/v10: movable main monitors. Each room's monitor hangs in a mount group pivoting at the screen centre; the SCREEN wing
// of the control panel moves it up/down, closer/farther (along the room axis, towards the arrival area), bigger/smaller
// and tilts it. v10: every room has the same monitor and the same clear "monitor bay" in front of its focal wall
// (decor was moved out of it), so the limits, ranges and steps are identical in all three rooms. The screen can go all the
// way down until its bottom edge rests on the floor. Settings are per room and saved in localStorage.
import { THREE } from './shared.js?v=18';

const KEY = 'resonanceChamber.screens.v1';
export const DEF = { dy: 0, dz: 0, s: 1, t: 0 };
export const LIM = { dy: [-8, 1.0], dz: [0, 3.6], s: [0.6, 1.8], t: [-10 * Math.PI / 180, 30 * Math.PI / 180] };
const STEP = { dy: 0.25, dz: 0.4, s: 0.1, t: 5 * Math.PI / 180 };
// the monitor bay (room-local, identical in every room): between the focal wall and the arrival area, under the ceiling
// v11: screen opacity, identical in every room (100% down to 10% in 10% steps); Reset restores 100%
export const OPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
export const BAY = { back: -6.0, front: -2.7, wall: 6.45, floor: 0, ceil: 7.96 };

export function createScreens({ monitors, onChange = () => {} }) {
  // monitors: [{ mount, brackets, geo: {r, y, h, half}, root, kit, monPos: Vector3 }]
  let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  const M = monitors.map((m, i) => {
    const { r, h, half } = m.geo;
    // sample points in the mount's own frame (pivot at the screen centre): glass, the frame tubes in front, the back plate
    // behind; top and bottom rows sit on the outside of the neon frame tubes, so "on the floor" means the frame touches it
    const pts = [], E = h / 2 + 0.1;
    for (let iu = 0; iu <= 14; iu++) { const ph = -half - 0.03 + ((2 * half + 0.06) * iu) / 14;
      for (let iv = 0; iv <= 6; iv++) { const yy = (-1 + iv / 3) * E;
        for (const rr of [r - 0.12, r, r + 0.1]) pts.push([-rr * Math.sin(ph), yy, r - rr * Math.cos(ph)]); } }
    const metal = m.kit.metalMat();
    const mk = (geo) => { const o = new THREE.Mesh(geo, metal); o.userData.noMirror = true; o.visible = false; m.mount.parent.add(o); return o; };
    // ceiling rods (screen high) or a small floor stand (screen low); both stretch as the screen moves
    const sup = [-1, 1].map((sg) => { const ph = sg * half * 0.6;
      return { rod: mk(new THREE.CylinderGeometry(0.016, 0.016, 1, 6)), leg: mk(new THREE.CylinderGeometry(0.03, 0.03, 1, 10)), foot: mk(new THREE.CylinderGeometry(0.2, 0.24, 0.04, 24)),
        top: new THREE.Vector3(-r * Math.sin(ph), h / 2 + 0.1, r - r * Math.cos(ph)), bot: new THREE.Vector3(-r * Math.sin(ph), -h / 2 - 0.1, r - r * Math.cos(ph)) }; });
    return { ...m, pts, sup, tgt: { ...DEF }, cur: { ...DEF }, flash: 0, msg: '', opI: 0, op: 1, opU: fadeable(m.mount) };
  });

  // ---------- v11 opacity: every material in the mount gets its own copy with an opacity multiplier ----------
  function fadeable(mount) {
    const u = { value: 1 }, mats = [];
    mount.traverse((o) => {
      if (!o.material || Array.isArray(o.material)) return;
      const m0 = o.material, m = m0.clone(); if (m0.uniforms) m.uniforms = m0.uniforms;
      const add = m0.blending === THREE.AdditiveBlending;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uOp = u;
        sh.fragmentShader = sh.fragmentShader.replace(/void\s+main\s*\(\s*(void)?\s*\)/, 'void mainOp_()') +
          `\nuniform float uOp;\nvoid main(){ mainOp_(); ${add ? 'gl_FragColor.rgb *= uOp;' : 'gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 1.0) * uOp;'} }\n`;
      };
      m.customProgramCacheKey = () => 'scrOp|' + (m0.customProgramCacheKey ? m0.customProgramCacheKey() : '');
      m.userData.baseTransparent = m0.transparent; m.userData.baseDepthWrite = m0.depthWrite; m.userData.baseRO = o.renderOrder;
      o.material = m; mats.push([o, m]);
    });
    return { u, mats, faded: false };
  }
  function applyOp(o) {
    const F = o.opU; F.u.value = o.op; const fade = o.op < 0.999;
    if (fade === F.faded) return; F.faded = fade;
    for (const [mesh, m] of F.mats) {
      m.transparent = fade || m.userData.baseTransparent; m.depthWrite = fade ? false : m.userData.baseDepthWrite;
      mesh.renderOrder = fade ? 45 + (m.userData.baseRO || 0) : m.userData.baseRO; m.needsUpdate = true;
    }
  }

  // ---------- geometry helpers (all identical for every room) ----------
  function extents(o, st) {   // min/max of the sample points in room-local space
    const { y, r } = o.geo, c = Math.cos(st.t), s = Math.sin(st.t);
    const py = y + st.dy, pz = -r + st.dz; let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, w = 0;
    for (const [x, yy, zz] of o.pts) {
      const X = st.s * x, Y = py + st.s * (yy * c - zz * s), Z = pz + st.s * (yy * s + zz * c);
      y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z); w = Math.max(w, Math.hypot(X, Z));
    }
    return { y0, y1, z0, z1, w };
  }
  const EPS = 1e-4;
  function valid(o, st) {
    for (const [k, v] of Object.entries(LIM)) if (st[k] < v[0] - 1e-6 || st[k] > v[1] + 1e-6) return false;
    const e = extents(o, st);
    return e.y0 >= BAY.floor - EPS && e.y1 <= BAY.ceil + EPS && e.z0 >= BAY.back - EPS && e.z1 <= BAY.front + EPS && e.w <= BAY.wall + EPS;
  }
  // nudge height and/or distance just enough to fit the bay
  function fit(o, p, dims) {
    const e = extents(o, p);
    if (dims.includes('dy')) { if (e.y0 < BAY.floor) p.dy += BAY.floor - e.y0; else if (e.y1 > BAY.ceil) p.dy -= e.y1 - BAY.ceil; }
    if (dims.includes('dz')) {
      if (e.z0 < BAY.back) p.dz += BAY.back - e.z0; else if (e.z1 > BAY.front) p.dz -= e.z1 - BAY.front;
      for (let k = 0; k < 80 && extents(o, p).w > BAY.wall && p.dz < LIM.dz[1]; k++) p.dz += 0.025;   // bigger screens step out from the curved wall
    }
    p.dy = +p.dy.toFixed(4); p.dz = +Math.max(LIM.dz[0], p.dz).toFixed(4);
    return p;
  }
  const KEYOF = { up: 'dy', down: 'dy', closer: 'dz', farther: 'dz', bigger: 's', smaller: 's', 'tilt+': 't', 'tilt-': 't' };
  const UPS = new Set(['up', 'closer', 'bigger', 'tilt+']);
  function tryMove(o, act) {
    const k = KEYOF[act]; if (!k) return null;
    const base = o.tgt, p = { ...base };
    p[k] = +Math.min(LIM[k][1], Math.max(LIM[k][0], base[k] + (UPS.has(act) ? 1 : -1) * STEP[k])).toFixed(4);
    // a step that would pass the floor, ceiling or the ends of the bay stops exactly there
    fit(o, p, k === 'dy' ? ['dy'] : k === 'dz' ? ['dz'] : ['dy', 'dz']);
    if (k === 'dy' && (UPS.has(act) ? p.dy <= base.dy + 1e-4 : p.dy >= base.dy - 1e-4)) return null;
    if (k === 'dz' && (UPS.has(act) ? p.dz <= base.dz + 1e-4 : p.dz >= base.dz - 1e-4)) return null;
    return valid(o, p) ? p : null;
  }
  // restore saved settings (older saves are clamped and fitted into the bay)
  M.forEach((o, i) => {
    const sv = saved && saved[i];
    if (sv && ['dy', 'dz', 's', 't'].every((k) => typeof sv[k] === 'number' && isFinite(sv[k]))) {
      const p = {}; for (const k of Object.keys(LIM)) p[k] = Math.min(LIM[k][1], Math.max(LIM[k][0], sv[k]));
      fit(o, p, ['dy', 'dz']); o.tgt = valid(o, p) ? p : { ...DEF };
    }
    if (sv && typeof sv.op === 'number') { const j = OPS.findIndex((v) => Math.abs(v - sv.op) < 0.051); o.opI = j >= 0 ? j : 0; }
    o.op = OPS[o.opI];
    o.cur = { ...o.tgt };
  });

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(M.map((o) => ({ ...o.tgt, op: OPS[o.opI] })))); } catch { /* ignore */ } };
  function act(id, i) {
    const o = M[i]; if (!o) return;
    const a = id.slice(2);
    if (a === 'reset') { o.tgt = { ...DEF }; o.opI = 0; o.msg = ''; }
    else if (a === 'op-' || a === 'op+') { const j = o.opI + (a === 'op-' ? 1 : -1);
      if (j < 0 || j >= OPS.length) { o.flash = 1.2; o.msg = 'LIMIT REACHED'; } else { o.opI = j; o.msg = ''; } }
    else { const n = tryMove(o, a); if (n) { o.tgt = n; o.msg = ''; } else { o.flash = 1.2; o.msg = a === 'down' ? 'ON THE FLOOR' : 'LIMIT REACHED'; } }
    save(); onChange(i);
  }

  const q = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const place = (mesh, x, y0, y1, z) => { const len = y1 - y0; mesh.visible = len > 0.04; mesh.position.set(x, (y0 + y1) / 2, z); mesh.scale.set(1, Math.max(0.01, len), 1); };
  function apply(o) {
    const c = o.cur, { y, r } = o.geo;
    o.mount.position.set(0, y + c.dy, -r + c.dz); o.mount.scale.setScalar(c.s); o.mount.rotation.set(c.t, 0, 0);
    const atHome = Math.abs(c.dy) < 0.02 && Math.abs(c.dz) < 0.02 && Math.abs(c.s - 1) < 0.01 && Math.abs(c.t) < 0.01;
    o.brackets.forEach((b) => { b.visible = atHome; });
    o.mount.updateMatrix();
    // hang from the ceiling while the screen is nearer the ceiling than the floor; otherwise stand on two small feet
    const e = extents(o, c), low = e.y0 < BAY.ceil + 0.03 - e.y1;
    for (const s of o.sup) {
      q.copy(s.top).applyMatrix4(o.mount.matrix);
      if (!low && !atHome) place(s.rod, q.x, q.y, 7.99, q.z); else s.rod.visible = false;
      q.copy(s.bot).applyMatrix4(o.mount.matrix);
      if (low) { place(s.leg, q.x, 0.02, q.y, q.z); s.foot.visible = s.leg.visible; s.foot.position.set(q.x, 0.02, q.z); }
      else { s.leg.visible = false; s.foot.visible = false; }
    }
    o.root.updateMatrixWorld(true);
    o.monPos.set(0, y + c.dy, -r + c.dz + 0.3); o.root.localToWorld(o.monPos);
  }
  M.forEach(apply); M.forEach(applyOp);
  function update(dt) {
    const k = 1 - Math.exp(-dt * 4.5);
    M.forEach((o, i) => {
      let moving = false;
      for (const key of ['dy', 'dz', 's', 't']) { const d = o.tgt[key] - o.cur[key]; if (Math.abs(d) > 1e-4) { o.cur[key] += d * k; moving = true; } else o.cur[key] = o.tgt[key]; }
      if (moving) apply(o);
      const ot = OPS[o.opI], od = ot - o.op; if (Math.abs(od) > 1e-3) { o.op += od * k; applyOp(o); } else if (o.op !== ot) { o.op = ot; applyOp(o); }
      if (o.flash > 0) { o.flash -= dt; if (o.flash <= 0) { o.msg = ''; onChange(i); } }
    });
  }
  // readouts: bottom-edge height and distance, each with the range available at the current size and tilt
  function ranges(o, t) {
    const e = extents(o, t), hiB = e.y0 + (BAY.ceil - e.y1);
    // z extents move one-for-one with the distance; the wall limit shrinks as the screen comes forward (bisection)
    const e0 = extents(o, { ...t, dz: 0 });
    let dz0 = Math.max(LIM.dz[0], BAY.back - e0.z0), dz1 = Math.min(LIM.dz[1], BAY.front - e0.z1);
    if (extents(o, { ...t, dz: dz0 }).w > BAY.wall + EPS) { let a = dz0, b = dz1; for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (extents(o, { ...t, dz: m }).w > BAY.wall) a = m; else b = m; } dz0 = b; }
    if (dz1 < dz0) dz1 = dz0;
    return { bottom: e.y0, hiB, dz0, dz1 };
  }
  const deg = (v) => (v > 0.001 ? '+' : v < -0.001 ? '−' : '') + Math.abs(Math.round(v * 180 / Math.PI)) + '°';
  const view = (i) => { const o = M[i], t = o.tgt, R = ranges(o, t);
    return { height: Math.max(0, R.bottom).toFixed(2) + ' m', dist: (t.dz >= 0.005 ? '+' : '') + t.dz.toFixed(2) + ' m', size: Math.round(t.s * 100) + '%', tilt: deg(t.t), opacity: Math.round(OPS[o.opI] * 100) + '%', hOpacity: `${Math.round(OPS[OPS.length - 1] * 100)} – 100%`,
      hHeight: `FLOOR 0.00 – ${R.hiB.toFixed(2)} m`, hDist: `${R.dz0.toFixed(2)} – ${R.dz1.toFixed(2)} m`, hSize: `${Math.round(LIM.s[0] * 100)} – ${Math.round(LIM.s[1] * 100)}%`, hTilt: `${deg(LIM.t[0])} – ${deg(LIM.t[1])}`,
      msg: o.msg, home: Math.abs(t.dy) + Math.abs(t.dz) + Math.abs(t.s - 1) + Math.abs(t.t) < 1e-3 && o.opI === 0 }; };
  return { act, update, view, M, BAY, valid: (i, st) => valid(M[i], st), extents: (i, st) => extents(M[i], st || M[i].tgt),
    op: (i) => M[i].op, set: (i, st) => { M[i].tgt = { ...st }; M[i].cur = { ...st }; apply(M[i]); save(); onChange(i); } };
}
