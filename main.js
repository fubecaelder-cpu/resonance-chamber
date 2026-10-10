// Resonance Chamber v5 — three WebXR rooms in a triangle (pink chamber, crimson vortex room, monochrome op-art room),
// with in-world control panels (animation speed, brightness, and v6 media: your own video on the room monitors).
// URL options: ?quality=low  ?scale=1.4  ?mirror=0  ?video=0|blend|full  ?fov=0.6  ?particles=900  ?spatial=0  ?room=1|2|3
import { THREE, Q, OPT, U, BEAT, R, TY, TZ, START_Z, VEIL_R, MON_GEO, env } from './shared.js?v=17';
import { VRButton } from './lib/VRButton.js';
import { buildChamber } from './chamber.js?v=17';
import { pinkRoomCfg } from './pinkroom.js?v=17';
import { buildOpRoom } from './oproom.js?v=17';
import { buildCorridor } from './corridor.js?v=17';
import { createPanels, settings, THETA_VOLS } from './panels.js?v=17';
import { createMedia, buildMonitor, roomMedia } from './media.js?v=17';
import { createScreens } from './screens.js?v=17';
import { createPods } from './pods.js?v=17';

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
const tunnelU = { uVideo: { value: null }, uHasVideo: { value: 0 }, uVidScale: { value: new THREE.Vector2(1, 1) },
  uVidMix: { value: OPT.video === 'full' ? 1.0 : OPT.video === '0' ? 0.0 : 0.32 }, uProc: { value: OPT.video === 'full' ? 0.0 : 1.0 } };
// ---------- layout (v8): an equilateral triangle, side 20 m. Every room's focal axis points away from the triangle's centre,
// and its two doorways sit mirrored at ±30° either side of the axis behind you, each looking straight down a corridor.
const SIDE = 20, DA = Math.PI / 6;
const RC = [[0, 0], [0, SIDE], [SIDE * Math.sqrt(3) / 2, SIDE / 2]];                 // pink, crimson, op-art centres
const CEN = [(RC[0][0] + RC[1][0] + RC[2][0]) / 3, (RC[0][1] + RC[1][1] + RC[2][1]) / 3];
const RY = RC.map(([x, z]) => Math.atan2(CEN[0] - x, CEN[1] - z));                   // local +z (behind the arrival) faces the centre
// door local angle for the door in room i that leads to room j (+30° or −30°)
const doorAng = (i, j) => { const w = Math.atan2(RC[j][0] - RC[i][0], RC[j][1] - RC[i][1]); return Math.atan2(Math.sin(w - RY[i]), Math.cos(w - RY[i])) > 0 ? DA : -DA; };
const doorPos = (i, j) => { const a = RY[i] + doorAng(i, j); return [RC[i][0] + Math.sin(a) * VEIL_R, RC[i][1] + Math.cos(a) * VEIL_R]; };
const doorsOf = (i) => [0, 1, 2].filter((j) => j !== i).map((j) => ({ ang: doorAng(i, j), style: j })).sort((a, b) => a.ang - b.ang);
const room1 = buildChamber({ ...pinkRoomCfg(tunnelU), center: RC[0], rotY: RY[0], doors: doorsOf(0) });
const room2 = buildChamber({ name: 'room2', center: RC[1], rotY: RY[1], pal: 'crimson', focal: 'vortex', gyro: true,
  podIdx: [2, 4], doors: doorsOf(1) });
const room3 = buildOpRoom({ name: 'room3', center: RC[2], rotY: RY[2], doors: doorsOf(2) });
// corridors run straight along the triangle's sides, door to door
const CDEF = [
  { k: 'cA', i: 0, j: 1, palA: 'pink', palB: 'crimson', styleA: 0, styleB: 1 },
  { k: 'cB', i: 1, j: 2, palA: 'crimson', palB: 'mono', styleA: 1, styleB: 2, drain: true },
  { k: 'cC', i: 2, j: 0, palA: 'mono', palB: 'pink', styleA: 2, styleB: 0, drain: true, monoAtStart: true },
].map((c) => { const S = doorPos(c.i, c.j), E = doorPos(c.j, c.i), L = Math.hypot(E[0] - S[0], E[1] - S[1]);
  return { ...c, S, E, L, D: [(E[0] - S[0]) / L, (E[1] - S[1]) / L] }; });
