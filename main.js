// Resonance Chamber v5 — three WebXR rooms in a triangle (pink chamber, crimson vortex room, monochrome op-art room),
// with in-world control panels (animation speed, brightness) in every room.
// URL options: ?quality=low  ?scale=1.4  ?mirror=0  ?video=0|blend|full  ?fov=0.6  ?particles=900  ?spatial=0  ?room=1|2|3
import { THREE, Q, OPT, U, BEAT, R, TY, TZ, START_Z, env } from './shared.js';
import { VRButton } from './lib/VRButton.js';
import { buildChamber } from './chamber.js';
import { pinkRoomCfg } from './pinkroom.js';
import { buildOpRoom } from './oproom.js';
import { buildCorridor } from './corridor.js';
import { createPanels, settings } from './panels.js';

const ASSET_VIDEO = 'assets/tunnel_loop.mp4', ASSET_AUDIO = 'assets/ambient_loop.mp3';

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x030002);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(OPT.scale);
renderer.xr.setFoveation(OPT.fov);
document.body.appendChild(renderer.domElement);
env.maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const rig = new THREE.Group(); rig.position.set(0, 0, START_Z); scene.add(rig);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 150);
camera.position.set(0, 1.6, 0); camera.rotation.order = 'YXZ'; rig.add(camera);

// ---------- world layout ----------
//  Room 1 (pink)    centre (0,0)    focal at -z, doorway behind the start (+z)
//  Corridor A       z 6.88 → 13.12
//  Room 2 (crimson) centre (0,20)   rotated 180°: vortex at +z, doorway back to A at -z, side doorway at +x
//  Corridor B       x 6.88 → 13.12 (z = 20)
//  Room 3 (op-art)  centre (20,20)  rotated -90°: tunnel at +x, doorway back to B at -x
const tunnelU = { uVideo: { value: null }, uHasVideo: { value: 0 }, uVidScale: { value: new THREE.Vector2(1, 1) },
  uVidMix: { value: OPT.video === 'full' ? 1.0 : OPT.video === '0' ? 0.0 : 0.32 }, uProc: { value: OPT.video === 'full' ? 0.0 : 1.0 } };
const room1 = buildChamber(pinkRoomCfg(tunnelU));
const room2 = buildChamber({ name: 'room2', center: [0, 20], rotY: Math.PI, pal: 'crimson', focal: 'vortex', gyro: true,
  podIdx: [0, 1, 4, 5], doors: [{ ang: 0, style: 0 }, { ang: -Math.PI / 2, style: 2 }] });
const room3 = buildOpRoom({ name: 'room3', center: [20, 20], rotY: -Math.PI / 2, doors: [{ ang: 0, style: 1 }, { ang: -Math.PI / 4, style: 0 }] });
// third side of the triangle: Room 3 → Room 1 along the diagonal (doorways at 45° on both rooms)
const DG = 6.88 * Math.SQRT1_2, LC = (20 - 2 * DG) * Math.SQRT2;
const corC = buildCorridor({ name: 'corC', start: [20 - DG, 20 - DG], rotY: -3 * Math.PI / 4, L: LC, palA: 'mono', palB: 'pink', styleA: 2, styleB: 0, drain: true, monoAtStart: true });
const corA = buildCorridor({ name: 'corA', start: [0, 6.88], dir: 'z', L: 6.24, palA: 'pink', palB: 'crimson', styleA: 0, styleB: 1 });
const corB = buildCorridor({ name: 'corB', start: [6.88, 20], dir: 'x', L: 6.24, palA: 'crimson', palB: 'mono', styleA: 1, styleB: 2, drain: true });
const SPACES = { r1: room1.root, cA: corA.root, r2: room2.root, cB: corB.root, r3: room3.root, cC: corC.root };
Object.values(SPACES).forEach((s) => scene.add(s));
const ROOMS = [room1, room2, room3, corA, corB, corC];
// control panels: one per room, beside the arrival spot, facing you, clear of the doorway paths (room-local positions)
const panelSys = createPanels({ renderer, rig, camera, onChange: applySettings, rooms: [
  { style: 'pink', root: room1.root, pos: [-1.25, 0.35], faceTo: [0, 1.6] },
  { style: 'crimson', root: room2.root, pos: [1.3, 4.5], faceTo: [0, 5.8] },
  { style: 'mono', root: room3.root, pos: [1.3, 4.5], faceTo: [0, 5.8] },
] });

