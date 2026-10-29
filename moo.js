// v24 "Moo Track": a spatial audio experience for the Little Moo Barn.
//  - a narrator voice that slowly circles your head (WebAudio PannerNode, HRTF; the listener is the camera),
//  - a heartbeat-like low drone pulsing from below you (a panner under the listener),
//  - a cowbell ring on timed "snap cues" (plus soft prop / footstep sounds for the other cue types).
// The narrator file is supplied by you (file picker, ?moo=, config.js, assets/, the GCS bucket or the barn Drive folder). Until it is, a generated
// placeholder (a TTS-free hummed "voice", a soft pad and chimes) plays instead. The cue list (moo_cues.json, or your own JSON) says when each
// cue fires: { "t": seconds, "type": "cowbell" | "prop" | "stepcloser" }. No three.js here: main.js wires it to the scene (props, Miss Moo).
import { DRIVE_DEFAULTS, MOO_DEFAULTS } from './config.js?v=28';

const KEY = 'resonanceChamber.moo.v1';
const GCS = DRIVE_DEFAULTS.gcs || '';
export const VOLS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const ALIAS = { cowbell: 'cowbell', bell: 'cowbell', snap: 'cowbell', prop: 'prop', props: 'prop', light: 'prop', lights: 'prop', stepcloser: 'stepcloser', step: 'stepcloser', closer: 'stepcloser', steps: 'stepcloser' };
const HB = 60 / 66;            // heartbeat period (66 bpm)
const ORBIT_R = 1.25;           // narrator orbit radius (m)
const DUCK = 0.5;               // room beds dip to this while the track plays

// the same list as moo_cues.json (used when that file can't be fetched)
export const EMBEDDED_CUES = { title: 'Moo Track (built-in cue list)', duration: 180, orbitSeconds: 28, cues: [
  [6, 'cowbell'], [14, 'prop'], [22, 'stepcloser'], [30, 'cowbell', -70], [38, 'stepcloser'], [46, 'prop'], [54, 'cowbell', 70], [62, 'stepcloser'], [72, 'prop'], [80, 'cowbell', 180],
  [88, 'stepcloser'], [98, 'cowbell', -40], [106, 'prop'], [114, 'stepcloser'], [124, 'cowbell', 40], [132, 'stepcloser'], [142, 'prop'], [150, 'stepcloser'], [160, 'cowbell', 0],
  [168, 'stepcloser'], [174, 'prop'] ].map(([t, type, az]) => (az === undefined ? { t, type } : { t, type, az })) };

// ---------- cue list parsing ----------
export function normalizeCues(j) {
  if (typeof j === 'string') j = JSON.parse(j);
  const arr = Array.isArray(j) ? j : (j && (j.cues || j.events)) || null;
  if (!Array.isArray(arr)) throw new Error('no "cues" list found in the JSON');
  const cues = []; let dropped = 0;
  for (const c of arr) {
    const t = +(c && (c.t ?? c.time ?? c.at ?? c.seconds)), type = ALIAS[String((c && c.type) || '').toLowerCase()];
    if (!isFinite(t) || t < 0 || !type) { dropped++; continue; }
    const o = { t, type };
    if (c.az !== undefined && isFinite(+c.az)) o.az = +c.az;
    if (c.gain !== undefined && isFinite(+c.gain)) o.gain = Math.max(0, Math.min(2, +c.gain));
    if (c.level !== undefined && isFinite(+c.level)) o.level = Math.max(0, Math.min(2, +c.level));
    cues.push(o);
  }
  cues.sort((a, b) => a.t - b.t);
  const last = cues.length ? cues[cues.length - 1].t : 0;
  const dur = j && !Array.isArray(j) && isFinite(+j.duration) && +j.duration > 5 ? +j.duration : Math.max(60, Math.ceil(last + 8));
  return { title: (j && j.title) || 'Moo Track', duration: dur, orbitSeconds: j && isFinite(+j.orbitSeconds) && +j.orbitSeconds > 4 ? +j.orbitSeconds : 28, cues, dropped };
}