const [corA, corB, corC] = CDEF.map((c) => buildCorridor({ name: 'cor' + c.k[1], start: c.S, rotY: Math.atan2(c.D[0], c.D[1]), L: c.L,
  palA: c.palA, palB: c.palB, styleA: c.styleA, styleB: c.styleB, drain: !!c.drain, monoAtStart: !!c.monoAtStart }));
const toWorld = (i, x, z) => { const c = Math.cos(RY[i]), s = Math.sin(RY[i]); return [RC[i][0] + x * c + z * s, RC[i][1] - x * s + z * c]; };
const SPACES = { r1: room1.root, cA: corA.root, r2: room2.root, cB: corB.root, r3: room3.root, cC: corC.root };
Object.values(SPACES).forEach((s) => scene.add(s));
const ROOMS = [room1, room2, room3, corA, corB, corC];
// ---------- media: one shared video on the main monitor of every room ----------
const mon2 = buildMonitor(room2.kit, room2.world, room2.root, 1, 'crimson', MON_GEO);   // v10: same monitor geometry in every room
const mon3 = buildMonitor(room3.kit, room3.world, room3.root, 2, 'mono', MON_GEO);
room1.root.updateMatrixWorld(true);
const MON_POS = [room1.root.localToWorld(new THREE.Vector3(0, room1.hud.SCR.y, -room1.hud.SCR.r + 0.3)), mon2.worldPos, mon3.worldPos];
let panelsReady = false;
const media = createMedia({ monitorPos: MON_POS, onChange: () => { if (panelsReady) panelSys.redrawMedia(); updateOverlay(); } });
media.setRenderer(renderer);
// control panels: one per room, beside the arrival spot, facing you, clear of the doorway paths (room-local positions)
// arrival spot: between the two doorways, facing the focal; the panel stands in the same place in every room, ahead-right
// of you as you come in through either doorway, turned towards the doorways
const SPAWN = [0, 3.6], PANEL_POS = [1.75, 2.15], PANEL_FACE = [0, 4.8];
// v9: movable monitors (SCREEN wing on each panel)
const screens = createScreens({ onChange: (i) => { if (panelsReady) panelSys.redrawScreen(i); }, monitors: [
  { mount: room1.hud.mount, brackets: room1.hud.brackets, geo: room1.hud.geo, root: room1.root, kit: room1.kit, monPos: MON_POS[0] },
  { mount: mon2.mount, brackets: mon2.brackets, geo: mon2.geo, root: room2.root, kit: room2.kit, monPos: MON_POS[1] },
  { mount: mon3.mount, brackets: mon3.brackets, geo: mon3.geo, root: room3.root, kit: room3.kit, monPos: MON_POS[2] },
] });
const pods = createPods({ media, onChange: () => { if (panelsReady) panelSys.redrawMedia(); }, rooms: [
  { root: room1.root, spots: room1.podSpots, tint: 0xff4fa3 },
  { root: room2.root, spots: room2.podSpots, tint: 0xff2038 },
  { root: room3.root, spots: room3.podSpots, tint: 0xffffff },
] });
const panelSys = createPanels({ renderer, rig, camera, onChange: applySettings, media, screens, pods, rooms: [
  { style: 'pink', root: room1.root, pos: PANEL_POS, faceTo: PANEL_FACE },
  { style: 'crimson', root: room2.root, pos: PANEL_POS, faceTo: PANEL_FACE },
  { style: 'mono', root: room3.root, pos: PANEL_POS, faceTo: PANEL_FACE },
] });
panelsReady = true;