// doorway planes (world): point, normal, lateral axis, fade colour
const DOORS = [
  { p: new THREE.Vector3(0, 0, 6.88), n: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(1, 0, 0), c: 0xb0103c, s: ['r1', 'cA'] },
  { p: new THREE.Vector3(0, 0, 13.12), n: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(1, 0, 0), c: 0x900818, s: ['cA', 'r2'] },
  { p: new THREE.Vector3(6.88, 0, 20), n: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, 0, 1), c: 0x70303a, s: ['r2', 'cB'] },
  { p: new THREE.Vector3(13.12, 0, 20), n: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, 0, 1), c: 0x9a9a9a, s: ['cB', 'r3'] },
  { p: new THREE.Vector3(20 - DG, 0, 20 - DG), n: new THREE.Vector3(1, 0, 1).normalize(), t: new THREE.Vector3(1, 0, -1).normalize(), c: 0x9a9a9a, s: ['r3', 'cC'] },
  { p: new THREE.Vector3(DG, 0, DG), n: new THREE.Vector3(1, 0, 1).normalize(), t: new THREE.Vector3(1, 0, -1).normalize(), c: 0xff4fa3, s: ['cC', 'r1'] },
];
// every doorway veil (both sides, and their mirror copies) shares one "open" uniform per doorway
DOORS.forEach((d) => { d.open = { value: 0 }; });
{ const wp = new THREE.Vector3(); scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (!o.userData.veil) return; o.getWorldPosition(wp);
    let best = DOORS[0], bd = Infinity; for (const d of DOORS) { const dd = Math.hypot(wp.x - d.p.x, wp.z - d.p.z); if (dd < bd) { bd = dd; best = d; } }
    o.material.uniforms.uOpen = best.open; }); }
// corridors as oriented strips: start S, unit direction D, length L (beds = [room bed at start, room bed at end])
const CORRS = [
  { k: 'cA', S: [0, 6.88], D: [0, 1], L: 6.24, beds: [0, 1] },
  { k: 'cB', S: [6.88, 20], D: [1, 0], L: 6.24, beds: [1, 2] },
  { k: 'cC', S: [20 - DG, 20 - DG], D: [-Math.SQRT1_2, -Math.SQRT1_2], L: LC, beds: [2, 0] },
];
const corrLocal = (c, x, z) => { const dx = x - c.S[0], dz = z - c.S[1]; return [dx * c.D[0] + dz * c.D[1], dx * c.D[1] - dz * c.D[0]]; };
function zoneOf(h) {
  for (const c of CORRS) { const [al, la] = corrLocal(c, h.x, h.z); if (al > 0 && al < c.L && Math.abs(la) < 1.35) return c.k; }
  const d1 = Math.hypot(h.x, h.z), d2 = Math.hypot(h.x, h.z - 20), d3 = Math.hypot(h.x - 20, h.z - 20);
  return d1 <= d2 && d1 <= d3 ? 'r1' : d2 <= d3 ? 'r2' : 'r3';
}
// walkable area: room circles + corridor strips
const REGIONS = [
  { c: [0, 0], r: R - 0.9 }, { c: [0, 20], r: R - 0.9 }, { c: [20, 20], r: R - 0.9 },
  ...CORRS.map((c) => ({ corr: c })),
];
function nearestIn(rg, x, z) {
  if (rg.c) { const dx = x - rg.c[0], dz = z - rg.c[1], d = Math.hypot(dx, dz); return d <= rg.r ? [x, z] : [rg.c[0] + (dx / d) * rg.r, rg.c[1] + (dz / d) * rg.r]; }
  const c = rg.corr; let [al, la] = corrLocal(c, x, z);
  al = Math.min(c.L + 1.3, Math.max(-1.3, al)); la = Math.min(0.95, Math.max(-0.95, la));
  return [c.S[0] + al * c.D[0] + la * c.D[1], c.S[1] + al * c.D[1] - la * c.D[0]];
}
const headP = new THREE.Vector3();
function clampToWorld() {
  camera.getWorldPosition(headP);
  let best = null, bd = Infinity;
  for (const rg of REGIONS) { const [nx, nz] = nearestIn(rg, headP.x, headP.z); const d = Math.hypot(nx - headP.x, nz - headP.z); if (d < 1e-6) return; if (d < bd) { bd = d; best = [nx, nz]; } }
  rig.position.x += best[0] - headP.x; rig.position.z += best[1] - headP.z;
}

