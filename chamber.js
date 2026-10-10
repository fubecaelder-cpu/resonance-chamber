// Neon pod chamber builder (Room 1 pink, Room 2 crimson). Everything is built in room-local space:
// focal point at local -z, entry doorway at local +z (angle 0).
import { clipMirror } from "./shared.js?v=16";
import { THREE, U, OPT, BEAT, f3, R, H, TY, TR, TZ, TL, START_Z, D0, DW, VEIL_R, PAL,
  makeKit, instanced, mtx, dummy, glowSprite, canvasTex, archCurve, ringCurves, doorDiscardGLSL, floorDoorDiscardGLSL, makeVeil } from './shared.js?v=16';
import { roomMedia, MEDIA_GLSL } from './media.js?v=16';
import { MON_GEO } from './shared.js?v=16';


// floor helpers shared by the room floors
export const FLOOR_HELPERS = /* glsl */`
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y); }
  float ln(float d, float hw){ return 1.0 - smoothstep(hw, hw + fwidth(d) * 1.5, abs(d)); }`;
// crimson room: dark glossy stone with branching veins that pulse outward from the vortex, and lub-dub heartbeat ripples
const CRIMSON_FLOOR = /* glsl */`
  { float n = vn(p * 1.3 + vec2(0.0, uTime * 0.03)) * 0.6 + vn(p * 3.4 + 7.0) * 0.3 + vn(p * 8.0) * 0.1;
    float vein = ln(n - 0.5, 0.009) + 0.55 * ln(vn(p * 0.8 - 2.0) - 0.5, 0.006);
    float lub = uBeatT * 4.6, dub = max(uBeatT - 0.28, 0.0) * 4.6;
    float flow = exp(-abs(d - lub) * 0.9) + 0.6 * exp(-abs(d - dub) * 0.9);
    col += BASE * 0.7 * vn(p * 0.6) + DEEP * 0.12 * vn(p * 2.1);
    col += PINK * vein * (0.1 + 0.08 * uInt + 0.95 * uBeat * flow) * DIM;
    col += HOT * (exp(-abs(d - lub) * 10.0) + 0.75 * exp(-abs(d - dub) * 10.0)) * uBeat * 0.8 * DIM;
    col += DEEP * aline(d / 0.55, 0.025, fwidth(d) / 0.55) * 1.4 * step(d, 12.0);
    float rq = length(p), aq = atan(abs(p.x), p.y);
    col += PINK * (ln(rq - 5.35, 0.012) * 0.55 + ln(rq - 5.62, 0.006) * 0.35) * DIM;
    float tk = (fract(aq * 36.0 / 3.14159) - 0.5) * 3.14159 / 36.0 * rq;
    col += HOT * ln(tk, 0.012) * step(abs(rq - 5.485), 0.09) * (0.35 + 0.6 * uBeat) * DIM;
    col += HOT * 0.25 * exp(-rq * 1.4) * (0.5 + uBeat) * DIM;
  }`;

