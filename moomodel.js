// v30: clip-driven models (Idle/Walk) also turn their head toward the viewer. v29: STL/OBJ/PLY uploads (converted to .glb by sync_gcs.py), newest-by-upload-time. v28: optional user-supplied 3D model for Miss Moo (.glb / .gltf with embedded data / .vrm).
// Source order: ?moomodel= override -> GCS model/manifest.json (made by sync_gcs.py) -> newest model in the Drive "Miss Moo Model" folder -> built-in figure.
import { THREE, clipMirror } from './shared.js?v=39f';
import { GLTFLoader } from './lib/GLTFLoader.js?v=39f';
import * as SkeletonUtils from './lib/SkeletonUtils.js?v=39f';
import { applyApx } from './apx.js?v=39f';
import { createFlex } from './flex.js?v=39f';
import { DRIVE_DEFAULTS, MOO_DEFAULTS } from './config.js?v=39f';

const EXT_RANK = { glb: 0, vrm: 1, gltf: 2 };
const CONVERTED = ['fbx', 'stl', 'obj', 'ply', '3mf', 'dae', 'off'];   // only ever loaded via the GCS .glb that sync_gcs.py converts
const extOf = (n) => ((/\.([a-z0-9]+)(?:[?#].*)?$/i.exec(n || '') || [])[1] || '').toLowerCase();
const MIRROR_TRI_LIMIT = 70000;   // above this the mirror twin is hidden while the model is in use (Quest budget)
const HEIGHT = 1.68;

// v38c: per-tail data for the runtime tail shaping (cluster centre / back in hips space, clip spread, chains, local sway axes)
function tailShape(tails, hips, model) {
  model.updateMatrixWorld(true);
  const hqi = hips.getWorldQuaternion(new THREE.Quaternion()).invert(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  const upH = up.clone().applyQuaternion(hqi), backH = fwd.clone().negate().applyQuaternion(hqi);
  const byK = new Map(); for (const t of tails) { if (!byK.has(t[2])) byK.set(t[2], []); byK.get(t[2]).push(t); }
  const chains = [], bones = new Map(), mean = new THREE.Vector3(); let nseg = 1;
  for (const [, arr] of byK) { arr.sort((a, b) => a[1] - b[1]); nseg = Math.max(nseg, arr.length);
    const r = arr[0][0].getWorldPosition(new THREE.Vector3()), tip = arr[arr.length - 1][0].localToWorld(new THREE.Vector3(0, 0.1, 0));
    const d = tip.sub(r).normalize().applyQuaternion(hqi); chains.push({ bones: arr.map((x) => x[0]), dir: d, lead: 0 }); mean.add(d);
    for (const [b] of arr) { const bqi = b.getWorldQuaternion(new THREE.Quaternion()).invert(), seg = new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
      let cax = new THREE.Vector3().crossVectors(seg, up); if (cax.lengthSq() < 1e-6) cax.set(1, 0, 0); cax.normalize();
      bones.set(b, { curlAx: cax.applyQuaternion(bqi).normalize(), swayAx: up.clone().applyQuaternion(bqi).normalize() }); } }
  mean.normalize(); if (mean.dot(upH) < 0.2) mean.addScaledVector(upH, 0.4).normalize();   // the crescent opens upward
  let maxA = 0; for (const c of chains) for (const c2 of chains) maxA = Math.max(maxA, c.dir.angleTo(c2.dir));
  const side = new THREE.Vector3().crossVectors(upH, mean).normalize(); let mx = 1e-3; for (const c of chains) mx = Math.max(mx, Math.abs(c.dir.dot(side)));
  return { chains, bones, mean, back: backH.clone().addScaledVector(upH, 0.35).normalize(), nseg, clipSpread: maxA * 180 / Math.PI, side,
    v: { c: new THREE.Vector3(), up: new THREE.Vector3(), d: new THREE.Vector3(), t: new THREE.Vector3(), ax: new THREE.Vector3() },
    q: { P: new THREE.Quaternion(), W: new THREE.Quaternion(), a: new THREE.Quaternion(), b: new THREE.Quaternion() }, setLead(TAIL) { for (const c of chains) c.lead = TAIL.TAIL_LEAD * (1 - Math.abs(c.dir.dot(side)) / mx); } };
}

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
  if (ext === 'vrm') { vrmMod = await import('./lib/three-vrm.module.min.js?v=39f'); loader.register((p) => new vrmMod.VRMLoaderPlugin(p)); }
  const base = url && !/^blob:/.test(url) ? url.replace(/[^/]*$/, '') : '';
  const gltf = await new Promise((res, rej) => loader.parse(buf, base, res, rej));
  return { gltf, vrmMod };
}

const BONES = { hips: /(^|[^a-z])(hips?|pelvis)$/i, spine: /spine$|spine1$|chest$/i, neck: /neck$|neck1$/i, head: /head$/i,
  lUp: /(left|^l[._ ]|[._]l$).*(upperarm|arm)$|leftarm$|upperarm[._]?l$/i, rUp: /(right|^r[._ ]|[._]r$).*(upperarm|arm)$|rightarm$|upperarm[._]?r$/i };

export function attachMooModel(cow, onStatus = () => {}, explicit = null) {   // v38: explicit = { name, ext, urls } (roster characters)
  const status = { state: 'looking', name: '', error: '' }; const say = () => onStatus(status);
  (async () => {
    let src = null; try { src = explicit || await findSources(); } catch (e) { console.warn(e); }
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

function install(cow, { gltf, vrmMod, c: src = {} }) {
  const q0 = new URLSearchParams(location.search);
  const vrm = gltf.userData && gltf.userData.vrm;
  let model = vrm ? vrm.scene : gltf.scene;
  if (vrm && vrmMod) { vrmMod.VRMUtils.removeUnnecessaryVertices(model); vrmMod.VRMUtils.combineSkeletons ? vrmMod.VRMUtils.combineSkeletons(model) : 0; if (vrm.meta && vrm.meta.metaVersion === '0') vrmMod.VRMUtils.rotateVRM0(vrm); }
  // v38e: static (un-rigged) figures: facing fix (settings.json "yaw", degrees) and extra anatomy (wings / ears / tails) via apx.js
  let skinned = false; model.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  const yaw0 = (+src.yaw || 0) * Math.PI / 180; let apx = null;
  if (!skinned && src.apx && src.apx.length && q0.get('mooapx') !== '0') { try { apx = applyApx(model, src.apx, { yaw: yaw0, debug: q0.get('mooapx') === 'debug' }); } catch (e) { console.warn('[moomodel] apx', e); } }
  if (!apx && !skinned && yaw0) model.rotation.y += yaw0;   // v39: rigged friends are built facing forward on Ari's skeleton
  // v39: rigged friends' hair / cape-like sheets / wings / chains (Flex_* bones): damped gravity + wind + momentum (flex.js)
  let flex = null; if (skinned && q0.get('mooflex') !== '0') { try { flex = createFlex(model); if (!flex.chains.length) flex = null; } catch (e) { console.warn('[moomodel] flex', e); } }
  const FX = { v: new THREE.Vector3() };
  let tris = 0; model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  // fit: ~1.68 m tall, feet on the floor, centred on the pivot
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true), size = box.getSize(new THREE.Vector3());
  const k = HEIGHT / Math.max(1e-4, size.y), fit = new THREE.Group(), holder = new THREE.Group(); holder.name = 'mooModel';
  // v38d: centre x/z on the hips, not the bounding box (the box includes the nine tails, so her body sat ~0.5 m in front of her pivot
  // and stood through the stall's front rail when she peeked out)
  let hipsB = null; model.traverse((o) => { if (!hipsB && o.isBone && BONES.hips.test(o.name || '')) hipsB = o; });
  const cxz = hipsB ? hipsB.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
  fit.scale.setScalar(k); fit.position.set(-cxz.x * k, -box.min.y * k, -cxz.z * k);
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
  // v38e: extra-anatomy bones (ears, wings) on rigged models: over-damped secondary motion layered on the clips, like the tails
  const xBones = []; model.traverse((o) => { if (o.isBone && /(ear|wing)/i.test(o.name) && !/tail|hand|arm|fore|^Flex_/i.test(o.name)) xBones.push({ b: o, wing: /wing/i.test(o.name), side: /left|_l$|\.l$/i.test(o.name) ? 1 : -1, f: [0, 0] }); });
  const XB = { mom: 0, q: new THREE.Quaternion(), q2: new THREE.Quaternion(), pq: new THREE.Quaternion(), hq: new THREE.Quaternion(), ax: new THREE.Vector3(), ay: new THREE.Vector3(), yaw: null };
  const tails = []; const animated = new Set((gltf.animations || []).flatMap((c) => c.tracks.map((tr) => tr.name.split('.')[0]))); model.traverse((o) => { if (o.isBone && /tail/i.test(o.name) && animated.has(o.name)) { const m = /(\d+)\D*$/.exec(o.name), m2 = /tail\D*(\d+)\D+(\d+)/i.exec(o.name); tails.push([o, m ? +m[1] : 1, m2 ? +m2[1] : 1]); } });
  let mixer = null, idleA = null, walkA = null, waveA = null, waveWas = 0, napA = null, nw = 0;
  let crawlF = null, sitF = null, sniffA = null, snw = 0; const gests = []; let gest = null, gw = 0, gestLast = null, gestT = 6 + Math.random() * 6;
  // walk speed match: metres travelled per Walk cycle (scaled with the fit); ?moostride= overrides (default 1.1 m at 1.68 m tall)
  const PULSE = q.get('moopulse') !== '0', TAILFX = q.get('mootailfx') !== '0';   // ?mootailfx=0: clip-only tails (debug)
  // v38d: Crawl loop = 2 lateral-sequence stride cycles of 0.34 m at 70 % stance -> 0.97 m per loop; Sniff: 4 cycles of 0.136 m -> 0.78 m
  const STRIDE = +(q.get('moostride') || 1.1), CSTRIDE = +(q.get('moocrawlstride') || 0.97), SSTRIDE = +(q.get('moosniffstride') || 0.78);
  const clips = gltf.animations || [];
  if (clips.length) { mixer = new THREE.AnimationMixer(model);
    const idle = clips.find((c) => /idle|stand|breath/i.test(c.name)) || clips.find((c) => !/walk|run/i.test(c.name)) || clips[0];
    const walk = clips.find((c) => /walk/i.test(c.name));
    const nap = clips.find((c) => /^(nap|sleep|curl)/i.test(c.name)); if (nap) { napA = mixer.clipAction(nap); napA.setEffectiveWeight(0); napA.play(); }   // v38: curled-up nap loop
    const wave = clips.find((c) => /wave/i.test(c.name)); if (wave) { waveA = mixer.clipAction(wave); waveA.setLoop(THREE.LoopOnce, 1); waveA.clampWhenFinished = true; }
    // v37: optional crawl family (CrawlDown -> Crawl loop -> CrawlUp); the companion asks via S.crawl, and reads S.crawlPhase back
    // v38c: pose families (down -> loop -> up): crawl (+ Sniff as an alternative loop) and sit crisscross; one-shot idle variants
    const family = (reDown, reLoop, reUp) => { const f = { acts: {}, phase: null, T: 0, w: 0, wts: { down: 0, loop: 0, up: 0 } };
      for (const [key, re, once] of [['down', reDown, true], ['loop', reLoop, false], ['up', reUp, true]]) { const c = clips.find((cl) => re.test(cl.name));
        if (c) { const a = mixer.clipAction(c); if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } a.setEffectiveWeight(0); f.acts[key] = a; } }
      return f.acts.loop ? f : null; };
    crawlF = family(/^crawl.?down$/i, /^crawl$/i, /^crawl.?up$/i); sitF = family(/^sit.?down$/i, /^sit.?idle$/i, /^sit.?up$/i);
    const sn = clips.find((c) => /^sniff/i.test(c.name)); if (sn && crawlF) { sniffA = mixer.clipAction(sn); sniffA.setEffectiveWeight(0); }
    for (const c of clips) if (/^idle[A-Z_]/.test(c.name)) { const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(0); gests.push(a); }
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
  const CO = cow.opts || {};
  if (q.get('moospiral') !== '0' && CO.spiral !== false) {
    const eyeMats = []; model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m && /eye/i.test(m.name) && !eyeMats.includes(m)) eyeMats.push(m); }); });
    if (eyeMats.length) {
      const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), img = g.createImageData(N, N);
      const pink = (CO.spiralColor || q.get('moospiralcolor') || 'ff1f8f').replace('#', ''), pr = parseInt(pink.slice(0, 2), 16), pg = parseInt(pink.slice(2, 4), 16), pb = parseInt(pink.slice(4, 6), 16);
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
      spiral = { tex, rate: +(CO.spiralSpeed || q.get('moospiralspeed') || 0.4) };
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
  // ---- v38c tail tuning (Ahri-style: a bushy upward crescent that floats, sways as one cluster, flattens back with momentum) ----
  const TAIL = {
    SPREAD_IDLE: 55,      // deg, total fan of the tail tips when standing (the clips fan ~130 deg; every segment is pulled toward the cluster centre)
    SPREAD_MOVE: 34,      // deg, total fan of the tips at full momentum (walking / turning)
    FAN_CAL: 2.0,         // calibration: per-segment pulls compound down the chain, so the per-segment scale uses spread * FAN_CAL
    CURL_SEG: 2.5,        // deg added per segment down the chain (cumulative upward curl) - the tails float up against gravity
    CURL_MOVE: 0.45,      // fraction of the curl kept at full momentum (tails stream back flatter)
    MAX_ELEV: 65,         // deg, the curl never lifts a segment steeper than this (keeps the crescent open, not a vertical bundle)
    MIN_ELEV: 5,          // deg, no tail segment points below this elevation while standing / walking (no drooping to the floor)
    FLATTEN: 0.55,        // 0..1 how far the cluster swings toward straight back at full momentum
    MOM_SPEED: 0.8,       // m/s of travel that counts as full momentum (her walk is ~0.85)
    MOM_TURN: 1.2,        // rad/s of turning that counts as full momentum
    MOM_RISE: 0.45, MOM_FALL: 1.1,   // s, momentum low-pass (slow release = tips carry forward softly and settle back on stops)
    PERIOD: 3.8,          // s, ambient sway cycle (one slow sine for the whole cluster)
    SWAY: 9,              // deg, sway scale (tip bone; summed down the chain the tips swing ~ +-11 deg, the base stays near rigid)
    SWAY_EXP: 1.6,        // amplitude growth base -> tip (j/n)^exp
    LAG: 0.09,            // s of phase lag per bone down the chain (wave travels base -> tip)
    TAIL_LEAD: 0.25,      // s, the centre tails lead the outer ones by up to this
    LIFT: 3,              // deg of slow up/down bob layered with the sway (quarter-cycle offset)
    TAU0: 0.16, TAU_SEG: 0.07,       // s, over-damped follow-through per bone (first-order: no spring, no overshoot)
    FLICK: 7, FLICK_HZ: 1.1,         // deg per bone / Hz of the happy tail swish (hop, tilt, being looked at) - goes through the same damping
  };
  for (const k of Object.keys(TAIL)) { const v = q.get('tail_' + k.toLowerCase()); if (v !== null && v !== '' && !isNaN(+v)) TAIL[k] = +v; }   // ?tail_spread_idle=50 etc.
  const TL = { init: false, hf: new THREE.Quaternion(), D: new THREE.Quaternion(), f: new Map(), tmp: new THREE.Quaternion(), w: new THREE.Quaternion(), ax: new THREE.Vector3(),
    shape: null, mom: 0, prevHq: new THREE.Quaternion(), stats: { spread: 0, minY: 0 } }, TP = {};
  const skinCtl = makeSkins(model, mats, cow), sparkle = makeSparkle(holder);
  const hq = new THREE.Quaternion(), hq2 = new THREE.Quaternion(), pq = new THREE.Quaternion(), pq2 = new THREE.Quaternion(), tq = new THREE.Quaternion();
  const add = (k2, x, y, z) => { const b = nb[k2]; if (!b || !rest[k2]) return; b.quaternion.copy(rest[k2]).multiply(tmpQ.setFromEuler(E.set(x, y, z))); };
  cow.ext = {
    clips: clips.map((c) => c.name), weights: () => ({ idle: idleA ? +idleA.getEffectiveWeight().toFixed(2) : null, walk: walkA ? +walkA.getEffectiveWeight().toFixed(2) : null, walkT: walkA ? +walkA.time.toFixed(2) : null, walkScale: walkA ? +walkA.timeScale.toFixed(2) : null, wave: waveA ? +waveA.getEffectiveWeight().toFixed(2) : null, crawl: crawlF ? +crawlF.w.toFixed(2) : 0, crawlPhase: crawlF && crawlF.phase, nap: +nw.toFixed(2), crawlScale: crawlF ? +crawlF.acts.loop.timeScale.toFixed(2) : null, sniff: +snw.toFixed(2), sit: sitF ? +sitF.w.toFixed(2) : 0, sitPhase: sitF && sitF.phase, gesture: gest ? gest.getClip().name : null, gw: +gw.toFixed(2) }),
    tris, mirrored: !!twin, hasClips: !!mixer, canCrawl: !!crawlF, canNap: !!napA, canSit: !!sitF, canSniff: !!sniffA, gestures: gests.map((a) => a.getClip().name), spiral: !!spiral, rigged: Object.keys(rest).length > 0, vrm: !!vrm, apx: apx ? apx.regions : [], flex: flex ? flex.info() : null, apxMom: () => (apx ? +apx.U.uApMom.value.toFixed(3) : null), xBones: xBones.map((e) => e.b.name), xMom: () => +XB.mom.toFixed(3),
    skin: () => skinCtl.id, setSkin: (def, quiet) => { if (!quiet) { sparkle.burst(); cow.state.flash = Math.max(cow.state.flash || 0, 1); } return skinCtl.set(def); },
    update(dt, S, cam, t) {
      const w = S.walk, idle = 1 - w;
      if (mixer) {
        // one-shot Wave clip: restarts when S.wave is set (cow.waveNow), fades the base clips out underneath it
        if (waveA) { if (S.wave > waveWas + 0.05) { waveA.reset(); waveA.play(); } waveWas = S.wave; }
        const famOn = (crawlF && crawlF.phase) || (sitF && sitF.phase);
        const ww = waveA && waveA.isRunning() && !famOn ? Math.min(1, S.waveW * 1.2) : 0; if (waveA) waveA.setEffectiveWeight(ww);
        const runFam = (f, want) => {
          const enter = (ph) => { f.phase = ph; f.T = 0; const a2 = ph && f.acts[ph]; if (a2) { a2.reset(); a2.play(); } if (ph) f.acts.loop.play(); };
          const done = (key) => !f.acts[key] || f.T >= f.acts[key].getClip().duration - 0.02;
          if (!f.phase) { if (want) enter(f.acts.down ? 'down' : 'loop'); }
          else if (f.phase === 'down') { if (done('down')) enter(want ? 'loop' : (f.acts.up ? 'up' : null)); }
          else if (f.phase === 'loop') { if (!want) enter(f.acts.up ? 'up' : null); }
          else if (f.phase === 'up') { if (done('up')) enter(null); }
          f.T += dt; const kk = 1 - Math.exp(-dt * 7);   // v38d: softer cross-fades between the down / loop / up clips
          for (const key of ['down', 'loop', 'up']) f.wts[key] += ((f.phase === key ? 1 : 0) - f.wts[key]) * kk;
          f.w += ((f.phase ? 1 : 0) - f.w) * (1 - Math.exp(-dt * (f.phase ? 9 : 5)));
          const tot = f.wts.down + f.wts.loop + f.wts.up || 1;
          for (const key of ['down', 'up']) if (f.acts[key]) f.acts[key].setEffectiveWeight(f.w * f.wts[key] / tot);
          return f.w * f.wts.loop / tot; };
        let fw = 0;
        if (crawlF) { const lw = runFam(crawlF, !!S.crawl && !(sitF && sitF.phase)); snw += ((S.sniff && crawlF.phase ? 1 : 0) - snw) * (1 - Math.exp(-dt * 3));
          crawlF.acts.loop.setEffectiveWeight(lw * (1 - (sniffA ? snw : 0)));
          const ts = (stride, a) => S.speed > 0.03 ? Math.min(2.0, Math.max(0.3, S.speed / (stride * k * (cow.scale || 1) / a.getClip().duration))) : 0.3;
          if (crawlF.phase === 'loop') crawlF.acts.loop.timeScale = ts(CSTRIDE, crawlF.acts.loop);
          if (sniffA) { if (crawlF.phase && !sniffA.isRunning()) sniffA.play(); sniffA.setEffectiveWeight(lw * snw); sniffA.timeScale = Math.max(0.55, ts(SSTRIDE, sniffA)); }
          S.crawlPhase = crawlF.phase; S.crawlLow = crawlF.w > 0.5; fw += crawlF.w; }
        if (sitF) { const lw = runFam(sitF, !!S.sit && !(crawlF && crawlF.phase)); sitF.acts.loop.setEffectiveWeight(lw); S.sitPhase = sitF.phase; S.sitLow = sitF.w > 0.5; fw += sitF.w; }
        fw = Math.min(1, fw); S.famW = fw;
        if (napA) { nw += ((S.nap && !famOn ? 1 : 0) - nw) * (1 - Math.exp(-dt * 1.6)); napA.setEffectiveWeight(nw * (1 - fw)); } S.napW = nw;
        // v38c: idle variants (stretch, hair tuck, hand on hip, weight shift + shoulder roll, yawn) - random, never twice in a row
        const still = w < 0.05 && fw < 0.05 && ww < 0.05 && nw < 0.05 && !S.noGesture;
        if (gests.length) {
          if (!gest && (still || S.gesture)) { gestT -= dt;
            if (gestT <= 0 || S.gesture) { const pool = gests.filter((a) => a !== gestLast && (!S.gesture || S.gesture === 'random' || a.getClip().name === S.gesture));
              gest = (pool.length ? pool : gests)[Math.floor(Math.random() * (pool.length || gests.length))]; gest.reset(); gest.play(); gestLast = gest; S.gesture = null; gestT = 7 + Math.random() * 9; } }
          let gt = 0;
          if (gest) { const d0 = gest.getClip().duration, tt = gest.time; gt = still ? Math.max(0, Math.min(1, tt / 0.35, (d0 - tt) / 0.45)) : 0;
            if (!gest.isRunning() || tt >= d0 - 0.01 || (!still && gw < 0.02)) { gest.stop(); gest.setEffectiveWeight(0); gest = null; gt = 0; } }
          gw += (gt - gw) * (1 - Math.exp(-dt * 10)); if (gest) gest.setEffectiveWeight((1 - w) * (1 - ww) * (1 - fw) * (1 - nw) * gw);
        }
        if (walkA) { walkA.setEffectiveWeight(w * (1 - ww) * (1 - fw) * (1 - nw)); idleA.setEffectiveWeight((1 - w) * (1 - ww) * (1 - fw) * (1 - nw) * (1 - gw));
          walkA.timeScale = S.speed > 0.05 ? Math.min(1.9, Math.max(0.45, S.speed / (STRIDE * k * (cow.scale || 1) / walkA.getClip().duration))) : 0.6; }
        mixer.update(dt);
        // v38c tails (TAIL constants above). Per tail, bone by bone from the root: the clip direction of each segment is pulled toward the
        // cluster centre (its spread scaled to SPREAD_IDLE -> SPREAD_MOVE: a clumped crescent, not 9 spikes), lifted by an upward curl
        // that grows down the chain (they float, never droop), swung back with momentum, then one slow cluster sway is layered on
        // (centre tails lead, base->tip lag, amplitude growing to the tips) and every bone goes through an over-damped follow-through
        // filter (first order: no spring, no overshoot, no jelly). Crawl / sit / nap keep their clip tails (sway + damping only).
        if (tails.length && nb.hips && TAILFX) {
          nb.hips.updateWorldMatrix(true, false); nb.hips.getWorldQuaternion(hq); if (!TL.init) { TL.init = true; TL.hf.copy(hq); TL.prevHq.copy(hq); }
          TL.hf.slerp(hq, 1 - Math.exp(-dt / 0.25)); TL.D.copy(TL.hf).multiply(hq2.copy(hq).invert());
          if (!TL.shape) { TL.shape = tailShape(tails, nb.hips, model); TL.shape.setLead(TAIL); cow.ext && (cow.ext.tailInfo = () => ({ clipSpread: TL.shape.clipSpread, mom: TL.mom, clampW: TL.cw || 0, nClamp: TL.nClamp || 0 })); }
          const SH = TL.shape, V = SH.v, Qv = SH.q, fw2 = S.famW || 0, sw = (1 - fw2) * (1 - nw);
          const turn = dt > 0 ? 2 * Math.acos(Math.min(1, Math.abs(TL.prevHq.dot(hq)))) / dt : 0; TL.prevHq.copy(hq);
          const mt = Math.min(1, Math.max((S.speed || 0) / TAIL.MOM_SPEED, turn / TAIL.MOM_TURN));
          TL.mom += (mt - TL.mom) * (1 - Math.exp(-dt / (mt > TL.mom ? TAIL.MOM_RISE : TAIL.MOM_FALL)));
          const mom = TL.mom * sw, spread = TAIL.SPREAD_IDLE + (TAIL.SPREAD_MOVE - TAIL.SPREAD_IDLE) * mom, ks = Math.min(1, spread * TAIL.FAN_CAL / Math.max(1, SH.clipSpread));
          const curl = TAIL.CURL_SEG * (1 - (1 - TAIL.CURL_MOVE) * mom) * Math.PI / 180, minEl = TAIL.MIN_ELEV * Math.PI / 180;
          const amp = (1 - 0.35 * nw) * (S.tailAmp === undefined ? 1 : S.tailAmp), om = 2 * Math.PI / TAIL.PERIOD;
          // cluster centre in world space (hips space -> world), swung back by momentum
          const cW = V.c.copy(SH.mean).lerp(SH.back, TAIL.FLATTEN * mom).normalize().applyQuaternion(hq), up = V.up.set(0, 1, 0);
          nb.hips.parent ? nb.hips.parent.getWorldQuaternion(pq) : pq.identity();
          // v38d stall clamp: segment ends are walked down each chain in world space; one that would leave the stall (dividers, front rail,
          // trough) is turned toward its clamped point. Applied after the follow-through filter (the filter state stays unclamped) and
          // blended in/out over ~0.4 s so entering / leaving never snaps.
          const tcf = S.tailClamp || null; if (tcf) TL.cf = tcf; TL.cw = (TL.cw || 0) + ((tcf ? 1 : 0) - (TL.cw || 0)) * (1 - Math.exp(-dt / 0.4));
          const CL = TL.cw > 0.002 && TL.cf ? TL.cf : null; if (CL) { nb.hips.getWorldScale(V.ws || (V.ws = new THREE.Vector3())); TL.nClamp = 0; }
          for (const ch of SH.chains) { const Pq = Qv.P.copy(hq); let cp = null;
            if (CL) { const rp = ch.bones[0].parent; rp.updateWorldMatrix(true, false); cp = (TL.cp || (TL.cp = new THREE.Vector3())).copy(ch.bones[0].position); rp.localToWorld(cp); }
            for (let jj = 0; jj < ch.bones.length; jj++) { const b = ch.bones[jj], j = jj + 1, L = TL.tmp.copy(b.quaternion);
              if (j === 1) L.premultiply(pq2.copy(Pq).invert().multiply(TL.D).multiply(Pq));   // root lags the hips' rotation (low-pass)
              if (sw > 0.001) {
                const Wq = Qv.W.copy(Pq).multiply(L), d = V.d.set(0, 1, 0).applyQuaternion(Wq);
                // clump: the deviation from the cluster centre scaled by ks
                Qv.a.setFromUnitVectors(cW, d); Qv.b.identity().slerp(Qv.a, ks); const tg = V.t.copy(cW).applyQuaternion(Qv.b);
                // upward curl growing down the chain + no drooping below MIN_ELEV
                const ax = V.ax.crossVectors(tg, up); if (ax.lengthSq() > 1e-8) { ax.normalize(); const el = Math.asin(Math.max(-1, Math.min(1, tg.y)));
                  const lift = Math.min(curl * (j - 1) + Math.max(0, minEl - el), TAIL.MAX_ELEV * Math.PI / 180 - el); if (lift > 0) tg.applyAxisAngle(ax, lift); }
                Qv.a.setFromUnitVectors(d, tg); Qv.b.identity().slerp(Qv.a, sw);
                L.copy(pq2.copy(Pq).invert().multiply(Qv.b).multiply(Wq));
              }
              // cluster sway: one sine, centre tails lead a little, phase lag down the chain, amplitude growing to the tips
              const ph = om * (t + ch.lead - TAIL.LAG * (j - 1)), g = Math.pow(j / SH.nseg, TAIL.SWAY_EXP) * amp * (0.6 + 0.4 * sw) / Math.max(1, SH.nseg * 0.4);
              const R = SH.bones.get(b); L.multiply(TL.w.setFromAxisAngle(R.swayAx, g * TAIL.SWAY * Math.PI / 180 * Math.sin(ph)));
              L.multiply(TL.w.setFromAxisAngle(R.curlAx, g * TAIL.LIFT * Math.PI / 180 * Math.sin(ph - Math.PI / 2)));
              if (S.flick > 0.01) L.multiply(TL.w.setFromAxisAngle(R.swayAx, S.flick * TAIL.FLICK * Math.PI / 180 * (j / SH.nseg) * Math.sin(2 * Math.PI * TAIL.FLICK_HZ * t - j * 0.5 + ch.lead * 4)));
              let F = TL.f.get(b); if (!F) { F = L.clone(); TL.f.set(b, F); } else F.slerp(L, 1 - Math.exp(-dt / (TAIL.TAU0 + TAIL.TAU_SEG * j)));
              b.quaternion.copy(F);
              if (CL) { const nx = ch.bones[jj + 1], len = (nx ? nx.position.length() : (TL.lastLen || 0.1)) * V.ws.x; if (nx) TL.lastLen = nx.position.length();
                const Wq = Qv.W.copy(Pq).multiply(F), d = (V.cd || (V.cd = new THREE.Vector3())).set(0, 1, 0).applyQuaternion(Wq);
                const ex = cp.x + d.x * len, ez = cp.z + d.z * len, c = CL(ex, ez);
                if (c) { let hx = c[0] - cp.x, hz = c[1] - cp.z; const hl = Math.hypot(hx, hz); if (hl > len * 0.999) { hx *= len * 0.999 / hl; hz *= len * 0.999 / hl; }   // end exactly at the clamped point, length kept (vertical takes the rest)
                  const nd = (V.cn || (V.cn = new THREE.Vector3())).set(hx, (d.y < -0.05 ? -1 : 1) * Math.sqrt(Math.max(0, len * len - hx * hx - hz * hz)), hz);
                  if (nd.lengthSq() > 1e-8) { nd.normalize(); Qv.a.setFromUnitVectors(d, nd); Qv.b.identity().slerp(Qv.a, TL.cw); Wq.premultiply(Qv.b);
                    b.quaternion.copy(pq2.copy(Pq).invert().multiply(Wq)); d.set(0, 1, 0).applyQuaternion(Wq); TL.nClamp++; } }
                cp.addScaledVector(d, len); }
              Pq.multiply(b.quaternion); } }
        }
        // tail flick (bones named *tail*): a quick ripple layered on top of the clips (only with ?mootailfx=0; v38c folds a slow swish into the damped tails)
        if (S.flick > 0.01 && tails.length && !TAILFX) for (const [b, j] of tails) { const a = S.flick * 0.22 * Math.sin(t * 16 - j * 0.9); b.rotateX(a); b.rotateZ(a * 0.6); }
      }
      if (mixer && walkA) {
        // clip-driven (Idle + Walk): layer the head/neck look-at-the-viewer on top of the animation, in world space so any bone axes work
        const cw = crawlF ? crawlF.w : 0; holder.getWorldQuaternion(hq); const wq = tmpQ.setFromEuler(E.set(S.lookP * (1 - 0.7 * cw) * (1 - nw), S.look * (1 - 0.4 * cw) * (1 - nw), S.tilt * 0.6 * (1 - nw), 'YXZ'));
        wq.premultiply(hq).multiply(hq2.copy(hq).invert());
        for (const [k2, f] of [['neck', 0.4], ['head', 0.5]]) { const b = nb[k2]; if (!b || !b.parent) continue;
          b.parent.getWorldQuaternion(pq); const part = tq.identity().slerp(wq, f);
          b.quaternion.premultiply(pq2.copy(pq).invert().multiply(part).multiply(pq)); }
      }
      if (xBones.length) {   // ears tilt back with momentum and sway a little, tips lag; first-order filter, no overshoot
        holder.getWorldQuaternion(XB.hq); const fwd = XB.ax.set(0, 0, 1).applyQuaternion(XB.hq), yw = Math.atan2(fwd.x, fwd.z);
        let turn = 0; if (XB.yaw !== null && dt > 0) { let d = yw - XB.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); turn = Math.abs(d) / dt; } XB.yaw = yw;
        const mt = Math.min(1, Math.max((S.speed || 0) / 1.2, turn / 2.5)); XB.mom += (mt - XB.mom) * (1 - Math.exp(-dt / (mt > XB.mom ? 0.5 : 1.1)));
        const right = XB.ax.set(1, 0, 0).applyQuaternion(XB.hq), fw = XB.ay.set(0, 0, 1).applyQuaternion(XB.hq);
        xBones.forEach((e, i) => { const A = e.wing ? 1 : 0.35, k1 = 1 - Math.exp(-dt / 0.3);
          const back = A * (0.12 * XB.mom + 0.035 * Math.sin(t * 1.1 + i * 0.7)), side = A * e.side * 0.03 * Math.sin(t * 0.7 + i * 1.9);
          e.f[0] += (back - e.f[0]) * k1; e.f[1] += (side - e.f[1]) * k1; if (!e.b.parent) return;
          XB.q.setFromAxisAngle(right, -e.f[0]).multiply(XB.q2.setFromAxisAngle(fw, e.f[1])); e.b.parent.getWorldQuaternion(XB.pq);
          e.b.quaternion.premultiply(XB.q2.copy(XB.pq).invert().multiply(XB.q).multiply(XB.pq)); });
      }
      if (flex) { (cow.group || holder).getWorldPosition(FX.v); flex.update(dt, t, { floorY: FX.v.y }); }
      if (apx) { holder.getWorldQuaternion(XB.hq); const fwd = XB.ax.set(0, 0, 1).applyQuaternion(XB.hq); apx.update(dt, t, S.speed || 0, Math.atan2(fwd.x, fwd.z)); }
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
      if (spiral) { spiral.tex.rotation = -(t * spiral.rate * Math.PI * 2) % (Math.PI * 2);   // v38c: the irises follow her gaze (eyes lead the head)
        spiral.tex.offset.set(-0.13 * ((S.eyeY || 0) + 0.3 * S.look), 0.13 * ((S.eyeP || 0) + 0.3 * S.lookP)); }
      if (sparkle) sparkle.update(dt);
      if (twin) { for (let i = 0; i < srcNodes.length; i++) { const a = srcNodes[i], b = dstNodes[i]; if (!b) break; b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale);
        if (a.morphTargetInfluences && b.morphTargetInfluences) b.morphTargetInfluences.splice(0, a.morphTargetInfluences.length, ...a.morphTargetInfluences); } }
    },
  };
}

