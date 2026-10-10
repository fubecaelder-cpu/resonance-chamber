// Custom video on the room monitors (v6). One shared <video> element feeds one VideoTexture that every monitor samples,
// so showing it on all three screens costs a single decode/upload. v7 (local only until verified): each room can also
// stream a Google Drive folder as a looping playlist (Drive API v3 + an API key); only the room you are in decodes. Files are opened with URL.createObjectURL and never
// leave the device. Direct .mp4/.webm URLs work when the host sends CORS headers (WebGL needs CORS-clean pixels).
import { THREE, OPT, f3 } from './shared.js';
import { DRIVE_DEFAULTS } from './config.js';

const KEY = 'resonanceChamber.media.v1', DKEY = 'resonanceChamber.drive.v1';
export const ROOM_NAMES = ['pink', 'crimson', 'mono'];
// ---------- shared uniforms / GLSL ----------
const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
// per-room monitor uniforms: which video texture the room's monitor shows, its aspect, and a 0..1 fade
export const roomMedia = [0, 1, 2].map(() => ({ uMedia: { value: black }, uMediaAsp: { value: 16 / 9 }, uMediaOn: { value: 0 } }));
// Letterboxed video inside a screen of aspect `sasp` (width / height). The texture holds raw sRGB bytes and this project
// writes shader output straight to the (sRGB) framebuffer, so colours pass through unchanged (no double conversion).
export const MEDIA_GLSL = /* glsl */`
  uniform sampler2D uMedia; uniform float uMediaAsp; uniform float uMediaOn;
  vec3 mediaFrame(vec2 uv, float sasp, vec3 tint){
    vec2 sz = uMediaAsp > sasp ? vec2(1.0, sasp / uMediaAsp) : vec2(uMediaAsp / sasp, 1.0);
    vec2 q = (uv - 0.5) / sz + 0.5;
    vec2 e = min(q, 1.0 - q); vec2 w = fwidth(q);
    float inside = smoothstep(-w.x, w.x, e.x) * smoothstep(-w.y, w.y, e.y);
    vec3 v = texture2D(uMedia, clamp(q, 0.0, 1.0)).rgb;
    float rim = exp(-max(min(e.x * sz.x * sasp, e.y * sz.y), 0.0) * 90.0) * (1.0 - inside);
    return mix(tint * (0.025 + 0.35 * rim), v, inside);
  }`;

