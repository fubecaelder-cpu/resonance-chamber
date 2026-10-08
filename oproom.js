// Room 3: stark monochrome op-art chamber. Purely abstract: spirals, moiré, warped checkers, concentric rings.
// Comfort: no flashing. Every pattern moves slowly (< ~1 Hz at any point), and the beat is a smooth 0.25 Hz luminance swell.
import { THREE, U, OPT, BEAT, f3, R, H, TY, TR, TZ, D0, DW, VEIL_R,
  makeKit, instanced, mtx, glowSprite, archCurve, doorDiscardGLSL, makeVeil, DH } from './shared.js';
import { makeParticles } from './chamber.js';
import { PAL } from './shared.js';

const placeAt = (m, p) => { m.position.copy(p); return m; };
export function buildOpRoom(cfg) {
  const root = new THREE.Group(); root.name = cfg.name;
  root.position.set(cfg.center[0], 0, cfg.center[1]); root.rotation.y = cfg.rotY || 0; root.updateMatrixWorld(true);
  const K = makeKit('mono', root.matrixWorld.clone().invert()), { mat, neonCore, glowShell, neonTorus, neonTube, metalMat } = K;
  const world = new THREE.Group(); root.add(world);
  const fx = new THREE.Group(); root.add(fx);
  const doorAngles = cfg.doors.map((d) => d.ang);
  const out = { root, world, fx, haze: [], kit: K, cfg };
  const BR = `float breath(){ return 0.5 - 0.5 * cos(6.2831 * uBeatT / ${f3(BEAT)}); }`;   // smooth swell, no flashing

  // walls: moiré ring fields in the middle band, chevrons low, concentric arcs high
  world.add(placeAt(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 128, 1, true), mat(/* glsl */`
    ${BR}
    void main(){
      float y = vW.y; float ang = atan(vW.x, vW.z);
      ${doorDiscardGLSL(doorAngles)}
      if (vW.z < -4.0 && length(vec2(vW.x, y - ${f3(TY)})) < ${f3(TR + 0.3)}) discard;
      float s = atan(-vW.x, -vW.z) * ${f3(R)};           // arc length, seam hidden above the doorway
      float pxs = length(fwidth(vW.xz)), pxy = fwidth(y);
      float b = breath();
      float v;
      if (y < 1.25) {
        float x = s * 1.6 + abs(fract(y * 0.9) - 0.5) * 2.0 * 0.6;
        v = stripe(x - uTime * 0.05, pxs * 1.6 * 1.2);
      } else if (y < 5.6) {
        vec2 q = vec2(s, y);
        vec2 c1 = vec2(-2.6 + sin(uTime * 0.05) * 1.4, 3.4 + cos(uTime * 0.04) * 0.4);
        vec2 c2 = vec2( 2.6 + cos(uTime * 0.045) * 1.4, 3.6 + sin(uTime * 0.035) * 0.4);
        float r1 = length(q - c1) * 2.2, r2 = length(q - c2) * 2.2;
        float w = max(pxs, pxy) * 2.2;
        float a1 = stripe(r1 - uTime * 0.06, w), a2 = stripe(r2 + uTime * 0.05, w);
        v = a1 + a2 - 2.0 * a1 * a2;                           // XOR → moiré interference
      } else {
        float r = length(vec2(s, y - 9.0)) * 1.8;
        v = stripe(r + uTime * 0.04, max(pxs, pxy) * 1.8);
      }
      float band = (1.0 - smoothstep(0.02, 0.02 + pxy * 1.5, abs(y - 1.25))) + (1.0 - smoothstep(0.02, 0.02 + pxy * 1.5, abs(y - 5.6)));
      float lum = mix(0.035, 0.86, v) * (0.88 + 0.12 * b);
      lum = max(lum, band);
      float dm = length(vec3(vW.x, y, vW.z) - vec3(0.0, ${f3(TY)}, ${f3(TZ)}));
      lum = mix(lum, 1.0, exp(-(dm - ${f3(TR)}) * 3.0) * 0.25);
      gl_FragColor = vec4(vec3(lum), 1.0);
    }`, { side: THREE.BackSide })), new THREE.Vector3(0, H / 2, 0)));
  // black pilaster hiding the pattern seam above the doorway
  world.add(placeAt(new THREE.Mesh(new THREE.BoxGeometry(0.6, H - DH - DW - 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0x050505 })),
    new THREE.Vector3(0, (H + DH + DW + 0.3) / 2, R - 0.12)));

  // floor: warped spiral checkerboard
  {
    const m = mat(/* glsl */`
      ${BR}
      void main(){
        vec2 p = vW.xz; float r = length(p) + 1e-3;
        float a = atan(p.x, p.y), a2 = atan(-p.x, -p.y);
        float lr = log(r + 0.35);
        float u = lr * 4.2 - uTime * 0.11;
        float v = (a + lr * 1.6) * 12.0 / 6.2831 + uTime * 0.02, vb = (a2 + lr * 1.6) * 12.0 / 6.2831;
        float wu = fwidth(u), wv = min(fwidth(v), fwidth(vb));
        float cu = stripe(u, wu), cv = stripe(v, wv);
        float c = cu + cv - 2.0 * cu * cv;
        float lum = mix(0.03, 0.84, c) * (0.9 + 0.1 * breath());
        lum *= 1.0 - smoothstep(5.8, ${f3(R)}, r) * 0.5;
        gl_FragColor = vec4(vec3(lum), 1.0);
      }`);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(R + 0.05, 96), m); fl.rotation.x = -Math.PI / 2; root.add(fl); out.floor = fl;
  }
  // ceiling: concentric rings xor radial rays
  {
    const m = mat(/* glsl */`
      void main(){
        vec2 p = vW.xz; float r = length(p) + 1e-3; float a = atan(p.x, p.y), a2 = atan(-p.x, -p.y);
        float u = r * 1.4 + uTime * 0.05, v = a * 24.0 / 6.2831, vb = a2 * 24.0 / 6.2831;
        float cu = stripe(u, fwidth(u)), cv = stripe(v, min(fwidth(v), fwidth(vb)));
        float c = mix(cu, cu + cv - 2.0 * cu * cv, smoothstep(1.0, 2.5, r));
        gl_FragColor = vec4(vec3(mix(0.02, 0.7, c) * (1.0 - smoothstep(4.0, ${f3(R)}, r) * 0.6)), 1.0);
      }`);
    const c = new THREE.Mesh(new THREE.CircleGeometry(R + 0.05, 96), m); c.rotation.x = Math.PI / 2; c.position.y = H; world.add(c);
    neonTorus(world, 2.0, 0.04, 0xffffff, new THREE.Vector3(0, H - 0.05, 0), Math.PI / 2, 1.0);
  }
  // focal: checkered spiral tunnel receding into the wall
  {
    const VSX = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const FSX = K.COMMON + /* glsl */`
      varying vec3 vP;
      ${BR}
      void main(){
        float d = -vP.z; float a = atan(vP.y, vP.x), a2 = atan(-vP.y, -vP.x);
        float ld = log(${f3(D0)} + d);
        float u = ld * 9.0 - uTime * 0.28;
        float v = (a + ld * 3.0 + uTime * 0.05) * 16.0 / 6.2831, vb = (a2 + ld * 3.0 + uTime * 0.05) * 16.0 / 6.2831;
        float cu = stripe(u, fwidth(u)), cv = stripe(v, min(fwidth(v), fwidth(vb)));
        float c = cu + cv - 2.0 * cu * cv;
        float lum = mix(0.02, 0.95, c) * exp(-d * 0.035) * (0.88 + 0.12 * breath());
        gl_FragColor = vec4(vec3(lum), 1.0);
      }`;
    const geo = new THREE.CylinderGeometry(TR, TR, 50, 64, 40, true); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -25);
    const t = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: VSX, fragmentShader: FSX, side: THREE.BackSide }));
    t.position.set(0, TY, TZ); t.frustumCulled = false; world.add(t);
    const pc = new THREE.Vector3(0, TY, TZ + 0.06);
    world.add(placeAt(new THREE.Mesh(new THREE.TorusGeometry(TR + 0.42, 0.34, 12, 96), new THREE.MeshBasicMaterial({ color: 0x060606 })), pc));
    neonTorus(world, TR + 0.1, 0.05, 0xffffff, pc, 0, 1.1, 4);
    neonTorus(world, TR + 0.75, 0.03, 0xffffff, pc.clone().setZ(TZ + 0.2), 0, 0.9, 4);
    // big rotating spiral disc above the tunnel (slow: 4 arms × 0.02 rev/s)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 96), mat(/* glsl */`
      ${BR}
      void main(){ vec2 p = (vUv - 0.5) * 2.0; float r = length(p) + 1e-3; float a = atan(p.y, p.x), a2 = atan(-p.y, -p.x);
        float v = r * 6.0 + (a - uTime * 0.12) * 4.0 / 6.2831, vb = r * 6.0 + (a2 - uTime * 0.12) * 4.0 / 6.2831;
        float s = stripe(v, min(fwidth(v), fwidth(vb)));
        gl_FragColor = vec4(vec3(mix(0.03, 0.95, s) * (0.9 + 0.1 * breath()) * smoothstep(1.0, 0.985, r) + (1.0 - smoothstep(0.0, 0.02, abs(r - 0.99)))), 1.0); }`));
    disc.position.set(0, 5.4, -R + 0.25); world.add(disc);
    neonTorus(world, 1.56, 0.03, 0xffffff, new THREE.Vector3(0, 5.4, -R + 0.27), 0, 1.0, 4);
  }
  // sculptures: striped monoliths + floating op-art rings and spheres
  {
    const mono = [];
    for (const a of [0.95, 1.6, 2.25, -0.95, -1.6, -2.25]) mono.push(mtx(Math.sin(a) * 5.2, 1.7, Math.cos(a) * 5.2, a + Math.PI));
    instanced(new THREE.BoxGeometry(0.9, 3.4, 0.28), mat(/* glsl */`
      ${BR}
      void main(){ float x = vL.x * 3.0 + vL.y * 1.2 + sin(vL.y * 2.0 + uTime * 0.15 + vH * 6.0) * 0.35;
        float s = stripe(x * 2.0, fwidth(x * 2.0));
        float e = max(1.0 - smoothstep(0.0, 0.02, 0.45 - abs(vL.x)), 1.0 - smoothstep(0.0, 0.02, 1.7 - abs(vL.y)));
        gl_FragColor = vec4(vec3(max(mix(0.03, 0.9, s) * (0.88 + 0.12 * breath()), e)), 1.0); }`), mono, world);
    const ringMat = mat(/* glsl */`
      void main(){ float a = atan(vL.y, vL.x), a2 = atan(-vL.y, -vL.x); float u = a * 24.0 / 6.2831 + uTime * 0.04, ub = a2 * 24.0 / 6.2831;
        gl_FragColor = vec4(vec3(mix(0.04, 0.95, stripe(u, min(fwidth(u), fwidth(ub))))), 1.0); }`);
    for (const [r, y, rx, rz] of [[2.2, 5.0, 1.2, 0.2], [1.6, 4.6, 0.6, -0.5], [1.0, 4.3, 1.5, 0.8]]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 12, 96), ringMat); t.position.set(0, y, 0.3); t.rotation.set(rx, 0, rz); world.add(t);
    }
    const sphMat = mat(/* glsl */`
      void main(){ vec3 n = normalize(vLN); float u = n.y * 5.0 + atan(n.x, n.z) * 2.0 / 6.2831 + uTime * 0.03;
        float ub = n.y * 5.0 + atan(-n.x, -n.z) * 2.0 / 6.2831;
        gl_FragColor = vec4(vec3(mix(0.03, 0.95, stripe(u, min(fwidth(u), fwidth(ub))))), 1.0); }`);
    for (const [x, y, z, r] of [[-3.0, 2.8, -2.0, 0.45], [3.0, 3.2, -2.4, 0.55], [-2.6, 3.6, 2.6, 0.35], [2.7, 2.6, 2.2, 0.4]]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), sphMat); s.position.set(x, y, z); world.add(s);
    }
  }
  // doorway frame + veil
  for (const d of cfg.doors) {
    const g = new THREE.Group(); g.position.set(Math.sin(d.ang) * VEIL_R, 0, Math.cos(d.ang) * VEIL_R); g.rotation.y = d.ang + Math.PI;
    g.add(makeVeil(d.style, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(archCurve(0.05, DW + 0.12), 64, 0.13, 8), new THREE.MeshBasicMaterial({ color: 0x080808 })));
    neonTube(g, archCurve(0.17, DW + 0.03), d.style === 1 ? 0xff3048 : 0xffffff, 1.1, 0.03, 64, 4);
    world.add(g);
  }
  out.points = makeParticles(fx, PAL.mono, Math.floor(OPT.particles * 0.35), false);
  out.focalWorld = root.localToWorld(new THREE.Vector3(0, TY, TZ - 1.5));
  return out;
}
