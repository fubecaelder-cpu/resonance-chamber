// v9: movable main monitors. Each room's monitor hangs in a mount group pivoting at the screen centre; the SCREEN wing of
// the control panel moves it up/down, closer/farther (along the room axis, towards the arrival area), bigger/smaller and
// tilts it. Targets are checked against the room (walls, ceiling ribs/beams/rings, portal, chandelier/gyroscope/op-art
// rings, side pylons, pod tops, balcony) before they are accepted; the mount then eases to the target.
// Settings are per room and saved in localStorage.
import { THREE } from './shared.js';

const KEY = 'resonanceChamber.screens.v1';
export const DEF = { dy: 0, dz: 0, s: 1, t: 0 };
export const LIM = { dy: [-3.5, 1.0], dz: [0, 3.6], s: [0.6, 1.8], t: [-10 * Math.PI / 180, 30 * Math.PI / 180] };
const STEP = { dy: 0.25, dz: 0.4, s: 0.1, t: 5 * Math.PI / 180 };
const WALL = 6.9, FLOOR = 3.6, TOP = 7.97;
const lerp = (a, b, t) => a + (b - a) * t;
const prof = (pts, d) => { if (d <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (d <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (d - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])); return pts[pts.length - 1][1]; };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// room-local obstacles (x, y, z boxes), measured from the built scenes
const ROOMS = {
  pink: {
    boxes: [
      [-3.85, -2, -7.5, 3.85, 5.85, -6.15],     // portal bezels, neon rings and petal halo
      [-3.75, 0, -6.18, -2.85, 6.45, -5.27], [2.85, 0, -6.18, 3.75, 6.45, -5.27],   // side pylons
      [-2.6, 4.7, -3.45, 2.6, 8.2, 1.6],        // crown chandelier (rings, bead strands, drops)
    ],
    ceil(x, z) {   // fan-vault ribs (the two over the monitor are left out)
      const d = Math.hypot(x, z), a = Math.atan2(x, z); let c = TOP;
      for (let i = 0; i < 16; i++) { if (i === 7 || i === 8) continue; const da = angDiff(a, ((i + 0.5) / 16) * Math.PI * 2);
        if (Math.abs(da) < Math.PI / 2 && d * Math.abs(Math.sin(da)) < 0.32) c = Math.min(c, prof([[1.3, 7.97], [3.4, 7.9], [5.4, 7.6], [6.82, 7.05]], d) - 0.17); }
      if (d < 2.7) c = Math.min(c, 7.65);
      return c;
    },
    extra(x, y, z) {   // balcony band on the side walls (gap of ±0.39 rad around the focal wall)
      const d = Math.hypot(x, z), a = Math.abs(angDiff(Math.atan2(x, z), Math.PI));
      return !(d > 6.3 && y > 4.4 && y < 5.05 && a > 0.37);
    },
  },
  crimson: {
    boxes: [
      [-3.75, -2, -7.5, 3.75, 6.25, -6.05],     // vortex rings, chase lights and frame
      [-3.75, 0, -6.18, -2.85, 6.45, -5.27], [2.85, 0, -6.18, 3.75, 6.45, -5.27],   // side pylons
      [-2.75, 5.0, -2.35, 2.75, 7.45, 3.0],     // hanging gyroscope rings
    ],
    ceil(x, z) {   // radial ceiling beams (the ones over the monitor are left out) and the centre ring
      const d = Math.hypot(x, z), a = Math.atan2(x, z); let c = TOP;
      if (d > 2.2) for (let i = 0; i < 24; i++) { const b = (i / 24) * Math.PI * 2; if (Math.abs(b - Math.PI) < 0.6) continue;
        const da = angDiff(a, b); if (Math.abs(da) < Math.PI / 2 && d * Math.abs(Math.sin(da)) < 0.3) c = Math.min(c, 7.55); }
      if (d < 2.9) c = Math.min(c, 7.6);
      return c;
    },
  },
  mono: {
    boxes: [
      [-2.5, -1, -7.5, 2.5, 6.8, -6.58],        // spiral disc and its rings above the tunnel
      [-2.5, -1, -7.5, 2.5, 4.2, -6.3],         // tunnel rings
      [-2.85, 5.0, -2.4, 2.85, 7.4, 3.0],       // floating op-art rings
    ],
    ceil(x, z) { return Math.hypot(x, z) < 2.4 ? 7.65 : TOP; },
  },
};