// doorway planes (world): point, normal, lateral axis, fade colour
const DCOL = { cA: [0xb0103c, 0x900818], cB: [0x70303a, 0x9a9a9a], cC: [0x9a9a9a, 0xff4fa3] };
const DOORS = CDEF.flatMap((c) => { const n = new THREE.Vector3(c.D[0], 0, c.D[1]), t = new THREE.Vector3(c.D[1], 0, -c.D[0]), rk = (i) => 'r' + (i + 1);
  return [{ p: new THREE.Vector3(c.S[0], 0, c.S[1]), n, t, c: DCOL[c.k][0], s: [rk(c.i), c.k] }, { p: new THREE.Vector3(c.E[0], 0, c.E[1]), n, t, c: DCOL[c.k][1], s: [c.k, rk(c.j)] }]; });
// every doorway veil (both sides, and their mirror copies) shares one "open" uniform per doorway
DOORS.forEach((d) => { d.open = { value: 0 }; });
{ const wp = new THREE.Vector3(); scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (!o.userData.veil) return; o.getWorldPosition(wp);
    let best = DOORS[0], bd = Infinity; for (const d of DOORS) { const dd = Math.hypot(wp.x - d.p.x, wp.z - d.p.z); if (dd < bd) { bd = dd; best = d; } }
    o.material.uniforms.uOpen = best.open; }); }
// corridors as oriented strips: start S, unit direction D, length L (beds = [room bed at start, room bed at end])
const CORRS = CDEF.map((c) => ({ k: c.k, S: c.S, D: c.D, L: c.L, beds: [c.i, c.j] }));
const corrLocal = (c, x, z) => { const dx = x - c.S[0], dz = z - c.S[1]; return [dx * c.D[0] + dz * c.D[1], dx * c.D[1] - dz * c.D[0]]; };
function zoneOf(h) {
  for (const c of CORRS) { const [al, la] = corrLocal(c, h.x, h.z); if (al > 0 && al < c.L && Math.abs(la) < 1.35) return c.k; }
  const [d1, d2, d3] = RC.map(([x, z]) => Math.hypot(h.x - x, h.z - z));
  return d1 <= d2 && d1 <= d3 ? 'r1' : d2 <= d3 ? 'r2' : 'r3';
}
// walkable area: room circles + corridor strips
const REGIONS = [
  ...RC.map((c) => ({ c, r: R - 0.9 })),
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
function applyTheta(ramp = 0.4) {   // gentle: 100% on the panel is a gain of 0.08 per ear
  if (!A.theta) return; const g = settings.theta ? 0.08 * THETA_VOLS[settings.thetaI] / 100 : 0;
  const p = A.theta.gain, t = A.ctx.currentTime, v = p.value;   // hold the current level, then glide (never jumps to the default gain of 1)
  p.cancelScheduledValues(t); p.setValueAtTime(v, t); p.setTargetAtTime(g, t, ramp / 3);
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
  // v14: constant 6 Hz theta binaural beat (200 Hz left / 206 Hz right). Goes straight to the stereo output through a
  // ChannelMerger (no panner, compressor or mono mixing), so each ear gets only its own tone everywhere in the world.
  { const merger = ctx.createChannelMerger(2), out = ctx.createGain(); out.channelCount = 2; out.channelCountMode = 'explicit'; out.channelInterpretation = 'discrete';
    for (const [f, ch] of [[200, 0], [206, 1]]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(merger, 0, ch); o.start(now); }
    out.gain.value = 0; merger.connect(out); out.connect(ctx.destination); A.theta = out; applyTheta(4); }
  media.attachAudio(ctx, comp);   // the video soundtrack bypasses the bed fade-in and is not ducked
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
  const duck = media.audible() ? 0.5 : 1;   // the ambient beds dip while your video's soundtrack plays
  if (A.ctx && A.beds.length) A.beds.forEach((g, i) => g.gain.setTargetAtTime(w[i] * duck, A.ctx.currentTime, 0.25));
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
  const b = settings.bright; U.uBright.value = b; applyTheta();
  for (const m of BRIGHT_MATS) m.color.copy(m.userData.c0).multiplyScalar(b);
  renderer.setClearColor(new THREE.Color(0x030002).multiplyScalar(b));
  if (videoEl) videoEl.playbackRate = settings.speed;
  if (A.ctx) { const now = A.ctx.currentTime;
    if (A.lfo2) A.lfo2.frequency.setTargetAtTime(0.125 * settings.speed, now, 0.1);
    if (A.lfo3) A.lfo3.frequency.setTargetAtTime(settings.speed / BEAT, now, 0.1); }
}
function intensityAt(t) { const c = t % 210; return 0.4 + 0.6 * THREE.MathUtils.smoothstep(c, 0, 120) * (1 - THREE.MathUtils.smoothstep(c, 190, 210)); }

// ---------- VR + locomotion ----------
// v16: local-floor is preferred; if a headset can't give it, fall back to 'local' and lift the rig 1.6 m
let floorBase = 0;
if (window.XRSession && XRSession.prototype.requestReferenceSpace) {
  const orig = XRSession.prototype.requestReferenceSpace;
  XRSession.prototype.requestReferenceSpace = function (type) {
    if (type !== 'local-floor') return orig.call(this, type);
    return orig.call(this, type).then((s) => { floorBase = 0; return s; }, () => { console.warn('[xr] local-floor unavailable: using local + 1.6 m'); floorBase = 1.6; return orig.call(this, 'local'); });
  };
}
const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }); document.body.appendChild(vrButton);
vrButton.addEventListener('click', startAudio);
renderer.xr.addEventListener('sessionstart', () => { camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); perf.reset(); });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, 1.6, 0); applyLook(); });
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), mv = new THREE.Vector3();
let snapReady = true;
// v14: sprint toggle (2x smooth locomotion). VR: click either thumbstick. Desktop: Shift toggles. Also the SPRINT panel button.
const stickWas = new Map();
const sprintHud = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,0,10,0.75)'; g.beginPath(); g.roundRect(4, 4, 248, 56, 20); g.fill(); g.strokeStyle = '#ff6eb4'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#ffffff'; g.font = '800 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('» SPRINT ON', 128, 33);
  const t = new THREE.CanvasTexture(c); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  m.position.set(0, -0.2, -0.6); m.renderOrder = 999; m.visible = false; camera.add(m); return m; })();