// ---------- monitor for rooms 2 and 3 (room 1 keeps its curved FIELD MONITOR, with the same media hook) ----------
const BUILTIN = {
  crimson: /* glsl */`
    float ecg(float t){ return 0.06 * exp(-pow((t - 0.12) / 0.03, 2.0)) - 0.1 * exp(-pow((t - 0.27) / 0.01, 2.0)) + 0.55 * exp(-pow((t - 0.3) / 0.011, 2.0))
      - 0.16 * exp(-pow((t - 0.33) / 0.012, 2.0)) + 0.32 * exp(-pow((t - 0.58) / 0.012, 2.0)) - 0.08 * exp(-pow((t - 0.61) / 0.012, 2.0)) + 0.1 * exp(-pow((t - 0.8) / 0.04, 2.0)); }
    vec3 builtin(vec2 p, float asp){
      float r = length(p), a = atan(p.y, p.x);
      vec3 col = BASE * 3.0 + DEEP * 0.9 * smoothstep(1.1, 0.0, r);
      float sp = 0.5 + 0.5 * sin(log(r + 0.002) * 9.0 - a * 3.0 + uTime * 1.1);
      col += PINK * pow(sp, 4.0) * smoothstep(0.85, 0.15, r) * smoothstep(0.015, 0.08, r) * 1.2;
      col += HOT * exp(-abs(r - uBeatT * 0.45) * 26.0) * uBeat * 0.9 + mix(HOT, WHITE, 0.4) * exp(-r * 14.0) * (0.6 + uBeat);
      float xs = p.x / asp + 0.5, u = xs * 2.0, du = 0.002;
      float y0 = -0.3 + 0.42 * ecg(fract(u));
      float sl = (ecg(fract(u + du)) - ecg(fract(u - du))) / (2.0 * du) * 0.42 * 2.0 / asp;
      float dl = abs(p.y - y0) / sqrt(1.0 + sl * sl);
      float head = fract(uTime / ${f3(8.0)}), age = fract(head - xs);
      float lw = 0.004 + fwidth(p.y) * 1.2;
      col += mix(HOT, WHITE, 0.45) * ((1.0 - smoothstep(lw, lw * 2.0, dl)) * 1.3 + exp(-dl * 60.0) * 0.45) * exp(-age * 1.6);
      col += PINK * (aline(p.x * 6.0, 0.008, fwidth(p.x) * 6.0) + aline(p.y * 6.0, 0.008, fwidth(p.y) * 6.0)) * 0.08;
      return col * (1.0 + 0.2 * uBeat);
    }`,
  mono: /* glsl */`
    vec3 builtin(vec2 p, float asp){
      vec2 c1 = vec2(sin(uTime * 0.07) * 0.6, cos(uTime * 0.05) * 0.15), c2 = vec2(0.3 * cos(uTime * 0.04), 0.0) - c1 * 0.8;
      float r1 = length(p - c1) * 13.0 - uTime * 0.3, r2 = length(p - c2) * 13.0 + uTime * 0.25;
      float a1 = stripe(r1, fwidth(r1)), a2 = stripe(r2, fwidth(r2));
      float v = a1 + a2 - 2.0 * a1 * a2;
      float sw = 0.5 - 0.5 * cos(6.2831 * uBeatT / 4.0);
      return vec3(mix(0.03, 0.88, v)) * (0.88 + 0.12 * sw);
    }`,
};
export function buildMonitor(K, world, root, idx, kind, { r = 6.45, y = 6.75, h = 2.0, half = 0.4 } = {}) {
  const { mat, neonTube, neonCore, glowShell, metalMat, hex } = K;
  const asp = (r * half * 2) / h;
  const g = new THREE.CylinderGeometry(r, r, h, 48, 1, true, Math.PI - half, half * 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  const m = mat(/* glsl */`
    ${MEDIA_GLSL}
    ${BUILTIN[kind]}
    void main(){
      vec2 p = (vUv - 0.5) * vec2(${f3(asp)}, 1.0);
      vec3 col = vec3(0.0);
      if (uMediaOn < 0.999) {
        col = builtin(p, ${f3(asp)});
        float sl = vUv.y * 420.0; col *= 1.0 - 0.07 * (0.5 + 0.5 * sin(sl * 6.2831)) * clamp(1.0 - fwidth(sl) * 2.0, 0.0, 1.0);
      }
      if (uMediaOn > 0.001) col = mix(col, mediaFrame(vUv, ${f3(asp)}, PINK), uMediaOn);
      vec2 e = min(vUv, 1.0 - vUv);
      col += PINK * exp(-min(e.x * ${f3(asp)}, e.y) * 40.0) * 0.5;
      gl_FragColor = vec4(col, 1.0);
    }`, { side: THREE.BackSide, uniforms: { ...roomMedia[idx] } });
  // v9: everything that moves with the screen hangs in a mount group pivoting at the screen centre (0, y, -r)
  const mount = new THREE.Group(); mount.name = 'monitor-mount'; mount.position.set(0, y, -r); mount.userData.noMirror = true; world.add(mount);
  const inner = new THREE.Group(); inner.position.set(0, -y, r); mount.add(inner);
  const s = new THREE.Mesh(g, m); s.position.y = y; inner.add(s);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.08, r + 0.08, h + 0.24, 48, 1, true, Math.PI - half - 0.03, half * 2 + 0.06), metalMat({ DOUBLE: 1 }));
  back.position.y = y; inner.add(back);
  const arc = (rad, yy, hf, n = 64) => { const pts = []; for (let i = 0; i <= n; i++) { const t = Math.PI - hf + (2 * hf * i) / n; pts.push(new THREE.Vector3(rad * Math.sin(t), yy, rad * Math.cos(t))); } return new THREE.CatmullRomCurve3(pts); };
  for (const yy of [y - h / 2 - 0.06, y + h / 2 + 0.06]) neonTube(inner, arc(r - 0.03, yy, half + 0.012), hex.b, kind === 'mono' ? 0.9 : 1.1);
  // standoff brackets back to the wall when the screen hangs forward of it (fixed to the wall: shown only at the default spot)
  const brackets = [];
  const gap = 6.95 - (r + 0.08);
  if (gap > 0.2) for (const t of [Math.PI - half * 0.62, Math.PI + half * 0.62]) for (const yy of [y - h * 0.32, y + h * 0.32]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, gap), metalMat());
    const rm = r + 0.08 + gap / 2; arm.position.set(rm * Math.sin(t), yy, rm * Math.cos(t)); arm.rotation.y = t; world.add(arm); brackets.push(arm);
  }
  for (const sg of [-1, 1]) {
    const t = Math.PI + sg * (half + 0.012);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h + 0.12, 8), neonCore(hex.b, 1.0));
    const pg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, h + 0.12, 10, 1, true), glowShell(hex.b, 0.45));
    for (const o of [post, pg]) { o.position.set((r - 0.03) * Math.sin(t), y, (r - 0.03) * Math.cos(t)); inner.add(o); }
  }
  root.updateMatrixWorld(true);
  return { mesh: s, worldPos: root.localToWorld(new THREE.Vector3(0, y, -r + 0.3)), mount, brackets, geo: { r, y, h, half }, root };
}

