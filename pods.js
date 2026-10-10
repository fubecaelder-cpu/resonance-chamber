// v11: pod media. Every pod (pink + crimson glass tubes, op-art monoliths) carries a glowing holographic panel that
// shuffles images and videos from Google Drive: the room's "Pods" subfolder if it has one, otherwise the room folder itself.
// Each pod shows a different item and crossfades to a new one every 8-12 s. Quest-friendly: images are downscaled to small
// canvases, GIFs are decoded to a few small frames, and at most two muted video pods play at once (only in the room you are
// in). If nothing loads the panels stay dark and the pods keep their original empty glow.
import { THREE, U, LOW } from './shared.js?v=17';

const KEY = 'resonanceChamber.pods.v1';
const MAXV = LOW ? 1 : 2;
const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i, VID_EXT = /\.(mp4|m4v|webm|mov)$/i;
const isImg = (f) => /^image\/(jpeg|png|webp|gif)$/.test(f.mimeType) || IMG_EXT.test(f.name);
const isVid = (f) => !isImg(f) && (/^video\//.test(f.mimeType) || f.mimeType === 'application/mp4' || VID_EXT.test(f.name));
const isGif = (f) => f.mimeType === 'image/gif' || /\.gif$/i.test(f.name);
// panel shapes (metres): curved band inside the glass tube, or a flat card on the monolith face
const SHAPE = { tube: { r: 0.4, arc: 2.0, h: 1.25, y: 1.5, tw: 208, th: 320 }, slab: { w: 0.76, h: 3.08, y: 1.7, z: 0.152, tw: 120, th: 480 } };

function holoMat(tint, additive = true) {   // op-art monoliths are white, so their cards blend normally instead of adding light
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
  return new THREE.ShaderMaterial({
    uniforms: { uA: { value: blank }, uB: { value: blank }, uCA: { value: new THREE.Vector4(0, 0, 1, 1) }, uCB: { value: new THREE.Vector4(0, 0, 1, 1) },
      uMix: { value: 0 }, uOn: { value: 0 }, uSeed: { value: Math.random() }, uTint: { value: new THREE.Color(tint) }, uTime: U.uTime, uBlank: { value: blank } },
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.FrontSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D uA; uniform sampler2D uB; uniform vec4 uCA; uniform vec4 uCB; uniform float uMix; uniform float uOn; uniform float uSeed;
      uniform vec3 uTint; uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        float wob = sin(uv.y * 90.0 + uTime * 6.0 + uSeed * 30.0) * 0.0015;
        vec3 a = texture2D(uA, uCA.xy + vec2(uv.x + wob, uv.y) * uCA.zw).rgb;
        vec3 b = texture2D(uB, uCB.xy + vec2(uv.x - wob, uv.y) * uCB.zw).rgb;
        float sweep = smoothstep(uMix * 1.3 - 0.3, uMix * 1.3, 1.0 - uv.y);          // new item wipes in from the top, softly
        vec3 c = mix(a, b, clamp(sweep, 0.0, 1.0));
        float line = exp(-abs((1.0 - uv.y) - (uMix * 1.3 - 0.15)) * 60.0) * step(0.001, uMix) * step(uMix, 0.999);
        float scan = 0.8 + 0.2 * sin(uv.y * 420.0 - uTime * 4.0);
        float edge = smoothstep(0.0, 0.07, uv.x) * smoothstep(1.0, 0.93, uv.x) * smoothstep(0.0, 0.04, uv.y) * smoothstep(1.0, 0.96, uv.y);
        float frame = (1.0 - smoothstep(0.0, 0.025, min(min(uv.x, 1.0 - uv.x) * 0.5, min(uv.y, 1.0 - uv.y) * 0.25))) * 0.5;
        float flick = 0.93 + 0.07 * sin(uTime * 13.0 + uSeed * 40.0);
        vec3 col = (c * 1.05 + uTint * 0.05) * scan * edge * flick + uTint * (frame + line * 0.9);
        ${additive ? 'gl_FragColor = vec4(col * uOn, 1.0);' : 'gl_FragColor = vec4(c * scan * flick + uTint * line * 0.3, clamp(max(edge, frame * 2.0) * uOn, 0.0, 1.0));'}   // the global brightness multiplier is injected by main.js
      }`,
  });
}

export function createPods({ rooms, media, onChange = () => {} }) {
  // rooms: [{ root, spots: [{kind, x, z, ry?}], tint }]
  let on = true; try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s.on === 'boolean') on = s.on; } catch { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on })); } catch { /* ignore */ } };
  const R = rooms.map((rm, ri) => {
    const pods = (rm.spots || []).map((sp, k) => {
      const g = new THREE.Group(); g.name = 'pod-holo'; g.userData.noMirror = true;
      let geo; const S = SHAPE[sp.kind];
      if (sp.kind === 'slab') { geo = new THREE.PlaneGeometry(S.w, S.h); g.position.set(sp.x, 0, sp.z); g.rotation.y = sp.ry; }
      else { geo = new THREE.CylinderGeometry(S.r, S.r, S.h, 28, 1, true, -S.arc / 2, S.arc);
        g.position.set(sp.x, 0, sp.z); g.rotation.y = Math.atan2(0 - sp.x, 3.6 - sp.z); }   // face the arrival area
      const m = holoMat(rm.tint, sp.kind !== 'slab'), mesh = new THREE.Mesh(geo, m);
      mesh.position.set(0, S.y, sp.kind === 'slab' ? S.z : 0); mesh.renderOrder = 26; mesh.visible = false; g.add(mesh); rm.root.add(g);
      return { k, mesh, m, kind: sp.kind, aspect: sp.kind === 'slab' ? S.w / S.h : (S.r * S.arc) / S.h, cur: null, nxt: null, mix: 0, next: 0, loading: false };
    });
    return { ri, pods, kind: (rm.spots && rm.spots[0] && rm.spots[0].kind) || 'tube', items: [], src: '', status: 'idle', listed: -1e9, cache: new Map(), bad: new Map(), fails: new Map(), active: false, msg: '' };
  });
  const D = media.drive, API = media.driveAPI;
  const url = (id) => `${API}/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(D.key)}`;
  async function getJSON(u) { const r = await fetch(u, { credentials: 'omit' }); const b = await r.json().catch(() => null); if (!r.ok) throw new Error((b && b.error && b.error.message) || 'HTTP ' + r.status); return b; }
  // v12: Google sometimes answers bursts of downloads with a temporary "automated traffic" page (no CORS headers, so the
  // browser reports a CORS error). Downloads are therefore queued one at a time with a short gap, images are kept in the
  // browser's Cache Storage so reloads don't download them again, and failures are retried later instead of dropped.
  let qTail = Promise.resolve();
  const queued = (fn) => { const p = qTail.then(fn, fn); qTail = p.then(() => new Promise((r) => setTimeout(r, 350)), () => new Promise((r) => setTimeout(r, 350))); return p; };
  const CACHE = 'resonanceChamber.pods.img.v1';
  // v13: images come from Google's resized-image server (small, CORS *, not subject to API download throttling), then
  // drive.usercontent, then the API. GIFs skip the resizer so they stay animated. Videos: usercontent, then the API.
  const ucUrl = (id) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  const lhUrl = (id, w) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${w}`;
  async function getBlob(id, gif) {
    let c = null; try { c = await caches.open(CACHE); const hit = await c.match('https://pods.cache/' + id); if (hit) return await hit.blob(); } catch { c = null; }
    const srcs = [...(gif ? [] : [lhUrl(id, 512)]), ucUrl(id), url(id)]; let blob = null, err = null;
    for (const u of srcs) {
      try { const res = await queued(() => fetch(u, { credentials: 'omit' })); if (!res.ok) throw new Error('HTTP ' + res.status);
        const b = await res.blob(); if (!/^image\//.test(b.type) && b.size < 4096) throw new Error('not an image'); blob = b; break; }
      catch (e) { err = e; }
    }
    if (!blob) throw err || new Error('download failed');
    if (c) { try { await c.put('https://pods.cache/' + id, new Response(blob)); } catch { /* storage full */ } }
    return blob;
  }
  const list = async (q) => { let tok = '', files = [];
    do { const b = await getJSON(`${API}/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType)')}&orderBy=name_natural&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${encodeURIComponent(D.key)}${tok ? '&pageToken=' + encodeURIComponent(tok) : ''}`);
      files = files.concat(b.files || []); tok = b.nextPageToken || ''; } while (tok && files.length < 2000);
    return files; };

  async function listRoom(r) {
    const folder = D.folders[r.ri]; r.listed = performance.now();
    if (!folder || !D.key) { r.status = 'none'; r.msg = 'no Drive folder'; onChange(); return; }
    try {
      const subs = await list(`'${folder}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and (name = 'Pods' or name = 'pods' or name = 'PODS')`);
      const src = subs.length ? subs[0].id : folder;
      const files = (await list(`'${src}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`)).filter((f) => isImg(f) || isVid(f));
      const sig = files.map((f) => f.id).join(',');
      if (sig !== r.items.map((f) => f.id).join(',') || src !== r.src) {
        r.items = files.map((f) => ({ ...f, video: isVid(f), gif: isGif(f) })); r.src = src;
        console.log('[pods]', ['pink', 'crimson', 'mono'][r.ri], subs.length ? 'Pods folder' : 'room folder', `${r.items.filter((f) => !f.video).length} image(s), ${r.items.filter((f) => f.video).length} video(s)`);
      }
      r.status = r.items.length ? 'ready' : 'empty'; r.subfolder = !!subs.length;
      r.msg = r.items.length ? `${r.items.length} ITEM${r.items.length > 1 ? 'S' : ''} · ${subs.length ? 'PODS FOLDER' : 'ROOM FOLDER'}` : 'FOLDER EMPTY · GLOW ONLY';
    } catch (e) { r.status = 'error'; r.msg = 'DRIVE UNAVAILABLE · GLOW ONLY'; console.warn('[pods]', e.message); }
    onChange();
  }

  // ---------- loading items into textures ----------
  const videosInUse = (r) => r.pods.filter((p) => (p.cur && p.cur.video) || (p.nxt && p.nxt.video)).length;
  function cover(srcW, srcH, aspect) {   // crop rect (in uv) that fills the panel without stretching
    const a = srcW / srcH; return a > aspect ? new THREE.Vector4((1 - aspect / a) / 2, 0, aspect / a, 1) : new THREE.Vector4(0, (1 - a / aspect) / 2, 1, a / aspect);
  }
  async function loadImage(r, it) {
    if (r.cache.has(it.id)) { const c = r.cache.get(it.id); c.used = performance.now(); return c; }
    const S = SHAPE[r.kind];
    const blob = await getBlob(it.id, it.gif);
    const cv = document.createElement('canvas'); cv.width = S.tw; cv.height = S.th; const g = cv.getContext('2d');
    const draw = (src, w, h) => { const a = w / h, pa = S.tw / S.th; let sx = 0, sy = 0, sw = w, sh = h;
      if (a > pa) { sw = h * pa; sx = (w - sw) / 2; } else { sh = w / pa; sy = (h - sh) / 2; }
      g.clearRect(0, 0, S.tw, S.th); g.drawImage(src, sx, sy, sw, sh, 0, 0, S.tw, S.th); };
    const entry = { tex: new THREE.CanvasTexture(cv), frames: null, fi: 0, ft: 0, used: performance.now() };
    entry.tex.minFilter = THREE.LinearFilter; entry.tex.generateMipmaps = false;
    if (it.gif && 'ImageDecoder' in window) {   // animated GIF: a few small frames
      try {
        const dec = new window.ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' }); await dec.tracks.ready;
        const n = Math.min(48, dec.tracks.selectedTrack.frameCount || 1), frames = [];
        for (let i = 0; i < n; i++) { const { image } = await dec.decode({ frameIndex: i });
          const fc = document.createElement('canvas'); fc.width = S.tw; fc.height = S.th; const og = g; draw(image, image.displayWidth, image.displayHeight);
          fc.getContext('2d').drawImage(cv, 0, 0); frames.push({ c: fc, d: Math.max(0.04, (image.duration || 100000) / 1e6) }); image.close(); void og; }
        dec.close(); if (frames.length > 1) entry.frames = frames; g.drawImage(frames[0].c, 0, 0);
      } catch (e) { entry.frames = null; const bm = await createImageBitmap(blob); draw(bm, bm.width, bm.height); bm.close && bm.close(); }
    } else { const bm = await createImageBitmap(blob); draw(bm, bm.width, bm.height); bm.close && bm.close(); }
    entry.tex.needsUpdate = true; entry.g = g;
    r.cache.set(it.id, entry);
    if (r.cache.size > 24) { const old = [...r.cache.entries()].filter(([id]) => !r.pods.some((p) => (p.cur && p.cur.id === id) || (p.nxt && p.nxt.id === id))).sort((a, b) => a[1].used - b[1].used)[0];
      if (old) { old[1].tex.dispose(); r.cache.delete(old[0]); } }
    return entry;
  }
  function loadVideo(it, aspect) {
    return new Promise((ok, fail) => {
      const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('muted', '');
      let done = false; const to = setTimeout(() => { if (!done) { done = true; v.removeAttribute('src'); v.load(); fail(new Error('timeout')); } }, 20000);
      v.addEventListener('loadeddata', () => { if (done) return; done = true; clearTimeout(to);
        const tex = new THREE.VideoTexture(v); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        v.play().catch(() => { /* will retry when the room is active */ }); ok({ tex, v, crop: cover(v.videoWidth || 16, v.videoHeight || 9, aspect) }); }, { once: true });
      v.addEventListener('error', () => { if (done || !alt) return; done = true; clearTimeout(to); fail(new Error('video error')); });
      let alt = false; v.addEventListener('error', () => { if (done || alt) return; alt = true; v.src = url(it.id); });   // usercontent failed: try the API
      v.src = ucUrl(it.id);
    });
  }
  const release = (p, slot) => { if (slot && slot.v) { slot.v.pause(); slot.v.removeAttribute('src'); slot.v.load(); slot.tex.dispose(); } };

  function pick(r, p) {
    const shown = new Set(r.pods.flatMap((q) => [q.cur && q.cur.id, q.nxt && q.nxt.id]).filter(Boolean));
    const vOk = videosInUse(r) - (p.cur && p.cur.video ? 1 : 0) < MAXV;
    const tnow = performance.now(); const ok = r.items.filter((f) => !(r.bad.get(f.id) > tnow) && (vOk || !f.video));
    let pool = ok.filter((f) => !shown.has(f.id));
    if (!pool.length) pool = ok.filter((f) => !f.video && (!p.cur || f.id !== p.cur.id));   // repeat an image rather than a video
    if (!pool.length) return null;
    // favour items that have not been shown for the longest time, with some randomness
    pool.sort((a, b) => (a.seen || 0) - (b.seen || 0)); const top = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));
    return top[Math.floor(Math.random() * top.length)];
  }
  async function swap(r, p) {
    const it = pick(r, p); if (!it) { p.next = performance.now() / 1000 + 4; return; }
    p.loading = true; it.seen = performance.now();
    try {
      let slot;
      if (it.video) { const vv = await queued(() => loadVideo(it, p.aspect)); slot = { id: it.id, video: true, tex: vv.tex, v: vv.v, crop: vv.crop }; }
      else { const e = await loadImage(r, it); slot = { id: it.id, video: false, tex: e.tex, entry: e, crop: new THREE.Vector4(0, 0, 1, 1) }; }
      if (!on || !r.active) { release(p, slot); p.loading = false; return; }
      p.nxt = slot; p.m.uniforms.uB.value = slot.tex; p.m.uniforms.uCB.value.copy(slot.crop); p.mix = 0; p.mesh.visible = true;
      if (!p.cur) { p.m.uniforms.uA.value = p.m.uniforms.uBlank.value; }
    } catch (e) { const n = (r.fails.get(it.id) || 0) + 1; r.fails.set(it.id, n); const wait = Math.min(300, 20 * 2 ** (n - 1));
      r.bad.set(it.id, performance.now() + wait * 1000); console.warn('[pods] will retry', it.name, 'in', wait + 's:', e.message); p.next = performance.now() / 1000 + 2; }
    p.loading = false;
  }
  function setActive(r, act) {
    if (r.active === act) return; r.active = act;
    for (const p of r.pods) for (const s of [p.cur, p.nxt]) if (s && s.v) { if (act && on) s.v.play().catch(() => {}); else s.v.pause(); }
    if (act && performance.now() - r.listed > 55000) listRoom(r);
  }
  let fadeOn = on ? 0 : 0;
  function update(dt, room) {
    const now = performance.now() / 1000;
    R.forEach((r) => setActive(r, r.ri === room));
    fadeOn += ((on ? 1 : 0) - fadeOn) * Math.min(1, dt * 2.5);
    const r = R[room]; if (!r) return;
    if (r.status === 'ready' && on) r.pods.forEach((p, k) => {
      if (!p.next) p.next = now + 0.4 + k * 0.35;        // initial fill, staggered
      if (!p.loading && !p.nxt && now >= p.next) swap(r, p);
    });
    for (const p of r.pods) {
      if (p.nxt) { p.mix = Math.min(1, p.mix + dt / 1.4);
        if (p.mix >= 1) { const old = p.cur; p.cur = p.nxt; p.nxt = null; p.m.uniforms.uA.value = p.cur.tex; p.m.uniforms.uCA.value.copy(p.cur.crop); p.mix = 0; release(p, old);
          p.next = now + 8 + Math.random() * 4; } }
      p.m.uniforms.uMix.value = p.mix;
      const has = !!(p.cur || p.nxt); p.m.uniforms.uOn.value = fadeOn * (p.cur ? 1 : p.mix);
      p.mesh.visible = has && fadeOn > 0.01;
      for (const s of [p.cur, p.nxt]) if (s && s.entry && s.entry.frames) {   // animated GIF frames
        const e = s.entry; e.ft += dt; if (e.ft >= e.frames[e.fi].d) { e.ft = 0; e.fi = (e.fi + 1) % e.frames.length; e.g.drawImage(e.frames[e.fi].c, 0, 0); e.tex.needsUpdate = true; } }
    }
    if (!on && fadeOn < 0.01) for (const p of r.pods) { if (p.cur || p.nxt) { release(p, p.cur); release(p, p.nxt); p.cur = p.nxt = null; p.next = 0; p.mesh.visible = false; } }
  }
  setInterval(() => { if (document.hidden) return; const r = R.find((x) => x.active); if (r) listRoom(r); }, Math.max(10, (+new URLSearchParams(location.search).get('drivePoll') || 60)) * 1000);
  function act(id, room) {
    if (id === 'p-toggle') { on = !on; save(); }
    else if (id === 'p-shuffle') { const r = R[room]; if (r) { const now = performance.now() / 1000; on = true; save();
      r.items.forEach((f) => { f.seen = Math.random(); }); r.pods.forEach((p, k) => { p.next = now + 0.1 + k * 0.2; }); } }
    onChange();
  }
  const view = (i) => { const r = R[i]; return { on, count: !on ? 'OFF · GLOW ONLY' : r.status === 'idle' ? 'WAITING…' : r.msg }; };
  // start listing the room you start in straight away; others list when you first walk in
  return { update, act, view, R, list: listRoom, get on() { return on; } };
}
