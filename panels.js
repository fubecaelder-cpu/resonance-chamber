// VR-friendly control panels (one per room) + global settings (animation speed, brightness), persisted in localStorage.
// Input: laser ray from each Quest controller (hover highlight, trigger to press, haptic pulse), direct poke with the
// controller tip or an index fingertip, and the desktop mouse (hover + click).
import { THREE, canvasTex } from './shared.js';

// ---------- settings ----------
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const BRIGHTS = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
const KEY = 'resonanceChamber.settings.v1';
export const settings = { speedI: 3, brightI: 7, get speed() { return SPEEDS[this.speedI]; }, get bright() { return BRIGHTS[this.brightI] / 100; } };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s) { if (SPEEDS.includes(s.speed)) settings.speedI = SPEEDS.indexOf(s.speed); if (BRIGHTS.includes(s.bright)) settings.brightI = BRIGHTS.indexOf(s.bright); }
} catch { /* storage unavailable */ }
function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify({ speed: settings.speed, bright: BRIGHTS[settings.brightI] })); } catch { /* ignore */ } }

// ---------- styles ----------
const STYLES = {
  pink: { bg0: '#2a0718', bg1: '#12030b', edge: '#ff6eb4', title: '#ffc0db', label: '#ff8fc8', value: '#ffffff', socket: 'rgba(255,79,163,0.28)',
    cap: [1.0, 0.31, 0.62], glyph: [1.0, 0.95, 0.97], rim: [0.55, 0.12, 0.3], frame: [0.16, 0.04, 0.1], neon: [1.0, 0.43, 0.69], stripes: false },
  crimson: { bg0: '#1c0003', bg1: '#080001', edge: '#ff3048', title: '#ff9aa0', label: '#ff5a66', value: '#ffe0e2', socket: 'rgba(216,8,28,0.3)',
    cap: [0.86, 0.03, 0.1], glyph: [1.0, 0.85, 0.86], rim: [0.35, 0.0, 0.04], frame: [0.07, 0.0, 0.01], neon: [1.0, 0.18, 0.26], stripes: false },
  mono: { bg0: '#0c0c0c', bg1: '#000000', edge: '#ffffff', title: '#ffffff', label: '#d8d8d8', value: '#ffffff', socket: 'rgba(255,255,255,0.18)',
    cap: [0.95, 0.95, 0.95], glyph: [0.02, 0.02, 0.02], rim: [0.3, 0.3, 0.3], frame: [0.03, 0.03, 0.03], neon: [1.0, 1.0, 1.0], stripes: true },
};

// board layout (metres, board-local: x right, y up)
const BW = 0.66, BH = 0.52, BR = 0.052;
const BTN = [
  { id: 'speed-', x: -0.21, y: 0.075, glyph: 0 }, { id: 'speed+', x: 0.21, y: 0.075, glyph: 1 },
  { id: 'bright-', x: -0.21, y: -0.085, glyph: 0 }, { id: 'bright+', x: 0.21, y: -0.085, glyph: 1 },
  { id: 'reset', x: 0.0, y: -0.19, glyph: 2, sx: 0.78 },
];
// media wing (v6): hinged to the right of the main board, angled in towards you
const WW = 0.5, WH = 0.56;
const WBTN = [
  { id: 'm-load', x: -0.15, y: 0.1, glyph: 3, label: 'LOAD' }, { id: 'm-play', x: 0.0, y: 0.1, glyph: 4, label: 'PLAY / PAUSE' },
  { id: 'm-next', x: 0.15, y: 0.1, glyph: 10, label: 'NEXT' },
  { id: 'm-vol-', x: -0.15, y: -0.04, glyph: 0, label: 'VOL −' }, { id: 'm-vol+', x: 0.15, y: -0.04, glyph: 1, label: 'VOL +' },
  { id: 'm-loop', x: -0.15, y: -0.18, glyph: 5, label: 'LOOP' }, { id: 'm-default', x: 0.0, y: -0.18, glyph: 7, label: 'DEFAULT' },
  { id: 'm-screens', x: 0.15, y: -0.18, glyph: 6, label: 'SCREENS' },
];
// screen wing (v9): hinged to the left of the main board, mirroring the media wing; moves this room's main monitor
const SW = 0.5, SH = 0.74;
const SROWS = [{ k: 'height', name: 'HEIGHT', y: 0.215 }, { k: 'dist', name: 'DISTANCE', y: 0.08 }, { k: 'size', name: 'SIZE', y: -0.055 }, { k: 'tilt', name: 'TILT', y: -0.19 }];
const SBTN = [
  { id: 's-down', x: -0.17, y: 0.215, glyph: 12, label: 'DOWN' }, { id: 's-up', x: 0.17, y: 0.215, glyph: 11, label: 'UP' },
  { id: 's-farther', x: -0.17, y: 0.08, glyph: 13, label: 'FARTHER' }, { id: 's-closer', x: 0.17, y: 0.08, glyph: 14, label: 'CLOSER' },
  { id: 's-smaller', x: -0.17, y: -0.055, glyph: 0, label: 'SMALLER' }, { id: 's-bigger', x: 0.17, y: -0.055, glyph: 1, label: 'BIGGER' },
  { id: 's-tilt-', x: -0.17, y: -0.19, glyph: 15, label: 'TILT UP' }, { id: 's-tilt+', x: 0.17, y: -0.19, glyph: 16, label: 'TILT DOWN' },
  { id: 's-reset', x: -0.17, y: -0.3, glyph: 2, label: 'RESET', sx: 0.78 },
];

