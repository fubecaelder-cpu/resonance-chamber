// v28: optional user-supplied 3D model for Miss Moo (.glb / .gltf with embedded data / .vrm).
// Source order: ?moomodel= override -> GCS model/manifest.json (made by sync_gcs.py) -> newest model in the Drive "Miss Moo Model" folder -> built-in figure.
import { THREE, clipMirror } from './shared.js?v=32';
import { GLTFLoader } from './lib/GLTFLoader.js?v=32';
import * as SkeletonUtils from './lib/SkeletonUtils.js?v=32';
import { DRIVE_DEFAULTS, MOO_DEFAULTS } from './config.js?v=32';

const EXT_RANK = { glb: 0, vrm: 1, gltf: 2 };
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
      const r = await fetch(`${API}/drive/v3/files?q=${encodeURIComponent(qq)}&fields=${encodeURIComponent('files(id,name,size,modifiedTime,md5Checksum)')}&orderBy=modifiedTime desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${encodeURIComponent(key)}`, { credentials: 'omit' });
      const b = await r.json(); const all = (b.files || []).filter((f) => extOf(f.name) in EXT_RANK || extOf(f.name) === 'fbx');
      all.sort((a, c) => (Date.parse(c.modifiedTime) - Date.parse(a.modifiedTime)) || ((EXT_RANK[extOf(a.name)] ?? 9) - (EXT_RANK[extOf(c.name)] ?? 9)));
      if (r.ok && !all.length) return { none: true };   // folder readable and empty: built-in figure, even if an old GCS copy exists
      const newestAny = all[0]; newest = all.find((f) => extOf(f.name) in EXT_RANK) || null;
      // the GCS copy is current only if it was made from the newest file in the folder (FBX files only ever come via GCS, converted by sync_gcs.py)
      if (newestAny && list[0] && list[0].src && list[0].src !== newestAny.id) list.shift();
    } catch (e) { console.warn('[moomodel] Drive list failed', e.message); }
  }
  if (newest) list.push({ name: newest.name, ext: extOf(newest.name), urls: driveUrls(newest.id) });
  return list.length ? { multi: list } : null;
}

async function parse(buf, ext, url) {
  const loader = new GLTFLoader(); let vrmMod = null;
  if (ext === 'vrm') { vrmMod = await import('./lib/three-vrm.module.min.js?v=32'); loader.register((p) => new vrmMod.VRMLoaderPlugin(p)); }
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
  let mixer = null, idleA = null, walkA = null;
  const clips = gltf.animations || [];
  if (clips.length) { mixer = new THREE.AnimationMixer(model);
    const idle = clips.find((c) => /idle|stand|breath/i.test(c.name)) || clips.find((c) => !/walk|run/i.test(c.name)) || clips[0];
    const walk = clips.find((c) => /walk/i.test(c.name));
    idleA = mixer.clipAction(idle); idleA.play(); if (walk && walk !== idle) { walkA = mixer.clipAction(walk); walkA.play(); walkA.setEffectiveWeight(0); } }
  if (q.get('moochoker') === '1') {
    const anchor = nb.neck || nb.head; const ch = new THREE.Group();
    ch.add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })));
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 0.03, 14), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 })); bell.position.set(0, -0.025, 0.045); ch.add(bell); ch.userData.bell = bell;
    if (anchor) { anchor.add(ch); holder.updateMatrixWorld(true); const s = 1 / new THREE.Vector3().setFromMatrixScale(anchor.matrixWorld).x; ch.scale.setScalar(s); }
    else { ch.position.set(0, HEIGHT * 0.83, 0); holder.add(ch); }
    holder.userData.choker = ch;
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
  const add = (k2, x, y, z) => { const b = nb[k2]; if (!b || !rest[k2]) return; b.quaternion.copy(rest[k2]).multiply(tmpQ.setFromEuler(E.set(x, y, z))); };
  cow.ext = {
    tris, mirrored: !!twin, hasClips: !!mixer, rigged: Object.keys(rest).length > 0, vrm: !!vrm,
    update(dt, S, cam, t) {
      const w = S.walk, idle = 1 - w;
      if (mixer) { if (walkA) { walkA.setEffectiveWeight(w); idleA.setEffectiveWeight(1 - w); } mixer.update(dt); }
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
      const f = S.flash; for (const m of mats) { if (f > 0.01) { m.emissive.copy(m.userData.e0).lerp(PINK, Math.min(1, f * 0.6)); m.emissiveIntensity = Math.max(m.userData.ei0, f); } else if (m.emissiveIntensity !== m.userData.ei0) { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; } }
      if (twin) { for (let i = 0; i < srcNodes.length; i++) { const a = srcNodes[i], b = dstNodes[i]; if (!b) break; b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale);
        if (a.morphTargetInfluences && b.morphTargetInfluences) b.morphTargetInfluences.splice(0, a.morphTargetInfluences.length, ...a.morphTargetInfluences); } }
    },
  };
}