// ---------- quality / visibility ----------
const quality = { haze: true, mirror: OPT.mirror, particles: true };
let zone = null;
function applyVisibility() {
  for (const [k, s] of Object.entries(SPACES)) s.visible = k === zone || DOORS.some((d) => d.open.value > 0.003 && d.s.includes(k) && d.s.includes(zone));
  for (const rm of ROOMS) {
    rm.haze.forEach((o) => { o.visible = quality.haze; });
    if (rm.mirror) rm.mirror.visible = quality.mirror;
    if (rm.points) rm.points.visible = quality.particles;
  }
  U.uMirror.value = quality.mirror ? 1 : 0;
}
// fade shell around the head: hides the moment you pass through a veil
const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.BackSide });
fadeMat.userData.bp = true;   // safety fade stays pure black
const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), fadeMat); fadeMesh.renderOrder = 1000; fadeMesh.frustumCulled = false; camera.add(fadeMesh);
const tmp = new THREE.Vector3();
// Doorways: as you approach, the veil irises open and the next space is drawn behind it, so walking through is a real,
// continuous view (no fade). The head-fade only remains as a tiny safety net if the iris is somehow still closed at the plane
// (e.g. a snap-teleport), and then only within ±12 cm of the plane.
function updateDoors(h, dt) {
  let f = 0, col = 0;
  for (const d of DOORS) {
    tmp.subVectors(h, d.p); const along = tmp.dot(d.n), lat = tmp.dot(d.t), dist = Math.hypot(along, lat);
    const target = 1 - THREE.MathUtils.smoothstep(dist, 1.5, 2.9);
    d.open.value += (target - d.open.value) * Math.min(1, dt * 5);
    if (Math.abs(target - d.open.value) < 0.002) d.open.value = target;
    if (Math.abs(lat) < 1.5 && h.y < 3.8) { const v = (1 - d.open.value) * (1 - THREE.MathUtils.smoothstep(Math.abs(along), 0.03, 0.12)); if (v > f) { f = v; col = d.c; } }
  }
  fadeMat.opacity = f; if (f > 0) fadeMat.color.setHex(col); fadeMesh.visible = f > 0.002;
}