const PVS = /* glsl */`
  varying vec3 vP; varying vec3 vWp; varying vec3 vNw;
  void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vNw = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w; }`;
const v3 = (a) => new THREE.Vector3(...a);

function buttonMat(st, glyph) {
  return new THREE.ShaderMaterial({
    uniforms: { uCap: { value: v3(st.cap) }, uGly: { value: v3(st.glyph) }, uRim: { value: v3(st.rim) }, uHover: { value: 0 }, uPress: { value: 0 }, uGlyph: { value: glyph }, uOn: { value: 0 } },
    vertexShader: PVS,
    fragmentShader: /* glsl */`
      uniform vec3 uCap; uniform vec3 uGly; uniform vec3 uRim; uniform float uHover; uniform float uPress; uniform float uGlyph; uniform float uOn;
      varying vec3 vP; varying vec3 vWp; varying vec3 vNw;
      float box(vec2 p, vec2 h){ vec2 d = abs(p) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
      float triR(vec2 q, float s){ return max(abs(q.y) * 0.866 + q.x * 0.5, -q.x) - s * 0.5; }   // right-pointing
      float triU(vec2 q, float s){ return max(abs(q.x) * 0.866 + q.y * 0.5, -q.y) - s * 0.5; }   // up-pointing
      void main(){
        vec2 b = vec2(vP.x, -vP.z) / ${BR.toFixed(3)};
        float rr = length(b);
        float cap = step(0.0135, vP.y);
        float d;
        if (uGlyph < 0.5) d = box(b, vec2(0.5, 0.1));
        else if (uGlyph < 1.5) d = min(box(b, vec2(0.5, 0.1)), box(b, vec2(0.1, 0.5)));
        else if (uGlyph > 2.5 && uGlyph < 3.5) d = min(triU(b - vec2(0.0, 0.12), 0.44), box(b - vec2(0.0, -0.36), vec2(0.4, 0.075)));     // eject = load
        else if (uGlyph > 3.5 && uGlyph < 4.5) d = triR(b - vec2(0.08, 0.0), 0.5);                                                      // play
        else if (uGlyph > 10.5 && uGlyph < 11.5) d = triU(b - vec2(0.0, -0.04), 0.56);                                                 // up
        else if (uGlyph > 11.5 && uGlyph < 12.5) d = triU(vec2(b.x, -b.y) - vec2(0.0, -0.04), 0.56);                                   // down
        else if (uGlyph > 12.5 && uGlyph < 14.5) { vec2 c = uGlyph < 13.5 ? b : vec2(b.x, -b.y);                                       // double chevron: away / towards you
          float c1 = max(abs(c.y - 0.24 + abs(c.x) * 0.8) * 0.78 - 0.07, abs(c.x) - 0.4);
          float c2 = max(abs(c.y + 0.04 + abs(c.x) * 0.8) * 0.78 - 0.07, abs(c.x) - 0.4); d = min(c1, c2); }
        else if (uGlyph > 14.5 && uGlyph < 16.5) { float an = uGlyph < 15.5 ? 0.5 : -0.5; vec2 c = mat2(cos(an), -sin(an), sin(an), cos(an)) * (b - vec2(0.0, 0.08));   // tilted screen on a base
          d = min(box(c, vec2(0.09, 0.36)), box(b - vec2(0.0, -0.42), vec2(0.32, 0.055))); }
        else if (uGlyph > 9.5 && uGlyph < 10.5) d = min(triR(b - vec2(-0.08, 0.0), 0.44), box(b - vec2(0.3, 0.0), vec2(0.07, 0.3)));                    // next
        else if (uGlyph > 7.5 && uGlyph < 8.5) d = min(box(b - vec2(-0.19, 0.0), vec2(0.1, 0.36)), box(b - vec2(0.19, 0.0), vec2(0.1, 0.36)));   // pause
        else if (uGlyph > 4.5 && uGlyph < 5.5) { float rr2 = abs(box(b, vec2(0.3, 0.14)) - 0.1) - 0.065;                                // loop
          d = min(rr2, min(triR(b - vec2(0.1, 0.24), 0.26), triR(-(b - vec2(-0.1, -0.24)), 0.26))); }
        else if (uGlyph > 5.5 && uGlyph < 6.5) d = min(min(box(b - vec2(-0.36, 0.0), vec2(0.12, 0.17)), box(b, vec2(0.12, 0.17))), box(b - vec2(0.36, 0.0), vec2(0.12, 0.17)));  // all screens
        else if (uGlyph > 8.5 && uGlyph < 9.5) d = abs(box(b, vec2(0.3, 0.2))) - 0.06;                                                  // this screen
        else if (uGlyph > 6.5 && uGlyph < 7.5) d = min(abs(b.x) / 0.14 + abs(b.y) / 0.52, abs(b.x) / 0.52 + abs(b.y) / 0.14) - 1.0;      // sparkle = default
        else { float a = atan(b.y, b.x); float ring = abs(rr - 0.46) - 0.09;
          float gap = step(abs(a - 1.2), 0.55); ring = mix(ring, 1.0, gap);
          vec2 tip = vec2(cos(0.65), sin(0.65)) * 0.46; vec2 q = b - tip;            // arrowhead
          vec2 dir = normalize(vec2(-sin(0.65), cos(0.65))); float along = dot(q, dir), lat = dot(q, vec2(dir.y, -dir.x));
          float tri = max(-along, abs(lat) - (0.24 - along * 0.9));
          tri = max(tri, along - 0.27); d = min(ring, tri); }
        float px = fwidth(d) * 1.2;
        float g = 1.0 - smoothstep(-px, px, d);
        vec3 top = mix(uCap * (0.72 + 0.35 * uHover), vec3(1.0), 0.18 * uHover + 0.55 * uPress);
        top *= 0.85 + 0.25 * smoothstep(1.0, 0.0, rr);                              // soft dome highlight
        float edge = smoothstep(0.82, 0.98, rr);
        top = mix(top, uCap * (1.3 + 0.8 * uHover), edge * 0.6);
        top = mix(top, uGly, max(g, smoothstep(0.8, 0.84, rr) * (1.0 - smoothstep(0.93, 0.97, rr)) * uOn));
        vec3 side = uRim * (0.6 + 0.9 * uHover) + uCap * 0.25 * uPress;
        gl_FragColor = vec4(mix(side, top, cap), 1.0);
      }`,
  });
}