// v38f: skins = material/texture sets on the same rigged model (UVs shared). def = null / builtin -> the model's own look (Circuit Doll);
// def = { id, base, emissive, orm } texture URLs (glTF UV convention: flipY false). Textures are cached per URL.
const TEXC = new Map();
function loadTex(url, srgb) {
  if (!url) return Promise.resolve(null);
  if (TEXC.has(url)) return TEXC.get(url);
  const p = new Promise((res) => new THREE.TextureLoader().load(url, (tx) => { tx.flipY = false; if (srgb) tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; res(tx); }, undefined, () => res(null)));
  TEXC.set(url, p); return p;
}
function makeSkins(model, mats) {
  const body = mats.filter((m) => !/eye/i.test(m.name || ''));
  const orig = body.map((m) => ({ m, map: m.map, vc: m.vertexColors, color: m.color.clone(), em: m.emissiveMap, e: m.emissive.clone(), ei: m.emissiveIntensity, rm: m.roughnessMap, mm: m.metalnessMap, r: m.roughness, mt: m.metalness }));
  const ctl = { id: null, async set(def) {
    if (!def || def.builtin) { for (const o of orig) { const m = o.m; m.map = o.map; m.vertexColors = o.vc; m.color.copy(o.color); m.emissiveMap = o.em; m.emissive.copy(o.e); m.emissiveIntensity = o.ei; m.roughnessMap = o.rm; m.metalnessMap = o.mm; m.roughness = o.r; m.metalness = o.mt; m.userData.e0 = o.e.clone(); m.userData.ei0 = o.ei; m.needsUpdate = true; }
      ctl.id = def ? def.id : null; return true; }
    const [b, e, o] = await Promise.all([loadTex(def.base, true), loadTex(def.emissive, true), loadTex(def.orm, false)]);
    if (!b) return false;
    for (const m of body) { m.map = b; m.vertexColors = false; m.color.set(0xffffff); m.emissiveMap = e; m.emissive.set(e ? 0xffffff : 0x000000); m.emissiveIntensity = e ? 1 : 0;
      m.roughnessMap = o; m.metalnessMap = o; m.roughness = o ? 1 : 0.5; m.metalness = o ? 1 : 0; m.userData.e0 = m.emissive.clone(); m.userData.ei0 = m.emissiveIntensity; m.needsUpdate = true; }
    ctl.id = def.id; return true; } };
  return ctl;
}
// a little sparkle burst when her skin changes
function makeSparkle(holder) {
  const N = 90, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cg = cv.getContext('2d'), gr = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 64, 64);
  cg.fillStyle = 'rgba(255,255,255,0.9)'; cg.fillRect(30, 4, 4, 56); cg.fillRect(4, 30, 56, 4);   // a little four-point star
  const m = new THREE.PointsMaterial({ color: 0xffd6ec, size: 0.07, map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; holder.add(pts); let life = 0;
  return { burst() { for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.35, y = Math.random() * 1.8;
      pos.set([Math.sin(a) * r, y, Math.cos(a) * r], i * 3); vel.set([Math.sin(a) * 0.15, 0.3 + Math.random() * 0.5, Math.cos(a) * 0.15], i * 3); }
      g.attributes.position.needsUpdate = true; life = 1.3; pts.visible = true; },
    update(dt) { if (life <= 0) return; life -= dt; for (let i = 0; i < N * 3; i++) pos[i] += vel[i] * dt; g.attributes.position.needsUpdate = true;
      m.opacity = Math.max(0, Math.min(1, life / 0.6)); m.color.setHSL(0.9 + 0.05 * Math.sin(life * 9), 1, 0.8); if (life <= 0) pts.visible = false; } };
}