const sprintMul = () => (settings.sprint ? 2 : 1);
function toggleSprint(src) {
  panelSys.act('sprint');
  const ha = src && src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0];
  if (ha) { try { ha.pulse ? ha.pulse(settings.sprint ? 0.6 : 0.3, settings.sprint ? 60 : 30) : ha.playEffect && ha.playEffect('dual-rumble', { duration: 50, strongMagnitude: 0.5, weakMagnitude: 0.5 }); } catch { /* no haptics */ } }
}
// ---------- v16: hands + teleport ----------
// Hand joints are drawn as small spheres. Right hand (or either controller's trigger): point at the floor, a dotted arc and
// ring show the spot, pinch/trigger and release to teleport there (short fade). Left hand: pinch and hold to glide in the
// direction you're looking. Pointing at a panel presses its buttons instead (pinch or trigger), and fingertips poke them.
const jointGeo = new THREE.SphereGeometry(0.008, 8, 6), jointMat = new THREE.MeshBasicMaterial({ color: 0xffc0db });
const hands = [0, 1].map((i) => renderer.xr.getHand(i));
function updateHandJoints() {
  for (const h of hands) for (const [name, j] of Object.entries(h.joints || {})) if (!j.userData.ball) {
    const b = new THREE.Mesh(jointGeo, jointMat); if (/tip/.test(name)) b.scale.setScalar(1.3); j.add(b); j.userData.ball = b; }
}
const tpRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
tpRing.rotation.x = -Math.PI / 2; tpRing.visible = false; tpRing.renderOrder = 998; scene.add(tpRing);
const ARCN = 32, arcGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARCN * 3), 3));
const tpArc = new THREE.Points(arcGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.025, transparent: true, opacity: 0.8, depthWrite: false })); tpArc.frustumCulled = false; tpArc.visible = false; scene.add(tpArc);
const tp = [0, 1].map((i) => { const c = renderer.xr.getController(i); const s = { c, i, src: null, aiming: false, held: false, target: null };
  c.addEventListener('connected', (e) => { s.src = e.data; }); c.addEventListener('disconnected', () => { s.src = null; s.aiming = s.held = false; });
  c.addEventListener('selectstart', () => { s.held = true; s.aiming = canTeleport(s) && !panelSys.hovering(i); });
  c.addEventListener('selectend', () => { s.held = false; if (s.aiming && s.target) teleportTo(s.target); s.aiming = false; });
  return s; });