function frameMat(st, hw = BW / 2, hh = BH / 2) {
  return new THREE.ShaderMaterial({
    uniforms: { uF: { value: v3(st.frame) }, uN: { value: v3(st.neon) }, uTime: { value: 0 }, uStripes: { value: st.stripes ? 1 : 0 } },
    vertexShader: PVS,
    fragmentShader: /* glsl */`
      uniform vec3 uF; uniform vec3 uN; uniform float uTime; uniform float uStripes; varying vec3 vP; varying vec3 vWp; varying vec3 vNw;
      void main(){
        vec3 V = normalize(cameraPosition - vWp); float fr = pow(1.0 - abs(dot(normalize(vNw), V)), 3.0);
        vec3 c = uF * (0.8 + 0.4 * fr) + uN * fr * 0.25;
        float e = max(abs(vP.x) / ${(hw + 0.035).toFixed(3)}, abs(vP.y) / ${(hh + 0.035).toFixed(3)});
        c += uN * smoothstep(0.955, 0.985, e) * (0.7 + 0.3 * sin(uTime * 1.3 + vP.x * 9.0 + vP.y * 9.0));
        if (uStripes > 0.5) { float s = step(0.5, fract((vP.x + vP.y) * 28.0)); c = mix(c, vec3(s * 0.9), step(0.93, e) * (1.0 - smoothstep(0.955, 0.985, e))); }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function boardMat(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex } }, vertexShader: PVS.replace('varying vec3 vP;', 'varying vec3 vP; varying vec2 vUv2;').replace('vP = position;', 'vP = position; vUv2 = uv;'),
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying vec2 vUv2; varying vec3 vP; varying vec3 vWp; varying vec3 vNw;
      void main(){ vec3 c = texture2D(uMap, vUv2).rgb;
        vec3 V = normalize(cameraPosition - vWp); float fr = pow(1.0 - abs(dot(normalize(vNw), V)), 4.0);
        gl_FragColor = vec4(c + vec3(fr * 0.06), 1.0); }`,
  });
}