// ---------- tunnel video swap (Room 1) ----------
let videoEl = null;
async function assetExists(url) { try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; } }
async function tryLoadTunnelVideo() {
  if (videoEl || tunnelU.uVidMix.value <= 0) return;
  if (!(await assetExists(ASSET_VIDEO))) return;
  const v = document.createElement('video');
  Object.assign(v, { src: ASSET_VIDEO, loop: true, muted: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  videoEl = v;
  v.addEventListener('loadeddata', () => {
    const tex = new THREE.VideoTexture(v); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const A = (v.videoWidth || 1) / (v.videoHeight || 1);
    tunnelU.uVidScale.value.set(Math.min(1, 1 / A), Math.min(1, A));
    tunnelU.uVideo.value = tex; tunnelU.uHasVideo.value = 1; v.playbackRate = settings.speed;
    console.log('[chamber] tunnel video active', v.videoWidth + 'x' + v.videoHeight, 'mix', tunnelU.uVidMix.value);
  }, { once: true });
  v.addEventListener('error', () => { console.warn('[chamber] tunnel video not playable yet; retrying later'); videoEl = null; });
  v.play().catch(() => {});
}
tryLoadTunnelVideo();
const videoPoll = setInterval(() => { if (tunnelU.uHasVideo.value > 0.5 || tunnelU.uVidMix.value <= 0) clearInterval(videoPoll); else tryLoadTunnelVideo(); }, 20000);

// ---------- audio: one beat clock, three room beds crossfaded by position ----------
const A = { ctx: null, t0: 0, master: null, beds: [], noise: null, next: 0, drone1: null, drone1F: null, drone2: null, drone2F: null, w: [1, 0, 0] };
const soundBtn = document.getElementById('sound');
function setParam(node, name, x, y, z) {
  if (node[name + 'X']) { node[name + 'X'].value = x; node[name + 'Y'].value = y; node[name + 'Z'].value = z; }
  else if (name === 'position' && node.setPosition) node.setPosition(x, y, z);
}
function osc(ctx, type, f, gain, dest, t) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(dest); o.start(t); return o; }
function panner(ctx, pos, dest, ref = 2.5) {
  const p = ctx.createPanner(); Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, rolloffFactor: 1.2 });
  setParam(p, 'position', pos.x, pos.y, pos.z); p.connect(dest); return p;
}
async function startAudio() {
  if (videoEl) videoEl.play().catch(() => {});
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)(); A.ctx = ctx;
  try { await ctx.resume(); } catch {}
  soundBtn.textContent = '♪ Sound on'; soundBtn.disabled = true;
  A.next = Math.floor(visualTime() / BEAT) + 1;
  const now = ctx.currentTime;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.setValueAtTime(0.0001, now); master.gain.exponentialRampToValueAtTime(0.9, now + 3); master.connect(comp); A.master = master;
  A.beds = [0, 1, 2].map((i) => { const g = ctx.createGain(); g.gain.value = A.w[i]; g.connect(master); return g; });
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; A.noise = nb;
  const [b1, b2, b3] = A.beds;
  // bed 1 (pink): ambient loop + warm drone + positional tunnel hum
  fetch(ASSET_AUDIO).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((b) => ctx.decodeAudioData(b)).then((buf) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const g = ctx.createGain(); g.gain.value = 0.5; s.connect(g); g.connect(b1); s.start();
    console.log('[chamber] ambient_loop.mp3 playing (room 1 bed)');
  }).catch((e) => console.log('[chamber] no ambient loop, synth only', e));
  { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.9; const g = ctx.createGain(); g.gain.value = 0.16; f.connect(g); g.connect(b1);
    A.drone1 = g; A.drone1F = f;
    for (const [fr, ty, gn] of [[55, 'sine', 0.5], [55.3, 'sine', 0.4], [82.4, 'triangle', 0.16], [110.2, 'sine', 0.1], [164.8, 'sine', 0.04]]) osc(ctx, ty, fr, gn, f, now); }
  if (OPT.spatial) { const p = panner(ctx, room1.focalWorld, b1); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.connect(p); osc(ctx, 'sawtooth', 73.4, 0.07, lp, now); }
  // bed 2 (crimson): darker, heavier drone + slow breath + positional vortex rumble
  { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 170; f.Q.value = 1.2; const g = ctx.createGain(); g.gain.value = 0.22; f.connect(g); g.connect(b2);
    A.drone2 = g; A.drone2F = f;
    for (const [fr, ty, gn] of [[41.2, 'sine', 0.55], [41.45, 'sine', 0.45], [61.7, 'triangle', 0.18], [82.4, 'sawtooth', 0.04]]) osc(ctx, ty, fr, gn, f, now);
    const n = ctx.createBufferSource(); n.buffer = nb; n.loop = true; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const ng = ctx.createGain(); ng.gain.value = 0.025; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.125 * settings.speed; A.lfo2 = lfo; const lg = ctx.createGain(); lg.gain.value = 0.022;
    lfo.connect(lg); lg.connect(ng.gain); n.connect(lp); lp.connect(ng); ng.connect(b2); n.start(now); lfo.start(now);
    if (OPT.spatial) { const p = panner(ctx, room2.focalWorld, b2, 3); const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 150; lp2.connect(p); osc(ctx, 'sawtooth', 55, 0.09, lp2, now); } }
  // bed 3 (monochrome): crisp, minimal — clean fifth pad with a slow tremolo at the beat rate
  { const g = ctx.createGain(); g.gain.value = 0.5; g.connect(b3);
    const trem = ctx.createGain(); trem.gain.value = 0.6; trem.connect(g);
    const lfo = ctx.createOscillator(); lfo.frequency.value = settings.speed / BEAT; A.lfo3 = lfo; const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(trem.gain); lfo.start(now);
    for (const [fr, gn] of [[220, 0.025], [329.6, 0.018], [440.5, 0.006]]) osc(ctx, 'sine', fr, gn, trem, now); }
}
function noiseBurst(dest, at, f, q, gain, dur) {
  const ctx = A.ctx, n = ctx.createBufferSource(); n.buffer = A.noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  n.connect(bp); bp.connect(g); g.connect(dest); n.start(at, Math.random()); n.stop(at + dur + 0.02);
}
function thump(dest, at, f0, f1, gain, decay) {
  const ctx = A.ctx, o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + 0.4);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(g); g.connect(dest); o.start(at); o.stop(at + decay + 0.05);
}
function scheduleBeat(n) {
  const ctx = A.ctx, k = 1 / settings.speed, at = ctx.currentTime + (n * BEAT - visualTime()) * k; if (at < ctx.currentTime + 0.02) return;
  const I = intensityAt(n * BEAT), surge = n % 4 === 3, amp = (0.5 + 0.5 * I) * (surge ? 1.3 : 1);
  const [b1, b2, b3] = A.beds;
  // room 1: kick + riser, chime on surges, drone pump
  thump(b1, at, 120, 40, 0.75 * amp, 1.3);
  { const rs = Math.max(ctx.currentTime, at - 1.6 * k), n1 = ctx.createBufferSource(); n1.buffer = A.noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(220, rs); bp.frequency.exponentialRampToValueAtTime(2200, at);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, rs); ng.gain.exponentialRampToValueAtTime(0.05 * amp, at - 0.02); ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    n1.connect(bp); bp.connect(ng); ng.connect(b1); n1.start(rs); n1.stop(at + 0.35); }
  A.drone1.gain.setTargetAtTime(0.06, at, 0.02); A.drone1.gain.setTargetAtTime(0.16 + 0.08 * I, at + 0.1 * k, 0.8);
  A.drone1F.frequency.setTargetAtTime(240 + 700 * I, at, 1.5);
  if (surge) for (const [f, d0] of [[659.25, 0], [987.77, 0.08], [1318.5, 0.16]]) {
    const d = d0 * k;
    const c = ctx.createOscillator(); c.frequency.value = f; const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, at + d); cg.gain.exponentialRampToValueAtTime(0.035 * I, at + d + 0.03); cg.gain.exponentialRampToValueAtTime(0.0001, at + d + 3.0);
    c.connect(cg); cg.connect(b1); c.start(at + d); c.stop(at + d + 3.1);
  }
  // room 2: heavy lub-dub heartbeat, drone pump
  thump(b2, at, 95, 32, 0.85 * amp, 0.9); thump(b2, at + 0.28 * k, 85, 30, 0.55 * amp, 0.8);
  A.drone2.gain.setTargetAtTime(0.08, at, 0.02); A.drone2.gain.setTargetAtTime(0.22 + 0.06 * I, at + 0.45 * k, 0.9);
  A.drone2F.frequency.setTargetAtTime(150 + 300 * I, at, 2.0);
  // room 3: crisp minimal pulse — short clean thump + click on the beat, soft ticks once per second
  thump(b3, at, 70, 50, 0.5 * amp, 0.35); noiseBurst(b3, at, 3200, 6, 0.08, 0.03);
  for (let j = 1; j < 4; j++) noiseBurst(b3, at + j * k, 4200, 8, 0.025, 0.02);
}
soundBtn.addEventListener('click', startAudio);
function updateBeds(h) {
  let w;
  const c = CORRS.find((cc) => cc.k === zone);
  if (c) { const t = THREE.MathUtils.clamp(corrLocal(c, h.x, h.z)[0] / c.L, 0, 1); w = [0, 0, 0]; w[c.beds[0]] += 1 - t; w[c.beds[1]] += t; }
  else w = zone === 'r1' ? [1, 0, 0] : zone === 'r2' ? [0, 1, 0] : [0, 0, 1];
  A.w = w;
  if (A.ctx && A.beds.length) A.beds.forEach((g, i) => g.gain.setTargetAtTime(w[i], A.ctx.currentTime, 0.25));
}