export function buildChamber(cfg) {
  const root = new THREE.Group(); root.name = cfg.name;
  root.position.set(cfg.center[0], 0, cfg.center[1]); root.rotation.y = cfg.rotY || 0; root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const K = makeKit(cfg.pal, inv), { mat, neonCore, glowShell, neonTorus, neonTube, metalMat, hex } = K;
  const world = new THREE.Group(); root.add(world);       // mirrored in the glossy floor
  const FS = cfg.focal === 'vortex' ? 1.5 : (cfg.deluxe ? 1.25 : 1.0), FY = cfg.focal === 'vortex' ? 2.55 : (cfg.deluxe ? 2.25 : TY);   // the crimson vortex is bigger and higher (v8: a little smaller so the monitor clears it)
  const fx = new THREE.Group(); root.add(fx);
  const doorAngles = cfg.doors.map((d) => d.ang);
  const haze = [], out = { root, world, fx, haze, kit: K, cfg };

  // ---------- walls ----------
  {
    const m = mat(/* glsl */`
      void main(){
        float y = abs(vW.y);
        float ang = atan(vW.x, vW.z);
        ${doorDiscardGLSL(doorAngles)}
        if (vW.z < -4.0 && length(vec2(vW.x, y - ${f3(FY)})) < ${f3((TR + 0.3) * FS)}) discard;
        float cw = ${f3((2 * Math.PI * R) / 56)};
        vec2 cell = vec2(ang * ${f3(R)} / cw, y / 0.92);
        vec2 id = floor(cell), f = fract(cell);
        vec2 pc = vec2(length(fwidth(vW.xz)) / cw, fwidth(y) / 0.92);
        float h = hash12(vec2(mod(id.x, 56.0), id.y) + 7.0);
        float nd = 0.0;   // 1 above a doorway: no vertical seams/flow lines there (they read as a wire over the arch)
        ${doorAngles.map((a) => `{ float da = atan(sin(ang - (${f3(a)})), cos(ang - (${f3(a)}))); nd = max(nd, 1.0 - smoothstep(${f3(DW + 0.35)}, ${f3(DW + 0.6)}, abs(da) * ${f3(R)})); }`).join('\n        ')}
        vec3 col = mix(BASE, BASE2, smoothstep(0.0, ${f3(H)}, y)) * (0.7 + 0.6 * h);
        float ex = min(f.x, 1.0 - f.x), ey = min(f.y, 1.0 - f.y);
        float seam = max((1.0 - smoothstep(0.012, 0.012 + pc.x * 1.5, ex)) * (1.0 - nd), 1.0 - smoothstep(0.018, 0.018 + pc.y * 1.5, ey));
        col *= 1.0 - seam * 0.85;
        float bev = smoothstep(0.018, 0.03, ey) * (1.0 - smoothstep(0.03, 0.045 + pc.y, ey)) * step(0.5, f.y);
        col += DEEP * bev * 0.6;
        float slot = (1.0 - smoothstep(0.05, 0.05 + pc.y * 1.5, abs(f.y - 0.5))) * (1.0 - smoothstep(0.3, 0.3 + pc.x * 1.5, abs(f.x - 0.5)));
        float on = step(${f3(cfg.pal === 'crimson' ? 0.86 : 0.8)}, h) * (0.55 + 0.45 * sin(uTime * (0.7 + h * 2.0) + h * 40.0));
        col += mix(PINK, HOT, h) * slot * on * (1.0 - nd) * (0.4 + 0.8 * uInt) * DIM;
        float vs = aline(cell.x / 4.0, 0.0035, pc.x / 4.0) * (1.0 - nd);
        float flow = pow(0.5 + 0.5 * sin(y * 1.1 - uTime * 2.0 + floor(cell.x / 4.0) * 1.7), 6.0);
        col += PINK * vs * (0.3 + 1.4 * flow * uInt) * DIM;
        float bw = exp(-abs(y - uBeatT * 3.0) * 2.0) * uBeat;
        col += PINK * bw * (0.12 + vs * 2.5 + slot * on * 2.0) * DIM;
        float py = fwidth(y);
        col += HOT * (1.0 - smoothstep(0.035, 0.035 + py * 1.5, abs(y - 0.12))) * (1.0 + uBeat);
        col += PINK * (1.0 - smoothstep(0.02, 0.02 + py * 1.5, abs(y - 3.95))) * (0.7 + 0.6 * uBeat);
        col += PINK * 0.14 * exp(-y * 1.4) * (0.6 + 0.6 * uBeat) * DIM;
        float dm = length(vec3(vW.x, y, vW.z) - vec3(0.0, ${f3(FY)}, ${f3(TZ)}));
        col += PINK * 0.8 * exp(-(dm - ${f3(TR * FS)}) * 0.85) * (0.5 + 0.5 * uInt + 0.7 * uBeat);
        ${cfg.wallGLSL || ''}
        gl_FragColor = vec4(fogit(col, vW), 1.0);
      }`, { side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 128, 1, true), m); wall.position.y = H / 2; world.add(wall);
  }
  // ---------- ceiling, beams, pilasters, pylons, conduits ----------
  {
    const m = mat(/* glsl */`
      void main(){
        float r = length(vW.xz);
        vec3 col = BASE2 + BASE * 0.3;
        col += DEEP * aline(r / 0.9, 0.012, fwidth(r) / 0.9) * 0.8;
        col += PINK * 0.5 * exp(-abs(r - 2.4) * 2.5) * (0.6 + 0.4 * uInt + 0.8 * uBeat) * DIM;
        col += HOT * 0.35 * exp(-r * 2.5) * (0.6 + 0.8 * uBeat) * DIM;
        ${cfg.ceilGLSL || ''}
        gl_FragColor = vec4(fogit(col, vW), 1.0);
      }`);
    const c = new THREE.Mesh(new THREE.CircleGeometry(R + 0.05, 96), m); c.rotation.x = Math.PI / 2; c.position.y = H; world.add(c);
    neonTorus(world, 2.4, 0.045, hex.a, new THREE.Vector3(0, H - 0.05, 0), Math.PI / 2, 1.1);
    neonTorus(world, 1.2, 0.03, hex.c, new THREE.Vector3(0, H - 0.05, 0), Math.PI / 2, 1.0);
    const beams = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; if (Math.abs(a - Math.PI) < 1.1) continue;   // v10: no beams over the monitor bay (the same clear space in every room)
      beams.push(mtx(Math.sin(a) * 4.7, H - 0.16, Math.cos(a) * 4.7, a)); }
    if (!cfg.deluxe) instanced(new THREE.BoxGeometry(0.24, 0.3, 4.6), metalMat({ STRIP_Y: '0.149' }), beams, world);
    const nearDoor = (a) => doorAngles.some((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))) < 0.25);
    const pil = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2; if (Math.abs(a - Math.PI) < 0.62 || nearDoor(a)) continue;
      pil.push(mtx(Math.sin(a) * (R - 0.18), H / 2, Math.cos(a) * (R - 0.18), a + Math.PI));
    }
    instanced(new THREE.BoxGeometry(0.34, H, 0.36), metalMat({ STRIP_Z: '0.179' }), pil, world);
    const pyl = [];
    for (const s of [-1, 1]) { const a = Math.PI + s * 0.5, x = Math.sin(a) * 6.8, z = Math.cos(a) * 6.8; pyl.push(mtx(x, 3.2, z, Math.atan2(-x, -z))); }   // v10: set back against the wall, clear of the monitor bay
    instanced(new THREE.BoxGeometry(0.62, 6.4, 0.6), metalMat({ STRIP_Z: '0.299' }), pyl, world);
    for (const y of [6.95, 7.15]) { const t = new THREE.Mesh(new THREE.TorusGeometry(R - 0.1, 0.07, 6, 112), metalMat()); t.rotation.x = Math.PI / 2; t.position.y = y; world.add(t); }
    neonTorus(world, R - 0.16, 0.03, hex.a, new THREE.Vector3(0, 7.38, 0), Math.PI / 2, 0.9, 4);
    for (const cv of ringCurves(R - 0.14, 0.32, doorAngles)) neonTube(world, cv, hex.e, 0.8, 0.025, 96, 4);
  }
  // ---------- doorways: frame + veil previewing the next space ----------
  for (const d of cfg.doors) {
    const g = new THREE.Group(); g.position.set(Math.sin(d.ang) * VEIL_R, 0, Math.cos(d.ang) * VEIL_R); g.rotation.y = d.ang + Math.PI;
    const veil = makeVeil(d.style, 0); g.add(veil);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(archCurve(0.05, DW + 0.12), 64, 0.13, 8), metalMat()));
    neonTube(g, archCurve(0.17, DW + 0.03), d.style === 2 ? 0xffffff : d.style === 1 ? 0xff3048 : 0xff6fc0, 1.2, 0.03, 64, 5);
    neonTube(g, archCurve(0.12, DW + 0.24), hex.a, 0.9, 0.02, 64, 5);
    world.add(g);
  }

  // ---------- glossy floor ----------
  {
    const doorPools = cfg.doors.map((d) => `col += HOT * 0.4 * exp(-length(p - vec2(${f3(Math.sin(d.ang) * 6.4)}, ${f3(Math.cos(d.ang) * 6.4)})) * 0.9) * (0.6 + 0.6 * uBeat);`).join('\n');
    const m = mat(/* glsl */`
      uniform float uMirror;
      ${FLOOR_HELPERS}
      void main(){
        vec2 p = vW.xz; float rr = length(p);
        ${floorDoorDiscardGLSL(doorAngles)}
        vec2 mm = p - vec2(0.0, ${f3(TZ)}); float d = length(mm);
        vec2 px = fwidth(p);
        vec3 col = FLOORC;
        ${cfg.floorGLSL || CRIMSON_FLOOR}
        col += PINK * 0.5 * exp(-d * 0.5) * (0.5 + 0.5 * uInt + 0.6 * uBeat);
        ${doorPools}
        col *= 1.0 - smoothstep(5.5, ${f3(R)}, rr) * 0.4;
        col = fogit(col, vW);
        vec3 V = normalize(CAM - vW);
        float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.5);
        gl_FragColor = vec4(col, mix(0.28, 0.72, fr) * uMirror);
      }`);
    m.transparent = true; m.depthWrite = true;
    m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.SrcAlphaFactor; m.blendEquation = THREE.AddEquation;
    const fl = new THREE.Mesh(new THREE.CircleGeometry(R + 0.05, 96), m); fl.rotation.x = -Math.PI / 2; fl.renderOrder = 10; root.add(fl);
    out.floor = fl;
  }

  // ---------- focal point ----------
  const pc = new THREE.Vector3(0, TY, TZ + 0.06);
  const fg = new THREE.Group(); fg.scale.setScalar(FS); fg.position.set(0, FY - pc.y * FS, pc.z - pc.z * FS); world.add(fg);
  if (cfg.focal === 'tunnel') buildTunnel(K, fg, cfg.tunnelU);
  else buildVortex(K, fg);
  if (!cfg.deluxe) {
    const bez = new THREE.Mesh(new THREE.TorusGeometry(TR + 0.42, 0.34, 12, 96), metalMat()); bez.position.copy(pc); fg.add(bez);
    neonTorus(fg, TR + 0.1, 0.05, hex.d, pc, 0, 1.3, 5);
    neonTorus(fg, TR + 0.62, 0.04, hex.a, pc.clone().setZ(TZ + 0.2), 0, 1.1, 5);
    neonTorus(fg, TR + 0.85, 0.022, hex.e, pc.clone().setZ(TZ + 0.1), 0, 0.9, 6);
    const chase = [];
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; dummy.position.set(Math.cos(a) * (TR + 0.42), TY + Math.sin(a) * (TR + 0.42), TZ + 0.42);
      dummy.rotation.set(0, 0, a); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); chase.push(dummy.matrix.clone()); }
    instanced(new THREE.BoxGeometry(0.16, 0.07, 0.04), mat(/* glsl */`
      void main(){ float a = atan(vI.y - ${f3(TY)}, vI.x);
        float c = pow(0.5 + 0.5 * sin(a * 4.0 - uTime * 3.0), 8.0);
        gl_FragColor = vec4(mix(DEEP * 0.6, mix(HOT, WHITE, 0.5) * 1.3, max(c, uBeat * 0.8)), 1.0); }`), chase, fg);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry((TR + 3.4) * 2, (TR + 3.4) * 2), mat(/* glsl */`
      void main(){
        vec2 p = (vUv - 0.5) * 2.0 * ${f3(TR + 3.4)}; float r = length(p); float a = atan(p.y, p.x);
        float ring = exp(-abs(r - ${f3(TR + 0.1)}) * 3.5) + 0.6 * exp(-abs(r - ${f3(TR + 0.62)}) * 6.0) + 0.4 * exp(-abs(r - ${f3(TR + 0.85)}) * 8.0);
        float outer = exp(-(r - ${f3(TR)}) * 0.9);
        float rays = pow(0.5 + 0.5 * sin(a * 18.0 + uTime * 0.15), 14.0) + 0.7 * pow(0.5 + 0.5 * sin(a * 7.0 - uTime * 0.11), 18.0);
        rays *= exp(-(r - ${f3(TR)}) * 0.5);
        float I = ring * 0.55 + outer * 0.35 + rays * 0.3;
        I *= smoothstep(${f3(TR - 0.05)}, ${f3(TR + 0.08)}, r) * (1.0 - smoothstep(${f3(TR + 2.8)}, ${f3(TR + 3.4)}, r));
        I *= 1.0 - smoothstep(${f3(TR + 0.9)}, ${f3(TR + 1.5)}, p.y) * ${cfg.screen || cfg.focal === 'vortex' ? '0.85' : '0.3'};
        gl_FragColor = vec4(PINK * I * (0.45 + 0.45 * uInt + 1.0 * uBeat + 0.4 * uSurge), 1.0);
      }`, { additive: true }));
    halo.position.set(0, TY, TZ + 0.5); fg.add(halo);
  }
  if (cfg.screen) out.hud = buildScreen(K, world, !!cfg.deluxe);
  if (cfg.gyro) {   // crimson room: hanging gyroscope rings above the floor
    const c = new THREE.Vector3(0, 6.2, 0.4);   // v8: higher and nearer the entrance, clear of the monitor sightline
    neonTorus(world, 2.0, 0.035, hex.b, c, Math.PI / 2, 1.0).forEach((m) => { m.rotation.set(Math.PI / 2 + 0.35, 0, 0.2); });
    neonTorus(world, 1.6, 0.03, hex.a, c, 0, 1.0).forEach((m) => { m.rotation.set(0.3, 0.9, 0); });
    neonTorus(world, 1.2, 0.025, hex.c, c, 0, 1.0).forEach((m) => { m.rotation.set(-0.5, -0.6, 0.4); });
    const s = glowSprite(hex.spr, 5, 5, 0.35); s.position.copy(c); world.add(s);
  }

  // ---------- pods ----------
  if (!cfg.deluxe) {
    const all = [];
    for (let i = 0; i < 6; i++) { const z = -4.6 + i * 1.65, x = 2.5 + 0.42 * i;   // v10: rows start 0.4 m further in (clear of the monitor bay)
      all.push([i, -x, z], [i, x, z]); }
    const PODS = all.filter(([i]) => cfg.podIdx.includes(i)).map(([, x, z]) => [x, z]);
    out.podSpots = PODS.map(([x, z]) => ({ kind: 'tube', x, z }));   // v11: holo media panels (pods.js)
    const podM = PODS.map(([x, z]) => { dummy.position.set(x, 0, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.lookAt(0, 0, z - 1.2); dummy.updateMatrix(); return dummy.matrix.clone(); });
    const parts = (local) => podM.map((pm) => pm.clone().multiply(local));
    const L = (x, y, z, rx = 0, ry = 0) => mtx(x, y, z, ry, rx);
    const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 36);
    instanced(lathe([[0, 0], [0.8, 0], [0.82, 0.05], [0.8, 0.13], [0.72, 0.15], [0.69, 0.33], [0.63, 0.37], [0.61, 0.44], [0, 0.44]]), metalMat({ DOUBLE: 1, GROOVES: '0.24' }), parts(L(0, 0, 0)), world);
    instanced(lathe([[0, 2.56], [0.61, 2.56], [0.64, 2.64], [0.62, 2.76], [0.48, 2.88], [0.22, 2.95], [0, 2.96]]), metalMat({ DOUBLE: 1, GROOVES: '2.70' }), parts(L(0, 0, 0)), world);
    const glassGeo = new THREE.CapsuleGeometry(0.53, 1.06, 6, 30);
    instanced(glassGeo, mat(/* glsl */`
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(CAM - vW);
        float ndv = abs(dot(N, V)); float fres = pow(1.0 - ndv, 3.0);
        float la = atan(vLN.x, vLN.z); float side = smoothstep(0.0, 0.35, 1.0 - abs(vLN.y));
        float st = exp(-pow((la - 0.85) / 0.07, 2.0)) * 0.9 + exp(-pow((la + 1.05) / 0.08, 2.0)) * 0.45;
        float y = vL.y;
        float etch = aline(y * 1.5 + 0.5, 0.012, fwidth(y * 1.5)) * 0.22 * step(abs(y), 1.0);
        float sy = fract(uTime * 0.11 + vH) * 2.6 - 1.3; float scan = exp(-abs(y - sy) * 12.0);
        vec3 col = PINK * (0.03 + fres * 0.9) + WHITE * st * side * 0.5 + HOT * etch + HOT * scan * 0.45;
        gl_FragColor = vec4(col * (0.75 + 0.35 * uInt + 0.5 * uBeat) * DIM, 1.0);
      }`, { additive: true }), parts(L(0, 1.5, 0)), world).userData.ro = 3;
    instanced(glassGeo, mat(/* glsl */`
      void main(){
        float y = vL.y; float g = 0.2 + 0.8 * (exp(-(y + 1.06) * 1.5) + 0.7 * exp(-(1.06 - y) * 2.2));
        float la = atan(vLN.x, vLN.z); float ribs = pow(0.5 + 0.5 * cos(la * 6.0), 6.0) * smoothstep(0.0, 0.5, 1.0 - abs(vLN.y));
        float br = 0.75 + 0.25 * sin(uTime * 1.3 + vH * 6.28);
        gl_FragColor = vec4(PINK * g * (0.16 + ribs * 0.3) * br * (0.7 + 0.4 * uInt + 0.6 * uBeat), 1.0);
      }`, { additive: true, side: THREE.BackSide }), parts(L(0, 1.5, 0)), world).userData.ro = 1;
    instanced(new THREE.CylinderGeometry(0.14, 0.14, 2.1, 20, 1, true), mat(/* glsl */`
      void main(){ float f = abs(dot(normalize(vN), normalize(CAM - vW)));
        float y = vL.y; float m = exp(-abs(y - (fract(uTime * 0.2 + vH) * 2.2 - 1.1)) * 6.0);
        gl_FragColor = vec4(mix(PINK, WHITE, 0.3) * pow(f, 3.0) * (0.25 + 0.6 * m) * (1.0 - 0.5 * abs(y)) * (0.8 + 0.6 * uBeat), 1.0); }`,
      { additive: true }), parts(L(0, 1.5, 0)), world).userData.ro = 2;
    const emit = mat(/* glsl */`
      void main(){ float r = length(vUv - 0.5) * 2.0;
        float rings = aline(r * 6.0 - uTime * 0.6, 0.05, fwidth(r * 6.0)) * (1.0 - r);
        gl_FragColor = vec4((HOT * exp(-r * 3.0) * 0.9 + PINK * rings * 0.8) * smoothstep(1.0, 0.92, r) * (0.8 + 0.6 * uBeat), 1.0); }`, { additive: true, side: THREE.DoubleSide });
    const discGeo = new THREE.CircleGeometry(0.55, 48);
    instanced(discGeo, emit, parts(L(0, 0.445, 0, -Math.PI / 2)), world).userData.ro = 2;
    instanced(discGeo, emit, parts(L(0, 2.555, 0, Math.PI / 2)), world).userData.ro = 2;
    const ringCore = neonCore(hex.b, 1.15), ringGlow = glowShell(hex.a, 0.6);
    for (const [y, r] of [[0.445, 0.62], [2.555, 0.62], [0.14, 0.81]]) {
      instanced(new THREE.TorusGeometry(r, 0.022, 5, 44), ringCore, parts(L(0, y, 0, Math.PI / 2)), world);
      instanced(new THREE.TorusGeometry(r, 0.11, 7, 44), ringGlow, parts(L(0, y, 0, Math.PI / 2)), world);
    }
    const strutM = [];
    for (const a of [Math.PI, Math.PI - 1.15, Math.PI + 1.15]) strutM.push(...parts(L(Math.sin(a) * 0.63, 1.5, Math.cos(a) * 0.63)));
    instanced(new THREE.CylinderGeometry(0.028, 0.028, 2.15, 8), metalMat({ STRIP_Z: '0.02' }), strutM, world);
    const ledM = []; for (const lx of [-0.12, 0, 0.12]) ledM.push(...parts(L(lx, 0.27, 0.69)));
    instanced(new THREE.SphereGeometry(0.022, 6, 4), mat(/* glsl */`
      void main(){ float h = vH; float b = step(0.45, fract(uTime * (0.4 + h * 1.2) + h));
        vec3 c = h > 0.66 ? WHITE : (h > 0.33 ? HOT : PINK); gl_FragColor = vec4(c * (0.25 + 1.1 * b), 1.0); }`), ledM, world);
    for (const [x, z] of PODS) { const s = glowSprite(hex.spr, 2.6, 3.8, 0.28 * PAL[cfg.pal].DIM); s.position.set(x, 1.55, z); world.add(s); }
    const decalGeo = new THREE.PlaneGeometry(2.6, 2.6); decalGeo.rotateX(-Math.PI / 2);
    instanced(decalGeo, mat(/* glsl */`
      void main(){ float r = length(vUv - 0.5) * 2.6; float pr = fwidth(r);
        float ring = 1.0 - smoothstep(0.012, 0.012 + pr * 1.5, abs(r - 0.98));
        float ring2 = 1.0 - smoothstep(0.006, 0.006 + pr * 1.5, abs(r - 1.12));
        vec3 c = HOT * ring * (0.8 + 0.8 * uBeat) + PINK * ring2 * 0.5 + PINK * exp(-r * r * 2.5) * 0.35;
        gl_FragColor = vec4(c * smoothstep(1.3, 1.2, r), 1.0); }`, { additive: true }), podM.map((m) => m.clone().multiply(L(0, 0.012, 0))), root).renderOrder = 15;
    const cone = new THREE.CylinderGeometry(0.22, 0.95, H - 2.95, 32, 1, true); cone.translate(0, (H - 2.95) / 2 + 2.95, 0);
    const shafts = instanced(cone, mat(/* glsl */`
      void main(){ float f = abs(dot(normalize(vN), normalize(CAM - vW)));
        float h = clamp((vW.y - 2.95) / ${f3(H - 2.95)}, 0.0, 1.0);
        float n = 0.75 + 0.25 * sin(vW.y * 3.0 + uTime * 0.7 + vI.z);
        gl_FragColor = vec4(PINK * pow(f, 2.0) * (1.0 - h) * (1.0 - h) * 0.16 * n * (0.7 + 0.5 * uInt + 0.6 * uBeat), 1.0); }`, { additive: true }), podM, root);
    shafts.renderOrder = 30; haze.push(shafts);
  }

  // ---------- haze cards + particles ----------
  {
    const hz = mat(/* glsl */`
      void main(){ vec2 p = vUv - 0.5; float e = (1.0 - smoothstep(0.15, 0.5, abs(p.x))) * (1.0 - smoothstep(0.0, 0.5, abs(p.y + 0.1)));
        float n = 0.6 + 0.4 * sin(vUv.y * 5.0 + uTime * 0.3 + vUv.x * 3.0) * sin(vUv.x * 4.0 - uTime * 0.2);
        gl_FragColor = vec4(PINK * e * n * 0.07 * (0.6 + 0.6 * uInt + 0.8 * uBeat), 1.0); }`, { additive: true, side: THREE.DoubleSide });
    for (const [x, z, ry, w, h] of (cfg.deluxe ? [] : [[-4.3, -1.4, 0.45, 2.6, 6.5], [4.3, -1.4, -0.45, 2.6, 6.5]])) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), hz); p.position.set(x, h / 2, z); p.rotation.y = ry; p.renderOrder = 31; fx.add(p); haze.push(p);
    }
    out.points = makeParticles(fx, PAL[cfg.pal]);
  }

  if (cfg.extra) cfg.extra({ K, world, root, fx, out, haze, FS, FY, pc });

  // ---------- mirror copy for floor reflections ----------
  world.traverse((o) => { if (o.material && o.material.transparent) o.renderOrder = 20 + (o.userData.ro || 0); });
  if (OPT.mirror) {
    const mirror = world.clone(true); mirror.scale.y = -1;
    const drop = []; mirror.traverse((o) => { if (o.userData.noMirror) drop.push(o); }); drop.forEach((o) => o.removeFromParent());
    mirror.traverse((o) => { if (o.material && o.material.transparent) o.renderOrder = (o.userData.ro || 0); });
    clipMirror(mirror); root.add(mirror); out.mirror = mirror;
  }
  out.focalWorld = root.localToWorld(new THREE.Vector3(0, FY, TZ - 1.5));
  return out;
}

