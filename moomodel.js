// v30: clip-driven models (Idle/Walk) also turn their head toward the viewer. v29: STL/OBJ/PLY uploads (converted to .glb by sync_gcs.py), newest-by-upload-time. v28: optional user-supplied 3D model for Miss Moo (.glb / .gltf with embedded data / .vrm).
// Source order: ?moomodel= override -> GCS model/manifest.json (made by sync_gcs.py) -> newest model in the Drive "Miss Moo Model" folder -> built-in figure.
import { THREE, clipMirror } from './shared.js?v=37';
import { GLTFLoader } from './lib/GLTFLoader.js?v=37';
import * as SkeletonUtils from './lib/SkeletonUtils.js?v=37';
import { DRIVE_DEFAULTS, MOO_DEFAULTS } from './config.js?v=37';

const EXT_RANK = { glb: 0, vrm: 1, gltf: 2 };
const CONVERTED = ['fbx', 'stl', 'obj', 'ply', '3mf', 'dae', 'off'];   // only ever loaded via the GCS .glb that sync_gcs.py converts
const extOf = (n) => ((/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(n || '') || [])[1] || '').toLowerCase();
const MIRROR_TRI_LIMIT = 70000;   // above this the mirror twin is hidden while the model is in use (Quest budget)
const HEIGHT = 1.68;

function driveId(s) { const m = /(?:\/d\/|id=|folders\/)([\w-]{20,})/.exec(s || '') || /^([\w-]{25,})$/.exec(s || ''); return m ? m[1] : ''; }

async function fetchBuf(urls) {
  let err = null;
  for (const u of urls) {
    try { const r = await fetch(u, { credentials: 'omit' }); if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.arrayBuffer();
      if (b.byteLength < 64) throw new Error('empty'); const head = new TextDecoder().decode(new Uint8Array(b, 0, 16));
      if (/^\s*<(!doctype|html)/i.test(head)) throw new Error('got an HTML page (Drive quota / virus-scan page?)');
      return { buf: b, url: u };
    } catch (e) { err = e; console.warn('[moomodel] fetch failed', u, e.message); }
  }
  throw err || new Error('no source');
}

async function findSources() {
  const q = new URLSearchParams(location.search), o = q.get('moomodel'), key = q.get('key') || DRIVE_DEFAULTS.key;
  const API = q.get('driveApi') || 'https://www.googleapis.com';
  const driveUrls = (id) => [`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
    `${API}/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(key)}`];
  if (o === 'off' || o === 'builtin' || o === '0') return null;
  if (o) {
    if (/^gcs:/i.test(o)) return { name: o, ext: extOf(o), urls: [`${DRIVE_DEFAULTS.gcs}/${o.slice(4).replace(/^\/+/, '')}`] };
    if (/^(https?:|\.|\/|assets\/|blob:)/i.test(o) && !/drive\.google\.com/.test(o)) return { name: o, ext: q.get('mooext') || extOf(o), urls: [o] };
    const id = driveId(o); if (id) return { name: 'Drive ' + id, ext: q.get('mooext') || 'glb', urls: driveUrls(id) };
  }
  const list = [];
  // 1) GCS copy made by sync_gcs.py
  try { const r = await fetch(`${DRIVE_DEFAULTS.gcs}/model/manifest.json?t=${Date.now()}`, { credentials: 'omit', cache: 'no-store' });
    if (r.ok) { const m = await r.json(); if (m && m.url) list.push({ name: m.name, ext: m.ext || extOf(m.url), urls: [m.url + (m.md5 ? '?h=' + encodeURIComponent(m.md5) : '')], src: m.driveId, gcs: true }); } } catch { /* no manifest */ }
  // 2) the Drive folder (newest supported file)
  let newest = null;
  if (MOO_DEFAULTS.modelFolder && key) {
    try {
      const qq = `'${MOO_DEFAULTS.modelFolder}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
      const r = await fetch(`${API}/drive/v3/files?q=${encodeURIComponent(qq)}&fields=${encodeURIComponent('files(id,name,size,modifiedTime,createdTime,md5Checksum)')}&orderBy=modifiedTime desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${encodeURIComponent(key)}`, { credentials: 'omit' });
      const b = await r.json(); const all = (b.files || []).filter((f) => extOf(f.name) in EXT_RANK || CONVERTED.includes(extOf(f.name)));
      const when = (f) => Math.max(Date.parse(f.modifiedTime) || 0, Date.parse(f.createdTime) || 0);   // uploads keep the file's old modified date
      all.sort((a, c) => (when(c) - when(a)) || ((EXT_RANK[extOf(a.name)] ?? 9) - (EXT_RANK[extOf(c.name)] ?? 9)));
      if (r.ok && !all.length) return { none: true };   // folder readable and empty: built-in figure, even if an old GCS copy exists
      const newestAny = all[0]; newest = all.find((f) => extOf(f.name) in EXT_RANK) || null;
      // the GCS copy is current only if it was made from the newest file in the folder (FBX/STL/OBJ files only ever come via GCS, converted by sync_gcs.py)
      if (newestAny && list[0] && list[0].src && list[0].src !== newestAny.id) list.shift();
    } catch (e) { console.warn('[moomodel] Drive list failed', e.message); }
  }
  if (newest) list.push({ name: newest.name, ext: extOf(newest.name), urls: driveUrls(newest.id) });
  return list.length ? { multi: list } : null;
}

