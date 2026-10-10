// Connecting corridor between two rooms. Colours blend from room A's palette to room B's along its length.
// Layered neon arches, glossy reflective floor, light flowing along the walls toward the next room, drifting particles.
// drain=true (crimson → monochrome): colour drains out and the surfaces turn into op-art stripes and checkers as you walk.
// Ends are iris veils (with a solid end wall) that open as you approach.
import { THREE, U, OPT, LOW, f3, PAL, makeKit, instanced, mtx, archCurve, makeVeil, clipMirror } from './shared.js?v=14';

export function buildCorridor(cfg) {
  const { L } = cfg, W = 2.6, HH = 3.6, HW = W / 2, drain = !!cfg.drain;
  const root = new THREE.Group(); root.name = cfg.name;
  root.position.set(cfg.start[0], 0, cfg.start[1]); root.rotation.y = cfg.rotY !== undefined ? cfg.rotY : (cfg.dir === 'x' ? Math.PI / 2 : 0); root.updateMatrixWorld(true);
  const K = makeKit(cfg.palA, root.matrixWorld.clone().invert());
  const world = new THREE.Group(); root.add(world);      // mirrored in the floor
  const fx = new THREE.Group(); root.add(fx);
  const A = PAL[cfg.palA], B = PAL[cfg.palB];
  const v = (a) => ({ value: new THREE.Vector3(...a) });
  const uni = { uA: v(A.PINK), uA2: v(A.HOT), uAW: v(A.WHITE), uB: v(B.PINK), uB2: v(B.HOT), uBW: v(B.WHITE), uBA: v(A.BASE), uBB: v(B.BASE) };
  const defines = drain ? (cfg.monoAtStart ? { DRAIN: 1, DRAIN_REV: 1 } : { DRAIN: 1 }) : {};
  const HEAD = /* glsl */`
    uniform vec3 uA; uniform vec3 uA2; uniform vec3 uAW; uniform vec3 uB; uniform vec3 uB2; uniform vec3 uBW; uniform vec3 uBA; uniform vec3 uBB;
    float tz(float z){ return smoothstep(0.04, 0.96, z / ${f3(L)}); }
    float dz(float z){   // 0 at the colourful end, 1 at the monochrome end
      #ifdef DRAIN_REV
        return 1.0 - z / ${f3(L)};
      #else
        return z / ${f3(L)};
      #endif
    }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 drainC(vec3 c, float z){
      #ifdef DRAIN
        float k = smoothstep(0.12, 0.8, dz(z)); return mix(c, vec3(luma(c)) * 1.35, k);
      #else
        return c;
      #endif
    }
    float monoK(float z, float y){
      #ifdef DRAIN
        return smoothstep(0.4, 0.86, dz(z) + 0.06 * sin(y * 2.3 + uTime * 0.2));
      #else
        return 0.0;
      #endif
    }
    float breath(){ return 0.5 - 0.5 * cos(6.2831 * uBeatT / 4.0); }
  `;
  const M = (fs, o = {}) => K.mat(HEAD + fs, { uniforms: uni, defines, ...o });

  // ---------- walls ----------
  const wallM = M(/* glsl */`
    void main(){
      float y = abs(vW.y), z = vW.z; float t = tz(z);
      vec3 acc = mix(uA, uB, t), acc2 = mix(uA2, uB2, t), wh = mix(uAW, uBW, t), base = mix(uBA, uBB, t);
      float pz = fwidth(z), py = fwidth(y);
      vec2 cell = vec2(z / 0.52, y / 0.9); vec2 id = floor(cell), f = fract(cell);
      float h = hash12(id + (vW.x > 0.0 ? 17.0 : 3.0));
      vec3 surf = base * (0.7 + 0.6 * h);
      float sx = 1.0 - smoothstep(0.02, 0.02 + pz / 0.52 * 1.5, min(f.x, 1.0 - f.x));
      float sy = 1.0 - smoothstep(0.02, 0.02 + py / 0.9 * 1.5, min(f.y, 1.0 - f.y));
      surf *= 1.0 - max(sx, sy) * 0.8;
      vec2 dc = (f - 0.5) * vec2(0.52, 0.9); float dd = abs(dc.x) * 1.7 + abs(dc.y);
      vec3 glow = acc * (1.0 - smoothstep(0.012, 0.012 + max(pz, py) * 2.0, abs(dd - 0.12))) * step(0.55, h) * 0.45;
      float rib = aline(z / 1.03 - 0.03, 0.012, pz / 1.03);
      float flow = pow(0.5 + 0.5 * sin(z * 2.2 - uTime * 3.0), 6.0);
      glow += acc * rib * (0.22 + 0.6 * flow);
      for (int k = 0; k < 3; k++) {
        float fk = float(k); float yk = k == 0 ? 0.62 : (k == 1 ? 1.55 : 2.85);
        float ln = 1.0 - smoothstep(0.014, 0.014 + py * 1.5, abs(y - yk));
        float hl = exp(-abs(y - yk) * 14.0);
        float dash = pow(0.5 + 0.5 * sin((z - uTime * (1.4 + 0.5 * fk)) * (2.4 - 0.5 * fk) + fk * 2.0), 10.0);
        glow += acc2 * (ln * (0.35 + 1.8 * dash) + hl * (0.06 + 0.3 * dash)) * (0.7 + 0.4 * uInt);
      }
      float cz = mod(uTime * 2.6, ${f3(L + 3)}) - 1.5;
      glow += wh * exp(-abs(z - cz) * 2.5) * exp(-abs(y - 1.55) * 3.0) * 0.45;
      glow += acc * exp(-abs(z - uBeatT * 3.5) * 1.6) * uBeat * 0.35;
      glow += acc2 * (1.0 - smoothstep(0.03, 0.03 + py * 1.5, abs(y - 0.12))) * (0.9 + 0.6 * uBeat);
      glow += acc * 0.08 * exp(-y * 1.5);
      vec3 col;
      #ifdef DRAIN
        float mk = monoK(z, y);
        float sv = z * 2.1 + y * 1.1 + sin(y * 1.6 + z * 0.8 + uTime * 0.12) * 0.35;
        float st = stripe(sv, fwidth(sv));
        vec3 mono = vec3(mix(0.03, 0.82, st)) * (0.88 + 0.12 * breath());
        col = mix(drainC(surf, z), mono, mk * 0.94) + drainC(glow, z) * (1.0 - 0.45 * mk);
      #else
        col = surf + glow;
      #endif
      gl_FragColor = vec4(col, 1.0);
    }`);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(L, HH), wallM);
    w.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; w.position.set(s * HW, HH / 2, L / 2); world.add(w);
  }
  // ---------- ceiling ----------
  {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(W, L), M(/* glsl */`
      void main(){
        float z = vW.z, x = vW.x, ax = abs(x); float t = tz(z);
        vec3 acc = mix(uA, uB, t), acc2 = mix(uA2, uB2, t), base = mix(uBA, uBB, t);
        float pz = fwidth(z), px = fwidth(x);
        vec3 surf = base * 0.7 * (1.0 - 0.7 * aline(z / 0.26, 0.06, pz / 0.26));
        float flow = pow(0.5 + 0.5 * sin(z * 2.0 - uTime * 3.0), 6.0);
        vec3 glow = acc2 * (1.0 - smoothstep(0.03, 0.03 + px * 1.5, ax)) * (0.35 + 0.6 * flow);
        glow += acc * (1.0 - smoothstep(0.012, 0.012 + px * 1.5, abs(ax - 0.75))) * 0.45;
        vec3 col;
        #ifdef DRAIN
          float mk = monoK(z, 3.6);
          float u = x * 2.0 + sin(z * 1.4 + uTime * 0.1) * 0.2, w = z * 2.0 - uTime * 0.08;
          float cu = stripe(u, fwidth(u)), cw = stripe(w, fwidth(w));
          vec3 mono = vec3(mix(0.02, 0.7, cu + cw - 2.0 * cu * cw));
          col = mix(drainC(surf, z), mono, mk) + drainC(glow, z) * (1.0 - 0.5 * mk);
        #else
          col = surf + glow;
        #endif
        gl_FragColor = vec4(col, 1.0);
      }`));
    c.rotation.x = Math.PI / 2; c.position.set(0, HH, L / 2); c.userData.noMirror = true; world.add(c);
  }
  // ---------- glossy floor: patterned inlays that blend between the two rooms' styles, with flowing arrows on top ----------
  // pink: interlocking-circle petal inlay; crimson: pulsing veins + lub-dub ripples; monochrome: warped op-art checker (DRAIN)
  let floor;
  {
    const oh = (s) => new THREE.Vector3(s === 0 ? 1 : 0, s === 1 ? 1 : 0, s === 2 ? 1 : 0);
    const cz = cfg.styleB === 1 ? L + 1.2 : -1.2;   // heartbeat ripples spread out from the crimson end
    const m = K.mat(HEAD + /* glsl */`
      uniform float uMirror; uniform vec3 uWA; uniform vec3 uWB;
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y); }
      float ln(float d, float hw){ return 1.0 - smoothstep(hw, hw + fwidth(d) * 1.5, abs(d)); }
      void main(){
        vec2 p = vW.xz; float z = p.y, ax = abs(p.x); float t = tz(z);
        vec3 w = mix(uWA, uWB, smoothstep(0.12, 0.88, z / ${f3(L)}));
        vec3 acc = mix(uA, uB, t), acc2 = mix(uA2, uB2, t), base = mix(uBA, uBB, t);
        vec2 px = fwidth(p);
        // polished slabs, staggered
        vec2 sc = vec2(p.x / 0.65, z / 1.3); sc.x += 0.5 * step(0.5, fract(sc.y * 0.5));
        vec2 gf = fract(sc);
        float seam = max(1.0 - smoothstep(0.006, 0.006 + px.x / 0.65 * 1.5, min(gf.x, 1.0 - gf.x)), 1.0 - smoothstep(0.004, 0.004 + px.y / 1.3 * 1.5, min(gf.y, 1.0 - gf.y)));
        vec3 surf = base * (0.28 + 0.06 * hash12(floor(sc))) + acc * seam * 0.08;
        float run = 1.0 - smoothstep(0.76, 0.8, ax);
        vec3 glow = vec3(0.0);
        // pink: interlocking circles -> four-petal flowers
        { vec2 c = vec2(p.x, z) / 0.42; vec2 f1 = fract(c) - 0.5, f2 = fract(c + 0.5) - 0.5;
          float l1 = length(f1), l2 = length(f2);
          float d = min(abs(l1 - 0.5), abs(l2 - 0.5)) * 0.42;
          float petal = (1.0 - smoothstep(0.47, 0.5, l1)) * (1.0 - smoothstep(0.47, 0.5, l2));
          float dot0 = 1.0 - smoothstep(0.035, 0.035 + fwidth(l1) * 1.5, l1);
          glow += w.x * run * (acc * ln(d, 0.0035) * 0.5 + acc2 * petal * 0.07 * (0.7 + 0.6 * uBeat) + acc2 * dot0 * 0.5); }
        // crimson: branching veins that pulse with the beat + lub-dub ripples
        { float n = vn(p * 2.6 + vec2(0.0, uTime * 0.04)) * 0.65 + vn(p * 6.3 - 3.1) * 0.35;
          float vein = ln(n - 0.5, 0.011);
          float dc = length(vec2(p.x * 1.2, z - ${f3(cz)}));
          float r1 = exp(-abs(dc - 1.0 - uBeatT * 2.6) * 7.0), r2 = exp(-abs(dc - 1.0 - max(uBeatT - 0.28, 0.0) * 2.6) * 7.0);
          float pulse = exp(-abs(dc - 1.0 - uBeatT * 2.6) * 1.2);
          glow += w.y * (acc * vein * (0.16 + 0.5 * uBeat * pulse + 0.15 * uInt) + acc2 * (r1 + 0.7 * r2) * uBeat * 0.45); }
        // border inlays: double rail with diamond beads
        float rail = ln(ax - 0.95, 0.012) * (0.75 + 0.5 * uBeat) + ln(ax - 1.13, 0.007) * 0.45;
        float dq = abs(ax - 1.04) + abs((fract(z / 0.5) - 0.5) * 0.5);
        float bead = 1.0 - smoothstep(0.04, 0.04 + fwidth(dq) * 1.5, dq);
        glow += acc2 * rail + acc * bead * (0.35 + 0.35 * uInt);
        glow += acc2 * exp(-abs(z - uBeatT * 3.5) * 1.6) * uBeat * 0.35 * step(ax, 1.0);
        glow += acc * 0.08 * exp(-ax * 2.0);
        // flowing arrows toward the far doorway (core + soft halo)
        float cv = (z + ax * 0.8) * 1.4 - uTime * 1.1;
        float fc = fract(cv), fd = min(fc, 1.0 - fc), inA = 1.0 - smoothstep(0.56, 0.6, ax);
        float chev = (1.0 - smoothstep(0.075, 0.075 + fwidth(cv) * 1.5, fd)) * inA;
        float chevO = (1.0 - smoothstep(0.14, 0.14 + fwidth(cv) * 1.5, fd)) * inA;
        float halo = exp(-fd * 9.0) * inA;
        vec3 arrows = mix(acc, acc2, 0.6) * chev * (0.75 + 0.35 * uInt + 0.3 * uBeat) + acc * halo * 0.18;
        vec3 col; float refl = 1.0;
        #ifdef DRAIN
          float mk = monoK(z, 0.0);
          float r = length(vec2(p.x, z - ${f3(L / 2)})) + 0.5;
          float u = p.x * 1.6 + sin(z * 1.3 + uTime * 0.15) * 0.25 + 0.12 * sin(r * 2.0 - uTime * 0.1), ww = z * 1.6 + 0.1 * sin(p.x * 3.0 + z);
          float cu = stripe(u, fwidth(u)), cw = stripe(ww, fwidth(ww));
          vec3 mono = vec3(mix(0.03, 0.78, cu + cw - 2.0 * cu * cw)) * (0.9 + 0.1 * breath());
          col = mix(drainC(surf, z), mono, mk) + drainC(glow, z) * (1.0 - 0.6 * mk);
          col = mix(col, vec3(0.015), mk * (chevO - chev * 0.0) * 0.85);              // dark keyline so the arrows read on the checker
          col += mix(drainC(arrows, z), vec3(0.95) * chev + vec3(0.12) * halo, mk);
          refl = 1.0 - 0.85 * mk;
        #else
          col = surf + glow + arrows;
        #endif
        vec3 V = normalize(CAM - vW); float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.5);
        gl_FragColor = vec4(col, mix(0.3, 0.75, fr) * uMirror * refl);
      }`, { uniforms: { ...uni, uWA: { value: oh(cfg.styleA) }, uWB: { value: oh(cfg.styleB) } }, defines });
    m.transparent = true; m.depthWrite = true;
    m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.SrcAlphaFactor; m.blendEquation = THREE.AddEquation;
    floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), m); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, L / 2); floor.renderOrder = 10; root.add(floor);
  }
  // ---------- layered neon arches ----------
  {
    const archs = []; for (let z = 0.55; z < L - 0.3; z += 1.03) archs.push(mtx(0, 0, z));
    const ARCH = `
      vec3 archCol(float z, float along, float k){
        float t = tz(z); vec3 c = mix(uA, uB, t);
        float br = 0.75 + 1.1 * pow(0.5 + 0.5 * sin(z * 1.8 - uTime * 3.0), 4.0) + 0.4 * uBeat;
        vec3 col = mix(c, vec3(1.0), 0.06) * br * k;
        #ifdef DRAIN
          float mk = smoothstep(0.35, 0.85, dz(z));
          float d = stripe(along * 34.0 - uTime * 0.15, fwidth(along * 34.0));
          col = mix(drainC(col, z), vec3(mix(0.06, 1.0, d)) * (0.9 + 0.2 * uBeat), mk);
        #endif
        return col;
      }`;
    instanced(new THREE.TubeGeometry(archCurve(0, 1.24, 2.3, 32), 48, 0.075, 8), M(/* glsl */`
      void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); float fr = pow(1.0 - abs(dot(N, V)), 2.0);
        float t = tz(vI.z); vec3 base = mix(uBA, uBB, t) * 1.6;
        vec3 col = base + drainC(mix(uA, uB, t), vI.z) * fr * 0.35 + drainC(mix(uA2, uB2, t), vI.z) * (1.0 - smoothstep(0.0, 0.08, abs(N.z))) * 0.12;
        gl_FragColor = vec4(col, 1.0); }`), archs, world);
    instanced(new THREE.TubeGeometry(archCurve(0.085, 1.17, 2.28, 32), 48, 0.03, 6), M(ARCH + `void main(){ gl_FragColor = vec4(archCol(vI.z, vUv.x, 1.0), 1.0); }`), archs, world);
    instanced(new THREE.TubeGeometry(archCurve(-0.085, 1.06, 2.2, 32), 48, 0.017, 5), M(ARCH + `void main(){ gl_FragColor = vec4(mix(archCol(vI.z + 0.4, vUv.x + 0.5, 0.9), vec3(1.0), 0.25), 1.0); }`), archs, world);
    const g = instanced(new THREE.TubeGeometry(archCurve(0.085, 1.17, 2.28, 32), 48, 0.13, 8), M(ARCH + `void main(){ float f = abs(dot(normalize(vN), normalize(CAM - vW)));
        gl_FragColor = vec4(archCol(vI.z, vUv.x, 0.4) * pow(f, 2.2) * (0.7 + 0.4 * uBeat), 1.0); }`, { additive: true }), archs, world);
    g.userData.ro = 2;
  }
  // ---------- end veils (iris doors) ----------
  const va = makeVeil(cfg.styleA, 1); va.position.z = 0.02; world.add(va);
  const vb = makeVeil(cfg.styleB, 1); vb.position.z = L - 0.02; vb.rotation.y = Math.PI; world.add(vb);
  // ---------- particles drifting toward the next room ----------
  let points;
  {
    const N = Math.floor(OPT.particles * (LOW ? 0.18 : 0.26) * Math.min(2, L / 6.24));
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([(Math.random() * 2 - 1) * 1.1, 0.15 + Math.random() * 3.2, Math.random() * L], i * 3); seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const pm = new THREE.ShaderMaterial({ uniforms: { ...U, ...uni }, defines, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uPx; uniform float uBeat; attribute float seed; varying float vA; varying float vZ;
        void main(){ vec3 p = position;
          p.z = mod(p.z + uTime * (0.35 + 0.45 * seed), ${f3(L)});
          p.x += sin(uTime * 0.6 + seed * 30.0) * 0.12; p.y += sin(uTime * 0.4 + seed * 17.0) * 0.15;
          vA = smoothstep(0.0, 0.5, p.z) * (1.0 - smoothstep(${f3(L - 0.7)}, ${f3(L)}, p.z)) * (0.6 + 0.6 * uBeat); vZ = p.z;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((0.016 + 0.03 * seed) * uPx * projectionMatrix[1][1] / -mv.z, 1.0, 36.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uBeatT; uniform vec3 uA2; uniform vec3 uB2; uniform vec3 uAW; uniform vec3 uBW; varying float vA; varying float vZ;
        ${HEAD.replace(/uniform vec3[^\n]*\n/, '').replace(/float breath\(\)[^\n]*\n/, '')}
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
          float t = tz(vZ); vec3 c = mix(mix(uA2, uB2, t), mix(uAW, uBW, t), 0.3);
          gl_FragColor = vec4(drainC(c, vZ) * a * vA * 0.9, 1.0); }` });
    points = new THREE.Points(g, pm); points.frustumCulled = false; points.renderOrder = 32; fx.add(points);
  }
  // ---------- mirror copy for the glossy floor ----------
  let mirror = null;
  world.traverse((o) => { if (o.material && o.material.transparent) o.renderOrder = 20 + (o.userData.ro || 0); });
  if (OPT.mirror) {
    mirror = world.clone(true); mirror.scale.y = -1;
    const drop = []; mirror.traverse((o) => { if (o.userData.noMirror) drop.push(o); }); drop.forEach((o) => o.removeFromParent());
    mirror.traverse((o) => { if (o.material && o.material.transparent) o.renderOrder = o.userData.ro || 0; });
    clipMirror(mirror); root.add(mirror);
  }
  return { root, world, fx, floor, mirror, points, haze: [], cfg };
}
