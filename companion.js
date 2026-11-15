// v37: 'curious companion' — she always stays in the player's room (or corridor) but mostly explores points of interest
// (the main monitor, pods, panels, doorways, barn stalls), glances back now and then, checks in every 30-60 s, keeps ~1.6 m
// personal space, and mixes in fewer playful moves (incl. a crawl). Below: the original v31 notes.
// v31: Miss Moo companion mode. She follows the player through every room and corridor at a comfortable 2-3.5 m,
// never closer than ~1.5 m, backs off / sidesteps when approached, reroutes through doorways, catches up or quietly
// reappears behind the player after a teleport, and does small playful things every 6-15 s. Cheap per-frame steering:
// seek + obstacle repulsion, then clamping to her own (narrower than the player's) walkable area so she never clips walls.
// Works with any figure: it only drives cow.place()/cow.update() and a few state fields (hop, lean, tiltAdd, flick, wave).
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

export function createCompanion({ cow, RC, CORRS, corrLocal, zoneOf, CEN, VEIL_R, roomR, obstacles, lookTargets, pois = [], peers = () => [], id = 'ari' }) {
  const ROOM_R = roomR;                       // per room: her disc radius (narrower than the player's 6.1 m)
  const HALF = 0.38, EXT = 2.4;               // corridor strip for her: centre line ±0.38 m (her tails are wide), overlapping into rooms
  const S = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, spd: 0, inited: false, act: null, actT: 0, next: 0, side: Math.random() < 0.5 ? -1 : 1,
    unseen: 0, pvx: 0, pvz: 0, esc: null, escT: 0, gaze: 0, gazeCool: 0, stuck: 0, lastD: 0, hop: 0, hopT: 0, hopN: 0, lean: 0, leanTo: 0, spin: 0, spinT: 0,
    tiltT: 0, flickT: 0, task: null, checkinAt: 0, glanceT: 6, glanceDur: 0, reactT: 0, pl: 0.15, recent: [], mode: 'idle', prevHx: null, prevHz: null, pv: 0, faceTo: null, info: '',
    fwd: 0, turnW: 0, hv: { n: 0, sum: 0, max: 0, over: 0 }, crawlUntil: 0, crawlHold: false, moveT: 0, crawlEvery: rnd(60, 90), travelUntil: 0, forcedDur: 0,
    homeOn: false, home: null, homeForce: null, gate: 0, id };
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
  const ACTS = { hop: 2, spin: 1.2, tilt: 1.5, flick: 1.5, wave: 1.2, peek: 1.2, circle: 1, hide: 1.3, crawl: 1.0, sit: 0.9, sniff: 1.0 };   // v38c: + sit crisscross, sniff on all fours
  function pickAct(still, inView, hx, hz) {
    const zp = zoneOf({ x: hx, z: hz }); const opts = [];
    for (const [k, w] of Object.entries(ACTS)) {
      if (!still && !['hop', 'tilt', 'flick', 'spin'].includes(k)) continue;
      if (k === 'wave' && !inView) continue;
      if (k === 'hide' && !nearPod(hx, hz, zp)) continue;
      if (k === 'crawl' && !(cow.ext && cow.ext.canCrawl)) continue;
      if (k === 'sit' && !(cow.ext && cow.ext.canSit && zp[0] === 'r')) continue;
      if (k === 'sniff' && !(cow.ext && cow.ext.canSniff && nearPod(hx, hz, zp))) continue;
      opts.push([k, w]);
    }
    let r = Math.random() * opts.reduce((a, [, w]) => a + w, 0); for (const [k, w] of opts) { r -= w; if (r <= 0) return k; } return opts.length ? opts[0][0] : 'hop';
  }
  // v38e: where to crawl next: prowl around the player (crawl), or nose around a pod / stall / bale in slow small arcs (sniff)
  function crawlTarget(a, hx, hz) {
    if (a.k === 'sniff') { a.ang = (a.ang || 0) + rnd(0.35, 0.7) * S.side; const p = a.pod, r = p ? p.r + 0.55 : 0.8, ox = p ? p.x : S.x, oz = p ? p.z : S.z;
      let x = ox + Math.sin(a.ang) * r, z = oz + Math.cos(a.ang) * r; if (!reachable(x, z)) { const c = snapCell(x, z); if (c >= 0) { x = cx(c); z = cz(c); } } return { x, z }; }
    const cur = Math.atan2(S.x - hx, S.z - hz);
    for (const da of [0.9, -0.9, 0.5, -0.5, 1.4, -1.4]) { const aa = cur + da * S.side, tx = hx + Math.sin(aa) * 2.4, tz = hz + Math.cos(aa) * 2.4, dd = Math.hypot(tx - S.x, tz - S.z);
      if (dd > 1.6 && dd < 5 && reachable(tx, tz) && lineFree(S.x, S.z, tx, tz)) return { x: tx, z: tz }; }
    const dd = Math.max(0.1, Math.hypot(S.x - hx, S.z - hz)); return { x: hx + (S.x - hx) / dd * 2.4, z: hz + (S.z - hz) / dd * 2.4 };
  }
  const nearPod = (hx, hz, zp) => obstacles.filter((o) => o.pillar && zoneOf(o) === zp && Math.hypot(o.x - hx, o.z - hz) < 6.5 && Math.hypot(o.x - hx, o.z - hz) > 2.2).sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z))[0];
  const lookPick = (hx, hz, zp, test) => { const L = lookTargets.filter((o) => zoneOf(o) === zp && Math.hypot(o.x - hx, o.z - hz) < 8); return L.length ? (test ? true : L[Math.floor(Math.random() * L.length)]) : null; };
  function startAct(k, hx, hz, fx, fz, now = 0) {
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
    else if (k === 'crawl') {   // prowl a few metres toward / around the player on all fours, then stand back up
      a.tg = crawlTarget(a, hx, hz); a.dur = 60; a.until = now + (S.forcedDur || rnd(6, 10)); S.forcedDur = 0; }
    else if (k === 'sniff') { a.pod = nearPod(hx, hz, zoneOf({ x: hx, z: hz })) || obstacles.filter((o) => Math.hypot(o.x - S.x, o.z - S.z) < 4).sort((p, q) => Math.hypot(p.x - S.x, p.z - S.z) - Math.hypot(q.x - S.x, q.z - S.z))[0] || null;
      a.ang = a.pod ? Math.atan2(S.x - a.pod.x, S.z - a.pod.z) : 0; a.tg = crawlTarget(a, hx, hz); a.dur = 60; a.until = now + (S.forcedDur || rnd(7, 11)); S.forcedDur = 0; }
    else if (k === 'sit') { a.dur = 999; a.sitFor = S.forcedDur || rnd(12, 22); S.forcedDur = 0;
      const mon = pois.find((p) => p.kind === 'monitor' && p.zone === zoneOf(S)); if (mon) { const M = mon.get ? { ...mon, ...mon.get() } : mon; if (Math.hypot(M.x - S.x, M.z - S.z) < 7) { a.lookAt = M; a.face = M; } } }
    S.info = 'act: ' + k;
  }
  // ---- curious exploring: points of interest per room ({x, y, z, stand, dwell:[a,b], kind, get?}), viewing spot validated once per visit
  const PS = 1.6;   // personal space (m)
  function standFor(P, hx, hz, zp) {
    const c = RC[+zp[1] - 1], bx = c[0] - P.x, bz = c[1] - P.z, bd = Math.hypot(bx, bz) || 1, b0 = Math.atan2(bx / bd, bz / bd);
    const tries = P.kind === 'pod' ? [Math.atan2(S.x - P.x, S.z - P.z), b0, b0 + 1.2, b0 - 1.2, b0 + 2.2, b0 - 2.2] : [b0 + rnd(-0.35, 0.35), b0, b0 + 0.6, b0 - 0.6];
    for (const ang of tries) for (const r of [P.stand, P.stand + 0.4, P.stand + 0.9]) {
      const x = P.x + Math.sin(ang) * r, z = P.z + Math.cos(ang) * r;
      if (zoneOf({ x, z }) !== zp || !reachable(x, z) || Math.hypot(x - hx, z - hz) < PS + 0.4) continue;
      return [x, z];
    }
    return null;
  }
  function nextTask(now, hx, hz, zp) {
    if (now > S.checkinAt && S.checkinAt > 0) { S.checkinAt = now + rnd(30, 60); return { k: 'checkin', zone: zp, t: 0, phase: 0, dwell: rnd(3, 5) }; }
    if (!S.checkinAt) S.checkinAt = now + rnd(25, 45);
    const taken = peers().map((o) => o.task && o.task.p).filter(Boolean);   // v38g: characters pick different points of interest
    const list = pois.filter((p) => p.zone === zp && !S.recent.includes(p) && !taken.some((t) => t === p || (Math.hypot(t.x - p.x, t.z - p.z) < 1.2)));
    let tot = 0; const w = list.map((p) => { const v = (p.kind === 'monitor' ? 2.5 : p.kind === 'door' ? 0.6 : 1) * (Math.hypot(p.x - S.x, p.z - S.z) < 1 ? 0.2 : 1); tot += v; return v; });
    for (let tries = 0; tries < 6 && list.length; tries++) {
      let r = Math.random() * tot, i = 0; for (; i < list.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
      const P0 = list[i], P = P0.get ? { ...P0, ...P0.get() } : P0, sp = standFor(P, hx, hz, zp);
      if (!sp) continue;
      S.recent.push(P0); if (S.recent.length > 3) S.recent.shift(); S.info = 'explore: ' + P.kind;
      return { k: 'poi', p: P, zone: zp, t: 0, phase: 0, sx: sp[0], sz: sp[1], dwell: rnd(P.dwell[0], P.dwell[1]), tiltAt: rnd(1.5, 4) };
    }
    return { k: 'idle', zone: zp, t: 0, dwell: rnd(2, 4) };
  }
  // ---- per frame
  function update(dt, now, hx, hz, fx, fz) {
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    S.now = now; if (S.homeOn) return homeUpdate(dt, now, hx, hz, fx, fz);
    if (!S.inited) { S.inited = true; S.next = now + rnd(4, 8); S.x = cow.state.x; S.z = cow.state.z; S.yaw = cow.state.yaw;
      if (!(Math.hypot(S.x - hx, S.z - hz) < 12) || Math.hypot(S.x - hx, S.z - hz) < 1.7 || !reachable(S.x, S.z) || zoneOf(S) !== zoneOf({ x: hx, z: hz })) teleportBehind(hx, hz, fx, fz, 'start'); }
    // player motion (teleports show up as jumps)
    let pv = 0; if (S.prevHx !== null) { const j = Math.hypot(hx - S.prevHx, hz - S.prevHz); pv = j / Math.max(dt, 1e-3); if (j > 1.5) pv = 0; }
    if (S.prevHx !== null && pv > 0) { const k = 1 - Math.exp(-dt * 4); S.pvx += ((hx - S.prevHx) / Math.max(dt, 1e-3) - S.pvx) * k; S.pvz += ((hz - S.prevHz) / Math.max(dt, 1e-3) - S.pvz) * k; } else { S.pvx *= 0.9; S.pvz *= 0.9; }
    S.prevHx = hx; S.prevHz = hz; S.pv += (pv - S.pv) * (1 - Math.exp(-dt * 4)); const still = S.pv < 0.35;
    let dx = S.x - hx, dz = S.z - hz, d = Math.hypot(dx, dz);
    const zm = zoneOf(S), zp = zoneOf({ x: hx, z: hz });
    if ((d > 12 && zm !== zp) || d > 15) { teleportBehind(hx, hz, fx, fz, 'far'); dx = S.x - hx; dz = S.z - hz; d = Math.hypot(dx, dz); }
    // stuck while trying to reach the player: give up quietly
    if (zm !== zp && d > 4 && d >= S.lastD - 0.02 && S.spd < 0.2 && !cow.state.crawlPhase) S.stuck += dt; else S.stuck = Math.max(0, S.stuck - dt * 2);
    S.lastD = d; if (S.stuck > 4) { S.stuck = 0; teleportBehind(hx, hz, fx, fz, 'stuck'); dx = S.x - hx; dz = S.z - hz; d = Math.hypot(dx, dz); }
    const inView = d > 0.1 && Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) < 1.0;
    S.unseen = inView ? 0 : S.unseen + dt;
    // gaze: look straight at her for a moment and she glows / tilts her head
    const gazing = d < 9 && Math.acos(clamp((dx * fx + dz * fz) / Math.max(d, 0.1), -1, 1)) < 0.2;
    S.gazeCool -= dt; S.gaze = gazing ? S.gaze + dt : 0;
    if (S.gaze > 0.8 && S.gazeCool <= 0) { S.gazeCool = 7; cow.flash(0.9); S.tiltT = Math.max(S.tiltT, 1.4); S.flickT = Math.max(S.flickT, 0.9); if (!S.act && Math.random() < 0.5) { S.hopT = 0; S.hopN = 1; } }
    // react when the player looks at her for a while: glow, turn to look back, sometimes wave
    if (S.gaze > 1.2 && S.reactCool <= 0) { S.reactCool = 9; S.reactT = 2.6; if (!S.act && Math.random() < 0.4) cow.waveNow(2.0); }
    S.reactCool = (S.reactCool || 0) - dt; S.reactT = Math.max(0, S.reactT - dt);
    // occasional glance over her shoulder at the player
    S.glanceT -= dt; if (S.glanceT <= 0) { S.glanceT = rnd(9, 22); S.glanceDur = rnd(1.2, 2.2); } S.glanceDur = Math.max(0, S.glanceDur - dt);
    const sameZone = zm === zp, inRoom = zp[0] === 'r';
    // choose a playful act (less often than before; mixed into the exploring)
    if (!S.act && (now > S.next || S.forced) && sameZone && d < 8 && !(S.task && S.task.k === 'poi' && S.task.phase === 1 && !S.forced)) { const k = S.forced || pickAct(still, inView, hx, hz); S.forced = null; startAct(k, hx, hz, fx, fz, now); }
    // ---- goal
    const base = Math.atan2(fx, fz); let gx = S.x, gz = S.z, speed = 0.9, face = null, scoot = false, hold = false, lookAt = null, pl = 0.15;
    const slot = (ang, r) => [hx + Math.sin(base + ang) * r, hz + Math.cos(base + ang) * r];
    // long acts give way as soon as the player leaves her zone or gets far
    if (S.act && ['peek', 'circle', 'hide', 'crawl', 'sniff', 'sit'].includes(S.act.k) && !S.act.end && (zm !== zp || d > 9 || (!['crawl', 'sniff', 'sit'].includes(S.act.k) && S.pv > 0.6))) {
      if (['crawl', 'sniff', 'sit'].includes(S.act.k)) S.act.end = true; else { S.act = null; S.leanTo = 0; S.next = now + rnd(15, 35); } }
    const want = { crawl: false, sit: false, sniff: false, nap: false };
    const a = S.act;
    if (a) {
      a.t += dt;
      if (a.k === 'peek') { [gx, gz] = slot(a.ang, 2.4); const arr = Math.hypot(gx - S.x, gz - S.z) < 0.35; if (arr) { a.phase += dt; S.leanTo = -S.side * 0.2 * Math.min(1, a.phase / 0.4) * (a.phase < 2.2 ? 1 : 0); S.tiltT = Math.max(S.tiltT, 0.2); } face = 'player'; pl = 1; if (a.phase > 2.6) a.t = a.dur; }
      else if (a.k === 'circle') { const u = Math.min(1, a.t / (a.dur - 1)); [gx, gz] = slot(a.a0 + (a.a1 - a.a0) * u, 2.5); speed = 1.2; pl = 0.5; }
      else if (a.k === 'hide' && a.pod) {
        const p = a.pod, ox = p.x - hx, oz = p.z - hz, od = Math.hypot(ox, oz) || 1;
        if (a.phase === 0) { [gx, gz] = [p.x + ox / od * (p.r + 0.2), p.z + oz / od * (p.r + 0.2)]; speed = 1.3; if (Math.hypot(gx - S.x, gz - S.z) < 0.4) a.phase = 1; }
        else if (a.phase === 1) { hold = true; face = 'player'; a.wait = (a.wait || 0) + dt; [gx, gz] = [S.x, S.z]; if (a.wait > 2.5) { a.phase = 2; S.hopT = 0; S.hopN = 1; cow.flash(1.0); S.flickT = 1.2; } }
        else { [gx, gz] = [p.x + (-oz / od) * S.side * (p.r + 0.5), p.z + (ox / od) * S.side * (p.r + 0.5)]; face = 'player'; pl = 1; speed = 1.4; S.leanTo = S.side * 0.18;
          a.pop = (a.pop || 0) + dt; if (a.pop > 1.2) { cow.waveNow(2.0); a.t = a.dur; } }
      }
      else if (a.k === 'crawl' || a.k === 'sniff') {   // v38e: crawl for ~6-10 s (or as long as forced), sniff = slow arcs around a pod, nose down
        const cp = cow.state.crawlPhase; if (a.t > 40) a.end = true; if (!a.end) { want.crawl = true; want.sniff = a.k === 'sniff'; }
        if (!a.end && cp === 'loop') { [gx, gz] = [a.tg.x, a.tg.z]; speed = a.k === 'sniff' ? 0.14 : 0.42; pl = a.k === 'sniff' ? 0.1 : 0.5;
          if (a.k === 'sniff' && a.pod) lookAt = { x: a.pod.x, y: 0.25, z: a.pod.z };
          if (Math.hypot(a.tg.x - S.x, a.tg.z - S.z) < 0.4) { if (now < a.until) a.tg = crawlTarget(a, hx, hz); else a.end = true; }
          if (now > a.until + 4) a.end = true; }
        else { hold = true; if (a.end && !cp) { a.t = a.dur; if (a.k === 'crawl') { S.hopT = 0; S.hopN = 1; } } if (!a.end && !cp && a.t > 2.5) { a.end = true; a.t = a.dur; } }
      }
      else if (a.k === 'sit') { hold = true; want.sit = !a.end; face = a.face || null; if (a.lookAt) lookAt = a.lookAt; pl = 0.3;
        if (!a.end && (a.t > a.sitFor || d < PS - 0.25)) a.end = true;
        if (a.end) { if (!cow.state.sitPhase) a.t = a.dur; else a.t = Math.min(a.t, a.dur - 0.1); } }
      if (a.t >= a.dur) { S.act = null; S.leanTo = 0; cow.state.crawl = 0; S.next = now + rnd(15, 35); }
    }
    if (!S.act || ['hop', 'spin', 'tilt', 'flick', 'wave'].includes(S.act.k)) {
      if (!sameZone) {   // the one rule: be where the player is (route through doors; catch-up teleports handle the rest)
        S.task = null; [gx, gz] = [hx + dx / Math.max(d, 0.1) * 2.6, hz + dz / Math.max(d, 0.1) * 2.6]; speed = d > 5 ? 1.7 : 1.1; pl = 0.3;
      } else if (!inRoom) {   // in a corridor: stay with the player at a comfortable distance (nothing to explore here)
        S.task = null;
        if (!still) { [gx, gz] = slot(S.side * 2.2, 2.5); speed = clamp(S.pv * 1.1 + 0.3, 0.9, 1.9); }
        else if (d > 3.6) { [gx, gz] = [hx + dx / d * 2.8, hz + dz / d * 2.8]; speed = d > 6 ? 1.7 : 1.0; }
        else hold = true;
        pl = 0.4;
      } else {
        // exploring the room
        if (!S.task || S.task.done || S.task.zone !== zp) S.task = nextTask(now, hx, hz, zp);
        const T = S.task; T.t += dt;
        if (T.k === 'poi') {
          const P = T.p, at = Math.hypot(T.sx - S.x, T.sz - S.z) < 0.4;
          if (T.phase === 0) { [gx, gz] = [T.sx, T.sz]; speed = 0.85; if (Math.hypot(P.x - S.x, P.z - S.z) < 3.5) lookAt = P;
            if (at) { T.phase = 1; T.dw = 0; const X = cow.ext || {};   // v38c: sometimes sit crisscross to watch the monitor, or sniff around pods / stalls / bales
              if (P.kind === 'monitor' && X.canSit && Math.random() < 0.4) { T.sit = true; T.dwell *= 1.8; }
              else if (['pod', 'bottle', 'stall', 'hay'].includes(P.kind) && X.canSniff && Math.random() < 0.35) { T.sniff = true; T.dwell = Math.max(T.dwell, rnd(8, 12)); } }
            if (T.t > 25) T.done = true; }
          else { hold = true; face = P; lookAt = P; T.dw += dt;
            if (T.dw > T.tiltAt) { T.tiltAt = T.dw + rnd(3, 7); S.tiltT = Math.max(S.tiltT, rnd(1.0, 2.0)); S.side = Math.random() < 0.5 ? -1 : 1; }
            if (!T.gest && !T.sit && !T.sniff && T.dw > 2 && Math.random() < dt * 0.04) { T.gest = true; cow.waveNow(1.8); }    // a curious little hand gesture
            if (T.sit) want.sit = T.dw < T.dwell - 2;
            if (T.sniff) { const left = T.dwell - T.dw; if (left > 1.5) { want.crawl = want.sniff = true; lookAt = { x: P.x, y: 0.25, z: P.z }; }
              if (cow.state.crawlPhase === 'loop' && left > 1.5) { hold = false; T.a0 = T.a0 === undefined ? Math.atan2(S.x - P.x, S.z - P.z) : T.a0 + dt * 0.12 * S.side;
                const rr = Math.max(1.0, P.stand - 0.45); gx = P.x + Math.sin(T.a0) * rr; gz = P.z + Math.cos(T.a0) * rr; speed = 0.14; face = null; } }
            if (T.dw > T.dwell) { if (cow.state.crawlPhase || cow.state.sitPhase) T.dw = T.dwell; else T.done = true; } }
        } else if (T.k === 'checkin') {
          if (T.phase === 0) { const aa = Math.atan2(S.x - hx, S.z - hz); [gx, gz] = [hx + Math.sin(aa) * 2.4, hz + Math.cos(aa) * 2.4]; speed = 1.0; pl = 0.7; if (d < 2.8) { T.phase = 1; T.dw = 0; } if (T.t > 15) T.done = true; }
          else { hold = true; face = 'player'; pl = 1; T.dw += dt; if (!T.hi) { T.hi = true; if (Math.random() < 0.5) cow.waveNow(2.0); else S.tiltT = 1.6; } if (T.dw > T.dwell) T.done = true; }
        } else { hold = true; T.dw = (T.dw || 0) + dt; if (T.dw > T.dwell) T.done = true; }
      }
      // personal space: too close, or the player is walking straight at her -> sidestep to a free spot
      const closing = S.pv > 0.4 && ((S.pvx * dx + S.pvz * dz) / Math.max(d * Math.hypot(S.pvx, S.pvz), 1e-3)) > 0.6;
      if (d < PS || (d < PS + 0.6 && closing)) {
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
        [gx, gz] = S.esc; scoot = true; hold = false; speed = 1.3; pl = 0.5;   // v38e: turn and walk away (no backward / sideways scoot)
        if (S.task) { S.task.sit = false; if (S.task.sniff) S.task.dw = S.task.dwell; }
        if (S.task && S.task.k === 'poi' && S.task.phase === 1 && Math.hypot(S.task.sx - hx, S.task.sz - hz) < PS + 0.3) S.task.done = true;   // the player took her spot
      } else S.esc = null;
    }
    // where she looks: what she is examining, else mostly ahead; the player only on glances / check-ins / when watched
    if (S.reactT > 0) { lookAt = null; pl = 1; if (!S.act && hold) face = 'player'; }
    else if (S.glanceDur > 0) { lookAt = null; pl = Math.max(pl, 0.85); }
    S.pl += (pl - S.pl) * (1 - Math.exp(-dt * 3));
    cow.state.lookAt = lookAt ? { x: lookAt.x, y: lookAt.y === undefined ? 1.3 : lookAt.y, z: lookAt.z } : null; cow.state.playerLook = S.pl;
    // ---- v38c/e poses: forced crawl / Crawl ON toggle / a natural travel crawl every ~60-90 s of moving; sit and sniff come from acts / POIs
    if (now < S.crawlUntil || S.crawlHold) want.crawl = true;
    if (!hold && S.spd > 0.3) { S.moveT += dt;
      if (S.moveT > S.crawlEvery && !want.sit && (!S.act || ['hop', 'tilt', 'flick'].includes(S.act.k)) && cow.ext && cow.ext.canCrawl) { S.moveT = 0; S.crawlEvery = rnd(60, 90); S.travelUntil = now + rnd(6, 10); S.info = 'travel crawl'; } }
    if (now < S.travelUntil) want.crawl = true;
    if (scoot) { want.sit = false; }
    applyPose(want);
    if (want.sit || cow.state.sitPhase) { hold = true; scoot = false; }
    if (cow.state.crawlPhase && cow.state.crawlPhase !== 'loop') { hold = true; scoot = false; }
    if (cow.state.crawlPhase === 'loop') speed = Math.min(speed, want.sniff ? 0.16 : 0.45);
    // keep the goal somewhere she can actually stand (in the player's zone when following)
    if (!hold) { [gx, gz] = pushOut(...clampWalk(gx, gz, zp === zm || S.act ? null : zp)); [gx, gz] = clampWalk(gx, gz); if (!reachable(gx, gz)) { const c = snapCell(gx, gz); if (c >= 0) { gx = cx(c); gz = cz(c); } } }
    // ---- steering
    let wx = gx, wz = gz; if (!hold) [wx, wz] = navigate(S.x, S.z, gx, gz, dt);
    let ex = wx - S.x, ez = wz - S.z; const ed = Math.hypot(ex, ez);
    let tvx = 0, tvz = 0;
    if (!hold && ed > 0.12) { const v = speed * Math.min(1, ed / 0.8); tvx = ex / ed * v; tvz = ez / ed * v; }
    for (const o of obstacles) { const ox = S.x - o.x, oz = S.z - o.z, od = Math.hypot(ox, oz), R0 = o.r + 0.7;
      if (od < R0 && od > 1e-3 && (S.act && S.act.pod === o ? Math.hypot(gx - o.x, gz - o.z) > o.r + 0.6 : true) && !(S.task && S.task.sniff)) { const k = (R0 - od) / R0 * 1.4; tvx += ox / od * k; tvz += oz / od * k; } }
    if (d < PS + 0.1 && !hold) { const k = (PS + 0.1 - d) / (PS + 0.1) * 2.0; tvx += dx / Math.max(d, 0.1) * k; tvz += dz / Math.max(d, 0.1) * k; }
    for (const o of peers()) { const ox = S.x - o.x, oz = S.z - o.z, od = Math.hypot(ox, oz); if (od < 1.6 && od > 1e-3) { const k = (1.6 - od) / 1.6 * 1.2; tvx += ox / od * k; tvz += oz / od * k; } }   // v38g: friends keep apart
    locomote(dt, tvx, tvz, speed, hold, faceYaw(face, hx, hz), (x, z) => { const p = pushOut(...clampWalk(x, z)); return clampWalk(p[0], p[1]); });
    return finish(now, dt, hold, scoot, d);
  }
  function applyPose(w) { cow.state.crawl = w.crawl ? 1 : 0; cow.state.sniff = w.sniff ? 1 : 0; cow.state.sit = w.sit ? 1 : 0; cow.state.nap = w.nap ? 1 : 0; }
  const faceYaw = (face, hx, hz) => face === 'player' ? Math.atan2(hx - S.x, hz - S.z) : face && face.x !== undefined ? Math.atan2(face.x - S.x, face.z - S.z) : null;
  // v38e: heading-first locomotion. She turns toward where she is going (smooth ease in / out: gain 2.25 /s, max 1.75 rad/s, angular
  // acceleration 5 rad/s^2 - half the old 4.5 /s exponential turn, which peaked at ~7 rad/s on a 90 deg turn), only ever moves along her
  // heading (no sideways / backward sliding while Walk plays), slows to ~50 % on sharp turns and turns in place beyond ~80 deg.
  const TURN_GAIN = 2.25, TURN_MAX = 1.75, TURN_ACC = 5.0;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function locomote(dt, tvx, tvz, speed, hold, faceY, clampFn) {
    const tv = Math.hypot(tvx, tvz); let wantY = S.yaw, mv = 0;
    if (!hold && tv > 0.08) { wantY = Math.atan2(tvx, tvz); mv = tv; } else if (faceY !== null && faceY !== undefined) wantY = faceY;
    const err = wrap(wantY - S.yaw), wcmd = clamp(err * TURN_GAIN, -TURN_MAX, TURN_MAX);
    S.turnW += clamp(wcmd - S.turnW, -TURN_ACC * dt, TURN_ACC * dt); S.yaw = wrap(S.yaw + S.turnW * dt);
    const ae = Math.abs(err), f = (1 - 0.5 * smooth(0.3, 0.6, ae)) * (1 - smooth(0.95, 1.4, ae));
    const target = Math.min(mv, Math.max(speed, 1.0) + 0.3) * f;
    S.fwd += (target - S.fwd) * (1 - Math.exp(-dt * (target > S.fwd ? 3.5 : 6)));
    S.vx = Math.sin(S.yaw) * S.fwd; S.vz = Math.cos(S.yaw) * S.fwd;
    let nx = S.x + S.vx * dt, nz = S.z + S.vz * dt; [nx, nz] = clampFn(nx, nz);
    const mx = nx - S.x, mz = nz - S.z, mvd = Math.hypot(mx, mz), sp = mvd / Math.max(dt, 1e-3);
    S.spd += (sp - S.spd) * (1 - Math.exp(-dt * 8)); S.x = nx; S.z = nz;
    if (sp > 0.3) { const a = Math.abs(wrap(Math.atan2(mx, mz) - S.yaw)) * 180 / Math.PI, H = S.hv; H.n++; H.sum += a; H.max = Math.max(H.max, a); if (a > 25) H.over++; }
  }
  function finish(now, dt, hold, scoot, d) {
    let hop = 0; if (S.hopN > 0) { S.hopT += dt; const u = S.hopT / 0.42; hop = 0.16 * Math.sin(Math.PI * Math.min(1, u)); if (u >= 1) { S.hopN--; S.hopT = 0; } }
    if (cow.state.crawlPhase || cow.state.sitPhase || (cow.state.napW || 0) > 0.1) { hop = 0; S.hopN = 0; }
    let spin = 0; if (S.spinT > 0) { S.spinT += dt; const u = Math.min(1, S.spinT / 0.8); spin = TAU * u * u * (3 - 2 * u); if (u >= 1) S.spinT = 0; }
    S.lean += (S.leanTo - S.lean) * (1 - Math.exp(-dt * 6));
    S.tiltT = Math.max(0, S.tiltT - dt); S.flickT = Math.max(0, S.flickT - dt);
    cow.state.tiltAdd = S.tiltT > 0 ? 0.28 * Math.min(1, S.tiltT / 0.3) * S.side : 0;
    cow.state.flick = S.flickT > 0 ? Math.min(1, S.flickT / 0.3) : 0;
    cow.place(S.x, S.z, S.yaw + spin, hop, S.lean);
    S.mode = hold ? 'idle' : scoot ? 'away' : 'walk';
    return { x: S.x, z: S.z, speed: S.spd, moving: clamp(S.spd / 0.6, 0, 1), d, zone: zoneOf(S) };
  }
  // ---- v38b home stall: walk (or quietly reappear) into her stall, live there (idle, small wanders, naps, sitting, sniffing,
  // peeking over the rail at a nearby player), never follow the player out; 'Let out' walks back out through the gate.
  // stall = { C, F, front, yaw, inBox(x, z), clampBox(x, z), clampPath(x, z), randIn() } in world metres (from barnroom via main)
  function homeUpdate(dt, now, hx, hz, fx, fz) {
    const H = S.home, st = H.stall, C = st.C, F = st.F, want = { crawl: false, sit: false, sniff: false, nap: false };
    const pzone = zoneOf({ x: hx, z: hz }), dP = Math.hypot(S.x - hx, S.z - hz);
    const seen = (x, z) => { const ddx = x - hx, ddz = z - hz, dd = Math.hypot(ddx, ddz); return dd < 16 && Math.acos(clamp((ddx * fx + ddz * fz) / Math.max(dd, 0.1), -1, 1)) < 1.05; };
    if (!H.phase) {
      const far = Math.hypot(S.x - F.x, S.z - F.z) > 12, here = st.inBox(S.x, S.z);
      if (here || !S.inited || ((pzone !== 'r4' || zoneOf(S) !== 'r4' || far) && !(pzone === 'r4' && seen(S.x, S.z) && !far))) {
        S.x = C.x; S.z = C.z; S.yaw = st.yaw; S.vx = S.vz = S.fwd = S.turnW = 0; H.phase = 'in'; H.sub = null; S.info = 'home: reappeared in stall ' + (st.i + 1);
      } else { H.phase = 'goto'; S.info = 'home: walking to stall ' + (st.i + 1); }
      S.inited = true; S.act = null; S.task = null;
    }
    let gx = S.x, gz = S.z, speed = 0.9, hold = true, face = null, lookAt = null, pl = 0.15, clampFn = st.clampBox;
    const busy = cow.state.sitPhase || (cow.state.crawlPhase && cow.state.crawlPhase !== 'loop') || (cow.state.napW || 0) > 0.15;
    if (H.phase === 'goto') {
      gx = F.x; gz = F.z; hold = false; clampFn = (x, z) => { const p = pushOut(...clampWalk(x, z)); return clampWalk(p[0], p[1]); };
      H.t = (H.t || 0) + dt; if (Math.hypot(F.x - S.x, F.z - S.z) < 0.3) { H.phase = 'enter'; H.t = 0; }
      if (H.t > 40 && !seen(C.x, C.z)) { S.x = C.x; S.z = C.z; S.yaw = st.yaw; H.phase = 'in'; }
    } else if (H.phase === 'enter') { gx = C.x; gz = C.z; hold = false; speed = 0.55; clampFn = st.clampPath; if (Math.hypot(C.x - S.x, C.z - S.z) < 0.25) { H.phase = 'in'; H.sub = null; } }
    else if (H.phase === 'exit') {
      if (busy) hold = true; else { gx = F.x; gz = F.z; hold = false; speed = 0.55; clampFn = st.inBox(S.x, S.z) || Math.hypot(S.x - F.x, S.z - F.z) > 0.3 ? st.clampPath : clampFn; }
      if (!busy && Math.hypot(F.x - S.x, F.z - S.z) < 0.3) { S.homeOn = false; S.home = null; S.gate = 0; S.task = null; S.act = null; S.info = 'let out'; applyPose(want); return finish(now, dt, true, false, dP); }
    } else {   // in the stall
      const pNear = pzone === 'r4' && Math.hypot(hx - st.front.x, hz - st.front.z) < 4.2;
      let sb = H.sub;
      if (S.homeForce) { const f0 = S.homeForce; S.homeForce = null; sb = H.sub = { k: f0.k, t: 0, dur: f0.dur }; }
      if (!sb || sb.t >= sb.dur) {
        const X = cow.ext || {}, opts = [['idle', 3], ['wander', 3], ['sit', X.canSit ? 1.2 : 0], ['sniff', X.canSniff ? 1 : 0], ['nap', X.canNap && !pNear ? 1.3 : 0]];
        if (pNear && (H.peekCool || 0) < now) sb = { k: 'peek' };
        else { let r = Math.random() * opts.reduce((a, o) => a + o[1], 0); sb = { k: 'idle' }; for (const [k, w] of opts) { r -= w; if (r <= 0) { sb = { k }; break; } } }
        sb.t = 0; H.faceY = null; sb.dur = { idle: rnd(4, 9), wander: rnd(5, 10), sit: rnd(12, 25), sniff: rnd(6, 10), nap: rnd(20, 45), peek: rnd(6, 12), crawl: 8 }[sb.k] || 6; H.sub = sb; S.info = 'stall: ' + sb.k;
      }
      sb.t += dt; const left = sb.dur - sb.t;
      if (sb.k === 'peek') { gx = st.front.x; gz = st.front.z; hold = Math.hypot(gx - S.x, gz - S.z) < 0.15; speed = 0.45; face = 'player'; pl = 1;
        if (hold && !sb.hi) { sb.hi = true; if (Math.random() < 0.4) cow.waveNow(2.0); else S.tiltT = 1.6; }
        if (!pNear) sb.t = sb.dur; if (sb.t >= sb.dur) H.peekCool = now + 10; }
      else if (sb.k === 'wander') { if (!sb.tg || Math.hypot(sb.tg[0] - S.x, sb.tg[1] - S.z) < 0.15) sb.tg = st.randIn(); [gx, gz] = sb.tg; hold = false; speed = 0.32; }
      else if (sb.k === 'nap') {   // v38: settle in the middle of the stall, lying across it (the long axis), then nap
        if (sb.ny === undefined) sb.ny = st.yaw + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        const dc = Math.hypot(C.x - S.x, C.z - S.z); if (!sb.set && dc > 0.12) { gx = C.x; gz = C.z; hold = false; speed = 0.3; } else { sb.set = true; H.faceY = sb.ny; }
        want.nap = left > 2 && sb.set && Math.abs(wrap(sb.ny - S.yaw)) < 0.25 || (cow.state.napW || 0) > 0.15 && left > 2; if (pNear && dP < 2.6 && !sb.woke) { sb.woke = true; if (Math.random() < 0.5) sb.t = Math.max(sb.t, sb.dur - 2); } }
      else if (sb.k === 'sit') want.sit = left > 2;
      else if (sb.k === 'sniff' || sb.k === 'crawl') { want.crawl = left > 1.5; want.sniff = sb.k === 'sniff';
        if (cow.state.crawlPhase === 'loop' && want.crawl) { if (!sb.tg || Math.hypot(sb.tg[0] - S.x, sb.tg[1] - S.z) < 0.15) sb.tg = st.randIn(); [gx, gz] = sb.tg; hold = false; speed = sb.k === 'sniff' ? 0.14 : 0.38; } }
      if (sb.t >= sb.dur && busy) sb.t = sb.dur - 0.01;
    }
    if (S.crawlHold || now < S.crawlUntil) want.crawl = !want.sit && !want.nap;
    if (H.phase !== 'in') { want.sit = want.nap = false; }
    if (S.reactT > 0) pl = Math.max(pl, 0.8);
    S.pl += (pl - S.pl) * (1 - Math.exp(-dt * 3));
    cow.state.lookAt = lookAt; cow.state.playerLook = S.pl;
    applyPose(want);
    if (want.sit || cow.state.sitPhase || want.nap || (cow.state.napW || 0) > 0.15 || (cow.state.crawlPhase && cow.state.crawlPhase !== 'loop')) hold = true;
    if (cow.state.crawlPhase === 'loop') speed = Math.min(speed, want.sniff ? 0.16 : 0.4);
    S.gate = H.phase === 'enter' || H.phase === 'exit' || (H.phase === 'goto' && Math.hypot(S.x - F.x, S.z - F.z) < 1.8) ? 1 : 0;
    let tvx = 0, tvz = 0;
    if (!hold) { let wx = gx, wz = gz; if (H.phase === 'goto') [wx, wz] = navigate(S.x, S.z, gx, gz, dt); const ex = wx - S.x, ez = wz - S.z, ed = Math.hypot(ex, ez);
      if (ed > 0.08) { const v = speed * Math.min(1, ed / 0.5); tvx = ex / ed * v; tvz = ez / ed * v; } }
    locomote(dt, tvx, tvz, speed, hold, faceYaw(face, hx, hz) ?? (H.phase === 'in' && hold && !lookAt && Math.random() < 0.002 ? S.yaw + rnd(-1, 1) : (H.faceY ?? null)), clampFn);
    return finish(now, dt, hold, false, dP);
  }

  return { S, pois, act: (k) => { S.forced = k; }, task: () => S.task, update, reset: () => { S.inited = false; S.act = null; S.task = null; if (S.home) S.home.phase = null; cow.state.crawl = 0; cow.state.sit = 0; cow.state.sniff = 0; cow.state.nap = 0; cow.state.lookAt = null; cow.state.playerLook = undefined; }, teleportBehind, valid, reachable,
    // v38e controls
    crawlNow: (dur = rnd(6, 10)) => { S.crawlUntil = 0; if (S.homeOn) S.homeForce = { k: 'crawl', dur }; else { S.forcedDur = dur; S.forced = 'crawl'; S.crawlUntil = (S.now || 0) + dur; } },
    sitNow: (dur = rnd(12, 22)) => { if (S.homeOn) S.homeForce = { k: 'sit', dur }; else { S.forcedDur = dur; S.forced = 'sit'; if (S.act && !['sit'].includes(S.act.k)) S.act.end = true; } },
    sniffNow: (dur = rnd(7, 11)) => { if (S.homeOn) S.homeForce = { k: 'sniff', dur }; else { S.forcedDur = dur; S.forced = 'sniff'; } },
    setCrawlHold: (on) => { S.crawlHold = !!on; }, crawlHold: () => S.crawlHold,
    setHome: (stall) => { if (stall) { if (S.homeOn && S.home && S.home.stall.i === stall.i && S.home.phase !== 'exit') return; S.homeOn = true; S.home = { stall, phase: null }; S.act = null; S.task = null; }
      else if (S.homeOn) { if (S.home && (S.home.phase === 'in' || S.home.phase === 'enter')) { S.home.phase = 'exit'; S.home.sub = null; } else { S.homeOn = false; S.home = null; S.gate = 0; } } },
    home: () => (S.homeOn ? { stall: S.home.stall.i, phase: S.home.phase, sub: S.home.sub && S.home.sub.k } : null),
    hvStats: () => ({ samples: S.hv.n, mean: S.hv.n ? +(S.hv.sum / S.hv.n).toFixed(2) : 0, max: +S.hv.max.toFixed(2), over25: S.hv.over }), resetHv: () => { S.hv = { n: 0, sum: 0, max: 0, over: 0 }; } };

}
