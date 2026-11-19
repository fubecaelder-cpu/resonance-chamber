// v39 flex chains: hair, cape-like sheets, wings and loose chains rigged by charrig (bones Flex_<kind>_<name>_<k>_<j>, tip _T).
// Each chain is a string of points pinned at its root bone; per frame (fixed substeps) every point is pulled toward its
// animated target shape (rest pose + ambient wind/breathing/flap with per-chain and per-segment phase), by gravity (world down,
// so hair hangs whatever the head does), with absolute drag (trails and billows when she walks or turns) and relative damping
// chosen above critical (settles softly, no jelly). Segment lengths are kept exactly; points are pushed out of the body
// capsules (radii from the rig's extras) and kept above the floor. Bones are then swung onto the points, root to tip.
import { THREE } from './shared.js?v=39f';
export const FLEX_KINDS = {
  //       stiffness  gravity  rel.damp abs.drag  ambient deg  ambient Hz  momentum sweep deg
  hair:  { K: 3,  G: 9.8, CR: 0,  CA: 4.2, AMB: 5,  HZ: 0.22, SWEEP: 18, FLAP: 0, WIND: 0.25, LEASH: 0, DEC: 0 },
  cape:  { K: 90, G: 4.0, CR: 10, CA: 1.0, AMB: 1.5, HZ: 0.3, SWEEP: 0,  FLAP: 0, WIND: 0.05, LEASH: 0.07, DEC: 0 },   // v39d: long hair sheets hang calm (sharp-turn sweep 14 -> 5 deg): stiff, little drag, leash 0.07 rad; DEC = optional decoupling from the parent bone (0 = off)
  wing:  { K: 60, G: 0,   CR: 15, CA: 2.0, AMB: 12, HZ: 0.33, SWEEP: 30, FLAP: 16, WIND: 0, TUCK: 10 },
  chain: { K: 0,  G: 9.8, CR: 0,  CA: 6.5, AMB: 0,  HZ: 0,    SWEEP: 0,  FLAP: 0, WIND: 0, LEASH: 0 },
};
const COLL = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: null, LeftUpLeg: 'LeftLeg', RightUpLeg: 'RightLeg', LeftLeg: 'LeftFoot', RightLeg: 'RightFoot', LeftArm: 'LeftForeArm', RightArm: 'RightForeArm', LeftForeArm: 'LeftHand', RightForeArm: 'RightHand' };
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
export function createFlex(model, opts = {}) {
  let armNode = null; model.traverse((o) => { if (!armNode && o.userData && o.userData.flex) armNode = o; });
  const meta = armNode ? (typeof armNode.userData.flex === 'string' ? JSON.parse(armNode.userData.flex) : armNode.userData.flex) : { chains: {}, colliders: {} };
  const bones = {}; model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const groups = {};
  for (const [nm, b] of Object.entries(bones)) { const m = /^(Flex_[A-Za-z]+_[A-Za-z0-9]+_\d+)_(\d+|T)$/.exec(nm); if (m) (groups[m[1]] = groups[m[1]] || {})[m[2]] = b; }
  const q = opts.params || new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  model.updateMatrixWorld(true);
  const armQ = Q(); (armNode || model).getWorldQuaternion(armQ); const armQi = armQ.clone().invert();
  const chains = [];
  for (const [key, g] of Object.entries(groups)) {
    const n = Object.keys(g).filter((k) => k !== 'T').length; if (!n || !g.T) continue;
    const list = []; for (let j = 1; j <= n; j++) list.push(g[j]);
    const m = meta.chains[key] || {}; const kind = (/^Flex_([a-z]+)_/i.exec(key) || [])[1] || 'hair';
    const P = Object.assign({}, FLEX_KINDS[kind] || FLEX_KINDS.hair);
    for (const k of Object.keys(P)) { if (m[k] !== undefined) P[k] = +m[k]; const v = q.get && q.get('flex_' + kind + '_' + k.toLowerCase()); if (v !== null && v !== undefined && v !== '' && !isNaN(+v)) P[k] = +v; }
    const segs = list.map((b, j) => { const child = j < n - 1 ? list[j + 1] : g.T; const wq = Q(); b.getWorldQuaternion(wq); const rq = armQi.clone().multiply(wq).invert();
      return { b, child, q0: b.quaternion.clone(), axis: child.position.clone().normalize(), ax: new THREE.Vector3(1, 0, 0).applyQuaternion(rq), ay: new THREE.Vector3(0, 1, 0).applyQuaternion(rq), az: new THREE.Vector3(0, 0, 1).applyQuaternion(rq) }; });
    chains.push({ key, kind, P, segs, k: m.k || 0, nk: m.n || 1, side: m.side || 1, p: null, v: null, T: null, Tp: null, ph: (m.k || 0) * 0.9 + (m.side > 0 ? 0 : 1.7) });
  }
  let hipsB = null; for (const [nm, b] of Object.entries(bones)) if (!hipsB && /Spine2$/.test(nm)) hipsB = b; if (!hipsB) for (const [nm, b] of Object.entries(bones)) if (!hipsB && /Hips$/.test(nm)) hipsB = b;
  const restQ = (b) => { const q0 = Q(); b.getWorldQuaternion(q0); return q0; }; const hips0 = hipsB ? restQ(hipsB) : null;
  for (const c of chains) { const par = c.segs[0].b.parent; c.par = par; c.par0 = par ? restQ(par) : null; }
  const pairs = []; for (const a of chains) for (const b of chains) if (a !== b && a.key.replace(/_\d+$/, '') === b.key.replace(/_\d+$/, '') && b.k === a.k + 1) pairs.push([a, b]);
  const coll = []; for (const [nm, r] of Object.entries(meta.colliders || {})) if (bones[nm]) coll.push({ a: bones[nm], b: COLL[nm] ? bones[COLL[nm]] : null, r });
  const st = { mom: 0, last: null, yaw: null, turn: 0, gust: 0, enabled: !(q.get && q.get('mooflex') === '0') };
  const t1 = V(), t2 = V(), t3 = V(), wq = Q(), pq = Q(), sw = Q(), aq = Q(), down = new THREE.Vector3(0, -1, 0);
  function targets(c, t, mom, sc) {
    const P = c.P, om = 2 * Math.PI * P.HZ, d2r = Math.PI / 180, n = c.segs.length;
    c.segs.forEach((s, j) => { const f = (j + 1) / n; s.b.quaternion.copy(s.q0);
      if (c.kind === 'wing') {
        const ph = om * t + c.ph - 0.55 * j, A = P.AMB * d2r * (0.35 + 0.65 * f);
        s.b.quaternion.multiply(aq.setFromAxisAngle(s.az, c.side * (P.FLAP * d2r * (0.3 + 0.7 * f) / n * 2) * Math.sin(ph) - c.side * (P.TUCK || 0) * d2r * mom / n));
        s.b.quaternion.multiply(aq.setFromAxisAngle(s.ay, c.side * (A / n * 2 * Math.sin(0.5 * ph + 0.8) + P.SWEEP * d2r * mom / n)));
      } else if (P.AMB || P.SWEEP) {
        const ph = om * t - 0.7 * j + c.k * 0.8 + c.ph, gust = 0.55 + 0.45 * st.gust;
        s.b.quaternion.multiply(aq.setFromAxisAngle(s.ax, (P.AMB * gust * f * Math.sin(ph) + P.SWEEP * mom) * d2r / n));
        s.b.quaternion.multiply(aq.setFromAxisAngle(s.az, 0.4 * P.AMB * gust * f * Math.sin(0.7 * ph + 1.3) * d2r / n));
      } });
    c.segs[0].b.updateMatrixWorld(true);
    const T = c.segs.map((s) => V().setFromMatrixPosition(s.b.matrixWorld)); T.push(V().setFromMatrixPosition(c.segs[n - 1].child.matrixWorld));
    if (P.DEC && hipsB && c.par && c.par0) {   // v39d: rotate the target shape about its root by part of (hips motion - parent motion): long hair follows the body, not every head bob
      const qp = restQ(c.par).multiply(c.par0.clone().invert()), qb = restQ(hipsB).multiply(hips0.clone().invert());
      const qd = Q().slerp(qb.multiply(qp.invert()), Math.min(1, P.DEC)); for (let j = 1; j < T.length; j++) T[j].sub(T[0]).applyQuaternion(qd).add(T[0]); }
    c.len = T.slice(1).map((p, j) => p.distanceTo(T[j])); return T;
  }
  function collide(p, sc, floorY) {
    for (const c of coll) { const a = t1.setFromMatrixPosition(c.a.matrixWorld), r = c.r * sc + 0.012;
      let cp; if (c.b) { const b = t2.setFromMatrixPosition(c.b.matrixWorld), ab = t3.subVectors(b, a); const tt = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); cp = a.clone().addScaledVector(ab, tt); } else cp = a.clone().add(t2.set(0, r * 0.5, 0));
      const d = p.distanceTo(cp); if (d < r) { if (d < 1e-6) p.y += r; else p.sub(cp).multiplyScalar(r / d).add(cp); } }
    if (floorY !== undefined && p.y < floorY + 0.01) p.y = floorY + 0.01;
  }
  function update(dt, t, ctx = {}) {
    if (!st.enabled || !chains.length || !(dt > 0)) return;
    dt = Math.min(dt, 0.05); model.updateMatrixWorld(true);
    const sc = (armNode || model).getWorldScale(t1).x;
    const pos = V().setFromMatrixPosition((armNode || model).matrixWorld); (armNode || model).getWorldQuaternion(wq);
    const fwd = V().set(0, 0, 1).applyQuaternion(wq), yaw = Math.atan2(fwd.x, fwd.z);
    let spd = 0, tr = 0; if (st.last) { spd = Math.hypot(pos.x - st.last.x, pos.z - st.last.z) / dt; let dy = yaw - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); tr = Math.abs(dy) / dt; }
    const jump = st.last && pos.distanceTo(st.last) > 1.0; st.last = pos.clone(); st.yaw = yaw;
    const mt = Math.min(1, Math.max(spd / 1.1, tr / 2.5)); st.mom += (mt - st.mom) * (1 - Math.exp(-dt / (mt > st.mom ? 0.35 : 0.9)));
    st.gust = 0.5 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.91 + 1.1) + 0.2 * Math.sin(t * 1.73 + 2.3);
    const floorY = ctx.floorY !== undefined ? ctx.floorY : (model.parent ? V().setFromMatrixPosition(model.parent.matrixWorld).y : 0);
    const wind0 = V().set(Math.sin(t * 0.23) * 0.4, 0, -1).applyQuaternion(wq);
    for (const c of chains) { c.T = targets(c, t, st.mom, sc); if (!c.p || jump) { c.p = c.T.map((p) => p.clone()); c.v = c.T.map(() => V()); c.Tp = c.T.map((p) => p.clone()); } }
    const nsub = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / nsub;
    for (let s = 0; s < nsub; s++) {
      for (const c of chains) {
        const T = c.T, n = c.segs.length, P = c.P, wind = t3.copy(wind0).multiplyScalar(P.WIND * (0.6 + 0.4 * st.gust)).clone();
        const a = (s + 1) / nsub; c.p[0].lerpVectors(c.Tp[0], T[0], a);
        for (let j = 1; j <= n; j++) {
          const p = c.p[j], v = c.v[j], tg = t2.lerpVectors(c.Tp[j], T[j], a), vt = t3.subVectors(T[j], c.Tp[j]).divideScalar(dt);
          const acc = V().subVectors(tg, p).multiplyScalar(P.K).addScaledVector(down, P.G).add(wind).addScaledVector(v, -P.CA).addScaledVector(t1.subVectors(v, vt), -P.CR);
          const prev = p.clone(); v.addScaledVector(acc, h); p.addScaledVector(v, h);
          const L = c.len[j - 1], d = p.distanceTo(c.p[j - 1]); if (d > 1e-9) p.sub(c.p[j - 1]).multiplyScalar(L / d).add(c.p[j - 1]);
          collide(p, sc, floorY); const d2 = p.distanceTo(c.p[j - 1]); if (d2 > 1e-9) p.sub(c.p[j - 1]).multiplyScalar(L / d2).add(c.p[j - 1]);
          c.prev = c.prev || []; c.prev[j] = prev;
        }
      }
      // sheets (cape-like hair, wing feathers): neighbouring chains keep their target spacing (+-15%) so the sheet never tears or crosses
      for (const pr of pairs) { const A = pr[0], B = pr[1];
        for (let j = 1; j < A.p.length && j < B.p.length; j++) { const r0 = A.T[j].distanceTo(B.T[j]), d = A.p[j].distanceTo(B.p[j]); const lo = r0 * 0.85, hi = r0 * 1.15;
          if (d > 1e-9 && (d < lo || d > hi)) { const want = d < lo ? lo : hi, corr = t1.subVectors(B.p[j], A.p[j]).multiplyScalar((d - want) / d * 0.5); A.p[j].add(corr); B.p[j].sub(corr); } } }
      for (const c of chains) { const n = c.segs.length;
        for (let j = 1; j <= n; j++) { const p = c.p[j], L = c.len[j - 1]; let d = p.distanceTo(c.p[j - 1]); if (d > 1e-9) p.sub(c.p[j - 1]).multiplyScalar(L / d).add(c.p[j - 1]);
          if (c.P.LEASH) { const td = t1.subVectors(c.T[j], c.T[j - 1]).normalize(), sd = t2.subVectors(p, c.p[j - 1]).normalize(), ang = td.angleTo(sd);   // v39c: max swing away from the animated pose
            if (ang > c.P.LEASH) { const q0 = Q().setFromUnitVectors(td, sd), qa = Q().slerp(q0, c.P.LEASH / ang); p.copy(td.applyQuaternion(qa).multiplyScalar(L).add(c.p[j - 1])); } }
          if (c.kind !== 'wing') collide(p, sc, floorY); d = p.distanceTo(c.p[j - 1]); if (d > 1e-9) p.sub(c.p[j - 1]).multiplyScalar(L / d).add(c.p[j - 1]);
          c.v[j].subVectors(p, c.prev[j]).divideScalar(h); } }
    }
    for (const c of chains) { const T = c.T;
      c.Tp = T.map((p) => p.clone());
      // swing bones onto the points, root to tip (bone quats still hold the ambient target rotation)
      c.segs[0].b.parent.getWorldQuaternion(pq);
      c.segs.forEach((s, j) => { wq.multiplyQuaternions(pq, s.b.quaternion); const cur = t1.copy(s.axis).applyQuaternion(wq), des = t2.subVectors(c.p[j + 1], c.p[j]).normalize();
        sw.setFromUnitVectors(cur, des); const nw = Q().multiplyQuaternions(sw, wq); s.b.quaternion.copy(pq.clone().invert().multiply(nw)); pq.copy(nw); });
      c.segs[0].b.updateMatrixWorld(true);
    }
  }
  return { chains, coll, st, update, info: () => ({ n: chains.length, kinds: chains.map((c) => c.kind), mom: +st.mom.toFixed(2) }) };
}