function drawBoard(ct, st) {
  const { c, g } = ct, W = c.width, H = c.height;
  const X = (x) => (x / BW + 0.5) * W, Y = (y) => (0.5 - y / BH) * H, S = W / BW;
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, st.bg0); grd.addColorStop(1, st.bg1);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (st.stripes) {   // op-art: fine concentric arcs in the background
    g.save(); g.globalAlpha = 0.09; g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    for (let r = 20; r < W; r += 26) { g.beginPath(); g.arc(W / 2, H * 1.1, r, Math.PI, 2 * Math.PI); g.stroke(); }
    g.restore();
  } else {
    g.save(); g.globalAlpha = 0.12; const rg = g.createRadialGradient(W / 2, H * 0.2, 10, W / 2, H * 0.2, W * 0.7); rg.addColorStop(0, st.edge); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
  }
  g.strokeStyle = st.edge; g.lineWidth = 6; g.globalAlpha = 0.85; g.strokeRect(14, 14, W - 28, H - 28); g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = st.title; g.font = '700 46px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText('CHAMBER CONTROLS', W / 2, Y(0.205));
  g.fillStyle = st.edge; g.fillRect(W * 0.2, Y(0.172), W * 0.6, 3);
  const row = (label, value, y) => {
    g.fillStyle = st.label; g.font = '600 34px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText(label, W / 2, Y(y + 0.058));
    g.fillStyle = st.value; g.font = '800 64px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText(value, W / 2, Y(y - 0.004));
  };
  row('ANIMATION SPEED', `${settings.speed.toFixed(2)}×`, 0.075);
  row('BRIGHTNESS', `${BRIGHTS[settings.brightI]}%`, -0.085);
  // button sockets
  for (const b of BTN) {
    g.fillStyle = st.socket; g.beginPath(); g.ellipse(X(b.x), Y(b.y), (BR + 0.012) * S * (b.sx ? b.sx * 1.9 : 1), (BR + 0.012) * S, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = st.label; g.font = '600 28px system-ui, Segoe UI, Roboto, sans-serif';
  g.textAlign = 'left'; g.fillText('RESET', X(0.105), Y(-0.19));
  g.textAlign = 'right'; g.fillText('1× · 100%', X(-0.105), Y(-0.19));
  // range ticks under each readout
  const ticks = (n, i, y) => { for (let k = 0; k < n; k++) { const x = X(-0.1 + (0.2 * k) / (n - 1)); g.fillStyle = k <= i ? st.edge : 'rgba(255,255,255,0.18)'; g.fillRect(x - 5, Y(y - 0.05) - 5, 10, 10); } };
  ticks(SPEEDS.length, settings.speedI, 0.075); ticks(BRIGHTS.length, settings.brightI, -0.085);
  ct.t.needsUpdate = true;
}

function drawWing(ct, st, ms) {
  const { c, g } = ct, W = c.width, H = c.height;
  const X = (x) => (x / WW + 0.5) * W, Y = (y) => (0.5 - y / WH) * H, S = W / WW;
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, st.bg0); grd.addColorStop(1, st.bg1);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (st.stripes) { g.save(); g.globalAlpha = 0.09; g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    for (let r = 20; r < W * 1.4; r += 26) { g.beginPath(); g.arc(W / 2, H * 1.1, r, Math.PI, 2 * Math.PI); g.stroke(); } g.restore(); }
  g.strokeStyle = st.edge; g.lineWidth = 6; g.globalAlpha = 0.85; g.strokeRect(14, 14, W - 28, H - 28); g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = st.title; g.font = '700 46px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText(ms.mode === 'drive' ? 'MEDIA · DRIVE' : 'MEDIA', W / 2, Y(0.238));
  // status (file name, hint or error), wrapped to two lines
  g.font = '500 25px system-ui, Segoe UI, Roboto, sans-serif'; g.fillStyle = ms.error ? '#ffd27a' : st.label;
  const words = String(ms.status || '').split(' '); const lines = ['']; for (const w of words) { const t = (lines[lines.length - 1] + ' ' + w).trim();
    if (g.measureText(t).width > W - 70 && lines[lines.length - 1]) { if (lines.length === 2) { lines[1] += '…'; break; } lines.push(w); } else lines[lines.length - 1] = t; }
  lines.forEach((l, i) => g.fillText(l, W / 2, Y(0.2 - i * 0.026)));
  for (const b of WBTN) { g.fillStyle = st.socket; g.beginPath(); g.arc(X(b.x), Y(b.y), (BR + 0.012) * S, 0, Math.PI * 2); g.fill();
    const lab = b.id === 'm-loop' ? ms.loopLabel : b.id === 'm-screens' ? ms.screensLabel : b.label;
    g.fillStyle = b.id === 'm-loop' || b.id === 'm-screens' ? st.value : st.label; g.font = '600 24px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText(lab, X(b.x), Y(b.y - 0.074)); }
  g.fillStyle = st.label; g.font = '600 26px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText('VOLUME', W / 2, Y(-0.012));
  g.fillStyle = st.value; g.font = '800 52px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText(ms.volume <= 0 ? 'MUTE' : `${Math.round(ms.volume * 100)}%`, W / 2, Y(-0.05));
  ct.t.needsUpdate = true;
}

function drawScreenWing(ct, st, sv) {
  const { c, g } = ct, W = c.width, H = c.height;
  const X = (x) => (x / SW + 0.5) * W, Y = (y) => (0.5 - y / SH) * H, S = W / SW;
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, st.bg0); grd.addColorStop(1, st.bg1);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (st.stripes) { g.save(); g.globalAlpha = 0.09; g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    for (let r = 20; r < W * 1.6; r += 26) { g.beginPath(); g.arc(W / 2, H * 1.1, r, Math.PI, 2 * Math.PI); g.stroke(); } g.restore(); }
  g.strokeStyle = st.edge; g.lineWidth = 6; g.globalAlpha = 0.85; g.strokeRect(14, 14, W - 28, H - 28); g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = st.title; g.font = '700 46px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText('SCREEN', W / 2, Y(0.318));
  for (const b of SBTN) { g.fillStyle = st.socket; g.beginPath(); g.arc(X(b.x), Y(b.y), (BR * (b.sx || 1) + 0.012) * S, 0, Math.PI * 2); g.fill(); }
  const vals = { height: sv.height, dist: sv.dist, size: sv.size, tilt: sv.tilt };
  const HINT = { height: 'DOWN  ·  UP', dist: 'FARTHER  ·  CLOSER', size: 'SMALLER  ·  BIGGER', tilt: 'FACE UP  ·  FACE DOWN' };
  for (const r of SROWS) {
    g.fillStyle = st.label; g.font = '700 27px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText(r.name, W / 2, Y(r.y + 0.042));
    g.fillStyle = st.value; g.font = '800 56px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText(vals[r.k], W / 2, Y(r.y + 0.002));
    g.fillStyle = st.label; g.globalAlpha = 0.9; g.font = '600 21px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText(HINT[r.k], W / 2, Y(r.y - 0.042)); g.globalAlpha = 1;
  }
  g.globalAlpha = 1;
  g.textAlign = 'left'; g.font = '700 28px system-ui, Segoe UI, Roboto, sans-serif';
  if (sv.msg) { g.fillStyle = '#ffd27a'; g.fillText(sv.msg, X(-0.11), Y(-0.3)); }
  else { g.fillStyle = st.label; g.fillText(sv.home ? 'RESET · DEFAULT SPOT' : 'RESET TO DEFAULT', X(-0.11), Y(-0.3)); }
  ct.t.needsUpdate = true;
}

