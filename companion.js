// v31: Miss Moo companion mode. She follows the player through every room and corridor at a comfortable 2-3.5 m,
// never closer than ~1.5 m, backs off / sidesteps when approached, reroutes through doorways, catches up or quietly
// reappears behind the player after a teleport, and does small playful things every 6-15 s. Cheap per-frame steering:
// seek + obstacle repulsion, then clamping to her own (narrower than the player's) walkable area so she never clips walls.
// Works with any figure: it only drives cow.place()/cow.update() and a few state fields (hop, lean, tiltAdd, flick, wave).
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

export function createCompanion({ cow, RC, CORRS, corrLocal, zoneOf, CEN, VEIL_R, roomR, obstacles, lookTargets }) {
  const ROOM_R = roomR;                       // per room: her disc radius (narrower than the player's 6.1 m)
  const HALF = 0.38, EXT = 2.4;               // corridor strip for her: centre line ±0.38 m (her tails are wide), overlapping into rooms
  const S = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, spd: 0, inited: false, act: null, actT: 0, next: 0, side: Math.random() < 0.5 ? -1 : 1,
    unseen: 0, pvx: 0, pvz: 0, esc: null, escT: 0, gaze: 0, gazeCool: 0, stuck: 0, lastD: 0, hop: 0, hopT: 0, hopN: 0, lean: 0, leanTo: 0, spin: 0, spinT: 0,
    tiltT: 0, flickT: 0, mode: 'idle', prevHx: null, prevHz: null, pv: 0, faceTo: null, info: '' };
  const corr = Object.fromEntries(CORRS.map((c) => [c.k, c]));
  const corrPt = (c, al, la = 0) => [c.S[0] + al * c.D[0] + la * c.D[1], c.S[1] + al * c.D[1] - la * c.D[0]];
  const corrBetween = (i, j) => CORRS.find((c) => (c.beds[0] === i && c.beds[1] === j) || (c.beds[0] === j && c.beds[1] === i));
  const isC = (z) => z[0] === 'c';
  // ---- her walkable area: room discs + narrow corridor strips
  function nearestIn(k, x, z) {
    if (!isC(k)) { const i = +k[1] - 1, c = RC[i], r = ROOM_R[i], dx = x - c[0], dz = z - c[1], d = Math.hypot(dx, dz); return d <= r ? [x, z] : [c[0] + dx / d * r, c[1] + dz / d * r]; }
    const c = corr[k]; let [al, la] = corrLocal(c, x, z); al = clamp(al, -EXT, c.L + EXT); la = clamp(la, -HALF, HALF); return corrPt(c, al, la);
  }
  const REG = ['r1', 'r2', 'r3', 'r4', ...CORRS.map((c) => c.k)];
  function clampWalk(x, z, only) {
    let best = null, bd = Infinity;
    for (const k of only ? [only] : REG) { const p = nearestIn(k, x, z), d = Math.hypot(p[0] - x, p[1] - z); if (d < 1e-6) return [x, z]; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function pushOut(x, z) {
    for (const o of obstacles) { const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz); if (d < o.r) { const k = d > 1e-4 ? o.r / d : 0; x = o.x + dx * k; z = o.z + (d > 1e-4 ? dz * k : o.r); } }
    return [x, z];
  }
  const free = (x, z) => { const p = pushOut(...clampWalk(x, z)); return Math.hypot(p[0] - x, p[1] - z) < 0.12; };
  const valid = (x, z) => { const p = pushOut(...clampWalk(x, z)); return clampWalk(p[0], p[1]); };
  // ---- routing between zones: returns the next waypoint towards (tx, tz)
  function route(x, z, tx, tz) {
    const zm = zoneOf({ x, z }), zp = zoneOf({ x: tx, z: tz });
    if (zm === zp) return [tx, tz];
    if (!isC(zm)) {
      const ri = +zm[1] - 1; let c;
      if (isC(zp)) { const cp = corr[zp]; if (cp.beds.includes(ri)) c = cp; else { const [al] = corrLocal(cp, tx, tz); c = corrBetween(ri, al < cp.L / 2 ? cp.beds[0] : cp.beds[1]); } }
      else c = corrBetween(ri, +zp[1] - 1);
      const atS = c.beds[0] === ri, [al, la] = corrLocal(c, x, z), aAl = atS ? -(VEIL_R - ROOM_R[ri]) - 0.15 : c.L + (VEIL_R - ROOM_R[ri]) + 0.15;
      // line up on the doorway's centre line first (inside the room), then go through
      const lined = Math.abs(la) < 0.3 && (atS ? al > aAl - 0.4 : al < aAl + 0.4);
      return lined ? corrPt(c, atS ? 1.2 : c.L - 1.2) : corrPt(c, aAl);
    }
    const c = corr[zm], [al] = corrLocal(c, x, z);
    if (isC(zp)) {
      const cp = corr[zp];
      if ((zm === 'cC' && zp === 'cF') || (zm === 'cF' && zp === 'cC')) {   // the diagonals cross at the centre
        const d = Math.hypot(x - CEN[0], z - CEN[1]); return d > 0.6 ? CEN : [tx, tz];
      }
      const shared = c.beds.find((b) => cp.beds.includes(b)); const end = shared !== undefined ? shared : (al < c.L / 2 ? c.beds[0] : c.beds[1]);
      return corrPt(c, end === c.beds[0] ? -EXT + 0.3 : c.L + EXT - 0.3);
    }
    const rj = +zp[1] - 1, end = c.beds.includes(rj) ? rj : (al < c.L / 2 ? c.beds[0] : c.beds[1]);
    return corrPt(c, end === c.beds[0] ? -EXT + 0.3 : c.L + EXT - 0.3);
  }
  // ---- coarse nav grid (built once): BFS distance field towards her goal, refreshed a few times a second.
  // Fixes pockets behind pod rows etc. that pure steering gets wedged in. Cheap: ~30k cells, BFS only on goal change.
  const G = 0.2, X0 = -8, Z0 = -8, N = 180, OK = new Uint8Array(N * N), COMP = new Int32Array(N * N), DIST = new Int32Array(N * N), Q = new Int32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = X0 + (i + 0.5) * G, z = Z0 + (j + 0.5) * G, w = clampWalk(x, z);
    if (Math.hypot(w[0] - x, w[1] - z) > 1e-6) continue; let ok = 1; for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + 0.12) { ok = 0; break; } OK[j * N + i] = ok; }
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let MAIN = 0; { let nc = 0, best = 0; COMP.fill(0);
    for (let c0 = 0; c0 < N * N; c0++) { if (!OK[c0] || COMP[c0]) continue; nc++; let h = 0, t = 0, n = 0; Q[t++] = c0; COMP[c0] = nc;
      while (h < t) { const c = Q[h++]; n++; const ci = c % N, cj = (c / N) | 0; for (const [a, b] of NB) { const ii = ci + a, jj = cj + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const q = jj * N + ii; if (OK[q] && !COMP[q]) { COMP[q] = nc; Q[t++] = q; } } }
      if (n > best) { best = n; MAIN = nc; } } }
  const cellOf = (x, z) => { const i = Math.floor((x - X0) / G), j = Math.floor((z - Z0) / G); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const cx = (c) => X0 + (c % N + 0.5) * G, cz = (c) => Z0 + (((c / N) | 0) + 0.5) * G;
  const good = (c) => c >= 0 && OK[c] && COMP[c] === MAIN;
  function snapCell(x, z) { let c = cellOf(x, z); if (good(c)) return c; let best = -1, bd = 1e9; const ci = Math.floor((x - X0) / G), cj = Math.floor((z - Z0) / G);
    for (let r = 1; r < 14 && best < 0; r++) for (let jj = cj - r; jj <= cj + r; jj++) for (let ii = ci - r; ii <= ci + r; ii++) { if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const q = jj * N + ii; if (!good(q)) continue; const d = Math.hypot(cx(q) - x, cz(q) - z); if (d < bd) { bd = d; best = q; } }
    return best; }
  const reachable = (x, z) => good(cellOf(x, z));
  let navGoal = -1, navT = 0;
  function bfs(goal) { DIST.fill(-1); let h = 0, t = 0; DIST[goal] = 0; Q[t++] = goal;
    while (h < t) { const c = Q[h++], ci = c % N, cj = (c / N) | 0, dc = DIST[c] + 1; for (let k = 0; k < 8; k++) { const ii = ci + NB[k][0], jj = cj + NB[k][1]; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const q = jj * N + ii;
      if (!OK[q] || DIST[q] >= 0) continue; if (k > 3 && (!OK[cj * N + ii] || !OK[jj * N + ci])) continue; DIST[q] = dc; Q[t++] = q; } } }
  function lineFree(x0, z0, x1, z1) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.12); for (let k = 1; k <= n; k++) { const c = cellOf(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n); if (c < 0 || !OK[c]) return false; } return true; }
  function navigate(x, z, gx, gz, dt) {
    if (lineFree(x, z, gx, gz)) return [gx, gz];
    const g = snapCell(gx, gz); if (g < 0) return route(x, z, gx, gz);
    navT -= dt; if (g !== navGoal && (navT <= 0 || navGoal < 0 || Math.hypot(cx(g) - cx(navGoal), cz(g) - cz(navGoal)) > 0.8)) { bfs(g); navGoal = g; navT = 0.35; }
    let c = snapCell(x, z); if (c < 0 || DIST[c] < 0) return route(x, z, gx, gz);
    let pick = c;
    for (let s = 0; s < 18 && DIST[c] > 0; s++) { const ci = c % N, cj = (c / N) | 0; let nb = c;
      for (const [a, b] of NB) { const ii = ci + a, jj = cj + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const q = jj * N + ii; if (DIST[q] >= 0 && DIST[q] < DIST[nb]) nb = q; }
      if (nb === c) break; c = nb; if (lineFree(x, z, cx(c), cz(c))) pick = c; else break; }
    return DIST[pick] === 0 ? [gx, gz] : [cx(pick), cz(pick)];
  }
  function teleportBehind(hx, hz, fx, fz, why) {
    const zp = zoneOf({ x: hx, z: hz }), base = Math.atan2(fx, fz);
    for (const da of [Math.PI, Math.PI * 0.8, -Math.PI * 0.8, Math.PI * 0.65, -Math.PI * 0.65, Math.PI * 0.5, -Math.PI * 0.5]) {
      for (const r of [2.6, 2.0, 3.2]) {
        let [x, z] = pushOut(...clampWalk(hx + Math.sin(base + da) * r, hz + Math.cos(base + da) * r, zp)); [x, z] = clampWalk(x, z);
        const dx = x - hx, dz = z - hz, d = Math.hypot(dx, dz); if (d < 1.7 || !reachable(x, z)) continue;
        const ang = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)); if (ang < 1.75) continue;   // out of view (> ~100° off the gaze)
        S.x = x; S.z = z; S.vx = S.vz = 0; S.yaw = Math.atan2(-dx, -dz); S.act = null; S.info = 'reappeared (' + why + ')'; return true;
      }
    }
    const [x, z] = valid(hx - fx * 2.4, hz - fz * 2.4); S.x = x; S.z = z; S.vx = S.vz = 0; S.info = 'reappeared* (' + why + ')'; return false;
  }
  // ---- playful acts
  const ACTS = { hop: 3, spin: 1.5, tilt: 3, flick: 2.5, wave: 2.5, peek: 2.5, circle: 2, wander: 2, hide: 2 };
  function pickAct(still, inView, hx, hz) {
    const zp = zoneOf({ x: hx, z: hz }); const opts = [];
    for (const [k, w] of Object.entries(ACTS)) {
      if (!still && !['hop', 'tilt', 'flick', 'spin'].includes(k)) continue;
      if (k === 'wave' && !inView) continue;
      if (k === 'hide' && !nearPod(hx, hz, zp)) continue;
      if (k === 'wander' && !lookPick(hx, hz, zp, true)) continue;
      opts.push([k, w]);
    }
    let r = Math.random() * opts.reduce((a, [, w]) => a + w, 0); for (const [k, w] of opts) { r -= w; if (r <= 0) return k; } return opts.length ? opts[0][0] : 'hop';
  }
  const nearPod = (hx, hz, zp) => obstacles.filter((o) => o.pillar && zoneOf(o) === zp && Math.hypot(o.x - hx, o.z - hz) < 6.5 && Math.hypot(o.x - hx, o.z - hz) > 2.2).sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z))[0];
  const lookPick = (hx, hz, zp, test) => { const L = lookTargets.filter((o) => zoneOf(o) === zp && Math.hypot(o.x - hx, o.z - hz) < 8); return L.length ? (test ? true : L[Math.floor(Math.random() * L.length)]) : null; };
  function startAct(k, hx, hz, fx, fz) {
    const a = { k, t: 0, phase: 0 }; S.act = a; S.side = Math.random() < 0.5 ? -1 : 1;
    if (k === 'hop') { S.hopT = 0; S.hopN = 2; S.flickT = 1.0; a.dur = 1.2; }
    else if (k === 'spin') { S.spinT = 0.0001; S.hopT = 0; S.hopN = 1; a.dur = 1.1; }
    else if (k === 'tilt') { S.tiltT = 1.8; S.flickT = 0.8; a.dur = 1.8; }
    else if (k === 'flick') { S.flickT = 1.4; a.dur = 1.4; }
    else if (k === 'wave') { cow.waveNow(2.0); S.tiltT = 2.0; a.dur = 2.2; }
    else if (k === 'peek') { a.ang = S.side * 1.15; a.dur = 7; }
    else if (k === 'circle') { const cur = wrap(Math.atan2(S.x - hx, S.z - hz) - Math.atan2(fx, fz)); a.a0 = cur; a.a1 = cur + S.side * 2.3; a.dur = 6; }
    else if (k === 'wander') { a.tg = lookPick(hx, hz, zoneOf({ x: hx, z: hz })); a.dur = 11; }
    else if (k === 'hide') { a.pod = nearPod(hx, hz, zoneOf({ x: hx, z: hz })); a.dur = 10; }
    S.info = 'act: ' + k;
  }
  // ---- per frame
  function update(dt, now, hx, hz, fx, fz) {
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    if (!S.inited) { S.inited = true; S.next = now + rnd(4, 8); S.x = cow.state.x; S.z = cow.state.z; S.yaw = cow.state.yaw;
      if (!(Math.hypot(S.x - hx, S.z - hz) < 12) || Math.hypot(S.x - hx, S.z - hz) < 1.7 || !reachable(S.x, S.z) || zoneOf(S) !== zoneOf({ x: hx, z: hz })) teleportBehind(hx, hz, fx, fz, 'start'); }
    // player motion (teleports show up as jumps)
    let pv = 0; if (S.prevHx !== null) { const j = Math.hypot(hx - S.prevHx, hz - S.prevHz); pv = j / Math.max(dt, 1e-3); if (j > 1.5) pv = 0; }
    if (S.prevHx !== null && pv > 0) { const k = 1 - Math.exp(-dt * 4); S.pvx += ((hx - S.prevHx) / Math.max(dt, 1e-3) - S.pvx) * k; S.pvz += ((hz - S.prevHz) / Math.max(dt, 1e-3) - S.pvz) * k; } else { S.pvx *= 0.9; S.pvz *= 0.9; }
    S.prevHx = hx; S.prevHz = hz; S.pv += (pv - S.pv) * (1 - Math.exp(-dt * 4)); const still = S.pv < 0.35;
    let dx = S.x - hx, dz = S.z - hz, d = Math.hypot(dx, dz);
    const zm = zoneOf(S), zp = zoneOf({ x: hx, z: hz });
    if (d > 12) { teleportBehind(hx, hz, fx, fz, 'far'); dx = S.x - hx; dz = S.z - hz; d = Math.hypot(dx, dz); }
    // stuck while trying to reach the player: give up quietly
    if (d > 5 && d >= S.lastD - 0.02 && S.spd < 0.2) S.stuck += dt; else S.stuck = Math.max(0, S.stuck - dt * 2);
    S.lastD = d; if (S.stuck > 4) { S.stuck = 0; teleportBehind(hx, hz, fx, fz, 'stuck'); dx = S.x - hx; dz = S.z - hz; d = Math.hypot(dx, dz); }
    const inView = d > 0.1 && Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) < 1.0;
    S.unseen = inView ? 0 : S.unseen + dt;
    // gaze: look straight at her for a moment and she glows / tilts her head
    const gazing = d < 9 && Math.acos(clamp((dx * fx + dz * fz) / Math.max(d, 0.1), -1, 1)) < 0.2;
    S.gazeCool -= dt; S.gaze = gazing ? S.gaze + dt : 0;
    if (S.gaze > 0.8 && S.gazeCool <= 0) { S.gazeCool = 7; cow.flash(0.9); S.tiltT = Math.max(S.tiltT, 1.4); S.flickT = Math.max(S.flickT, 0.9); if (!S.act && Math.random() < 0.5) { S.hopT = 0; S.hopN = 1; } }
    // choose an act
    if (!S.act && (now > S.next || S.forced) && zm === zp && d < 6) { const k = S.forced || pickAct(still, inView, hx, hz); S.forced = null; startAct(k, hx, hz, fx, fz); }
    // ---- goal
    const base = Math.atan2(fx, fz); let gx = S.x, gz = S.z, speed = 0.95, face = null, scoot = false, hold = false;
    const slot = (ang, r) => [hx + Math.sin(base + ang) * r, hz + Math.cos(base + ang) * r];
    // long acts give way as soon as the player sets off, leaves her zone or gets far
    if (S.act && ['peek', 'circle', 'wander', 'hide'].includes(S.act.k) && (S.pv > 0.6 || zm !== zp || d > 7)) { S.act = null; S.leanTo = 0; S.next = now + rnd(6, 15); }
    const a = S.act;
    if (a) {
      a.t += dt;
      if (a.k === 'peek') { [gx, gz] = slot(a.ang, 2.4); const arr = Math.hypot(gx - S.x, gz - S.z) < 0.35; if (arr) { a.phase += dt; S.leanTo = -S.side * 0.2 * Math.min(1, a.phase / 0.4) * (a.phase < 2.2 ? 1 : 0); S.tiltT = Math.max(S.tiltT, 0.2); } face = 'player'; if (a.phase > 2.6) a.t = a.dur; }
      else if (a.k === 'circle') { const u = Math.min(1, a.t / (a.dur - 1)); [gx, gz] = slot(a.a0 + (a.a1 - a.a0) * u, 2.5); speed = 1.2; }
      else if (a.k === 'wander' && a.tg) {
        const tg = a.tg, vx = S.x - tg.x, vz = S.z - tg.z, vd = Math.hypot(vx, vz) || 1;
        if (a.phase === 0) { [gx, gz] = [tg.x + vx / vd * tg.stand, tg.z + vz / vd * tg.stand]; face = tg; if (vd < tg.stand + 0.4) a.phase = 1; }
        else if (a.phase === 1) { hold = true; face = tg; S.tiltT = Math.max(S.tiltT, 0.2); a.look = (a.look || 0) + dt; if (a.look > 2.6) a.phase = 2; }
        else { [gx, gz] = slot(S.side * 0.6, 2.4); speed = 1.6; if (d < 3.2) a.t = a.dur; }
      }
      else if (a.k === 'hide' && a.pod) {
        const p = a.pod, ox = p.x - hx, oz = p.z - hz, od = Math.hypot(ox, oz) || 1;
        if (a.phase === 0) { [gx, gz] = [p.x + ox / od * (p.r + 0.2), p.z + oz / od * (p.r + 0.2)]; speed = 1.3; if (Math.hypot(gx - S.x, gz - S.z) < 0.4) a.phase = 1; }
        else if (a.phase === 1) { hold = true; face = 'player'; a.wait = (a.wait || 0) + dt; [gx, gz] = [S.x, S.z]; if (a.wait > 2.5) { a.phase = 2; S.hopT = 0; S.hopN = 1; cow.flash(1.0); S.flickT = 1.2; } }
        else { [gx, gz] = [p.x + (-oz / od) * S.side * (p.r + 0.5), p.z + (ox / od) * S.side * (p.r + 0.5)]; face = 'player'; speed = 1.4; S.leanTo = S.side * 0.18;
          a.pop = (a.pop || 0) + dt; if (a.pop > 1.2) { cow.waveNow(2.0); a.t = a.dur; } }
      }
      if (a.t >= a.dur) { S.act = null; S.leanTo = 0; S.next = now + rnd(6, 15); }
    }
    if (!S.act || ['hop', 'spin', 'tilt', 'flick', 'wave'].includes(S.act.k)) {
      // comfort keeping
      // too close, or the player is walking straight at her: sidestep to a free spot (never back into a wall)
      const closing = S.pv > 0.4 && (S.pvx * -dx + S.pvz * -dz) < 0 && ((S.pvx * dx + S.pvz * dz) / Math.max(d * Math.hypot(S.pvx, S.pvz), 1e-3)) > 0.6;
      if (d < 1.5 || (d < 2.2 && closing)) {
        S.escT -= dt;
        if (!S.esc || S.escT <= 0) {
          const away = Math.atan2(dx, dz); S.esc = null;
          for (const o of [0.75, -0.75, 1.35, -1.35, 0, 1.9, -1.9, 2.5, -2.5]) {
            const aa = away + o * S.side, ex = hx + Math.sin(aa) * 2.5, ez = hz + Math.cos(aa) * 2.5;
            if (!reachable(ex, ez) || !lineFree(S.x, S.z, ex, ez)) continue;
            S.esc = [ex, ez]; if (o * S.side < 0 && Math.abs(o) > 0.1) S.side = -S.side; break;
          }
          if (!S.esc) S.esc = valid(hx + Math.sin(away) * 2.5, hz + Math.cos(away) * 2.5); S.escT = 0.7;
        }
        [gx, gz] = S.esc; scoot = true; speed = 2.0;
      }
      else if ((S.esc = null), !still) { [gx, gz] = slot(S.side * 2.2, 2.5); speed = clamp(S.pv * 1.1 + 0.3, 0.9, 1.9); }
      else if (d > 3.6) { [gx, gz] = [hx + dx / d * 2.8, hz + dz / d * 2.8]; speed = d > 6 ? 1.7 : 1.0; }
      else if (S.unseen > 2.5) { [gx, gz] = slot(S.side * 0.75, 2.6); }
      else hold = true;
      if (zm !== zp) { hold = false; [gx, gz] = [hx + dx / Math.max(d, 0.1) * 2.6, hz + dz / Math.max(d, 0.1) * 2.6]; speed = d > 5 ? 1.7 : 1.1; }
      if (!face) face = 'player';
    }
    // keep the goal somewhere she can actually stand (in the player's zone when following)
    if (!hold) { [gx, gz] = pushOut(...clampWalk(gx, gz, zp === zm || S.act ? null : zp)); [gx, gz] = clampWalk(gx, gz); if (!reachable(gx, gz)) { const c = snapCell(gx, gz); if (c >= 0) { gx = cx(c); gz = cz(c); } } }
    // ---- steering
    let wx = gx, wz = gz; if (!hold) [wx, wz] = navigate(S.x, S.z, gx, gz, dt);
    let ex = wx - S.x, ez = wz - S.z; const ed = Math.hypot(ex, ez);
    let tvx = 0, tvz = 0;
    if (!hold && ed > 0.12) { const v = speed * Math.min(1, ed / 0.8); tvx = ex / ed * v; tvz = ez / ed * v; }
    for (const o of obstacles) { const ox = S.x - o.x, oz = S.z - o.z, od = Math.hypot(ox, oz), R0 = o.r + 0.7;
      if (od < R0 && od > 1e-3 && (S.act && S.act.pod === o ? Math.hypot(gx - o.x, gz - o.z) > o.r + 0.6 : true)) { const k = (R0 - od) / R0 * 1.4; tvx += ox / od * k; tvz += oz / od * k; } }
    if (d < 1.7 && !hold) { const k = (1.7 - d) / 1.7 * 2.0; tvx += dx / Math.max(d, 0.1) * k; tvz += dz / Math.max(d, 0.1) * k; }
    const acc = 1 - Math.exp(-dt * 4.5); S.vx += (tvx - S.vx) * acc; S.vz += (tvz - S.vz) * acc;
    const vm = Math.hypot(S.vx, S.vz), vmax = Math.max(speed, 1.0) + 0.3; if (vm > vmax) { S.vx *= vmax / vm; S.vz *= vmax / vm; }
    let nx = S.x + S.vx * dt, nz = S.z + S.vz * dt; [nx, nz] = pushOut(...clampWalk(nx, nz)); [nx, nz] = clampWalk(nx, nz);
    const moved = Math.hypot(nx - S.x, nz - S.z); S.spd += (moved / Math.max(dt, 1e-3) - S.spd) * (1 - Math.exp(-dt * 8)); S.x = nx; S.z = nz;
    // ---- heading: walk where she is going; when standing (or scooting back) face the player / what she is looking at
    let want = S.yaw;
    if (S.spd > 0.25 && !scoot) want = Math.atan2(S.vx, S.vz);
    else if (face === 'player' || scoot) want = Math.atan2(hx - S.x, hz - S.z);
    else if (face) want = Math.atan2(face.x - S.x, face.z - S.z);
    S.yaw += wrap(want - S.yaw) * (1 - Math.exp(-dt * (scoot ? 7 : 4.5)));
    // ---- procedural layers: hop / spin / lean / tilt / flick
    let hop = 0; if (S.hopN > 0) { S.hopT += dt; const u = S.hopT / 0.42; hop = 0.16 * Math.sin(Math.PI * Math.min(1, u)); if (u >= 1) { S.hopN--; S.hopT = 0; } }
    if (scoot && S.spd > 0.4) hop = Math.max(hop, 0.03 * Math.abs(Math.sin(now * 12)));
    let spin = 0; if (S.spinT > 0) { S.spinT += dt; const u = Math.min(1, S.spinT / 0.8); spin = TAU * u * u * (3 - 2 * u); if (u >= 1) S.spinT = 0; }
    S.lean += (S.leanTo - S.lean) * (1 - Math.exp(-dt * 6));
    S.tiltT = Math.max(0, S.tiltT - dt); S.flickT = Math.max(0, S.flickT - dt);
    cow.state.tiltAdd = S.tiltT > 0 ? 0.28 * Math.min(1, S.tiltT / 0.3) * S.side : 0;
    cow.state.flick = S.flickT > 0 ? Math.min(1, S.flickT / 0.3) : 0;
    cow.place(S.x, S.z, S.yaw + spin, hop, S.lean);
    S.mode = hold ? 'idle' : scoot ? 'scoot' : 'walk';
    return { x: S.x, z: S.z, speed: S.spd, moving: clamp(S.spd / 0.6, 0, 1), d, zone: zoneOf(S) };
  }
  return { S, act: (k) => { S.forced = k; }, update, reset: () => { S.inited = false; S.act = null; }, teleportBehind, valid, reachable };
}