// ---------- source helpers ----------
export function driveFileId(s) {
  s = (s || '').trim();
  const m = /\/file\/d\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{25,}$/.test(s) ? s : '';
}
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const baseName = (u) => { try { return decodeURIComponent(new URL(u, location.href).pathname.split('/').pop() || u); } catch { return String(u); } };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function createMoo({ ensureAudio, getDrive, onChange = () => {}, onCue = () => {}, cowPos = () => null, propPos = () => null }) {
  const Q = new URLSearchParams(location.search);
  const API = Q.get('driveApi') || 'https://www.googleapis.com';
  const S = { state: 'idle', t: 0, dur: EMBEDDED_CUES.duration, orbit: EMBEDDED_CUES.orbitSeconds, vol: 0.8, cues: [], cueSrc: 'built-in list', title: EMBEDDED_CUES.title,
    narr: { kind: 'none', name: '', ready: false, dur: 0, url: '' }, status: 'Press START (a placeholder voice plays until your narration is added)', error: '', ci: 0, steps: 0, nSteps: 0, cueCount: [0, 0, 0],
    pulse: 0, discovering: true, ctxT0: 0, phi0: 0 };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s.vol === 'number') S.vol = Math.max(0, Math.min(1, s.vol)); } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ vol: S.vol })); } catch { /* ignore */ } };
  const changed = () => onChange(S);

  // ----- cues -----
  function setCues(n, src) {
    S.cues = n.cues; S.cueSrc = src; S.title = n.title; S.dur = n.duration; S.orbit = n.orbitSeconds;
    S.nSteps = n.cues.filter((c) => c.type === 'stepcloser').length;
    S.cueCount = ['cowbell', 'prop', 'stepcloser'].map((k) => n.cues.filter((c) => c.type === k).length);
    if (S.narr.kind !== 'none' && S.narr.dur > 1) S.dur = S.narr.dur;
    changed();
  }
  setCues(normalizeCues(EMBEDDED_CUES), 'built-in list');
  async function fetchText(url) { const r = await fetch(url, { cache: 'no-store', credentials: 'omit' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }
  const driveUrls = (id) => { const d = getDrive(); return [`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
    `${API}/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(d.key || '')}`]; };
  // spec -> list of candidate URLs
  function candidates(spec) {
    spec = (spec || '').trim(); if (!spec || /^(default|off|0)$/i.test(spec)) return [];
    const id = driveFileId(spec); if (id) return driveUrls(id);
    if (/^gcs:/i.test(spec)) return [`${GCS}/${spec.slice(4).replace(/^\/+/, '')}`];
    return [spec];
  }
  async function loadCuesFrom(spec, label) {
    let lastErr = null;
    for (const u of candidates(spec)) {
      try { const n = normalizeCues(await fetchText(u)); setCues(n, label || baseName(u)); S.error = ''; return n; } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('no link');
  }
  async function exists(u) { try { const r = await fetch(u, { method: 'HEAD', cache: 'no-store', credentials: 'omit' }); return r.ok; } catch { return false; } }
  async function driveFind(q) {
    const d = getDrive(); if (!d.key || !d.folder) return null;
    try {
      const url = `${API}/drive/v3/files?q=${encodeURIComponent(`'${d.folder}' in parents and trashed = false and ${q}`)}&fields=${encodeURIComponent('files(id,name,mimeType)')}&orderBy=name_natural&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${encodeURIComponent(d.key)}`;
      const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) return null; return (await r.json()).files || [];
    } catch { return null; }
  }

  // ----- narrator element -----
  const el = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.loop = false;
  let blobUrl = null, loadId = 0;
  el.addEventListener('ended', () => { if (S.state === 'playing' && S.narr.kind !== 'none') finish(); });
  function clearNarr(msg) {
    loadId++; if (!el.paused) el.pause(); el.removeAttribute('src'); el.load(); if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    S.narr = { kind: 'none', name: '', ready: false, dur: 0, url: '' }; S.dur = S.cues.length ? normalizeCues({ cues: S.cues, duration: EMBEDDED_CUES.duration }).duration : EMBEDDED_CUES.duration;
    if (msg) S.status = msg;
  }
  // try one URL; resolves when the browser knows its duration
  function tryUrl(u, name, kind, timeout = 20000) {
    return new Promise((res, rej) => {
      const id = ++loadId; let done = false;
      const fin = (ok, err) => { if (done) return; done = true; clearTimeout(tm); el.removeEventListener('loadedmetadata', onOk); el.removeEventListener('error', onErr);
        if (id !== loadId) return rej(new Error('superseded')); ok ? res() : rej(err); };
      const onOk = () => fin(true), onErr = () => fin(false, new Error(el.error && el.error.message ? el.error.message : 'could not load audio')), tm = setTimeout(() => fin(false, new Error('timed out')), timeout);
      el.addEventListener('loadedmetadata', onOk); el.addEventListener('error', onErr);
      el.src = u; el.load();
    }).then(() => { S.narr = { kind, name, ready: true, dur: isFinite(el.duration) ? el.duration : 0, url: u }; if (S.narr.dur > 1) S.dur = S.narr.dur; });
  }
  async function loadNarrator(spec, label) {
    const list = candidates(spec); if (!list.length) { useDefault(); return; }
    S.status = 'Loading narration…'; changed(); let lastErr = null;
    for (const u of list) { try { await tryUrl(u, label || baseName(u), 'url'); S.error = ''; S.status = `Narration ready: ${S.narr.name} (${mmss(S.narr.dur)})`; changed(); return true; } catch (e) { lastErr = e; if (e.message === 'superseded') return false; } }
    S.error = `Could not load that narration (${lastErr ? lastErr.message : 'bad link'}): is it shared "Anyone with the link" and a direct audio file?`; S.status = S.error; clearNarr(); S.status = S.error; changed(); return false;
  }
  async function loadFile(file) {
    if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = URL.createObjectURL(file);
    S.status = 'Loading ' + file.name + '…'; changed();
    try { await tryUrl(blobUrl, file.name, 'file'); S.error = ''; S.status = `Narration ready: ${file.name} (${mmss(S.narr.dur)})`; }
    catch (e) { S.error = `Can't play ${file.name} (${e.message}). Try MP3, M4A, OGG or WAV.`; clearNarr(); S.status = S.error; }
    changed();
  }
  async function loadCueFile(file) {
    try { const n = normalizeCues(await file.text()); setCues(n, file.name); S.error = ''; S.status = `Cues loaded: ${n.cues.length} from ${file.name}${n.dropped ? ` (${n.dropped} skipped)` : ''}`; }
    catch (e) { S.error = `Cue file not usable: ${e.message}`; S.status = S.error; }
    changed();
  }
  function useDefault() { clearNarr('Placeholder voice (no narration file loaded)'); S.error = ''; changed(); }
  const mkPicker = (accept, fn) => { const p = document.createElement('input'); p.type = 'file'; p.accept = accept; p.style.display = 'none'; document.body.appendChild(p);
    p.addEventListener('change', () => { const f = p.files && p.files[0]; if (f) fn(f); p.value = ''; }); return p; };
  const picker = mkPicker('audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.webm', loadFile);
  const cuePicker = mkPicker('application/json,.json,.txt', loadCueFile);

  // ----- discovery: where is the narration / cue list? -----
  async function discover() {
    const q = Q.get('moo'), qc = Q.get('moocues');
    try {
      // cues
      let got = false;
      if (qc) { try { await loadCuesFrom(qc); got = true; } catch (e) { S.error = 'Cue list link failed: ' + e.message; } }
      if (!got && MOO_DEFAULTS.cues) { try { await loadCuesFrom(MOO_DEFAULTS.cues); got = true; } catch { /* next */ } }
      if (!got && MOO_DEFAULTS.autoFind !== false) {
        const files = await driveFind("name = 'moo_cues.json'"); if (files && files[0]) { try { await loadCuesFrom(files[0].id, 'moo_cues.json (Drive)'); got = true; } catch { /* next */ } }
        if (!got && GCS && await exists(`${GCS}/moo/moo_cues.json`)) { try { await loadCuesFrom(`gcs:moo/moo_cues.json`, 'moo_cues.json (GCS)'); got = true; } catch { /* next */ } }
      }
      if (!got) { try { await loadCuesFrom('moo_cues.json?v=28', 'moo_cues.json'); } catch { /* embedded stays */ } }
      // narration
      let ok = false;
      if (q && !/^(default|off|0)$/i.test(q)) ok = await loadNarrator(q);
      else if (!q) {
        if (MOO_DEFAULTS.narrator) ok = await loadNarrator(MOO_DEFAULTS.narrator);
        if (!ok && MOO_DEFAULTS.autoFind !== false) {
          for (const n of ['mp3', 'm4a', 'ogg', 'wav']) { if (ok) break; const u = `assets/moo_narrator.${n}`; if (await exists(u)) ok = await loadNarrator(u, `moo_narrator.${n}`); }
          for (const n of ['mp3', 'm4a']) { if (ok || !GCS) break; const u = `${GCS}/moo/narrator.${n}`; if (await exists(u)) ok = await loadNarrator(u, `narrator.${n} (GCS)`); }
          if (!ok) { const files = await driveFind("mimeType contains 'audio/'"); const f = files && (files.find((x) => /moo|narrat|voice|track/i.test(x.name))); if (f) ok = await loadNarrator(f.id, `${f.name} (Drive)`); }
        }
      }
      if (!ok && S.narr.kind === 'none' && !S.error) S.status = 'Placeholder voice (no narration file loaded): add yours with LOAD';
    } catch (e) { console.warn('[moo] discovery', e); }
    S.discovering = false; changed();
  }
  const discovered = discover();

  // ---------- audio graph ----------
  let audio = null, G = null, ses = null;
  function setPos(node, x, y, z) { if (node.positionX) { node.positionX.value = x; node.positionY.value = y; node.positionZ.value = z; } else node.setPosition(x, y, z); }
  function mkPanner(ctx, ref = 1, roll = 0.8) { const p = ctx.createPanner(); Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, rolloffFactor: roll }); return p; }
  function build(ctx, dest) {
    if (G && G.ctx === ctx) return;
    const out = ctx.createGain(); out.gain.value = S.vol; out.connect(dest);
    const orbit = mkPanner(ctx, 1, 0.6), heart = mkPanner(ctx, 1, 0.6); orbit.connect(out); heart.connect(out);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    G = { ctx, out, orbit, heart, noise, elSrc: null };
    try { G.elSrc = ctx.createMediaElementSource(el); } catch (e) { console.warn('[moo] media element source', e); }
  }
  function sesNodes(ctx) {
    const mk = (to) => { const g = ctx.createGain(); g.gain.value = 1; g.connect(to); return g; };
    return { voice: mk(G.orbit), heart: mk(G.heart), fx: mk(G.out), pad: mk(G.out), t0: ctx.currentTime, oscs: [] };
  }
  function endSession(fade = 0.45) {
    if (!ses) return; const s = ses; ses = null; const ctx = G.ctx, t = ctx.currentTime;
    for (const k of ['voice', 'heart', 'fx', 'pad']) { const g = s[k].gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade); }
    if (G.elSrc) { try { G.elSrc.disconnect(s.voice); } catch { /* ignore */ } }
    setTimeout(() => { for (const k of ['voice', 'heart', 'fx', 'pad']) { try { s[k].disconnect(); } catch { /* ignore */ } } s.oscs.forEach((o) => { try { o.stop(); } catch { /* ignore */ } }); }, (fade + 0.15) * 1000);
  }

  // ----- sound builders -----
  const env = (g, at, a, peak, hold, rel) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + a); g.gain.setValueAtTime(Math.max(peak, 0.0002), at + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, at + a + hold + rel); };
  function thump(dest, at, f0, f1, gain, decay) {
    const ctx = G.ctx, o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g); g.connect(dest); o.start(at); o.stop(at + decay + 0.05);
  }
  function tick(dest, at, f, q, gain, dur) {
    const ctx = G.ctx, n = ctx.createBufferSource(); n.buffer = G.noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(bp); bp.connect(g); g.connect(dest); n.start(at, Math.random() * 0.5); n.stop(at + dur + 0.02);
  }
  function placed(pos, ref, roll) { const p = mkPanner(G.ctx, ref, roll); setPos(p, pos.x, pos.y, pos.z); p.connect(ses.fx); return p; }
  function bellSound(at, pos, gain = 1) {
    const ctx = G.ctx, p = placed(pos, 1, 0.5);
    const hit = (t0, k, f) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.5; bp.Q.value = 0.9; const g = ctx.createGain(); env(g, t0, 0.004, 0.5 * gain * k, 0, 1.5);
      for (const [r, ty, a] of [[1, 'triangle', 1], [1.504, 'triangle', 0.8], [2.41, 'sine', 0.35]]) { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f * r; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(bp); o.start(t0); o.stop(t0 + 1.7); }
      bp.connect(g); g.connect(p); tick(p, t0, 2400, 3, 0.06 * gain * k, 0.05);
    };
    hit(at, 1, 640); hit(at + 0.17, 0.6, 612); hit(at + 0.31, 0.38, 640);
    setTimeout(() => { try { p.disconnect(); } catch { /* ignore */ } }, 2600 + Math.max(0, (at - G.ctx.currentTime)) * 1000);
  }
  function propSound(at, pos, gain = 1) {
    const ctx = G.ctx, p = placed(pos, 2.5, 0.8);
    [[523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.3]].forEach(([f, d]) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); env(g, at + d, 0.01, 0.14 * gain, 0.02, 0.45); o.connect(g); g.connect(p); o.start(at + d); o.stop(at + d + 0.7); });
    tick(p, at, 3800, 5, 0.05 * gain, 0.06); tick(p, at + 0.3, 5200, 6, 0.035 * gain, 0.05);
    setTimeout(() => { try { p.disconnect(); } catch { /* ignore */ } }, 1800 + Math.max(0, (at - G.ctx.currentTime)) * 1000);
  }
  function stepSound(at, pos, gain = 1) {
    const ctx = G.ctx, p = placed(pos, 1.5, 0.9);
    for (const [d, f] of [[0, 150], [0.36, 128]]) { thump(p, at + d, f * 1.6, f * 0.55, 0.5 * gain, 0.18); tick(p, at + d, 1100, 2, 0.09 * gain, 0.05); }
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1;
    for (const [d, f] of [[0.02, 1250], [0.4, 1180]]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = ctx.createGain(); env(g, at + d, 0.004, 0.025 * gain, 0, 0.35); o.connect(g); g.connect(p); o.start(at + d); o.stop(at + d + 0.4); }
    setTimeout(() => { try { p.disconnect(); } catch { /* ignore */ } }, 1500 + Math.max(0, (at - G.ctx.currentTime)) * 1000);
  }

  // ----- the placeholder track: a hummed "voice", a soft pad and chimes, built from a fixed seed so it is the same every time -----
  const PENTA = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25];
  const VOWEL = { oo: [320, 800], ah: [730, 1090], oh: [520, 880], eh: [530, 1840] };
  function planPlaceholder(dur) {
    const r = mulberry(24), ev = []; let idx = 2;
    for (let t = 2.5; t < dur - 6; t += 7.5 + r() * 3) {
      const n = 3 + Math.floor(r() * 3); let tt = t;
      for (let k = 0; k < n; k++) {
        idx = Math.max(0, Math.min(PENTA.length - 1, idx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)]));
        const d = 0.7 + r() * 0.9; ev.push({ t: tt, d, kind: 'voice', f: PENTA[idx] * (k === n - 1 ? 0.5 : 1), v: k === 0 ? 'oo' : ['ah', 'oh', 'oo'][Math.floor(r() * 3)] }); tt += d + 0.12;
      }
    }
    const CH = [[146.83, 220, 329.63, 369.99], [123.47, 185, 293.66, 440], [98, 146.83, 246.94, 293.66], [110, 164.81, 277.18, 392]];
    for (let t = 0, k = 0; t < dur; t += 9, k++) ev.push({ t, d: 11, kind: 'pad', ch: CH[k % 4] });
    for (let t = 5, k = 0; t < dur - 3; t += 4.5 + r() * 4, k++) ev.push({ t, d: 3, kind: 'chime', f: [1174.7, 1318.5, 1568, 1760, 1480][Math.floor(r() * 5)], pan: k % 2 ? 0.6 : -0.6 });
    return ev.sort((a, b) => a.t - b.t);
  }
  let plan = [], pi = 0;
  function playPlan(e, at) {
    const ctx = G.ctx;
    if (e.kind === 'voice') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = e.f;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.1; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(e.f * 0.011, at + e.d * 0.5); lfo.connect(lg); lg.connect(o.frequency);
      const [a1, a2] = VOWEL.oo, [b1, b2] = VOWEL[e.v];
      const g = ctx.createGain(); env(g, at, 0.1, 0.5, Math.max(0.05, e.d - 0.35), 0.28);
      for (const [f0, f1, gn] of [[a1, b1, 1], [a2, b2, 0.6]]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7; bp.frequency.setValueAtTime(f0, at); bp.frequency.linearRampToValueAtTime(f1, at + e.d * 0.6);
        const bg = ctx.createGain(); bg.gain.value = gn; o.connect(bp); bp.connect(bg); bg.connect(g);
      }
      g.connect(ses.voice); o.start(at); lfo.start(at); o.stop(at + e.d + 0.5); lfo.stop(at + e.d + 0.5);
    } else if (e.kind === 'pad') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.05, at + 3); g.gain.setValueAtTime(0.05, at + e.d - 3.4); g.gain.linearRampToValueAtTime(0.0001, at + e.d);
      for (const f of e.ch) for (const dt of [-1.2, 1.2]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = dt * 3; o.connect(lp); o.start(at); o.stop(at + e.d + 0.1); }
      lp.connect(g); g.connect(ses.pad);
    } else if (e.kind === 'chime') {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = e.f; const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = e.f * 2.01;
      const g = ctx.createGain(); env(g, at, 0.006, 0.05, 0, 2.6); const g2 = ctx.createGain(); g2.gain.value = 0.25; const sp = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (sp) sp.pan.value = e.pan;
      o.connect(g); o2.connect(g2); g2.connect(g); if (sp) { g.connect(sp); sp.connect(ses.pad); } else g.connect(ses.pad);
      o.start(at); o2.start(at); o.stop(at + 2.8); o2.stop(at + 2.8);
    }
  }

  // ----- run state -----
  let hbNext = 0, hbStart = 0, drone = null, headPos = { x: 0, y: 1.6, z: 0 }, headYaw = 0, fireN = 0;
  function dirAz(az) { const a = headYaw + (az * Math.PI) / 180; return { x: Math.sin(a), z: -Math.cos(a) }; }   // az 0 = ahead, +90 = to the right (yaw = camera look direction)
  function fire(c, at) {
    const gain = c.gain === undefined ? 1 : c.gain;
    if (c.type === 'cowbell') {
      const az = c.az !== undefined ? c.az : (fireN++ % 2 ? 60 : -60), d = dirAz(az);
      bellSound(at, { x: headPos.x + d.x * 1.1, y: headPos.y - 0.1, z: headPos.z + d.z * 1.1 }, gain);
    } else if (c.type === 'prop') { const p = propPos() || { x: headPos.x, y: headPos.y, z: headPos.z - 4 }; propSound(at, p, gain); }
    else if (c.type === 'stepcloser') { const p = cowPos() || { x: headPos.x, y: 0.5, z: headPos.z - 3 }; stepSound(at, { x: p.x, y: 0.4, z: p.z }, gain); }
    if (c.type === 'stepcloser') S.steps++;
    const delay = Math.max(0, (at - G.ctx.currentTime) * 1000);
    setTimeout(() => onCue(c), delay);
  }
  async function start() {
    if (S.state === 'starting') return;
    const prev = S.state; S.state = 'starting'; S.error = ''; S.status = 'Starting…'; changed();
    try {
      const audioP = ensureAudio();   // created first, inside the click / controller-press gesture
      await Promise.race([discovered, new Promise((r) => setTimeout(r, 2500))]);
      audio = await audioP; const ctx = audio.ctx; if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
      build(ctx, audio.dest); endSession(0.15); ses = sesNodes(ctx);
      S.ci = 0; S.steps = 0; S.t = 0; fireN = 0; pi = 0; S.phi0 = -Math.PI / 2 + headYaw;   // the voice starts in front of you
      const fileMode = S.narr.kind !== 'none' && S.narr.ready;
      if (fileMode) {
        el.currentTime = 0; if (G.elSrc) G.elSrc.connect(ses.voice);
        try { await el.play(); } catch (e) { throw new Error('the browser blocked audio playback (tap START again)'); }
        S.dur = S.narr.dur > 1 ? S.narr.dur : (S.cues.length ? S.cues[S.cues.length - 1].t + 8 : 120);
        plan = [];
      } else { S.dur = Math.max(S.dur, 12); plan = planPlaceholder(S.dur); }
      const now = ctx.currentTime; S.ctxT0 = now + 0.15; hbStart = hbNext = now + 0.4;
      // sustained heartbeat drone (pulsed per beat in update)
      drone = ctx.createGain(); drone.gain.value = 0.0001; drone.connect(ses.heart); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; lp.connect(drone);
      for (const [f, a] of [[46, 0.6], [69.2, 0.25], [92.4, 0.1]]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(lp); o.start(now); ses.oscs.push(o); }
      ses.fx.gain.value = 1; for (const k of ['voice', 'heart', 'pad']) { const g = ses[k].gain; g.setValueAtTime(0.0001, now); g.linearRampToValueAtTime(1, now + 1.2); }
      S.state = 'playing'; S.status = fileMode ? `Playing: ${S.narr.name}` : 'Playing the placeholder voice'; S.t = 0;
    } catch (e) { S.state = 'idle'; S.error = 'Moo Track could not start: ' + (e && e.message ? e.message : e); S.status = S.error; endSession(0.1); }
    changed();
  }
  function stop(why) {
    if (S.state !== 'playing' && S.state !== 'done' && S.state !== 'starting') { S.t = 0; changed(); return; }
    if (!el.paused) el.pause(); try { el.currentTime = 0; } catch { /* ignore */ }
    endSession(0.45); S.state = 'idle'; S.t = 0; S.steps = 0; S.ci = 0; S.pulse = 0; S.status = why || (S.narr.kind !== 'none' ? `Stopped. Narration: ${S.narr.name}` : 'Stopped. Press START for the placeholder voice'); changed();
  }
  function finish() {
    if (S.state !== 'playing') return; if (!el.paused) el.pause();
    endSession(3); S.state = 'done'; S.status = 'Track finished. Press RESTART to go again'; S.steps = S.nSteps; changed();
  }
  async function restart() { stop('Restarting…'); await new Promise((r) => setTimeout(r, 120)); return start(); }
  function setVol(v) { S.vol = Math.max(0, Math.min(1, v)); save(); if (G) { const t = G.ctx.currentTime; G.out.gain.cancelScheduledValues(t); G.out.gain.setTargetAtTime(S.vol, t, 0.05); } changed(); }
  function act(id) {
    if (id === 'k-start') { if (S.state === 'done') restart(); else if (S.state !== 'playing') start(); }
    else if (id === 'k-stop') stop();
    else if (id === 'k-restart') restart();
    else if (id === 'k-vol-') setVol(VOLS[Math.max(0, volIdx() - 1)] / 100);
    else if (id === 'k-vol+') setVol(VOLS[Math.min(VOLS.length - 1, volIdx() + 1)] / 100);
    else if (id === 'k-load') { S.status = ((window.__isXR && window.__isXR()) ? 'Opening file picker… (if none appears, exit VR and use "Choose narration" on the page)' : 'Choose a narration audio file…'); changed(); picker.click(); }
    else if (id === 'k-cues') { cuePicker.click(); }
    else if (id === 'k-default') { useDefault(); }
  }
  const volIdx = () => { let b = 0; VOLS.forEach((v, i) => { if (Math.abs(v - S.vol * 100) < Math.abs(VOLS[b] - S.vol * 100)) b = i; }); return b; };

  // per frame: head = world position of the camera, yaw = camera heading
  function update(dt, head, yaw) {
    headPos = head; headYaw = yaw;
    if (S.state !== 'playing' || !G || !ses) return;
    const ctx = G.ctx, now = ctx.currentTime, fileMode = S.narr.kind !== 'none' && S.narr.ready;
    const T = fileMode ? el.currentTime : now - S.ctxT0; S.t = Math.max(0, T);
    // narrator circles your head slowly (clockwise seen from above), a touch of height drift; the heartbeat sits under you
    const a = S.phi0 + (2 * Math.PI * S.t) / S.orbit, bob = 0.12 * Math.sin(a * 0.5);
    setPos(G.orbit, head.x + Math.cos(a) * ORBIT_R, head.y - 0.05 + bob, head.z + Math.sin(a) * ORBIT_R);
    setPos(G.heart, head.x, head.y - 1.25, head.z);
    // heartbeat (lookahead scheduler)
    while (hbNext < now + 0.5) {
      const at = hbNext; thump(ses.heart, at, 74, 38, 1.0, 0.5); thump(ses.heart, at + 0.27, 62, 34, 0.6, 0.42); tick(ses.heart, at, 180, 1.5, 0.06, 0.06);
      drone.gain.setTargetAtTime(0.5, at, 0.025); drone.gain.setTargetAtTime(0.16, at + 0.1, 0.18); drone.gain.setTargetAtTime(0.4, at + 0.27, 0.025); drone.gain.setTargetAtTime(0.16, at + 0.36, 0.2);
      hbNext += HB;
    }
    S.pulse = Math.exp(-((((now - hbStart) % HB) + HB) % HB) * 7);
    // cues
    while (S.ci < S.cues.length && S.cues[S.ci].t - S.t < 0.1) { const c = S.cues[S.ci++]; if (c.t < S.t - 0.8) { if (c.type === 'stepcloser') S.steps++; continue; } fire(c, now + Math.max(0.005, c.t - S.t)); }
    // placeholder voice / pad / chimes
    while (!fileMode && pi < plan.length && S.ctxT0 + plan[pi].t < now + 0.6) { const e = plan[pi++]; playPlan(e, Math.max(now + 0.01, S.ctxT0 + e.t)); }
    if (S.t >= S.dur - 0.02) finish();
  }
  const progress = () => { if (S.state === 'idle') return 0; if (S.state === 'done') return 1; const tf = S.dur > 0 ? Math.min(1, S.t / S.dur) : 0; return S.nSteps ? 0.35 * tf + 0.65 * (S.steps / S.nSteps) : tf; };
  const view = () => ({ state: S.state, status: S.status, error: !!S.error, time: `${mmss(S.t)} / ${mmss(S.dur)}`, sec: Math.floor(S.t), volume: S.vol,
    voice: S.narr.kind === 'none' ? 'PLACEHOLDER VOICE' : (S.narr.name.length > 22 ? S.narr.name.slice(0, 21) + '…' : S.narr.name), cues: `${S.cues.length} CUES · ${S.cueSrc.length > 18 ? S.cueSrc.slice(0, 17) + '…' : S.cueSrc}`, playing: S.state === 'playing' });
  return { S, el, act, start, stop, restart, update, setVol, view, progress, loadNarrator, loadFile, loadCueFile, loadCuesFrom, useDefault, picker, cuePicker, discovered,
    active: () => S.state === 'playing', duck: () => (S.state === 'playing' ? DUCK : 1), pulse: () => (S.state === 'playing' ? S.pulse : 0), VOLS,
    get G() { return G; }, get ses() { return ses; } };
}