// ---------- Google Drive helpers ----------
export function parseFolderId(s) {
  s = (s || '').trim(); if (!s) return '';
  let m = /\/folders\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}
function driveError(status, body, what) {
  const msg = (body && body.error && body.error.message) || '';
  const reason = (body && body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason) || '';
  if (/API key not valid|keyInvalid/i.test(msg + reason)) return 'API key not valid: check the key you pasted';
  if (/referer|referrer/i.test(msg)) return 'This API key does not allow this website: add the site to the key\'s HTTP referrer list';
  if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(msg + reason)) return 'Google Drive API is not enabled for this API key\'s project';
  if (/missing a valid API key|unregistered callers/i.test(msg)) return 'A Google API key is needed to read Drive folders';
  if (status === 404) return `${what} not found: is it shared as "Anyone with the link"?`;
  if (/quota|rate|userRateLimitExceeded|downloadQuotaExceeded/i.test(msg + reason)) return 'Google Drive quota exceeded: try again later';
  return `Drive error ${status}${msg ? ': ' + msg : ''}`;
}

// ---------- controller ----------
export function createMedia({ onChange = () => {}, monitorPos = [] } = {}) {
  const st = { kind: 'none', name: '', playing: false, volume: 0.7, loop: true, screens: 'all', error: '', status: 'Built-in visuals', ready: false };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { if (s.volume >= 0 && s.volume <= 1) st.volume = s.volume; st.loop = s.loop !== false; st.screens = s.screens === 'this' ? 'this' : 'all'; } } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ volume: st.volume, loop: st.loop, screens: st.screens })); } catch { /* ignore */ } };
  let renderer = null, room = 0, ctxA = null, destA = null;
  const changed = () => { onChange(st); };

  // a channel = one <video> + its texture + its audio chain
  function channel() {
    const v = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
    const ch = { v, tex: null, ready: false, asp: 16 / 9, a: null, loadId: 0 };
    if (ctxA) wire(ch);
    return ch;
  }
  function wire(ch) {
    if (ch.a || !ctxA) return;
    try {
      const src = ctxA.createMediaElementSource(ch.v), gain = ctxA.createGain(); gain.gain.value = st.volume; src.connect(gain);
      let pan = null;
      if (OPT.spatial) { pan = ctxA.createPanner(); Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 7, rolloffFactor: 0.5 }); gain.connect(pan); pan.connect(destA); }
      else gain.connect(destA);
      ch.a = { src, gain, pan }; ch.v.volume = 1;
    } catch (e) { console.warn('[media] audio routing unavailable', e); }
  }
  function chVolume(ch) {
    if (ch.a) ch.a.gain.gain.setTargetAtTime(st.volume, ctxA.currentTime, 0.05); else ch.v.volume = st.volume;
    ch.v.muted = st.volume <= 0;
  }
  function chLoad(ch, src, cors, onReady, onFail) {
    const id = ++ch.loadId; const v = ch.v;
    ch.ready = false; v.pause();
    if (cors) v.crossOrigin = 'anonymous'; else v.removeAttribute('crossorigin');
    v.src = src; chVolume(ch); v.load();
    v.addEventListener('loadeddata', () => {
      if (id !== ch.loadId) return;
      if (ch.tex) ch.tex.dispose();
      ch.tex = new THREE.VideoTexture(v); ch.tex.colorSpace = THREE.SRGBColorSpace;
      ch.tex.minFilter = THREE.LinearFilter; ch.tex.magFilter = THREE.LinearFilter; ch.tex.generateMipmaps = false;
      ch.asp = (v.videoWidth || 16) / (v.videoHeight || 9); ch.ready = true; onReady();
    }, { once: true });
    v.addEventListener('error', () => { if (id === ch.loadId) onFail(v.error); }, { once: true });
  }
  function chPlay(ch, onMuted) {
    const p = ch.v.play();
    if (p) p.catch(() => { ch.v.muted = true; ch.v.play().then(onMuted).catch(() => {}); });
  }
  function chStop(ch) { ch.loadId++; ch.ready = false; ch.v.pause(); ch.v.removeAttribute('src'); ch.v.load(); }

  // ---------- custom video (local file / URL), shared by all rooms ----------
  const cust = channel(); cust.v.loop = st.loop;
  let blobUrl = null;
  const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'video/*'; picker.style.display = 'none';
  document.body.appendChild(picker);
  picker.addEventListener('change', () => { const f = picker.files && picker.files[0]; if (f) loadFile(f); picker.value = ''; });
  function fail(msg) { st.error = msg; st.status = msg; st.ready = false; st.playing = false; st.kind = 'none'; console.warn('[media]', msg); resumeDrive(); changed(); }
  const custActive = () => st.kind !== 'none';
  function resumeDrive() { const d = drv[room]; if (!d.on || d.paused || d.state !== 'ready') return; if (d.ch && d.ch.ready) chPlay(d.ch, () => {}); else drvStart(room); }
  function load(src, name, kind) {
    st.error = ''; st.status = 'Loading ' + name + '…'; st.name = name; st.kind = kind; st.ready = false;
    drv.forEach((d) => { if (d.ch && !d.ch.v.paused) d.ch.v.pause(); });   // your own video takes over until DEFAULT
    changed();
    cust.v.loop = st.loop;
    chLoad(cust, src, kind === 'url', () => {
      st.ready = true; st.status = name; console.log('[media] playing', name, cust.v.videoWidth + 'x' + cust.v.videoHeight);
      play(); changed();
    }, () => {
      if (kind === 'url') fail("Couldn't load that URL. It must be a direct .mp4/.webm link, and the server must allow cross-origin use (CORS). Otherwise download it and use Choose video file.");
      else fail("This video can't be played by the browser. Try MP4 (H.264/AAC) or WebM.");
    });
  }
  function loadFile(file) {
    if (!file) return;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(file);          // stays on the device: nothing is uploaded
    load(blobUrl, file.name, 'file');
  }
  function loadURL(url) {
    url = (url || '').trim();
    if (!/^https?:\/\//i.test(url) && !/^blob:/i.test(url)) { fail('Please paste a full http(s) link to a .mp4 or .webm file.'); return; }
    let name = url; try { name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || url); } catch { /* keep */ }
    load(url, name, 'url');
  }
  function play() {
    if (!st.ready) return; st.playing = true; chVolume(cust);
    chPlay(cust, () => { st.status = st.name + ' (muted: press Play or Volume + for sound)'; changed(); });
  }
  function restoreDefault() {
    chStop(cust);
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    st.kind = 'none'; st.ready = false; st.playing = false; st.name = ''; st.error = ''; st.status = 'Built-in visuals';
    resumeDrive(); changed();
  }
  cust.v.addEventListener('ended', () => { st.playing = false; changed(); });

  // ---------- Google Drive: one folder per room, streamed as a looping playlist ----------
  const API = new URLSearchParams(location.search).get('driveApi') || 'https://www.googleapis.com';   // override only used for local testing
  const drive = { key: DRIVE_DEFAULTS.key || '', folders: (DRIVE_DEFAULTS.folders || []).concat(['', '', '']).slice(0, 3) };
  try { const s = JSON.parse(localStorage.getItem(DKEY) || 'null'); if (s) { drive.key = s.key || ''; if (Array.isArray(s.folders)) drive.folders = s.folders.slice(0, 3).map((f) => f || ''); } } catch { /* ignore */ }
  { const q = new URLSearchParams(location.search);
    if (q.get('key')) drive.key = q.get('key');
    ROOM_NAMES.forEach((n, i) => { const id = parseFolderId(q.get(n)); if (id) drive.folders[i] = id; }); }
  const saveDrive = () => { try { localStorage.setItem(DKEY, JSON.stringify(drive)); } catch { /* ignore */ } };
  const drv = [0, 1, 2].map(() => ({ ch: null, folder: '', title: '', items: [], idx: 0, on: false, state: 'none', msg: '', paused: false, repeat: false, fails: 0 }));
  const streamUrl = (id) => `${API}/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(drive.key)}`;
  async function getJSON(url, what) {
    let r; try { r = await fetch(url, { credentials: 'omit' }); } catch { throw new Error('Could not reach Google Drive (offline or blocked?)'); }
    let body = null; try { body = await r.json(); } catch { /* not JSON */ }
    if (!r.ok) throw new Error(driveError(r.status, body, what));
    return body;
  }
  const VQ = (folder) => `'${folder}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder' and (mimeType contains 'video/' or mimeType = 'application/mp4' or name contains '.mp4' or name contains '.webm' or name contains '.m4v' or name contains '.mov')`;
  async function fetchList(folder) {
    const k = encodeURIComponent(drive.key); let token = '', files = [];
    do {   // Drive labels some uploads application/mp4 or octet-stream, so match by name as well as by type
      const body = await getJSON(`${API}/drive/v3/files?q=${encodeURIComponent(VQ(folder))}&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType,size)')}&orderBy=name_natural&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${k}${token ? '&pageToken=' + encodeURIComponent(token) : ''}`, 'Folder');
      files = files.concat(body.files || []); token = body.nextPageToken || '';
    } while (token && files.length < 5000);
    return files.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder' && !/\.(mkv|avi|wmv|flv)$/i.test(f.name));
  }
  function setItems(i, items) {
    const d = drv[i], cur = d.items[d.idx];
    d.items = items;
    if (!items.length) { d.state = 'empty'; d.msg = 'Folder is empty: built-in visuals (new videos appear automatically)'; drvOff(i); return; }
    const wasReady = d.state === 'ready';
    d.state = 'ready'; d.fails = 0;
    if (cur) { const j = items.findIndex((f) => f.id === cur.id); d.idx = j >= 0 ? j : Math.min(d.idx, items.length - 1); } else d.idx = 0;
    if (!wasReady) { d.on = true; d.paused = false; d.msg = `${d.title}: ${items.length} video${items.length > 1 ? 's' : ''}`; if (i === room && !custActive()) drvStart(i); }
    else if (d.ch) d.ch.v.loop = d.repeat || items.length === 1;
  }
  async function listFolder(i) {
    const d = drv[i], folder = drive.folders[i];
    d.folder = folder; d.items = []; d.idx = 0; d.fails = 0;
    if (!folder) { drvOff(i, true); d.state = 'none'; d.msg = ''; changed(); return; }
    if (!drive.key) { d.state = 'error'; d.msg = 'Add a Google API key to stream Drive folders'; changed(); return; }
    d.state = 'listing'; d.msg = 'Reading Drive folder…'; changed();
    try {
      const meta = await getJSON(`${API}/drive/v3/files/${encodeURIComponent(folder)}?fields=id,name,mimeType&supportsAllDrives=true&key=${encodeURIComponent(drive.key)}`, 'Folder');
      if (meta.mimeType !== 'application/vnd.google-apps.folder') throw new Error('That link is a file, not a folder');
      d.title = meta.name || 'Drive folder';
      const items = await fetchList(folder);
      if (drive.folders[i] !== folder) return;   // changed while we were listing
      setItems(i, items);
      console.log('[drive]', ROOM_NAMES[i], d.title, items.length + ' video(s)');
      changed();
    } catch (e) { if (drive.folders[i] !== folder) return; d.state = 'error'; d.msg = e.message; console.warn('[drive]', ROOM_NAMES[i], e.message); changed(); }
  }
  // poll every minute so videos dropped into a folder later show up without reloading
  async function poll() {
    if (document.hidden || !drive.key) return;
    for (let i = 0; i < 3; i++) {
      const d = drv[i], folder = drive.folders[i];
      if (!folder || d.state === 'listing') continue;
      if (d.state === 'error' || !d.title) { listFolder(i); continue; }
      try {
        const items = await fetchList(folder);
        if (drive.folders[i] !== folder) continue;
        const sig = (a) => a.map((f) => f.id).join(',');
        if (sig(items) !== sig(d.items)) { console.log('[drive]', ROOM_NAMES[i], 'folder changed:', items.length + ' video(s)'); setItems(i, items); changed(); }
      } catch (e) { console.warn('[drive] poll', ROOM_NAMES[i], e.message); }
    }
  }
  setInterval(poll, Math.max(5, +new URLSearchParams(location.search).get('drivePoll') || DRIVE_DEFAULTS.pollSeconds || 60) * 1000);
  function drvStart(i, idx = drv[i].idx) {
    const d = drv[i]; if (!d.items.length) return;
    if (!d.ch) { d.ch = channel(); d.ch.v.addEventListener('ended', () => { if (!d.repeat) drvStart(i, (d.idx + 1) % d.items.length); }); }
    d.idx = ((idx % d.items.length) + d.items.length) % d.items.length; d.on = true; d.paused = false;
    const it = d.items[d.idx]; d.ch.v.loop = d.repeat || d.items.length === 1;
    d.msg = `Loading ${it.name}…`; changed();
    chLoad(d.ch, streamUrl(it.id), true, () => {
      d.fails = 0; d.msg = `${it.name}  (${d.idx + 1}/${d.items.length})`; console.log('[drive] playing', it.name, d.ch.v.videoWidth + 'x' + d.ch.v.videoHeight);
      if (room === i && !d.paused && !custActive()) chPlay(d.ch, () => { d.msg = it.name + ' (muted: press Play for sound)'; changed(); });
      changed();
    }, () => {
      d.fails++;
      console.warn('[drive] could not play', it.name);
      if (d.fails >= d.items.length) { d.state = 'error'; d.msg = 'None of the videos would play: check sharing, the API key, and that they are MP4 (H.264) or WebM'; d.on = false; changed(); return; }
      drvStart(i, d.idx + 1);
    });
  }
  function drvOff(i, stop = true) { const d = drv[i]; d.on = false; if (d.ch && stop) chStop(d.ch); }
  function setDrive({ key, folders }) {
    if (key !== undefined) drive.key = key.trim();
    const bad = [];
    if (folders) folders.forEach((f, i) => { const id = parseFolderId(f); if (id === null) bad.push(ROOM_NAMES[i]); else drive.folders[i] = id; });
    saveDrive();
    [0, 1, 2].forEach((i) => { drvOff(i); listFolder(i); });
    return bad;
  }
  function bookmarkURL() {
    const u = new URL(location.href); ['pink', 'crimson', 'mono', 'key'].forEach((k) => u.searchParams.delete(k));
    ROOM_NAMES.forEach((n, i) => { if (drive.folders[i]) u.searchParams.set(n, drive.folders[i]); });
    if (drive.key) u.searchParams.set('key', drive.key);
    return u.toString();
  }

  // ---------- panel actions (they act on the room you are standing in) ----------
  const driveRoom = () => { const d = drv[room]; return !custActive() && d.state === 'ready' && d.items.length ? d : null; };
  function act(id) {
    const d = driveRoom();
    if (id === 'm-load') {
      picker.click();
      st.status = renderer && renderer.xr && renderer.xr.isPresenting ? 'Opening file picker… (if none appears, exit VR and use "Choose video file" on the page)' : 'Choose a video file…';
    } else if (id === 'm-play') {
      if (d && !d.on) drvStart(room);
      else if (d && d.ch) { if (d.ch.v.paused || d.ch.v.muted && st.volume > 0) { d.paused = false; chVolume(d.ch); chPlay(d.ch, () => {}); } else { d.paused = true; d.ch.v.pause(); } }
      else if (!st.ready) st.status = 'Load a video first';
      else if (cust.v.paused || cust.v.muted && st.volume > 0) play(); else { cust.v.pause(); st.playing = false; }
    } else if (id === 'm-next') {
      if (d) drvStart(room, d.idx + 1); else if (st.ready) { cust.v.currentTime = 0; play(); }
    } else if (id === 'm-vol-' || id === 'm-vol+') {
      st.volume = Math.min(1, Math.max(0, Math.round((st.volume + (id === 'm-vol+' ? 0.1 : -0.1)) * 10) / 10));
      [cust, ...drv.map((x) => x.ch).filter(Boolean)].forEach(chVolume); save();
    } else if (id === 'm-loop') {
      if (d) { d.repeat = !d.repeat; if (d.ch) d.ch.v.loop = d.repeat || d.items.length === 1; }
      else { st.loop = !st.loop; cust.v.loop = st.loop; save(); }
    } else if (id === 'm-screens') { st.screens = st.screens === 'all' ? 'this' : 'all'; save(); }
    else if (id === 'm-default') { if (d && d.on) drvOff(room); else restoreDefault(); }
    changed();
  }
  // what the MEDIA wing shows for the current room
  function view() {
    const d = drv[room], dr = driveRoom();
    if (dr && dr.on) {
      const v = dr.ch && dr.ch.v;
      return { mode: 'drive', status: dr.msg, error: false, ready: !!(dr.ch && dr.ch.ready), playing: !!(v && !v.paused), loopOn: dr.repeat,
        loopLabel: dr.repeat ? 'REPEAT 1' : 'PLAYLIST', screensLabel: 'DRIVE', volume: st.volume, defaultOn: false };
    }
    const note = d.state === 'error' ? d.msg : dr ? 'Drive off here: press PLAY' : '';
    if (custActive() && st.ready) return { mode: 'custom', status: st.status + '  ·  DEFAULT = back to Drive', error: false, ready: true, playing: !cust.v.paused,
      loopOn: st.loop, loopLabel: st.loop ? 'LOOP ON' : 'LOOP OFF', screensLabel: st.screens === 'all' ? 'ALL ROOMS' : 'THIS ROOM', volume: st.volume, defaultOn: false };
    return { mode: 'custom', status: st.ready ? st.status : note || st.status, error: !!st.error || d.state === 'error', ready: st.ready, playing: st.ready && !cust.v.paused,
      loopOn: st.loop, loopLabel: st.loop ? 'LOOP ON' : 'LOOP OFF', screensLabel: st.screens === 'all' ? 'ALL ROOMS' : 'THIS ROOM', volume: st.volume, defaultOn: !st.ready };
  }

  function attachAudio(ctx, dest) { ctxA = ctx; destA = dest; wire(cust); drv.forEach((d) => d.ch && wire(d.ch)); [cust, ...drv.map((x) => x.ch).filter(Boolean)].forEach(chVolume); }
  function setPos(ch, p) { const n = ch && ch.a && ch.a.pan; if (!n || !p) return;
    if (n.positionX) { n.positionX.value = p.x; n.positionY.value = p.y; n.positionZ.value = p.z; } else n.setPosition(p.x, p.y, p.z); }
  // per-frame: pick each monitor's source, fade, pause Drive rooms you are not in
  function update(dt, r) {
    if (r !== room) {
      const old = drv[room]; if (old.ch && !old.ch.v.paused) old.ch.v.pause();
      room = r; const d = drv[room];
      if (!custActive()) resumeDrive();
      changed();
    }
    for (let i = 0; i < 3; i++) {
      const d = drv[i], u = roomMedia[i];
      let ch = null;
      if (custActive()) { if (st.ready && (st.screens === 'all' || i === room)) ch = cust; }
      else if (d.on && d.ch && d.ch.ready) ch = d.ch;
      if (ch) { u.uMedia.value = ch.tex; u.uMediaAsp.value = ch.asp; }
      const target = ch ? 1 : 0;
      u.uMediaOn.value += (target - u.uMediaOn.value) * Math.min(1, dt * 4); if (Math.abs(target - u.uMediaOn.value) < 0.002) u.uMediaOn.value = target;
      if (u.uMediaOn.value === 0) u.uMedia.value = black;
      if (d.ch) setPos(d.ch, monitorPos[i]);
    }
    setPos(cust, monitorPos[room]);
  }
  const audible = () => (st.ready && !cust.v.paused && !cust.v.muted && st.volume > 0) || drv.some((d) => d.ch && !d.ch.v.paused && !d.ch.v.muted && st.volume > 0);
  // start listing any folders configured via localStorage or URL params
  setTimeout(() => [0, 1, 2].forEach((i) => { if (drive.folders[i]) listFolder(i); }), 0);
  return { drive, driveAPI: API, st, video: cust.v, act, view, loadFile, loadURL, restoreDefault, attachAudio, update, audible, picker,
    drive, drv, setDrive, bookmarkURL, setRenderer: (x) => { renderer = x; } };
}