export function createScreens({ monitors, onChange = () => {} }) {
  let why = '';
  // monitors: [{ kind: 'pink'|'crimson'|'mono', mount, brackets, geo: {r, y, h, half}, root, kit, monPos: Vector3 }]
  let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  const M = monitors.map((m, i) => {
    const room = ROOMS[m.kind], { r, y, h, half } = m.geo;
    // sample points in the mount's own frame (pivot at the screen centre): glass, the frame tubes in front, the back plate behind
    const pts = [];
    for (let iu = 0; iu <= 14; iu++) { const ph = -half - 0.03 + ((2 * half + 0.06) * iu) / 14;
      for (let iv = 0; iv <= 6; iv++) { const yy = (-1 + iv / 3) * (h / 2 + 0.08);
        for (const rr of [r - 0.12, r, r + 0.1]) pts.push([-rr * Math.sin(ph), yy, r - rr * Math.cos(ph)]); } }
    // suspension rods from the screen top to the ceiling (they stretch as the screen moves)
    const rodMat = m.kit.metalMat();
    const rods = [-1, 1].map((sg) => { const rd = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 6), rodMat); rd.userData.noMirror = true; m.mount.parent.add(rd);
      const ph = sg * half * 0.6; return { mesh: rd, p: new THREE.Vector3(-r * Math.sin(ph), h / 2 + 0.1, r - r * Math.cos(ph)) }; });
    const st = { ...DEF };
    const sv = saved && saved[i];
    if (sv && ['dy', 'dz', 's', 't'].every((k) => typeof sv[k] === 'number' && isFinite(sv[k]))) Object.assign(st, sv);
    const o = { ...m, room, pts, rods, tgt: st, cur: { ...DEF }, flash: 0, msg: '' };
    if (!valid(o, st)) o.tgt = { ...DEF };
    o.cur = { ...o.tgt };
    return o;
  });

  const q = new THREE.Vector3();
  function valid(o, st) {
    const { y, r } = o.geo, c = Math.cos(st.t), s = Math.sin(st.t);
    for (const [k, v] of Object.entries(LIM)) if (st[k] < v[0] - 1e-6 || st[k] > v[1] + 1e-6) return false;
    const px = 0, py = y + st.dy, pz = -r + st.dz;
    for (const [x0, y0, z0] of o.pts) {
      const x = px + st.s * x0, yy = py + st.s * (y0 * c - z0 * s), z = pz + st.s * (y0 * s + z0 * c);
      if (Math.hypot(x, z) > WALL || yy < FLOOR || yy > o.room.ceil(x, z)) { why = `wall/floor/ceil ${x.toFixed(2)},${yy.toFixed(2)},${z.toFixed(2)}`; return false; }
      for (const b of o.room.boxes) if (x > b[0] && x < b[3] && yy > b[1] && yy < b[4] && z > b[2] && z < b[5]) { why = `box ${b} at ${x.toFixed(2)},${yy.toFixed(2)},${z.toFixed(2)}`; return false; }
      if (o.room.extra && !o.room.extra(x, yy, z)) { why = 'extra'; return false; }
    }
    return true;
  }
  // which other values may be nudged to make a requested move fit (e.g. lowering near the portal first brings it forward)
  const REPAIR = { 'up': [['dz', -1]], 'down': [['dz', 1]], 'closer': [['dy', -1]], 'farther': [['dy', 1]],
    'bigger': [['dz', 1], ['dy', 0]], 'smaller': [['dy', 0]], 'tilt+': [['dz', 1], ['dy', 0]], 'tilt-': [['dz', 1], ['dy', 0]] };
  function tryMove(o, act) {
    const base = o.tgt, p = { ...base };
    const k = act === 'up' || act === 'down' ? 'dy' : act === 'closer' || act === 'farther' ? 'dz' : act === 'bigger' || act === 'smaller' ? 's' : 't';
    const sg = act === 'up' || act === 'closer' || act === 'bigger' || act === 'tilt+' ? 1 : -1;
    for (const f of [1, 0.6, 0.3]) {
      p[k] = +Math.min(LIM[k][1], Math.max(LIM[k][0], base[k] + sg * STEP[k] * f)).toFixed(4);
      if (Math.abs(p[k] - base[k]) < 1e-6) break;
      if (valid(o, p)) return p;
      // repair: nearest fit, nudging only the allowed values
      const dims = REPAIR[act] || [], cand = [];
      const span = dims.length === 1 ? 0.8 : 1.5;
      const range = (dir) => { const a = []; for (let v = 0; v <= span + 1e-9; v += 0.1) { if (dir >= 0) a.push(v); if (dir <= 0 && v > 0) a.push(-v); } return dir === 0 ? a : a.filter((v) => Math.sign(v) === dir || v === 0); };
      if (dims.length === 1) for (const a of range(dims[0][1])) cand.push([[dims[0][0], a]]);
      else if (dims.length === 2) for (const a of range(dims[0][1])) for (const b of range(dims[1][1])) cand.push([[dims[0][0], a], [dims[1][0], b]]);
      cand.sort((A, B) => A.reduce((s, [, v]) => s + Math.abs(v), 0) - B.reduce((s, [, v]) => s + Math.abs(v), 0));
      for (const cd of cand) { const t = { ...p }; for (const [d, v] of cd) t[d] = +(base[d] + v).toFixed(3); if (valid(o, t)) return t; }
    }
    return null;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(M.map((o) => o.tgt))); } catch { /* ignore */ } };
  function act(id, i) {
    const o = M[i]; if (!o) return;
    const a = id.slice(2);
    if (a === 'reset') { o.tgt = { ...DEF }; o.msg = ''; }
    else { const n = tryMove(o, a); if (n) { o.tgt = n; o.msg = ''; } else { o.flash = 1.2; o.msg = 'LIMIT REACHED'; } }
    save(); onChange(i);
  }
  function apply(o) {
    const c = o.cur, { y, r } = o.geo;
    o.mount.position.set(0, y + c.dy, -r + c.dz); o.mount.scale.setScalar(c.s); o.mount.rotation.set(c.t, 0, 0);
    const atHome = Math.abs(c.dy) < 0.02 && Math.abs(c.dz) < 0.02 && Math.abs(c.s - 1) < 0.01 && Math.abs(c.t) < 0.01;
    o.brackets.forEach((b) => { b.visible = atHome; });
    o.mount.updateMatrix();
    for (const rd of o.rods) {   // rod from the screen top straight up to the ceiling
      q.copy(rd.p).applyMatrix4(o.mount.matrix);
      const top = 7.99, len = top - q.y; rd.mesh.visible = len > 0.04;
      rd.mesh.position.set(q.x, (q.y + top) / 2, q.z); rd.mesh.scale.set(1, Math.max(0.01, len), 1);
    }
    o.root.updateMatrixWorld(true);
    o.monPos.set(0, y + c.dy, -r + c.dz + 0.3); o.root.localToWorld(o.monPos);
  }
  M.forEach(apply);
  let msgT = 0;
  function update(dt) {
    const k = 1 - Math.exp(-dt * 4.5);
    M.forEach((o, i) => {
      let moving = false;
      for (const key of ['dy', 'dz', 's', 't']) { const d = o.tgt[key] - o.cur[key]; if (Math.abs(d) > 1e-4) { o.cur[key] += d * k; moving = true; } else o.cur[key] = o.tgt[key]; }
      if (moving) apply(o);
      if (o.flash > 0) { o.flash -= dt; if (o.flash <= 0) { o.msg = ''; onChange(i); } }
    });
    msgT += dt;
  }
  const view = (i) => { const o = M[i], t = o.tgt;
    return { height: (o.geo.y + t.dy).toFixed(1) + ' m', dist: (t.dz >= 0.005 ? '+' : '') + t.dz.toFixed(1) + ' m', size: Math.round(t.s * 100) + '%',
      tilt: (t.t > 0.001 ? '+' : '') + Math.round(t.t * 180 / Math.PI) + '°', msg: o.msg, home: Math.abs(t.dy) + Math.abs(t.dz) + Math.abs(t.s - 1) + Math.abs(t.t) < 1e-3 }; };
  return { act, update, view, M, valid: (i, st) => valid(M[i], st), why: () => why, set: (i, st) => { M[i].tgt = { ...st }; M[i].cur = { ...st }; apply(M[i]); save(); onChange(i); } };
}