const canTeleport = (s) => s.src && (!s.src.hand || s.src.handedness === 'right');
function walkable(x, z) { return REGIONS.some((rg) => { const [nx, nz] = nearestIn(rg, x, z); return Math.hypot(nx - x, nz - z) < 1e-6; }); }
let tpFade = 0, tpPending = null;
function teleportTo(p) { tpPending = p.clone(); tpFade = 0.0001; }
const ao = new THREE.Vector3(), ad = new THREE.Vector3(), aq = new THREE.Quaternion(), ap = new THREE.Vector3(), an = new THREE.Vector3();
function updateTeleport(dt) {
  let shown = null;
  for (const s of tp) {
    s.target = null;
    if (!s.aiming) continue;
    s.c.getWorldPosition(ao); s.c.getWorldQuaternion(aq); ad.set(0, 0, -1).applyQuaternion(aq);
    const pos = arcGeo.attributes.position.array; ap.copy(ao); an.copy(ad).multiplyScalar(7); let hit = null, k = 0;
    for (; k < ARCN; k++) { pos[k * 3] = ap.x; pos[k * 3 + 1] = ap.y; pos[k * 3 + 2] = ap.z;
      const nx = ap.x + an.x * 0.06, ny = ap.y + an.y * 0.06, nz = ap.z + an.z * 0.06; an.y -= 9.8 * 0.06;
      if (ny <= 0) { const f = ap.y / (ap.y - ny); hit = new THREE.Vector3(ap.x + (nx - ap.x) * f, 0, ap.z + (nz - ap.z) * f); k++; break; }
      ap.set(nx, ny, nz); }
    for (let j = k; j < ARCN; j++) { pos[j * 3] = ap.x; pos[j * 3 + 1] = ap.y; pos[j * 3 + 2] = ap.z; }
    arcGeo.attributes.position.needsUpdate = true;
    const ok = hit && walkable(hit.x, hit.z); s.target = ok ? hit : null;
    shown = { hit, ok };
  }
  tpArc.visible = !!shown; tpRing.visible = !!(shown && shown.hit);
  if (shown && shown.hit) { tpRing.position.set(shown.hit.x, 0.02, shown.hit.z); tpRing.material.color.setHex(shown.ok ? 0xffffff : 0xff3040); tpArc.material.color.setHex(shown.ok ? 0xffffff : 0xff3040); }
  // short fade: out 0.12 s, move, in 0.18 s
  if (tpFade > 0) {
    if (tpPending) { tpFade = Math.min(1, tpFade + dt / 0.12); if (tpFade >= 1) { camera.getWorldPosition(headP); rig.position.x += tpPending.x - headP.x; rig.position.z += tpPending.z - headP.z; tpPending = null; } }
    else tpFade = Math.max(0, tpFade - dt / 0.18);
    fadeMat.opacity = Math.max(fadeMat.opacity, tpFade); fadeMat.color.setHex(0x000000); fadeMesh.visible = fadeMat.opacity > 0.002;
  }
  // left hand pinch-and-hold: glide where you look
  for (const s of tp) if (s.held && s.src && s.src.hand && s.src.handedness === 'left' && !panelSys.hovering(s.i)) {
    camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() > 1e-6) { fwd.normalize(); rig.position.addScaledVector(fwd, 1.2 * sprintMul() * dt); clampToWorld(); } }
}
function xrLocomotion(dt) {
  const session = renderer.xr.getSession(); if (!session) return;
  for (const src of session.inputSources) {
    const gp = src.gamepad; if (!gp || gp.axes.length < 2) continue;
    const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0], ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];
    const click = !!(gp.buttons[3] && gp.buttons[3].pressed), was = stickWas.get(src) || false; stickWas.set(src, click);
    if (click && !was) toggleSprint(src);   // thumbstick click (left or right) toggles sprint
    if (src.handedness === 'left') {
      if (Math.abs(ax) < 0.15 && Math.abs(ay) < 0.15) continue;
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, UP).normalize();
      rig.position.add(mv.copy(fwd).multiplyScalar(-ay).addScaledVector(right, ax).multiplyScalar(1.5 * sprintMul() * dt)); clampToWorld();
    } else if (src.handedness === 'right') {
      if (Math.abs(ax) > 0.7 && snapReady) {
        snapReady = false; const ang = -Math.sign(ax) * Math.PI / 6; camera.getWorldPosition(headP);
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
window.addEventListener('keydown', (e) => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; keys.add(e.code); if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) toggleSprint(null); }); window.addEventListener('keyup', (e) => keys.delete(e.code));
function desktopMove(dt) {
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f++; if (keys.has('KeyS') || keys.has('ArrowDown')) f--;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s++; if (keys.has('KeyA') || keys.has('ArrowLeft')) s--;
  if (!f && !s) return;
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  rig.position.addScaledVector(fwd, f * 2.2 * sprintMul() * dt).addScaledVector(right, s * 2.2 * sprintMul() * dt); clampToWorld();
}
// start room option (?room=2 / ?room=3), handy for previews
{ const r = +(Q.get('room') || 1) - 1; const i = r >= 0 && r < 3 ? r : 0; const [x, z] = toWorld(i, ...SPAWN); rig.position.set(x, 0, z); yaw = RY[i]; applyLook(); }
window.__layout = { RC, RY, CDEF, toWorld, SPAWN };
// debug: top-down plan view (orthographic, cut at 4.2 m so ceilings and upper walls are skipped)
window.__plan = (cx, cz, half, px = 1024) => {
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 6); cam.position.set(cx, 4.2, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz);
  const vis = Object.values(SPACES).map((o) => o.visible); Object.values(SPACES).forEach((o) => { o.visible = true; });
  const sz = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(px, px, false); renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setSize(sz.x, sz.y, false); renderer.setPixelRatio(pr); Object.values(SPACES).forEach((o, i) => { o.visible = vis[i]; });
  return url; };