async function parse(buf, ext, url) {
  const loader = new GLTFLoader(); let vrmMod = null;
  if (ext === 'vrm') { vrmMod = await import('./lib/three-vrm.module.min.js?v=37'); loader.register((p) => new vrmMod.VRMLoaderPlugin(p)); }
  const base = url && !/^blob:/.test(url) ? url.replace(/[^/]*$/, '') : '';
  const gltf = await new Promise((res, rej) => loader.parse(buf, base, res, rej));
  return { gltf, vrmMod };
}

const BONES = { hips: /(^|[^a-z])(hips?|pelvis)$/i, spine: /spine$|spine1$|chest$/i, neck: /neck$|neck1$/i, head: /head$/i,
  lUp: /(left|^l[._ ]|[._]l$).*(upperarm|arm)$|leftarm$|upperarm[._]?l$/i, rUp: /(right|^r[._ ]|[._]r$).*(upperarm|arm)$|rightarm$|upperarm[._]?r$/i };

export function attachMooModel(cow, onStatus = () => {}) {
  const status = { state: 'looking', name: '', error: '' }; const say = () => onStatus(status);
  (async () => {
    let src = null; try { src = await findSources(); } catch (e) { console.warn(e); }
    if (!src || src.none) { status.state = 'builtin'; say(); return; }
    const cands = src.multi || [src]; let done = null;
    for (const c of cands) {
      try { const { buf, url } = await fetchBuf(c.urls); const ext = c.ext === 'gltf' || c.ext === 'vrm' ? c.ext : (c.ext || 'glb');
        done = { c, ...(await parse(buf, ext === 'glb' || ext === 'gltf' ? ext : ext, url)) }; break;
      } catch (e) { status.error = e.message; console.warn('[moomodel] could not load', c.name, e); }
    }
    if (!done) { status.state = 'builtin'; say(); return; }
    install(cow, done); status.state = 'model'; status.name = done.c.name; status.error = ''; say();
  })();
  return status;
}