function buildPanel(style, parent, pos, faceTo) {
  const st = STYLES[style];
  const g = new THREE.Group(); g.name = 'panel-' + style;
  g.position.set(pos[0], 0, pos[1]); g.rotation.y = Math.atan2(faceTo[0] - pos[0], faceTo[1] - pos[1]); parent.add(g);
  const fm = frameMat(st);
  // stand: base plate, slim column, neon collar
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 40), fm); base.position.y = 0.025; g.add(base);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.95, 16), fm); col.position.y = 0.5; g.add(col);
  // tilted board (centre ~1.1 m, tilted back 32° so it faces a standing user's hand and eyes)
  const head = new THREE.Group(); head.position.set(0, 1.1, 0); head.rotation.x = -0.56; g.add(head);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.07, BH + 0.07, 0.035), fm); frame.position.z = -0.02; head.add(frame);
  const ct = canvasTex(1024, Math.round(1024 * BH / BW));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), boardMat(ct.t)); board.position.z = 0.0; head.add(board);
  const geo = new THREE.CylinderGeometry(BR, BR + 0.004, 0.028, 40); geo.translate(0, 0.0, 0);
  const buttons = BTN.map((b) => {
    const m = new THREE.Mesh(geo, buttonMat(st, b.glyph)); m.rotation.x = Math.PI / 2; m.position.set(b.x, b.y, 0.014);
    if (b.sx) m.scale.set(b.sx, 1, b.sx);
    m.userData.btn = { id: b.id, hover: 0, hoverT: 0, press: 0, rest: 0.014, pokeArmed: true };
    head.add(m); return m;
  });
  // media wing on a hinge at the right edge, swung 24° towards the user
  const hinge = new THREE.Group(); hinge.position.set(BW / 2 + 0.05, 0, -0.005); hinge.rotation.y = -0.42; head.add(hinge);
  const wing = new THREE.Group(); wing.position.set(WW / 2 + 0.04, 0, 0); hinge.add(wing);
  const wfm = frameMat(st, WW / 2, WH / 2);
  const wframe = new THREE.Mesh(new THREE.BoxGeometry(WW + 0.07, WH + 0.07, 0.035), wfm); wframe.position.z = -0.02; wing.add(wframe);
  const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, BH * 0.8, 12), fm); hinge.add(knuckle);
  const wct = canvasTex(1024, Math.round(1024 * WH / WW));
  const wboard = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), boardMat(wct.t)); wing.add(wboard);
  const wbuttons = WBTN.map((b) => {
    const m = new THREE.Mesh(geo, buttonMat(st, b.glyph)); m.rotation.x = Math.PI / 2; m.position.set(b.x, b.y, 0.014);
    m.userData.btn = { id: b.id, hover: 0, hoverT: 0, press: 0, rest: 0.014, pokeArmed: true };
    wing.add(m); return m;
  });
  // screen wing on a hinge at the left edge, swung 24° towards the user (mirror of the media wing)
  const shinge = new THREE.Group(); shinge.position.set(-BW / 2 - 0.05, 0, -0.005); shinge.rotation.y = 0.42; head.add(shinge);
  const swing = new THREE.Group(); swing.position.set(-SW / 2 - 0.04, -(SH - BH) / 2, 0); shinge.add(swing);
  const sfm = frameMat(st, SW / 2, SH / 2);
  const sframe = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.07, SH + 0.07, 0.035), sfm); sframe.position.z = -0.02; swing.add(sframe);
  const sknuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, BH * 0.8, 12), fm); shinge.add(sknuckle);
  const sct = canvasTex(1024, Math.round(1024 * SH / SW));
  const sboard = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), boardMat(sct.t)); swing.add(sboard);
  const sbuttons = SBTN.map((b) => {
    const m = new THREE.Mesh(geo, buttonMat(st, b.glyph)); m.rotation.x = Math.PI / 2; m.position.set(b.x, b.y, 0.014);
    if (b.sx) m.scale.set(b.sx, 1, b.sx);
    m.userData.btn = { id: b.id, hover: 0, hoverT: 0, press: 0, rest: 0.014, pokeArmed: true };
    swing.add(m); return m;
  });
  return { group: g, head, board, frame, ct, st, buttons: [...buttons, ...wbuttons, ...sbuttons], frameMat: fm, wfm, wboard, wframe, wct, wbuttons, sfm, sboard, sframe, sct, sbuttons };
}