window.__isXR = () => renderer.xr.isPresenting; window.__floorBase = () => floorBase; window.__refType = () => renderer.xr.getReferenceSpace && renderer.xr.getReferenceSpace() ? "ok" : "none"; window.__rig = rig; window.__spaces = () => Object.entries(SPACES).filter(([, s]) => s.visible).map(([k]) => k).join(',');
window.__view = (y, p, z = START_Z, x = 0) => { yaw = y; pitch = p; rig.position.set(x, 0, z); applyLook(); };
window.__freeze = (t) => { frozenT = t; };
window.__thetaGain = () => A.theta ? +A.theta.gain.value.toFixed(4) : null; window.__pods = pods; window.__zone = () => zone; window.__scene = scene; window.__media = media; window.__roomMedia = roomMedia;
window.__settings = () => ({ speed: settings.speed, bright: settings.bright, vt });
window.__act = (id, room = 0) => panelSys.act(id, room); window.__screens = screens;
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
// ---------- 2D page overlay for media (works before Enter VR; the Quest browser may not show a file picker inside VR) ----------
let lastRoom = 0;
const $ = (id) => document.getElementById(id);
function updateOverlay() {
  const el = $('mStatus'); if (!el) return;
  el.textContent = media.st.kind === 'none' && !media.st.error ? 'Showing your Google Drive playlists (rooms with empty folders show built-in visuals)' : media.st.status;
  el.className = media.st.error ? 'err' : '';
  const ds = $('dStatus');
  if (ds) ds.textContent = media.drv.map((d, i) => d.state === 'none' ? '' : `${['Pink', 'Crimson', 'Mono'][i]}: ${d.on || d.state !== 'ready' ? d.msg : 'off (press PLAY on the panel)'}`).filter(Boolean).join('\n');
}
if ($('mFile')) {
  $('mFile').addEventListener('click', () => { media.picker.click(); });
  const goUrl = () => { media.loadURL($('mUrl').value); };
  $('mUrlGo').addEventListener('click', goUrl);
  $('mUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') goUrl(); });
  $('mDefault').addEventListener('click', () => media.restoreDefault());
  $('mToggle').addEventListener('click', () => $('media').classList.toggle('open'));
  $('dKey').value = media.drive.key; [0, 1, 2].forEach((i) => { $('dF' + i).value = media.drive.folders[i]; });
  $('dGo').addEventListener('click', () => {
    const bad = media.setDrive({ key: $('dKey').value, folders: [0, 1, 2].map((i) => $('dF' + i).value) });
    if (bad.length) $('dStatus').textContent = `That doesn't look like a Drive folder link: ${bad.join(', ')}`;
  });
  $('dLink').addEventListener('click', () => {
    const u = media.bookmarkURL(); history.replaceState(null, '', u);
    $('dStatus').textContent = 'The address bar now holds your rooms\' folders: bookmark this page.';
  });
  updateOverlay();
}
renderer.setAnimationLoop(() => {
  const nowMs = performance.now(); const dt = Math.min((nowMs - prev) / 1000, 0.1); prev = nowMs;
  if (renderer.xr.isPresenting) { xrLocomotion(dt); perf.sample(dt); rig.position.y = floorBase + settings.height; }
  else { desktopMove(dt); rig.position.y = 0; camera.position.y = 1.6 + settings.height; }
  camera.updateMatrixWorld(true);
  // v15: the head is the user camera under the rig. In XR three.js copies the headset pose onto it each frame, so its
  // world position includes rig movement. (renderer.xr.getCamera() has no parent, so its getWorldPosition() was the
  // headset's offset inside the play space: rooms/corridors were activated for the wrong spot and stayed dark.)
  camera.getWorldPosition(headP);
  zone = zoneOf(headP);
  updateDoors(headP, dt); if (renderer.xr.isPresenting) { updateHandJoints(); updateTeleport(dt); } else { tpArc.visible = tpRing.visible = false; } applyVisibility(); updateBeds(headP);
  advanceClock(); panelSys.update(dt, visualTime()); screens.update(dt); sprintHud.visible = settings.sprint;
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
    const L = A.ctx.listener; const e = camera.matrixWorld.elements;
    setParam(L, 'position', e[12], e[13], e[14]);
    fwdA.set(-e[8], -e[9], -e[10]).normalize(); upA.set(e[4], e[5], e[6]).normalize();
    if (L.forwardX) { L.forwardX.value = fwdA.x; L.forwardY.value = fwdA.y; L.forwardZ.value = fwdA.z; L.upX.value = upA.x; L.upY.value = upA.y; L.upZ.value = upA.z; }
    else if (L.setOrientation) L.setOrientation(fwdA.x, fwdA.y, fwdA.z, upA.x, upA.y, upA.z);
  }
  const tick = Math.floor(t * 2);
  if (zone === 'r1' && room1.hud && tick !== lastHud && roomMedia[0].uMediaOn.value < 1) { lastHud = tick; room1.hud.draw(t, I); }
  const zi = { r1: 0, r2: 1, r3: 2 }[zone]; if (zi !== undefined) lastRoom = zi;
  media.update(dt, lastRoom); pods.update(dt, lastRoom);
  renderer.render(scene, camera);
  if (++frames === 3) window.__ready = true;
});