function install(cow, { gltf, vrmMod }) {
  const vrm = gltf.userData && gltf.userData.vrm;
  let model = vrm ? vrm.scene : gltf.scene;
  if (vrm && vrmMod) { vrmMod.VRMUtils.removeUnnecessaryVertices(model); vrmMod.VRMUtils.combineSkeletons ? vrmMod.VRMUtils.combineSkeletons(model) : 0; if (vrm.meta && vrm.meta.metaVersion === '0') vrmMod.VRMUtils.rotateVRM0(vrm); }
  let tris = 0; model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  // fit: ~1.68 m tall, feet on the floor, centred on the pivot
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true), size = box.getSize(new THREE.Vector3());
  const k = HEIGHT / Math.max(1e-4, size.y), fit = new THREE.Group(), holder = new THREE.Group(); holder.name = 'mooModel';
  fit.scale.setScalar(k); fit.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  fit.add(model); holder.add(fit);
  // the rooms are mostly unlit shader materials, so the model brings its own soft light rig (moves with her)
  const hemi = new THREE.HemisphereLight(0xfff0f6, 0x3a1830, 1.6); holder.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(0.8, 2.4, 2.2); key.target.position.set(0, 1, 0); holder.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff4fa0, 1.2); rim.position.set(-1.2, 2.0, -1.6); rim.target.position.set(0, 1, 0); holder.add(rim, rim.target);
  // optional code-built cowbell choker (?moochoker=1): rides on the neck/head bone when there is one
  const q = new URLSearchParams(location.search);
  // bones / animation
  const named = {}; model.traverse((o) => { if (!o.isBone && !(o.type === 'Object3D' && /hips|spine|neck|head|arm/i.test(o.name))) return;
    for (const [k2, re] of Object.entries(BONES)) if (!named[k2] && re.test(o.name.replace(/^mixamorig:?/i, ''))) named[k2] = o; });
  const nb = vrm && vrm.humanoid ? { hips: vrm.humanoid.getNormalizedBoneNode('hips'), spine: vrm.humanoid.getNormalizedBoneNode('spine'), neck: vrm.humanoid.getNormalizedBoneNode('neck'),
    head: vrm.humanoid.getNormalizedBoneNode('head'), lUp: vrm.humanoid.getNormalizedBoneNode('leftUpperArm'), rUp: vrm.humanoid.getNormalizedBoneNode('rightUpperArm') } : named;
  const rest = {}; for (const [k2, b] of Object.entries(nb)) if (b) rest[k2] = b.quaternion.clone();
  const tails = []; const animated = new Set((gltf.animations || []).flatMap((c) => c.tracks.map((tr) => tr.name.split('.')[0]))); model.traverse((o) => { if (o.isBone && /tail/i.test(o.name) && animated.has(o.name)) { const m = /(\d+)\D*$/.exec(o.name); tails.push([o, m ? +m[1] : 1]); } });
  let mixer = null, idleA = null, walkA = null, waveA = null, waveWas = 0;
  const crawl = {}; let cphase = null, cT = 0, cw = 0; const cwts = { down: 0, loop: 0, up: 0 };
  // walk speed match: metres travelled per Walk cycle (scaled with the fit); ?moostride= overrides (default 1.1 m at 1.68 m tall)
  const PULSE = q.get('moopulse') !== '0';
  const STRIDE = +(q.get('moostride') || 1.1), CSTRIDE = +(q.get('moocrawlstride') || 0.26);
  const clips = gltf.animations || [];
  if (clips.length) { mixer = new THREE.AnimationMixer(model);
    const idle = clips.find((c) => /idle|stand|breath/i.test(c.name)) || clips.find((c) => !/walk|run/i.test(c.name)) || clips[0];
    const walk = clips.find((c) => /walk/i.test(c.name));
    const wave = clips.find((c) => /wave/i.test(c.name)); if (wave) { waveA = mixer.clipAction(wave); waveA.setLoop(THREE.LoopOnce, 1); waveA.clampWhenFinished = true; }
    // v37: optional crawl family (CrawlDown -> Crawl loop -> CrawlUp); the companion asks via S.crawl, and reads S.crawlPhase back
    for (const [key, re, once] of [['down', /^crawl.?down$/i, true], ['loop', /^crawl$/i, false], ['up', /^crawl.?up$/i, true]]) { const c = clips.find((cl) => re.test(cl.name));
      if (c) { const a = mixer.clipAction(c); if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } a.setEffectiveWeight(0); crawl[key] = a; } }
    idleA = mixer.clipAction(idle); idleA.play(); if (walk && walk !== idle) { walkA = mixer.clipAction(walk); walkA.timeScale = +(q.get('moowalkspeed') || 0.6); walkA.play(); walkA.setEffectiveWeight(0); } }
  if (q.get('moochoker') === '1') {
    const anchor = nb.neck || nb.head; const ch = new THREE.Group();
    ch.add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })));
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 0.03, 14), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 })); bell.position.set(0, -0.025, 0.045); ch.add(bell); ch.userData.bell = bell;
    if (anchor) { anchor.add(ch); holder.updateMatrixWorld(true); const s = 1 / new THREE.Vector3().setFromMatrixScale(anchor.matrixWorld).x; ch.scale.setScalar(s); }
    else { ch.position.set(0, HEIGHT * 0.83, 0); holder.add(ch); }
    holder.userData.choker = ch;
  }
  // v37: spiral hypnosis eyes. A model material named *eye* (with front-planar UVs, iris = 0..1) gets a slowly turning
  // hot-pink / black spiral as colour + emissive map. ?moospiral=0 keeps the model's own eyes. Shared by the mirror twin.
  let spiral = null;
  if (q.get('moospiral') !== '0') {
    const eyeMats = []; model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m && /eye/i.test(m.name) && !eyeMats.includes(m)) eyeMats.push(m); }); });
    if (eyeMats.length) {
      const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), img = g.createImageData(N, N);
      const pink = (q.get('moospiralcolor') || 'ff1f8f').replace('#', ''), pr = parseInt(pink.slice(0, 2), 16), pg = parseInt(pink.slice(2, 4), 16), pb = parseInt(pink.slice(4, 6), 16);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N - 0.5, v = (y + 0.5) / N - 0.5, r = Math.hypot(u, v) * 2, th = Math.atan2(v, u);
        const f = th / (Math.PI * 2) * 2 + r * 3.2;                       // two arms, ~3 turns across the iris
        const arm = 0.5 + 0.5 * Math.cos(f * Math.PI * 2); let s2 = Math.min(1, Math.max(0, (arm - 0.5) * 6 + 0.5));
        s2 *= Math.min(1, Math.max(0, (r - 0.07) / 0.05));               // tiny dark centre
        const rim = Math.min(1, Math.max(0, (r - 0.9) / 0.08));            // soft pink rim at the iris edge
        const a = Math.max(s2, rim * 0.85), i = (y * N + x) * 4;
        img.data[i] = pr * a + 8 * (1 - a); img.data[i + 1] = pg * a + 4 * (1 - a); img.data[i + 2] = pb * a + 10 * (1 - a); img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.center.set(0.5, 0.5); tex.anisotropy = 4;
      for (const m of eyeMats) { m.map = tex; m.emissiveMap = tex; m.vertexColors = false; m.color.set(0xffffff); m.emissive.set(0xffffff); m.emissiveIntensity = 0.9; m.roughness = 0.3; m.needsUpdate = true; }
      spiral = { tex, rate: +(q.get('moospiralspeed') || 0.4) };
    }
  }
  // materials for the flash cue
  const mats = []; model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m && m.emissive && !mats.includes(m)) { mats.push(m); m.userData.e0 = m.emissive.clone(); m.userData.ei0 = m.emissiveIntensity; } }); });
  const PINK = new THREE.Color(1, 0.2, 0.58);
  // mirror twin: same model, poses copied every frame
  let twin = null, srcNodes = [], dstNodes = [];
  if (tris <= MIRROR_TRI_LIMIT) {
    twin = SkeletonUtils.clone(holder); twin.traverse((o) => { if (o.isLight) o.visible = false; }); clipMirror(twin);
    holder.traverse((o) => srcNodes.push(o)); twin.traverse((o) => dstNodes.push(o));
    cow.mirror.add(twin);
  }
  cow.builtin.visible = false; cow.builtinTwin.visible = false; cow.group.add(holder);
  const tmpQ = new THREE.Quaternion(), E = new THREE.Euler();
  const hq = new THREE.Quaternion(), hq2 = new THREE.Quaternion(), pq = new THREE.Quaternion(), pq2 = new THREE.Quaternion(), tq = new THREE.Quaternion();
  const add = (k2, x, y, z) => { const b = nb[k2]; if (!b || !rest[k2]) return; b.quaternion.copy(rest[k2]).multiply(tmpQ.setFromEuler(E.set(x, y, z))); };
  cow.ext = {
    clips: clips.map((c) => c.name), weights: () => ({ idle: idleA ? +idleA.getEffectiveWeight().toFixed(2) : null, walk: walkA ? +walkA.getEffectiveWeight().toFixed(2) : null, walkT: walkA ? +walkA.time.toFixed(2) : null, walkScale: walkA ? +walkA.timeScale.toFixed(2) : null, wave: waveA ? +waveA.getEffectiveWeight().toFixed(2) : null, crawl: +cw.toFixed(2), crawlPhase: cphase, crawlScale: crawl.loop ? +crawl.loop.timeScale.toFixed(2) : null }),
    tris, mirrored: !!twin, hasClips: !!mixer, canCrawl: !!crawl.loop, spiral: !!spiral, rigged: Object.keys(rest).length > 0, vrm: !!vrm,
    update(dt, S, cam, t) {
      const w = S.walk, idle = 1 - w;
      if (mixer) {
        // one-shot Wave clip: restarts when S.wave is set (cow.waveNow), fades the base clips out underneath it
        if (waveA) { if (S.wave > waveWas + 0.05) { waveA.reset(); waveA.play(); } waveWas = S.wave; }
        const ww = waveA && waveA.isRunning() && !cphase ? Math.min(1, S.waveW * 1.2) : 0; if (waveA) waveA.setEffectiveWeight(ww);
        // crawl state machine
        if (crawl.loop) {
          const want = !!S.crawl;
          const enter = (ph) => { cphase = ph; cT = 0; const a2 = ph && crawl[ph]; if (a2) { a2.reset(); a2.play(); } if (ph) crawl.loop.play(); };
          const done = (key) => !crawl[key] || cT >= crawl[key].getClip().duration - 0.02;
          if (!cphase) { if (want) enter(crawl.down ? 'down' : 'loop'); }
          else if (cphase === 'down') { if (done('down')) enter(want ? 'loop' : (crawl.up ? 'up' : null)); }
          else if (cphase === 'loop') { if (!want) enter(crawl.up ? 'up' : null); }
          else if (cphase === 'up') { if (done('up')) enter(null); }
          cT += dt;
          const kk = 1 - Math.exp(-dt * 12); for (const key of ['down', 'loop', 'up']) cwts[key] += ((cphase === key ? 1 : 0) - cwts[key]) * kk;
          cw += ((cphase ? 1 : 0) - cw) * (1 - Math.exp(-dt * (cphase ? 14 : 6)));
          if (cphase === 'loop') crawl.loop.timeScale = S.speed > 0.03 ? Math.min(2.2, Math.max(0.5, S.speed / (CSTRIDE * k * (cow.scale || 1) / crawl.loop.getClip().duration))) : 0.35;
          const tot = cwts.down + cwts.loop + cwts.up || 1;
          for (const key of ['down', 'loop', 'up']) if (crawl[key]) crawl[key].setEffectiveWeight(cw * cwts[key] / tot);
          S.crawlPhase = cphase; S.crawlLow = cw > 0.5;
        }
        if (walkA) { walkA.setEffectiveWeight(w * (1 - ww) * (1 - cw)); idleA.setEffectiveWeight((1 - w) * (1 - ww) * (1 - cw));
          walkA.timeScale = S.speed > 0.05 ? Math.min(1.9, Math.max(0.45, S.speed / (STRIDE * k * (cow.scale || 1) / walkA.getClip().duration))) : 0.6; }
        mixer.update(dt);
        // tail flick (bones named *tail*): a quick ripple layered on top of the clips
        if (S.flick > 0.01 && tails.length) for (const [b, j] of tails) { const a = S.flick * 0.22 * Math.sin(t * 16 - j * 0.9); b.rotateX(a); b.rotateZ(a * 0.6); }
      }
      if (mixer && walkA) {
        // clip-driven (Idle + Walk): layer the head/neck look-at-the-viewer on top of the animation, in world space so any bone axes work
        holder.getWorldQuaternion(hq); const wq = tmpQ.setFromEuler(E.set(S.lookP * (1 - 0.7 * cw), S.look * (1 - 0.4 * cw), S.tilt * 0.6, 'YXZ'));
        wq.premultiply(hq).multiply(hq2.copy(hq).invert());
        for (const [k2, f] of [['neck', 0.4], ['head', 0.5]]) { const b = nb[k2]; if (!b || !b.parent) continue;
          b.parent.getWorldQuaternion(pq); const part = tq.identity().slerp(wq, f);
          b.quaternion.premultiply(pq2.copy(pq).invert().multiply(part).multiply(pq)); }
      }
      if (!mixer || !walkA) {
        // procedural: breathing sway, head turned toward the viewer, gentle tilt, a little bob while gliding
        const sw = Math.sin(S.phase);
        if (!mixer) { add('hips', 0, 0.05 * sw * w, 0.03 * Math.sin(t * 0.55) * idle); add('spine', 0.015 * Math.sin(t * 1.35), 0.03 * Math.sin(t * 0.4) * idle, -0.03 * Math.sin(t * 0.55) * idle);
          if (vrm) { add('lUp', 0, 0, -1.2 + 0.04 * Math.sin(t * 0.9) + 0.25 * sw * w); add('rUp', 0, 0, 1.2 - 0.04 * Math.sin(t * 0.9) + 0.25 * sw * w); } }
        add('neck', S.lookP * 0.4, S.look * 0.4, S.tilt * 0.5);
        add('head', S.lookP * 0.4 + 0.05 * S.bellE * Math.sin(S.ringT * 18), S.look * 0.45, S.tilt * 0.5 + 0.015 * Math.sin(t * 0.7));
        if (!S.rigged && !Object.keys(rest).length) { holder.rotation.y = S.look * 0.35; holder.rotation.z = 0.012 * Math.sin(t * 0.55) * idle; }
        holder.position.y = 0.012 * Math.abs(Math.cos(S.phase)) * w;
      }
      if (vrm) {
        const em = vrm.expressionManager; if (em) { const b = S.blinkT > 0 ? Math.min(1, 1.15 * Math.sin(Math.PI * (1 - S.blinkT / 0.45))) : 0; try { em.setValue('blink', b); } catch { /* none */ } }
        vrm.update(dt);
      }
      const ch = holder.userData.choker; if (ch) { ch.userData.bell.rotation.x = S.bellE * 0.9 * Math.sin(S.ringT * 24); }
      // v36: models with an emissive map (e.g. Circuit Doll lines) get a gentle breathing pulse (?moopulse=0 turns it off)
      const f = S.flash; for (const m of mats) { if (f > 0.01) { m.emissive.copy(m.userData.e0).lerp(PINK, Math.min(1, f * 0.6)); m.emissiveIntensity = Math.max(m.userData.ei0, f + (m.emissiveMap ? 0.4 : 0)); }
        else if (m.emissiveMap && PULSE) { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0 * (0.8 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2))); }
        else if (m.emissiveIntensity !== m.userData.ei0) { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; } }
      if (spiral) spiral.tex.rotation = -(t * spiral.rate * Math.PI * 2) % (Math.PI * 2);
      if (twin) { for (let i = 0; i < srcNodes.length; i++) { const a = srcNodes[i], b = dstNodes[i]; if (!b) break; b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale);
        if (a.morphTargetInfluences && b.morphTargetInfluences) b.morphTargetInfluences.splice(0, a.morphTargetInfluences.length, ...a.morphTargetInfluences); } }
    },
  };
}