// ---------- clock ----------
// The visual clock advances at (real time x animation speed). Real time comes from the audio clock once sound is on, so
// the scheduled beats stay locked to the visuals; every shader, rotation, particle and the beat itself runs off this clock.
let vt = +(Q.get('t') || 0), frozenT = null, lastReal = 0, lastSrc = '';
function advanceClock() {
  const useA = !!(A.ctx && A.ctx.state === 'running'), now = useA ? A.ctx.currentTime : performance.now() / 1000, src = useA ? 'a' : 'p';
  if (src !== lastSrc) { lastSrc = src; lastReal = now; }
  vt += Math.min(Math.max(now - lastReal, 0), 0.25) * settings.speed; lastReal = now;
}
const visualTime = () => (frozenT !== null ? frozenT : vt);
// brightness: one global multiplier on every shader's output (+ colour of the few built-in materials)
const BRIGHT_MATS = [];
function patchBright(m) {
  if (!m || m.userData.bp) return; m.userData.bp = true;
  if (m.isShaderMaterial) {
    if (!/void\s+main\s*\(/.test(m.fragmentShader)) return;
    m.uniforms.uBright = U.uBright;
    m.fragmentShader = 'uniform float uBright;\n' + m.fragmentShader.replace(/void\s+main\s*\(\s*(void)?\s*\)/, 'void mainInner()') +
      '\nvoid main(){ mainInner(); gl_FragColor.rgb *= uBright; }';
  } else if (m.color) { m.userData.c0 = m.color.clone(); BRIGHT_MATS.push(m); }
}
function applySettings() {
  const b = settings.bright; U.uBright.value = b;
  for (const m of BRIGHT_MATS) m.color.copy(m.userData.c0).multiplyScalar(b);
  renderer.setClearColor(new THREE.Color(0x030002).multiplyScalar(b));
  if (videoEl) videoEl.playbackRate = settings.speed;
  if (A.ctx) { const now = A.ctx.currentTime;
    if (A.lfo2) A.lfo2.frequency.setTargetAtTime(0.125 * settings.speed, now, 0.1);
    if (A.lfo3) A.lfo3.frequency.setTargetAtTime(settings.speed / BEAT, now, 0.1); }
}
function intensityAt(t) { const c = t % 210; return 0.4 + 0.6 * THREE.MathUtils.smoothstep(c, 0, 120) * (1 - THREE.MathUtils.smoothstep(c, 190, 210)); }

// ---------- VR + locomotion ----------
const vrButton = VRButton.createButton(renderer); document.body.appendChild(vrButton);
vrButton.addEventListener('click', startAudio);
renderer.xr.addEventListener('sessionstart', () => { camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); perf.reset(); });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, 1.6, 0); applyLook(); });
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), mv = new THREE.Vector3();
let snapReady = true;
function xrLocomotion(dt) {
  const session = renderer.xr.getSession(); if (!session) return;
  const xrCam = renderer.xr.getCamera();
  for (const src of session.inputSources) {
    const gp = src.gamepad; if (!gp || gp.axes.length < 2) continue;
    const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0], ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];
    if (src.handedness === 'left') {
      if (Math.abs(ax) < 0.15 && Math.abs(ay) < 0.15) continue;
      xrCam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, UP).normalize();
      rig.position.add(mv.copy(fwd).multiplyScalar(-ay).addScaledVector(right, ax).multiplyScalar(1.5 * dt)); clampToWorld();
    } else if (src.handedness === 'right') {
      if (Math.abs(ax) > 0.7 && snapReady) {
        snapReady = false; const ang = -Math.sign(ax) * Math.PI / 6; xrCam.getWorldPosition(headP);
        rig.position.sub(headP).applyAxisAngle(UP, ang).add(headP); rig.rotation.y += ang;
      } else if (Math.abs(ax) < 0.3) snapReady = true;
    }
  }
}
const perf = {
  acc: 0, n: 0, level: 0,
  reset() { this.acc = 0; this.n = 0; },
  sample(dt) {
    if (!renderer.xr.isPresenting || this.level >= 3) return;
    this.acc += dt; this.n++; if (this.acc < 3) return;
    const avg = this.acc / this.n; this.reset();
    if (avg > 1 / 60) {
      this.level++;
      if (this.level === 1) quality.haze = false;
      if (this.level === 2) quality.mirror = false;
      if (this.level === 3) quality.particles = false;
      applyVisibility(); console.log('[chamber] perf step-down', this.level, (1 / avg).toFixed(0) + 'fps');
    }
  },
};

