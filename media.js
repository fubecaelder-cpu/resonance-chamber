// Custom video on the room monitors (v6). One shared <video> element feeds one VideoTexture that every monitor samples,
// so showing it on all three screens costs a single decode/upload. Files are opened with URL.createObjectURL and never
// leave the device. Direct .mp4/.webm URLs work when the host sends CORS headers (WebGL needs CORS-clean pixels).
import { THREE, OPT, f3 } from './shared.js';

const KEY = 'resonanceChamber.media.v1';
// ---------- shared uniforms / GLSL ----------
const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
export const MEDIA = { uMedia: { value: black }, uMediaAsp: { value: 16 / 9 } };
export const mediaOn = [{ value: 0 }, { value: 0 }, { value: 0 }];   // per-room fade 0..1
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
    }`, { side: THREE.BackSide, uniforms: { ...MEDIA, uMediaOn: mediaOn[idx] } });
  const s = new THREE.Mesh(g, m); s.position.y = y; world.add(s);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.08, r + 0.08, h + 0.36, 48, 1, true, Math.PI - half - 0.03, half * 2 + 0.06), metalMat({ DOUBLE: 1 }));
  back.position.y = y; world.add(back);
  const arc = (rad, yy, hf, n = 64) => { const pts = []; for (let i = 0; i <= n; i++) { const t = Math.PI - hf + (2 * hf * i) / n; pts.push(new THREE.Vector3(rad * Math.sin(t), yy, rad * Math.cos(t))); } return new THREE.CatmullRomCurve3(pts); };
  for (const yy of [y - h / 2 - 0.06, y + h / 2 + 0.06]) neonTube(world, arc(r - 0.03, yy, half + 0.012), hex.b, kind === 'mono' ? 0.9 : 1.1);
  for (const sg of [-1, 1]) {
    const t = Math.PI + sg * (half + 0.012);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h + 0.12, 8), neonCore(hex.b, 1.0));
    const pg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, h + 0.12, 10, 1, true), glowShell(hex.b, 0.45));
    for (const o of [post, pg]) { o.position.set((r - 0.03) * Math.sin(t), y, (r - 0.03) * Math.cos(t)); world.add(o); }
  }
  root.updateMatrixWorld(true);
  return { mesh: s, worldPos: root.localToWorld(new THREE.Vector3(0, y, -r + 0.3)) };
}

// ---------- controller ----------
export function createMedia({ onChange = () => {} } = {}) {
  const st = { kind: 'none', name: '', playing: false, volume: 0.7, loop: true, screens: 'all', error: '', status: 'Built-in visuals', ready: false };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { if (s.volume >= 0 && s.volume <= 1) st.volume = s.volume; st.loop = s.loop !== false; st.screens = s.screens === 'this' ? 'this' : 'all'; } } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ volume: st.volume, loop: st.loop, screens: st.screens })); } catch { /* ignore */ } };
  const v = document.createElement('video');
  v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.loop = st.loop;
  let tex = null, blobUrl = null, loadId = 0;
  const audio = { ctx: null, src: null, gain: null, pan: null };
  const changed = () => { onChange(st); };

  const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'video/*'; picker.style.display = 'none';
  document.body.appendChild(picker);
  picker.addEventListener('change', () => { const f = picker.files && picker.files[0]; if (f) loadFile(f); picker.value = ''; });

  function applyVolume() {
    if (audio.gain) { v.volume = 1; audio.gain.gain.setTargetAtTime(st.volume, audio.ctx.currentTime, 0.05); } else v.volume = st.volume;
    v.muted = st.volume <= 0;
  }
  function fail(msg) {
    st.error = msg; st.status = msg; st.ready = false; st.playing = false; st.kind = 'none';
    MEDIA.uMedia.value = black; console.warn('[media]', msg); changed();
  }
  function load(src, name, kind) {
    const id = ++loadId;
    st.error = ''; st.status = 'Loading ' + name + '…'; st.name = name; st.kind = kind; st.ready = false; changed();
    v.pause();
    if (kind === 'url') v.crossOrigin = 'anonymous'; else v.removeAttribute('crossorigin');
    v.src = src; v.loop = st.loop; applyVolume(); v.load();
    const onData = () => {
      if (id !== loadId) return;
      if (tex) tex.dispose();
      tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      MEDIA.uMedia.value = tex; MEDIA.uMediaAsp.value = (v.videoWidth || 16) / (v.videoHeight || 9);
      st.ready = true; st.status = name; console.log('[media] playing', name, v.videoWidth + 'x' + v.videoHeight);
      play(); changed();
    };
    v.addEventListener('loadeddata', onData, { once: true });
    v.addEventListener('error', () => {
      if (id !== loadId) return;
      if (kind === 'url') fail("Couldn't load that URL. It must be a direct .mp4/.webm link, and the server must allow cross-origin use (CORS). Otherwise download it and use Choose video file.");
      else fail("This video can't be played by the browser. Try MP4 (H.264/AAC) or WebM.");
    }, { once: true });
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
    if (!st.ready) return;
    const p = v.play();
    st.playing = true;
    if (p) p.then(changed).catch(() => {      // autoplay with sound blocked: play muted, unmute on the next press
      v.muted = true; v.play().then(() => { st.status = st.name + ' (muted: press Play or Volume + for sound)'; changed(); }).catch(() => { st.playing = false; changed(); });
    });
  }
  function act(id) {
    if (id === 'm-load') {
      picker.click();
      st.status = renderer && renderer.xr && renderer.xr.isPresenting ? 'Opening file picker… (if none appears, exit VR and use "Choose video file" on the page)' : 'Choose a video file…';
    } else if (id === 'm-play') {
      if (!st.ready) st.status = 'Load a video first';
      else if (v.paused || v.muted && st.volume > 0) { applyVolume(); play(); } else { v.pause(); st.playing = false; }
    } else if (id === 'm-vol-') { st.volume = Math.max(0, Math.round((st.volume - 0.1) * 10) / 10); applyVolume(); save(); }
    else if (id === 'm-vol+') { st.volume = Math.min(1, Math.round((st.volume + 0.1) * 10) / 10); applyVolume(); save(); }
    else if (id === 'm-loop') { st.loop = !st.loop; v.loop = st.loop; save(); }
    else if (id === 'm-screens') { st.screens = st.screens === 'all' ? 'this' : 'all'; save(); }
    else if (id === 'm-default') restoreDefault();
    changed();
  }
  function restoreDefault() {
    loadId++; v.pause(); v.removeAttribute('src'); v.load();
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    st.kind = 'none'; st.ready = false; st.playing = false; st.name = ''; st.error = ''; st.status = 'Built-in visuals';
    changed();
  }
  v.addEventListener('ended', () => { st.playing = false; changed(); });
  v.addEventListener('pause', () => { if (st.playing && !v.ended && st.ready && v.paused) { /* paused by the system */ } });
  // route the soundtrack through WebAudio once the scene's AudioContext exists (positional, from the monitor)
  function attachAudio(ctx, dest) {
    if (audio.src) return;
    try {
      audio.ctx = ctx; audio.src = ctx.createMediaElementSource(v); audio.gain = ctx.createGain(); audio.gain.gain.value = st.volume;
      audio.src.connect(audio.gain);
      if (OPT.spatial) {
        audio.pan = ctx.createPanner(); Object.assign(audio.pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 7, rolloffFactor: 0.5 });
        audio.gain.connect(audio.pan); audio.pan.connect(dest);
      } else audio.gain.connect(dest);
      applyVolume();
    } catch (e) { console.warn('[media] audio routing unavailable', e); }
  }
  function setAudioPos(p) {
    const n = audio.pan; if (!n) return;
    if (n.positionX) { n.positionX.value = p.x; n.positionY.value = p.y; n.positionZ.value = p.z; } else n.setPosition(p.x, p.y, p.z);
  }
  // per-frame: fade each room's monitor towards its target
  function update(dt, room) {
    const on = st.ready ? 1 : 0;
    for (let i = 0; i < 3; i++) {
      const target = on && (st.screens === 'all' || i === room) ? 1 : 0;
      const u = mediaOn[i]; u.value += (target - u.value) * Math.min(1, dt * 4); if (Math.abs(target - u.value) < 0.002) u.value = target;
    }
  }
  const audible = () => st.ready && !v.paused && !v.muted && st.volume > 0;
  let renderer = null;
  return { st, video: v, act, loadFile, loadURL, restoreDefault, attachAudio, setAudioPos, update, audible, picker, setRenderer: (r) => { renderer = r; } };
}