// ---------- particles: rising motes + a stream spiralling into the focal point ----------
export function makeParticles(parent, P, count = OPT.particles, stream = true) {
  const N = count, NS = stream ? Math.floor(N * 0.35) : 0;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N), kind = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = Math.sqrt(Math.random()) * (R - 0.6), a = Math.random() * Math.PI * 2;
    pos.set([r * Math.sin(a), Math.random() * H, r * Math.cos(a)], i * 3); seed[i] = Math.random(); kind[i] = i < NS ? 1 : 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
  const c1 = new THREE.Vector3(...P.PINK).lerp(new THREE.Vector3(1, 1, 1), 0.15), c2 = new THREE.Vector3(...P.WHITE);
  const pm = new THREE.ShaderMaterial({
    uniforms: { ...U, uC1: { value: c1 }, uC2: { value: c2 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPx; uniform float uBeat; attribute float seed; attribute float kind; varying float vA; varying float vK;
      void main(){
        vec3 p = position; float sz;
        if (kind > 0.5) {
          float u = fract(uTime * (0.035 + 0.03 * seed) + seed * 7.0);
          float th = seed * 40.0 + u * 9.0 + uTime * 0.2;
          float rr = mix(0.6 + 2.6 * fract(seed * 13.7), ${f3(TR * 0.75)}, smoothstep(0.0, 0.45, u));
          p = vec3(cos(th) * rr, ${f3(TY)} + sin(th) * rr * 0.85, mix(-0.5, ${f3(TZ - 14)}, u * u));
          vA = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.75, 1.0, u)); sz = 0.035;
        } else {
          p.y = mod(p.y + uTime * (0.05 + 0.12 * seed), ${f3(H)});
          p.x += sin(uTime * 0.3 + seed * 20.0) * 0.25; p.z += cos(uTime * 0.23 + seed * 13.0) * 0.25;
          vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.0 + seed * 40.0)); sz = 0.018 + 0.03 * seed;
        }
        vA *= 0.8 + 0.6 * uBeat; vK = kind;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(sz * uPx * projectionMatrix[1][1] / -mv.z, 1.0, 40.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uC1; uniform vec3 uC2; varying float vA; varying float vK;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
        gl_FragColor = vec4(mix(uC1, uC2, vK * 0.5) * a * vA * 0.9, 1.0); }`,
  });
  const pts = new THREE.Points(g, pm); pts.frustumCulled = false; pts.renderOrder = 32; parent.add(pts); return pts;
}

// ---------- Room 1 focal: hypnotic pink tunnel (+ optional teammate video blend) ----------
function buildTunnel(K, world, tunnelU) {
  const VSX = /* glsl */`
    uniform float uTime; varying vec3 vP;
    vec2 bend(float d){ float k = pow(clamp(d / ${f3(TL)}, 0.0, 1.0), 1.5);
      return vec2(sin(d * 0.045 + uTime * 0.21), cos(d * 0.037 + uTime * 0.17)) * k * 2.6; }
    void main(){
      vP = position; float d = -position.z; vec3 p = position;
      p.xy *= 1.0 + 0.2 * (1.0 - smoothstep(0.0, 1.6, d));
      p.xy += bend(d);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const FSX = K.COMMON + /* glsl */`
    uniform sampler2D uVideo; uniform float uHasVideo; uniform vec2 uVidScale; uniform float uVidMix; uniform float uProc;
    varying vec3 vP;
    float bandM(float v, float w){ float tri = abs(fract(v) - 0.5) * 2.0; return 1.0 - smoothstep(0.42 - w, 0.42 + w, tri); }
    vec3 vid(float d, float a){ float r = 0.5 * ${f3(D0)} / (${f3(D0)} + d);
      vec3 c = texture2D(uVideo, 0.5 + vec2(cos(a), sin(a)) * r * uVidScale).rgb;
      // the clip is magenta (hue ~315); remap by luminance onto the room's pink ramp, keep a little of its own colour
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 pk = mix(DEEP * 0.6, PINK, smoothstep(0.02, 0.45, l)); pk = mix(pk, WHITE, smoothstep(0.55, 1.0, l));
      return mix(pk * 1.15, c, 0.15); }
    void main(){
      float d = -vP.z; float a = atan(vP.y, vP.x); float a2 = atan(-vP.y, -vP.x);
      float ld = log(${f3(D0)} + d);
      float spin = uTime * 0.3;
      float v  = ld * 7.5 + (a  + spin) * 3.0 / 6.2831 - uTime * (0.45 + 0.3 * uInt);
      float vb = ld * 7.5 + (a2 + spin) * 3.0 / 6.2831;
      float w = min(fwidth(v), fwidth(vb));
      float k = clamp(1.25 - w * 2.2, 0.0, 1.0);
      float ww = w * 1.1 + 0.003;
      float mR = bandM(v + 0.04, ww), mG = bandM(v, ww), mB = bandM(v - 0.04, ww);
      float fv = fract(v);
      vec3 bc = mix(HOT, DEEP * 0.8, smoothstep(0.29, 0.71, fv));
      vec3 col = vec3(0.006, 0.001, 0.003) + bc * vec3(mR, mG, 0.7 * mG + 0.3 * mR);
      float tri = abs(fv - 0.5) * 2.0;
      col += WHITE * (1.0 - smoothstep(0.0, ww * 2.0 + 0.01, abs(tri - 0.42))) * 0.6 * step(fv, 0.5);
      float v2 = ld * 6.0 - (a - spin * 0.6) * 3.0 / 6.2831 + uTime * 0.18;
      float v2b = ld * 6.0 - (a2 - spin * 0.6) * 3.0 / 6.2831;
      float w2 = min(fwidth(v2), fwidth(v2b));
      col += VIOL * (1.0 - smoothstep(0.03, 0.03 + w2 * 1.5, abs(fract(v2) - 0.5))) * 0.22 * clamp(1.2 - w2 * 3.0, 0.0, 1.0);
      col = mix(DEEP * 0.3 * (0.6 + 0.4 * uInt), col, k);
      float rc = (d - uTime * 3.2) / 3.2; float pr = fwidth(rc);
      col += mix(HOT, WHITE, 0.4) * aline(rc, 0.01, pr) * 0.5 * (0.5 + 0.5 * sin(a * 6.0 + uTime * 1.3)) * clamp(1.4 - pr * 5.0, 0.0, 1.0);
      float wv = exp(-abs(d - uBeatT * 16.0) * 0.22) * uBeat;
      col *= 1.0 + wv * 2.0 + uSurge * 0.5;
      col *= (0.7 + 0.5 * uInt) * exp(-d * 0.028) * uProc;
      if (uHasVideo > 0.5) col += vid(d, a) * uVidMix * exp(-d * 0.02) * (0.85 + 0.4 * uBeat);
      col += PINK * 0.35 * exp(-d * 1.4) * (0.7 + 0.6 * uBeat);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const geo = new THREE.CylinderGeometry(TR, TR, TL, 64, 100, true); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -TL / 2);
  const t = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...U, ...tunnelU }, vertexShader: VSX, fragmentShader: FSX, side: THREE.BackSide }));
  t.position.set(0, TY, TZ); t.frustumCulled = false; world.add(t);
  const capGeo = new THREE.CircleGeometry(TR, 48); capGeo.translate(0, 0, -TL);
  const cap = new THREE.Mesh(capGeo, new THREE.ShaderMaterial({ uniforms: { ...U, ...tunnelU }, vertexShader: VSX,
    fragmentShader: K.COMMON + `varying vec3 vP; void main(){ float r = length(vP.xy) / ${f3(TR)};
      gl_FragColor = vec4(mix(HOT * (0.5 + 0.8 * uBeat), DEEP * 0.12, smoothstep(0.0, 0.8, r)) * 0.6, 1.0); }` }));
  cap.position.set(0, TY, TZ); cap.frustumCulled = false; world.add(cap);
}

// ---------- Room 2 focal: heart-like crimson vortex funnel with a lub-dub pulse ----------
function buildVortex(K, world) {
  const VL = 26;
  const HB = `float hbeat(){ return exp(-uBeatT * 6.0) + 0.7 * exp(-max(uBeatT - 0.28, 0.0) * 6.0) * step(0.28, uBeatT); }`;
  const VSX = /* glsl */`
    uniform float uTime; uniform float uBeatT; uniform float uBeat; varying vec3 vP;
    ${HB}
    void main(){
      vP = position; float d = -position.z; float k = clamp(d / ${f3(VL)}, 0.0, 1.0);
      float rf = pow(1.0 - k, 0.75) * 0.97 + 0.03;
      rf *= 1.0 + 0.06 * hbeat() * uBeat * (1.0 - k);
      vec3 p = position; p.xy *= rf * (1.0 + 0.18 * (1.0 - smoothstep(0.0, 1.2, d)));
      p.xy += vec2(sin(d * 0.15 + uTime * 0.4), cos(d * 0.12 + uTime * 0.33)) * k * 0.7;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const FSX = K.COMMON + /* glsl */`
    varying vec3 vP;
    ${HB}
    void main(){
      float d = -vP.z; float k = clamp(d / ${f3(VL)}, 0.0, 1.0);
      float a = atan(vP.y, vP.x), a2 = atan(-vP.y, -vP.x);
      float hb = hbeat() * (0.5 + 0.5 * uInt);
      float ld = log(0.5 + d);
      float v  = ld * 4.0 + (a  + uTime * 0.45 + 2.5 * ld) * 5.0 / 6.2831 - uTime * 0.35 - hb * 0.15;
      float vb = ld * 4.0 + (a2 + uTime * 0.45 + 2.5 * ld) * 5.0 / 6.2831;
      float w = min(fwidth(v), fwidth(vb)); float kk = clamp(1.25 - w * 2.2, 0.0, 1.0); float ww = w * 1.1 + 0.003;
      float fv = fract(v); float tri = abs(fv - 0.5) * 2.0;
      float band = 1.0 - smoothstep(0.36 - ww, 0.36 + ww, tri);
      vec3 col = vec3(0.003, 0.0, 0.0) + mix(HOT, DEEP, smoothstep(0.32, 0.68, fv)) * band;
      col += WHITE * 0.45 * (1.0 - smoothstep(0.0, ww * 2.0 + 0.01, abs(tri - 0.36))) * step(fv, 0.5);
      col = mix(PINK * 0.12, col, kk);
      float c = a * 14.0 / 6.2831 + sin(ld * 4.0 - uTime) * 0.2, cb = a2 * 14.0 / 6.2831 + sin(ld * 4.0 - uTime) * 0.2;
      col += PINK * aline(c, 0.015, min(fwidth(c), fwidth(cb))) * 0.25 * (1.0 - k) * kk;
      float wv = exp(-abs((${f3(VL)} - d) - uBeatT * 10.0) * 0.3) * hb;
      col *= (1.0 + wv * 1.5) * mix(1.0, 0.55, k) * (0.75 + 0.4 * uInt);
      col += HOT * exp(-(${f3(VL)} - d) * 0.22) * (0.35 + 1.8 * hb);
      col += PINK * 0.35 * exp(-d * 1.4) * (0.7 + 0.6 * uBeat);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const geo = new THREE.CylinderGeometry(TR, TR, VL, 64, 70, true); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -VL / 2);
  const t = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: VSX, fragmentShader: FSX, side: THREE.BackSide }));
  t.position.set(0, TY, TZ); t.frustumCulled = false; world.add(t);
}

// ---------- Room 1 curved screen + status display ----------
function buildScreen(K, world, deluxe = false) {
  const { mat, neonCore, glowShell, neonTube, metalMat, hex } = K;
  const arcGeometry = (radius, height, half, segs = 48) => {
    const g = new THREE.CylinderGeometry(radius, radius, height, segs, 1, true, Math.PI - half, half * 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); return g;
  };
  const arcCurve = (radius, y, half, n = 64) => { const pts = [];
    for (let i = 0; i <= n; i++) { const t = Math.PI - half + (2 * half * i) / n; pts.push(new THREE.Vector3(radius * Math.sin(t), y, radius * Math.cos(t))); }
    return new THREE.CatmullRomCurve3(pts); };
  const SCR = deluxe ? { ...MON_GEO } : { r: 6.45, y: 6.1, h: 2.3, half: 0.43 };
  const asp = (SCR.r * SCR.half * 2) / SCR.h;
  const hud = canvasTex(2048, Math.round(2048 / asp)), stat = canvasTex(2048, 256);
  const m = mat(/* glsl */`
    uniform sampler2D uHud;
    ${MEDIA_GLSL}
    float sband(float s, float sb, float duty){ float w = min(fwidth(s), fwidth(sb)); float tri = abs(fract(s) - 0.5) * 2.0; return 1.0 - smoothstep(duty - w, duty + w, tri); }
    void main(){
      vec2 p = (vUv - 0.5) * vec2(${f3(asp)}, 1.0);
      vec2 px2 = fwidth(p); float pw = max(px2.x, px2.y);
      vec3 col = vec3(0.0);
      if (uMediaOn < 0.999) {
      float r = length(p) + 1e-4; float a = atan(p.y, p.x); float a2 = atan(-p.y, -p.x);
      col = mix(BASE * 0.9, BASE2 * 0.5, smoothstep(0.0, 1.1, r));
      float lr = log(r);
      float s1 = lr * 2.4 + a * 6.0 / 6.2831 + uTime * 0.55, s1b = lr * 2.4 + a2 * 6.0 / 6.2831;
      float s2 = lr * 2.4 - a * 6.0 / 6.2831 + uTime * 0.32, s2b = lr * 2.4 - a2 * 6.0 / 6.2831;
      float b1 = sband(s1, s1b, 0.35), b2 = sband(s2, s2b, 0.2);
      float mask = smoothstep(0.78, 0.12, r) * smoothstep(0.02, 0.06, r);
      col += mix(DEEP, HOT, 0.5 + 0.5 * sin(lr * 3.0 - uTime)) * b1 * mask * 0.9;
      col += VIOL * b2 * mask * 0.45 + WHITE * b1 * b2 * mask * 0.5;
      float rr = r * 16.0 - uTime * 2.2;
      col += HOT * aline(rr, 0.04, fwidth(rr)) * smoothstep(0.32, 0.05, r) * 0.6;
      col += mix(HOT, WHITE, 0.4) * exp(-r * 11.0) * (0.8 + 1.2 * uBeat);
      col += HOT * exp(-abs(r - uBeatT * 0.55) * 28.0) * uBeat * 1.2;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float y0 = -0.36 + 0.012 * fi + (0.05 - 0.012 * fi) * sin(p.x * (8.0 + fi * 3.0) + uTime * (2.6 - fi * 0.7)) * (0.6 + 0.4 * sin(p.x * 1.7 - uTime * 0.8 + fi)) * (0.7 + 0.9 * uBeat);
        float dl = abs(p.y - y0);
        vec3 lc = i == 0 ? mix(HOT, WHITE, 0.4) : (i == 1 ? PINK : VIOL);
        col += lc * ((1.0 - smoothstep(0.0025, 0.0025 + pw * 1.5, dl)) * 0.9 + exp(-dl * 70.0) * 0.25);
      }
      float ax = abs(p.x); float x0 = ${f3(asp / 2 - 0.46)};
      if (ax > x0 && ax < ${f3(asp / 2 - 0.07)} && p.y > -0.24 && p.y < 0.42) {
        float bx = (ax - x0) / 0.032; float id = floor(bx); float fx = fract(bx);
        float hgt = 0.08 + 0.42 * abs(sin(id * 1.7 + uTime * (1.5 + 0.13 * id) + id * id * 0.3)) * (0.45 + 0.55 * uInt) + uBeat * 0.2;
        float on = (1.0 - smoothstep(0.32, 0.32 + px2.x / 0.032 * 1.5, abs(fx - 0.5))) * step(p.y, -0.24 + hgt);
        float seg = 1.0 - smoothstep(0.38, 0.38 + px2.y * 50.0 * 1.5, abs(fract(p.y * 50.0) - 0.5));
        col += mix(PINK, WHITE, (p.y + 0.24) * 1.4) * on * seg * 0.85;
      }
      col += PINK * (aline(p.x * 8.0, 0.006, px2.x * 8.0) + aline(p.y * 8.0, 0.006, px2.y * 8.0)) * 0.05;
      vec4 h = texture2D(uHud, vUv);
      col = mix(col, h.rgb * 1.25, h.a);
      float sl = vUv.y * 420.0; col *= 1.0 - 0.08 * (0.5 + 0.5 * sin(sl * 6.2831)) * clamp(1.0 - fwidth(sl) * 2.0, 0.0, 1.0);
      vec2 e = min(vUv, 1.0 - vUv);
      col += PINK * exp(-min(e.x * ${f3(asp)}, e.y) * 30.0) * 0.8;
      col *= 1.08 + 0.25 * uBeat + 0.15 * uInt;
      }
      if (uMediaOn > 0.001) { vec3 mv = mediaFrame(vUv, ${f3(asp)}, PINK); vec2 e2 = min(vUv, 1.0 - vUv);
        mv += PINK * exp(-min(e2.x * ${f3(asp)}, e2.y) * 40.0) * 0.5; col = mix(col, mv, uMediaOn); }
      gl_FragColor = vec4(col, 1.0);
    }`, { side: THREE.BackSide, uniforms: { uHud: { value: hud.t }, ...roomMedia[0] } });
  // v9: the screen and its frame hang in a mount group pivoting at the screen centre, so the panel can move it
  const mount = new THREE.Group(); mount.name = 'monitor-mount'; mount.position.set(0, SCR.y, -SCR.r); mount.userData.noMirror = true; world.add(mount);
  const inner = new THREE.Group(); inner.position.set(0, -SCR.y, SCR.r); mount.add(inner);
  const s = new THREE.Mesh(arcGeometry(SCR.r, SCR.h, SCR.half), m); s.position.y = SCR.y; inner.add(s);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(SCR.r + 0.08, SCR.r + 0.08, SCR.h + 0.4, 48, 1, true, Math.PI - SCR.half - 0.03, SCR.half * 2 + 0.06), metalMat({ DOUBLE: 1 }));
  back.position.y = SCR.y; inner.add(back);
  for (const yy of [SCR.y - SCR.h / 2 - 0.06, SCR.y + SCR.h / 2 + 0.06]) neonTube(inner, arcCurve(SCR.r - 0.03, yy, SCR.half + 0.012), hex.b, 1.1);
  for (const sg of [-1, 1]) {
    const t = Math.PI + sg * (SCR.half + 0.012);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, SCR.h + 0.12, 8), neonCore(hex.b, 1.1));
    const pg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, SCR.h + 0.12, 10, 1, true), glowShell(hex.b, 0.55));
    for (const o of [post, pg]) { o.position.set((SCR.r - 0.03) * Math.sin(t), SCR.y, (SCR.r - 0.03) * Math.cos(t)); inner.add(o); }
  }
  const sg = glowSprite(hex.scr, 9.5, 4.6, 0.32); sg.position.set(0, SCR.y, -SCR.r - 0.15); inner.add(sg);
  // standoff brackets back to the wall (fixed to the wall: shown only at the default spot)
  const brackets = [], gap = 6.95 - (SCR.r + 0.08);
  if (gap > 0.2) for (const t of [Math.PI - SCR.half * 0.62, Math.PI + SCR.half * 0.62]) for (const yy of [SCR.y - SCR.h * 0.32, SCR.y + SCR.h * 0.32]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, gap), metalMat());
    const rm = SCR.r + 0.08 + gap / 2; arm.position.set(rm * Math.sin(t), yy, rm * Math.cos(t)); arm.rotation.y = t; arm.userData.noMirror = true; world.add(arm); brackets.push(arm);
  }
  stat.t.colorSpace = THREE.SRGBColorSpace;
  if (!deluxe) { const half = 0.4, r = 6.5, h = 0.6, y = 4.47;
    const sm = new THREE.Mesh(arcGeometry(r, h, half), new THREE.MeshBasicMaterial({ map: stat.t, side: THREE.BackSide })); sm.position.y = y; world.add(sm);
    for (const yy of [y - h / 2 - 0.035, y + h / 2 + 0.035]) neonTube(world, arcCurve(r - 0.03, yy, half), hex.a, 0.9, 0.018); }
  function draw(t, I) {
    { const { g, c } = hud, W = c.width, Hh = c.height;
      g.clearRect(0, 0, W, Hh);
      g.strokeStyle = 'rgba(255,140,190,0.95)'; g.lineWidth = 6; g.shadowColor = '#ff4fa3'; g.shadowBlur = 16;
      const br = (x, y, sx, sy) => { g.beginPath(); g.moveTo(x, y + sy * 70); g.lineTo(x, y); g.lineTo(x + sx * 70, y); g.stroke(); };
      br(40, 40, 1, 1); br(W - 40, 40, -1, 1); br(40, Hh - 40, 1, -1); br(W - 40, Hh - 40, -1, -1);
      g.font = 'bold 46px "Courier New", monospace'; g.textBaseline = 'middle';
      g.fillStyle = '#ffe2ec'; g.textAlign = 'left'; g.fillText('◈ FIELD MONITOR', 80, 92);
      const el = Math.floor(t); g.textAlign = 'right'; g.fillText(`T+${String(Math.floor(el / 60)).padStart(2, '0')}:${String(el % 60).padStart(2, '0')}`, W - 80, 92);
      g.font = 'bold 34px "Courier New", monospace'; g.fillStyle = '#ffa3c9'; g.textAlign = 'left';
      [`PHASE    ${(0.5 + 0.5 * Math.sin(t * 0.7)).toFixed(2)}`, `DEPTH    ${(38 + 6 * Math.sin(t * 0.13)).toFixed(1)}`, 'SYNC     LOCKED', `FIELD    ${(I * 100).toFixed(0)}%`]
        .forEach((s, i) => g.fillText(s, 80, 170 + i * 48));
      g.textAlign = 'right';
      [`HARMONIC  ${3 + (Math.floor(t / 8) % 3)}`, `FLUX  ${(0.6 + 0.35 * Math.abs(Math.sin(t * 0.4))).toFixed(2)}`, 'CORE  STABLE', `PULSE  ${BEAT.toFixed(1)}s`]
        .forEach((s, i) => g.fillText(s, W - 80, 170 + i * 48));
      g.textAlign = 'center'; g.font = 'bold 30px "Courier New", monospace'; g.fillStyle = 'rgba(255,180,210,0.9)'; g.fillText('— SIGNAL —', W / 2, Hh - 70);
      hud.t.needsUpdate = true; }
    if (!deluxe) { const { g, c } = stat, W = c.width, Hh = c.height;
      g.shadowBlur = 0; g.fillStyle = '#0a0007'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = 'rgba(255,60,160,0.22)'; g.lineWidth = 2;
      for (let x = 0; x < W; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); }
      g.shadowColor = '#ff4fa3'; g.shadowBlur = 22; g.textBaseline = 'middle'; g.font = 'bold 64px "Courier New", monospace';
      g.fillStyle = Math.floor(t * 1.5) % 2 ? '#ff5fb5' : '#6a1442'; g.beginPath(); g.arc(78, 70, 18, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffe0f2'; g.textAlign = 'left'; g.fillText('SYSTEM ONLINE', 118, 72);
      const res = Math.min(99, Math.floor(73 + 26 * I));
      g.textAlign = 'right'; g.fillStyle = '#ffa6d8'; g.fillText(`RESONANCE ${res}% AND RISING`, W - 64, 72);
      const segs = 64, sw = (W - 128) / segs;
      for (let i = 0; i < segs; i++) { g.fillStyle = i / segs < res / 100 ? '#ff4fa3' : '#2a0018'; g.fillRect(64 + i * sw, 128, sw - 6, 20); }
      g.font = 'bold 60px "Courier New", monospace'; g.textAlign = 'center'; g.fillStyle = '#ffc8e8'; g.fillText('BREATHE  •  FOCUS  •  DRIFT', W / 2, 205);
      stat.t.needsUpdate = true; }
  }
  return { draw, mesh: s, SCR, mount, brackets, geo: { r: SCR.r, y: SCR.y, h: SCR.h, half: SCR.half } };
}