// ---------- system ----------
export function createPanels({ renderer, rig, camera, rooms, onChange, media, screens }) {
  const panels = rooms.map((r, i) => { const p = buildPanel(r.style, r.root, r.pos, r.faceTo); p.space = r.space;
    p.buttons.forEach((b) => { b.userData.btn.room = i; }); return p; });
  const redrawScreen = (i) => { if (screens) drawScreenWing(panels[i].sct, panels[i].st, screens.view(i)); };
  panels.forEach((_, i) => redrawScreen(i));
  const redraw = () => panels.forEach((p) => drawBoard(p.ct, p.st));
  const redrawMedia = () => { const ms = media.view(); panels.forEach((p) => {
    drawWing(p.wct, p.st, ms);
    const by = (id) => p.wbuttons[WBTN.findIndex((b) => b.id === id)].material.uniforms;
    by('m-play').uGlyph.value = ms.playing ? 8 : 4; by('m-play').uOn.value = ms.ready ? 1 : 0;
    by('m-loop').uOn.value = ms.loopOn ? 1 : 0;
    by('m-screens').uGlyph.value = media.st.screens === 'all' ? 6 : 9;
    by('m-default').uOn.value = ms.defaultOn ? 1 : 0;
  }); };
  redrawMedia();
  redraw();
  const allButtons = panels.flatMap((p) => p.buttons);
  const hitTargets = panels.flatMap((p) => [...p.buttons, p.board, p.frame, p.wboard, p.wframe, p.sboard, p.sframe]);

  function act(id, room = 0) {
    if (id.startsWith('m-')) { media.act(id); return; }
    if (id.startsWith('s-')) { if (screens) screens.act(id, room); return; }
    if (id === 'speed-') settings.speedI = Math.max(0, settings.speedI - 1);
    else if (id === 'speed+') settings.speedI = Math.min(SPEEDS.length - 1, settings.speedI + 1);
    else if (id === 'bright-') settings.brightI = Math.max(0, settings.brightI - 1);
    else if (id === 'bright+') settings.brightI = Math.min(BRIGHTS.length - 1, settings.brightI + 1);
    else if (id === 'reset') { settings.speedI = 3; settings.brightI = 7; }
    saveSettings(); redraw(); onChange(settings);
  }
  function press(btn, src) {
    btn.userData.btn.press = 1; act(btn.userData.btn.id, btn.userData.btn.room);
    const ha = src && src.gamepad && src.gamepad.hapticActuators && src.gamepad.hapticActuators[0];
    if (ha) { try { (ha.pulse ? ha.pulse(0.55, 35) : ha.playEffect && ha.playEffect('dual-rumble', { duration: 35, strongMagnitude: 0.55, weakMagnitude: 0.55 })); } catch { /* no haptics */ } }
  }

  // ---------- XR controllers: laser + cursor ----------
  const ray = new THREE.Raycaster(); ray.far = 6;
  const laserGeo = new THREE.BoxGeometry(0.0035, 0.0035, 1); laserGeo.translate(0, 0, -0.5);
  const laserMat = new THREE.ShaderMaterial({ uniforms: { uHit: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vZ; void main(){ vZ = -position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uHit; varying float vZ; void main(){ float a = mix(0.35 * (1.0 - vZ), 0.9, uHit); gl_FragColor = vec4(vec3(1.0, 0.75, 0.88) * a, 1.0); }' });
  const cursorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i); rig.add(c);
    const lm = laserMat.clone(); const laser = new THREE.Mesh(laserGeo, lm); laser.scale.z = 1.2; laser.frustumCulled = false; c.add(laser);
    const cursor = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.011, 24), cursorMat); cursor.visible = false; cursor.renderOrder = 999;
    const hand = renderer.xr.getHand(i); rig.add(hand);
    const st = { c, laser, lm, cursor, src: null, hover: null, hand };
    c.addEventListener('connected', (e) => { st.src = e.data; laser.visible = !e.data.hand; });
    c.addEventListener('disconnected', () => { st.src = null; st.hover = null; });
    c.addEventListener('selectstart', () => { if (st.hover && st.hover.userData.btn) press(st.hover, st.src); });
    return st;
  });
  let cursorParentSet = false;

  // ---------- desktop mouse ----------
  let mouseHover = null; const ndc = new THREE.Vector2();
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(visibleTargets(), false)[0];
    return h && h.object.userData.btn ? h.object : null;
  }
  const shown = (o) => { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; };
  const visibleTargets = () => hitTargets.filter(shown);
  function mouseDown(e) { const b = pick(e); if (b) { press(b, null); return true; } return false; }
  function mouseMove(e) { mouseHover = pick(e); renderer.domElement.style.cursor = mouseHover ? 'pointer' : ''; }

  // ---------- per frame ----------
  const o = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion(), lp = new THREE.Vector3(), tip = new THREE.Vector3();
  function pokeCheck(worldPt, src) {
    for (const b of allButtons) {
      if (!shown(b)) continue;
      lp.copy(worldPt); b.worldToLocal(lp);        // button-local: cap faces +y (towards the user)
      const B = b.userData.btn, rad = Math.hypot(lp.x, lp.z);
      if (rad < BR * 1.15 && lp.y < 0.012 && lp.y > -0.05) { if (B.pokeArmed) { B.pokeArmed = false; press(b, src); } }
      else if (rad > BR * 1.4 || lp.y > 0.04) B.pokeArmed = true;
    }
  }
  function update(dt, time) {
    panels.forEach((p) => { p.frameMat.uniforms.uTime.value = time; p.wfm.uniforms.uTime.value = time; p.sfm.uniforms.uTime.value = time; });
    const xr = renderer.xr.isPresenting;
    if (xr && !cursorParentSet) { ctrls.forEach((s) => rig.parent.add(s.cursor)); cursorParentSet = true; }
    const targets = visibleTargets();
    const hovered = new Set();
    for (const s of ctrls) {
      s.hover = null;
      if (!xr || !s.src || !s.src.targetRayMode || s.src.targetRayMode !== 'tracked-pointer') { s.cursor.visible = false; continue; }
      s.c.getWorldPosition(o); s.c.getWorldQuaternion(q); d.set(0, 0, -1).applyQuaternion(q);
      ray.set(o, d); const h = targets.length ? ray.intersectObjects(targets, false)[0] : null;
      if (h) {
        s.laser.scale.z = h.distance; s.lm.uniforms.uHit.value = 1;
        s.cursor.visible = true; s.cursor.position.copy(h.point); s.cursor.quaternion.copy(h.object.getWorldQuaternion(q));
        if (h.object.userData.btn) { s.hover = h.object; s.cursor.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)); }
        s.cursor.position.addScaledVector(d, -0.004);
      } else { s.laser.scale.z = 1.2; s.lm.uniforms.uHit.value = 0; s.cursor.visible = false; }
      if (s.hover) hovered.add(s.hover);
      // poke with the controller tip (grip/target-ray origin)
      if (!s.src.hand) pokeCheck(o, s.src);
    }
    // poke with an index fingertip (hand tracking)
    if (xr) for (const s of ctrls) { const j = s.hand && s.hand.joints && s.hand.joints['index-finger-tip']; if (j && j.visible) { j.getWorldPosition(tip); pokeCheck(tip, null); } }
    if (!xr && mouseHover) hovered.add(mouseHover);
    for (const b of allButtons) {
      const B = b.userData.btn; B.hover += ((hovered.has(b) ? 1 : 0) - B.hover) * Math.min(1, dt * 14);
      B.press = Math.max(0, B.press - dt * 4);
      b.material.uniforms.uHover.value = B.hover; b.material.uniforms.uPress.value = B.press;
      b.position.z = B.rest - 0.009 * B.press + 0.004 * B.hover;
    }
  }
  return { update, mouseDown, mouseMove, panels, redraw, redrawMedia, redrawScreen, press, act, allButtons };
}