// ---------- desktop controls ----------
let yaw = 0, pitch = 0.2, dragging = false, lx = 0, ly = 0; const keys = new Set();
function applyLook() { camera.rotation.set(pitch, yaw, 0, 'YXZ'); }
applyLook();
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => { if (panelSys.mouseDown(e)) return; dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
el.addEventListener('pointermove', (e) => { if (!dragging) { panelSys.mouseMove(e); return; } yaw += (e.clientX - lx) * 0.004; pitch = Math.max(-1.3, Math.min(1.3, pitch + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY; applyLook(); });
el.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('keydown', (e) => keys.add(e.code)); window.addEventListener('keyup', (e) => keys.delete(e.code));
function desktopMove(dt) {
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f++; if (keys.has('KeyS') || keys.has('ArrowDown')) f--;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s++; if (keys.has('KeyA') || keys.has('ArrowLeft')) s--;
  if (!f && !s) return;
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  rig.position.addScaledVector(fwd, f * 2.2 * dt).addScaledVector(right, s * 2.2 * dt); clampToWorld();
}
// start room option (?room=2 / ?room=3), handy for previews
{ const r = Q.get('room'); if (r === '2') { rig.position.set(0, 0, 14.5); yaw = Math.PI; } else if (r === '3') { rig.position.set(14.5, 0, 20); yaw = -Math.PI / 2; } applyLook(); }
window.__view = (y, p, z = START_Z, x = 0) => { yaw = y; pitch = p; rig.position.set(x, 0, z); applyLook(); };
window.__freeze = (t) => { frozenT = t; };
window.__zone = () => zone; window.__scene = scene;
window.__settings = () => ({ speed: settings.speed, bright: settings.bright, vt });
window.__act = (id) => panelSys.act(id);
// screen position of a panel button (room 0..2, button 0..4), for testing with the mouse
window.__btnScreen = (r, b) => { const m = panelSys.panels[r].buttons[b]; scene.updateMatrixWorld(true); const p = m.getWorldPosition(new THREE.Vector3()).project(camera);
  return [(p.x + 1) / 2 * window.innerWidth, (1 - p.y) / 2 * window.innerHeight]; };
window.__stats = () => ({ zone, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, progs: renderer.info.programs.length });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// ---------- precompile every room's shaders up front (avoids a hitch on first entering a room) ----------
scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(patchBright); });
applySettings();
Object.values(SPACES).forEach((sp) => { sp.visible = true; });
try { renderer.compile(scene, camera); } catch (e) { console.warn('[chamber] precompile skipped', e); }

// ---------- loop ----------
const fwdA = new THREE.Vector3(), upA = new THREE.Vector3(), szV = new THREE.Vector2();
let lastHud = -1, frames = 0, prev = performance.now();
renderer.setAnimationLoop(() => {
  const nowMs = performance.now(); const dt = Math.min((nowMs - prev) / 1000, 0.1); prev = nowMs;
  if (renderer.xr.isPresenting) { xrLocomotion(dt); perf.sample(dt); } else desktopMove(dt);
  camera.updateMatrixWorld(true);
  const xrCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  xrCam.getWorldPosition(headP);
  zone = zoneOf(headP);
  updateDoors(headP, dt); applyVisibility(); updateBeds(headP);
  advanceClock(); panelSys.update(dt, visualTime());
  const t = visualTime(); const I = intensityAt(t);
  const n = Math.floor(t / BEAT), tb = t - n * BEAT, surge = n % 4 === 3;
  const amp = (0.55 + 0.45 * I) * (surge ? 1.3 : 1);
  const swell = Math.pow(THREE.MathUtils.smoothstep(tb, BEAT - 1.6, BEAT), 2);
  U.uTime.value = t; U.uInt.value = I; U.uBeatT.value = tb;
  U.uBeat.value = Math.max(Math.exp(-tb * 2.2), 0.35 * swell) * amp;
  U.uSurge.value = surge ? Math.exp(-tb * 1.2) : 0;
  if (renderer.xr.isPresenting) { const bl = renderer.xr.getSession().renderState.baseLayer; if (bl) U.uPx.value = bl.framebufferHeight / 2; }
  else { renderer.getDrawingBufferSize(szV); U.uPx.value = szV.y / 2; }
  if (A.ctx) {
    while ((A.next * BEAT - t) / settings.speed < 1.8) scheduleBeat(A.next++);
    xrCam.updateMatrixWorld(); const L = A.ctx.listener; const e = xrCam.matrixWorld.elements;
    setParam(L, 'position', e[12], e[13], e[14]);
    fwdA.set(-e[8], -e[9], -e[10]).normalize(); upA.set(e[4], e[5], e[6]).normalize();
    if (L.forwardX) { L.forwardX.value = fwdA.x; L.forwardY.value = fwdA.y; L.forwardZ.value = fwdA.z; L.upX.value = upA.x; L.upY.value = upA.y; L.upZ.value = upA.z; }
    else if (L.setOrientation) L.setOrientation(fwdA.x, fwdA.y, fwdA.z, upA.x, upA.y, upA.z);
  }
  const tick = Math.floor(t * 2);
  if (zone === 'r1' && room1.hud && tick !== lastHud) { lastHud = tick; room1.hud.draw(t, I); }
  renderer.render(scene, camera);
  if (++frames === 3) window.__ready = true;
});
