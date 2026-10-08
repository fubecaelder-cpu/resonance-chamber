// Room 1 v4: the pink chamber, redesigned. True pink palette, grand layered portal, crown chandelier with bead strands,
// fan-vault ceiling ribs, arcade + rose-window walls, a balcony band, upgraded empty glowing pods, soft haze and bokeh.
// Built on top of buildChamber (walls / floor / doorway / tunnel / screen / mirror) through its deluxe hooks.
import { THREE, U, OPT, f3, R, H, TR, TZ, LOW, dummy, mtx, instanced, glowSprite, ringCurves } from './shared.js';

const FS = 1.25, FY = 2.25, RM = TR * FS;           // portal scale / centre height / mouth radius (must match chamber.js deluxe)
const PI = Math.PI, BAYS = 28, BAYW = (2 * PI * R) / BAYS;

const wallGLSL = /* glsl */`
  {
    float pxm = max(length(fwidth(vW.xz)), fwidth(y));
    // arcade: a rounded neon arch + recessed niche in every bay between pilasters, rose window above
    float u = ang * ${f3(BAYS / (2 * PI))};
    float s = (fract(u) - 0.5) * ${f3(BAYW)};
    float bayA = (floor(u) + 0.5) / ${f3(BAYS / (2 * PI))};
    float keep = step(0.3, abs(atan(sin(bayA), cos(bayA)))) * step(0.3, abs(atan(sin(bayA - 0.7854), cos(bayA - 0.7854)))) * step(0.72, abs(atan(sin(bayA - 3.14159), cos(bayA - 3.14159))));
    float aw = 0.5, ay = 3.25;
    float dA = y < ay ? abs(abs(s) - aw) : abs(length(vec2(s, y - ay)) - aw);
    float inA = (y < ay ? step(abs(s), aw) : step(length(vec2(s, y - ay)), aw)) * step(0.55, y);
    dA = y < 0.55 ? 1.0 : dA;
    float lineA = 1.0 - smoothstep(0.011, 0.011 + pxm * 1.5, dA);
    float flowA = pow(0.5 + 0.5 * sin(y * 1.8 - uTime * 1.1 + bayA * 5.0), 3.0);
    col = mix(col, col * 0.4 + DEEP * 0.05, inA * keep);
    col += mix(PINK, HOT, 0.5) * inA * keep * (0.05 + 0.16 * exp(-(y - 0.55) * 0.9)) * (0.7 + 0.5 * uBeat);
    float rib = aline(s / 0.125, 0.04, pxm / 0.125) * inA;
    col += DEEP * rib * keep * 0.5;
    col += mix(HOT, WHITE, 0.3) * keep * (lineA * (0.5 + 0.7 * flowA * (0.5 + 0.5 * uInt) + 0.6 * uBeat) + exp(-dA * 22.0) * 0.16);
    vec2 rw = vec2(s, y - 5.4); float rr = length(rw); float ra = atan(rw.y, rw.x);
    float rose = 0.27 + 0.07 * cos(ra * 8.0 + uTime * 0.15);
    float dR = min(abs(rr - 0.4), abs(rr - rose));
    float roseL = (1.0 - smoothstep(0.009, 0.009 + pxm * 1.5, dR)) * step(rr, 0.46);
    col += mix(PINK, WHITE, 0.25) * keep * (roseL * (0.45 + 0.5 * uBeat) + exp(-rr * 5.0) * 0.16 * (0.6 + 0.6 * uBeat));
    // sunburst rays + beat ripples radiating from the portal across the front wall
    if (vW.z < -1.5) {
      vec2 q = vec2(vW.x, y - ${f3(FY)}); float qr = length(q); float qa = atan(q.y, q.x);
      float fall = smoothstep(${f3(RM + 1.75)}, ${f3(RM + 2.25)}, qr) * exp(-(qr - ${f3(RM + 2.0)}) * 0.42);
      float rays = pow(0.5 + 0.5 * sin(qa * 18.0 + uTime * 0.07), 18.0);
      col += mix(PINK, HOT, 0.5) * rays * fall * (0.22 + 0.25 * uInt + 0.45 * uBeat);
      col += HOT * exp(-abs(qr - ${f3(RM + 2.0)} - uBeatT * 1.9) * 5.0) * uBeat * fall * 1.1;
    }
  }`;

const ceilGLSL = /* glsl */`
  { float a = atan(vW.x, vW.z); float pxr = fwidth(r);
    float pet = 3.0 + 0.95 * cos(a * 8.0);
    col += mix(PINK, WHITE, 0.15) * (1.0 - smoothstep(0.012, 0.012 + pxr * 1.5, abs(r - pet))) * (0.45 + 0.5 * uBeat) * step(r, 6.5);
    col += PINK * 0.10 * exp(-abs(r - pet) * 3.0);
  }`;

const floorGLSL = /* glsl */`
  { vec2 q = p - vec2(0.0, -0.9); float qr = length(q); float qa = atan(q.x, q.y); float pr = fwidth(qr);
    float pet = 1.55 + 0.5 * cos(qa * 6.0);
    float pet2 = 2.35 + 0.28 * cos(qa * 12.0);
    col += HOT * (1.0 - smoothstep(0.012, 0.012 + pr * 1.5, abs(qr - pet))) * (0.45 + 0.5 * uBeat);
    col += PINK * (1.0 - smoothstep(0.008, 0.008 + pr * 1.5, abs(qr - pet2))) * 0.35;
    col += PINK * exp(-qr * 1.1) * 0.22 * (0.6 + 0.6 * uBeat);
  }`;

function extra({ K, world, root, fx, out, haze }) {
  const { mat, neonTorus, neonTube, metalMat, glowShell, neonCore, VSf, hex } = K;
  const PC = new THREE.Vector3(0, FY, TZ + 0.06);
  const at = (z) => PC.clone().setZ(PC.z + z);

  // ---------- grand portal: stepped bezels, neon ring stack, chase lights, rotating petal iris, flower halo ----------
  for (const [r, tube, dz] of [[RM + 0.45, 0.3, 0], [RM + 1.18, 0.13, 0.22], [RM + 1.72, 0.085, 0.36]]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 96), metalMat()); t.position.copy(at(dz)); world.add(t);
  }
  neonTorus(world, RM + 0.07, 0.05, hex.d, PC, 0, 1.25, 5);
  neonTorus(world, RM + 0.8, 0.034, hex.a, at(0.2), 0, 1.1, 5);
  neonTorus(world, RM + 0.98, 0.018, hex.c, at(0.16), 0, 0.95, 5);
  neonTorus(world, RM + 1.42, 0.03, hex.b, at(0.34), 0, 1.05, 5);
  neonTorus(world, RM + 1.93, 0.02, hex.e, at(0.44), 0, 0.9, 6);
  {
    const chase = [];
    for (let i = 0; i < 72; i++) { const a = (i / 72) * PI * 2; dummy.position.set(Math.cos(a) * (RM + 0.45), FY + Math.sin(a) * (RM + 0.45), PC.z + 0.33);
      dummy.rotation.set(0, 0, a); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); chase.push(dummy.matrix.clone()); }
    instanced(new THREE.BoxGeometry(0.15, 0.06, 0.04), mat(/* glsl */`
      void main(){ float a = atan(vI.y - ${f3(FY)}, vI.x);
        float c = pow(0.5 + 0.5 * sin(a * 3.0 - uTime * 2.4), 8.0);
        gl_FragColor = vec4(mix(DEEP * 0.5, mix(HOT, WHITE, 0.5) * 1.25, max(c, uBeat * 0.8)), 1.0); }`), chase, world);
    // petal iris: 20 soft leaf blades slowly rotating around the mouth (vertex-shader spin, so the mirror copy follows)
    const pet = [];
    for (let i = 0; i < 20; i++) { const a = (i / 20) * PI * 2, rr = RM + 1.2;
      dummy.position.set(Math.cos(a) * rr, FY + Math.sin(a) * rr, PC.z + 0.4); dummy.rotation.set(0, 0, a - PI / 2); dummy.scale.set(0.17, 0.42, 1);
      dummy.updateMatrix(); pet.push(dummy.matrix.clone()); }
    const spin = `float sa = uTime * 0.035; vec2 q = lp.xy - vec2(0.0, ${f3(FY)}); mat2 rm = mat2(cos(sa), sin(sa), -sin(sa), cos(sa)); lp.xy = vec2(0.0, ${f3(FY)}) + rm * q; n.xy = rm * n.xy;`;
    instanced(new THREE.CircleGeometry(1, 28), mat(/* glsl */`
      void main(){ float r = length(vUv - 0.5) * 2.0; float a = atan(vI.y - ${f3(FY)}, vI.x);
        float c = 0.5 + 0.5 * sin(a * 2.0 - uTime * 0.9);
        float rim = smoothstep(0.7, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
        float fill = (1.0 - r) * 0.35;
        vec3 col = mix(PINK, WHITE, 0.35) * rim * (0.6 + 0.6 * c + 0.6 * uBeat) + mix(DEEP, PINK, 0.5) * fill * (0.5 + 0.5 * c);
        gl_FragColor = vec4(col * (0.8 + 0.3 * uInt), 1.0); }`, { additive: true, side: THREE.DoubleSide, vs: VSf(spin) }), pet, world).userData.ro = 2;
    const S = RM + 3.7;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), mat(/* glsl */`
      void main(){
        vec2 p = (vUv - 0.5) * 2.0 * ${f3(S)}; float r = length(p); float a = atan(p.y, p.x);
        float ring = exp(-abs(r - ${f3(RM + 0.07)}) * 3.5) + 0.6 * exp(-abs(r - ${f3(RM + 0.8)}) * 6.0) + 0.5 * exp(-abs(r - ${f3(RM + 1.42)}) * 6.0) + 0.3 * exp(-abs(r - ${f3(RM + 1.93)}) * 8.0);
        float outer = exp(-(r - ${f3(RM)}) * 0.8);
        float pr = ${f3(RM + 2.45)} + 0.45 * cos(a * 6.0 + uTime * 0.05);
        float petal = exp(-abs(r - pr) * 4.0);
        float I = ring * 0.5 + outer * 0.32 + petal * 0.22;
        I *= smoothstep(${f3(RM - 0.05)}, ${f3(RM + 0.08)}, r) * (1.0 - smoothstep(${f3(S - 0.9)}, ${f3(S)}, r));
        I *= 1.0 - smoothstep(${f3(RM + 1.5)}, ${f3(RM + 2.6)}, p.y) * 0.7;
        gl_FragColor = vec4(mix(PINK, HOT, 0.35) * I * (0.4 + 0.4 * uInt + 0.9 * uBeat + 0.4 * uSurge), 1.0);
      }`, { additive: true }));
    halo.position.copy(at(0.55)); world.add(halo);
  }

  // ---------- crown chandelier: three rings with bead strands and crystal drops around a glowing orb ----------
  {
    const C = new THREE.Vector3(0, 0, -0.9);
    const RINGS = [[2.3, 6.55, 28, 1.5], [1.6, 6.15, 20, 1.15], [0.95, 5.8, 12, 0.8]];
    const beads = [], drops = [], cables = [];
    for (const [r, y, n, len] of RINGS) {
      neonTorus(world, r, 0.03, hex.b, new THREE.Vector3(C.x, y, C.z), PI / 2, 1.15, 4.5);
      const mr = new THREE.Mesh(new THREE.TorusGeometry(r, 0.055, 6, 96), metalMat()); mr.rotation.x = PI / 2; mr.position.set(C.x, y + 0.09, C.z); world.add(mr);
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * PI * 2, x = C.x + Math.sin(a) * r, z = C.z + Math.cos(a) * r;
        const L = len * (0.8 + 0.2 * Math.cos(a * 3));
        for (let yy = y - 0.1; yy > y - L; yy -= 0.13) beads.push(mtx(x, yy, z));
        drops.push(mtx(x, y - L - 0.08, z, a, 0, 1, 1.9, 1));
      }
      for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2 + 0.3, x = C.x + Math.sin(a) * r, z = C.z + Math.cos(a) * r, h = H - y;
        cables.push(mtx(x, y + h / 2, z, 0, 0, 1, h, 1)); }
    }
    instanced(new THREE.IcosahedronGeometry(0.026, 0), mat(/* glsl */`
      void main(){ float f = abs(dot(normalize(vN), normalize(CAM - vW)));
        float ph = pow(0.5 + 0.5 * sin(vI.y * 2.2 + uTime * 1.6 + vH * 6.2831), 6.0);
        vec3 c = mix(PINK, WHITE, 0.35 + 0.5 * ph) * (0.55 + 0.35 * f + 1.4 * ph * (0.5 + 0.5 * uInt) + 0.5 * uBeat);
        gl_FragColor = vec4(c, 1.0); }`), beads, world);
    instanced(new THREE.OctahedronGeometry(0.055, 0), mat(/* glsl */`
      void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); float f = pow(1.0 - abs(dot(N, V)), 1.5);
        float facet = 0.5 + 0.5 * sin(dot(N, vec3(7.0, 3.0, 5.0)) + uTime * 0.6);
        gl_FragColor = vec4(mix(HOT, WHITE, facet * 0.7) * (0.5 + 1.2 * f + 0.8 * uBeat), 1.0); }`), drops, world);
    const cab = instanced(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), metalMat(), cables, world); cab.userData.noMirror = true;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 18), mat(/* glsl */`
      void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); float f = abs(dot(N, V));
        float sw = 0.5 + 0.5 * sin(vL.y * 18.0 + atan(vL.x, vL.z) * 3.0 - uTime * 1.2);
        gl_FragColor = vec4((mix(PINK, WHITE, pow(f, 2.0) * 0.8) * (0.7 + 0.5 * sw) + HOT * pow(1.0 - f, 2.0)) * (0.9 + 0.8 * uBeat), 1.0); }`));
    orb.position.set(C.x, 5.35, C.z); world.add(orb);
    neonTorus(world, 0.48, 0.015, hex.d, orb.position, PI / 2 - 0.35, 1.0, 5);
    const sp = glowSprite(hex.spr, 3.8, 3.8, 0.42); sp.position.copy(orb.position); world.add(sp);
    const sp2 = glowSprite(hex.a, 7.5, 3.2, 0.16); sp2.position.set(C.x, 6.2, C.z); world.add(sp2);
    // soft light cone falling from the crown to the floor
    const cone = new THREE.CylinderGeometry(0.9, 2.9, 5.6, 40, 1, true); cone.translate(0, 2.8, 0);
    const cm = new THREE.Mesh(cone, mat(/* glsl */`
      void main(){ float f = abs(dot(normalize(vN), normalize(CAM - vW)));
        float h = clamp(vW.y / 5.6, 0.0, 1.0); float n = 0.8 + 0.2 * sin(vW.y * 2.0 - uTime * 0.6 + atan(vW.x, vW.z - ${f3(C.z)}) * 5.0);
        gl_FragColor = vec4(mix(PINK, WHITE, 0.15) * pow(f, 2.5) * (0.35 + 0.65 * h) * 0.075 * n * (0.7 + 0.4 * uInt + 0.6 * uBeat), 1.0); }`, { additive: true }));
    cm.position.set(C.x, 0, C.z); cm.renderOrder = 30; root.add(cm); haze.push(cm);
  }

  // ---------- fan-vault ceiling ribs ----------
  {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 7.97, 1.3), new THREE.Vector3(0, 7.9, 3.4), new THREE.Vector3(0, 7.6, 5.4), new THREE.Vector3(0, 7.05, 6.82)]);
    const ribs = []; for (let i = 0; i < 16; i++) ribs.push(mtx(0, 0, 0, ((i + 0.5) / 16) * PI * 2));
    const rc = instanced(new THREE.TubeGeometry(curve, 28, 0.028, 5), neonCore(hex.c, 0.95), ribs, world);
    const rg = instanced(new THREE.TubeGeometry(curve, 28, 0.12, 6), glowShell(hex.a, 0.5), ribs, world);
    rc.userData.noMirror = rg.userData.noMirror = true;
  }

  // ---------- balcony band around the side walls ----------
  {
    const gaps = [[0, 0.3], [PI / 4, 0.3], [PI, 0.78]];
    for (const cv of ringCurves(R - 0.3, 4.74, gaps, 200)) {
      const m = new THREE.Mesh(new THREE.TubeGeometry(cv, 64, 0.11, 8), metalMat({ STRIP_Y: '0.105' })); m.userData.noMirror = true; world.add(m);
    }
    for (const cv of ringCurves(R - 0.36, 4.6, gaps, 200)) neonTube(world, cv, hex.a, 0.95, 0.022, 96, 4.5);
  }

  // ---------- pods: upgraded empty glowing capsules ----------
  {
    const PODS = [];
    for (let i = 0; i < 5; i++) { const z = -5.0 + i * 1.65, x = 2.5 + 0.42 * i; PODS.push([-x, z], [x, z]); }   // 10 pods; the 45° doorway needs the back-right spot
    const podM = PODS.map(([x, z]) => { dummy.position.set(x, 0, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.lookAt(0, 0, z - 1.2); dummy.updateMatrix(); return dummy.matrix.clone(); });
    const parts = (local) => podM.map((pm) => pm.clone().multiply(local));
    const L = (x, y, z, rx = 0, ry = 0, s = 1) => mtx(x, y, z, ry, rx, s, s, s);
    const lathe = (pts, n = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);
    instanced(lathe([[0, 0], [0.88, 0], [0.9, 0.05], [0.88, 0.12], [0.8, 0.14], [0.76, 0.3], [0.67, 0.34], [0.63, 0.45], [0, 0.45]]), metalMat({ DOUBLE: 1, GROOVES: '0.22' }), parts(L(0, 0, 0)), world);
    instanced(lathe([[0, 2.55], [0.63, 2.55], [0.67, 2.63], [0.64, 2.76], [0.5, 2.88], [0.27, 2.96], [0.13, 3.03], [0.1, 3.13], [0, 3.15]]), metalMat({ DOUBLE: 1, GROOVES: '2.69' }), parts(L(0, 0, 0)), world);
    const glassGeo = new THREE.CapsuleGeometry(0.53, 1.06, 5, 28);
    instanced(glassGeo, mat(/* glsl */`
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(CAM - vW);
        float ndv = abs(dot(N, V)); float fres = pow(1.0 - ndv, 3.0);
        float la = atan(vLN.x, vLN.z); float side = smoothstep(0.0, 0.35, 1.0 - abs(vLN.y));
        float st = exp(-pow((la - 0.85) / 0.06, 2.0)) * 0.9 + exp(-pow((la + 1.05) / 0.07, 2.0)) * 0.45 + exp(-pow((la - 0.55) / 0.025, 2.0)) * 0.5;
        float y = vL.y;
        float film = 0.5 + 0.5 * sin(fres * 9.0 + y * 2.2 + uTime * 0.25 + vH * 6.0);       // soft iridescence within the pink range
        vec3 fc = mix(mix(VIOL, PINK, film), WHITE, film * film * 0.5);
        float etch = aline(y * 1.5 + 0.5, 0.012, fwidth(y * 1.5)) * 0.2 * step(abs(y), 1.0);
        float sy = fract(uTime * 0.11 + vH) * 2.6 - 1.3; float scan = exp(-abs(y - sy) * 12.0);
        vec3 col = fc * (0.03 + fres * 0.8) + WHITE * st * side * 0.5 + HOT * etch + HOT * scan * 0.4;
        gl_FragColor = vec4(col * (0.75 + 0.35 * uInt + 0.5 * uBeat), 1.0);
      }`, { additive: true }), parts(L(0, 1.5, 0)), world).userData.ro = 3;
    instanced(glassGeo, mat(/* glsl */`
      void main(){
        float y = vL.y; float g = 0.2 + 0.8 * (exp(-(y + 1.06) * 1.5) + 0.7 * exp(-(1.06 - y) * 2.2));
        float la = atan(vLN.x, vLN.z); float ribs = pow(0.5 + 0.5 * cos(la * 6.0), 6.0) * smoothstep(0.0, 0.5, 1.0 - abs(vLN.y));
        float br = 0.75 + 0.25 * sin(uTime * 1.3 + vH * 6.28);
        gl_FragColor = vec4(mix(PINK, HOT, 0.4) * g * (0.17 + ribs * 0.3) * br * (0.7 + 0.4 * uInt + 0.6 * uBeat), 1.0);
      }`, { additive: true, side: THREE.BackSide }), parts(L(0, 1.5, 0)), world).userData.ro = 1;
    instanced(new THREE.CylinderGeometry(0.15, 0.15, 2.1, 18, 1, true), mat(/* glsl */`
      void main(){ float f = abs(dot(normalize(vN), normalize(CAM - vW)));
        float y = vL.y; float m = exp(-abs(y - (fract(uTime * 0.2 + vH) * 2.2 - 1.1)) * 6.0);
        gl_FragColor = vec4(mix(PINK, WHITE, 0.35) * pow(f, 3.0) * (0.28 + 0.6 * m) * (1.0 - 0.5 * abs(y)) * (0.8 + 0.6 * uBeat), 1.0); }`,
      { additive: true }), parts(L(0, 1.5, 0)), world).userData.ro = 2;
    const emit = mat(/* glsl */`
      void main(){ float r = length(vUv - 0.5) * 2.0;
        float rings = aline(r * 6.0 - uTime * 0.6, 0.05, fwidth(r * 6.0)) * (1.0 - r);
        float pet = aline(r * 3.0 - 0.15 * cos(atan(vUv.y - 0.5, vUv.x - 0.5) * 6.0), 0.04, fwidth(r * 3.0)) * (1.0 - r);
        gl_FragColor = vec4((HOT * exp(-r * 3.0) * 0.9 + PINK * rings * 0.6 + WHITE * pet * 0.35) * smoothstep(1.0, 0.92, r) * (0.8 + 0.6 * uBeat), 1.0); }`, { additive: true, side: THREE.DoubleSide });
    const discGeo = new THREE.CircleGeometry(0.55, 40);
    instanced(discGeo, emit, [...parts(L(0, 0.455, 0, -PI / 2)), ...parts(L(0, 2.545, 0, PI / 2))], world).userData.ro = 2;
    // neon rings: base, two belts hugging the glass, cap
    const ringCore = neonCore(hex.b, 1.15), ringGlow = glowShell(hex.a, 0.6);
    instanced(new THREE.TorusGeometry(0.9, 0.022, 5, 48), ringCore, parts(L(0, 0.14, 0, PI / 2)), world);
    instanced(new THREE.TorusGeometry(0.9, 0.11, 7, 48), ringGlow, parts(L(0, 0.14, 0, PI / 2)), world);
    instanced(new THREE.TorusGeometry(0.575, 0.014, 4, 40), neonCore(hex.d, 1.0), [...parts(L(0, 0.75, 0, PI / 2)), ...parts(L(0, 2.25, 0, PI / 2)), ...parts(L(0, 2.6, 0, PI / 2, 0, 1.12))], world);
    // floating halo above each pod (bobs gently)
    const bob = `lp.y += 0.07 * sin(uTime * 0.7 + vH * 6.2831);`;
    const haloCore = neonCore(hex.d, 1.2); haloCore.vertexShader = VSf(bob);
    const haloGlow = glowShell(hex.a, 0.6); haloGlow.vertexShader = VSf(bob);
    instanced(new THREE.TorusGeometry(0.36, 0.016, 5, 40), haloCore, parts(L(0, 3.42, 0, PI / 2)), world);
    instanced(new THREE.TorusGeometry(0.36, 0.08, 6, 40), haloGlow, parts(L(0, 3.42, 0, PI / 2)), world);
    const strutM = [];
    for (const a of [PI, PI - 1.15, PI + 1.15]) strutM.push(...parts(L(Math.sin(a) * 0.65, 1.5, Math.cos(a) * 0.65)));
    instanced(new THREE.CylinderGeometry(0.026, 0.026, 2.15, 8), metalMat({ STRIP_Z: '0.018' }), strutM, world);
    // rising bubbles inside the empty capsules
    {
      const N = LOW ? 8 : 14, n = podM.length * N;
      const pos = new Float32Array(n * 3), seed = new Float32Array(n), v = new THREE.Vector3();
      podM.forEach((pm, k) => { for (let i = 0; i < N; i++) { const a = Math.random() * PI * 2, r = Math.random() * 0.36;
        v.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyMatrix4(pm); pos.set([v.x, 0, v.z], (k * N + i) * 3); seed[k * N + i] = Math.random(); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
      const pm = new THREE.ShaderMaterial({ uniforms: { ...U }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime; uniform float uPx; attribute float seed; varying float vA;
          void main(){ vec3 p = position; float u = fract(uTime * (0.06 + 0.06 * seed) + seed * 9.0);
            p.y = 0.55 + u * 1.9; p.x += sin(uTime * 1.3 + seed * 30.0) * 0.03; p.z += cos(uTime * 1.1 + seed * 20.0) * 0.03;
            vA = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.85, 1.0, u));
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp((0.012 + 0.02 * seed) * uPx * projectionMatrix[1][1] / -mv.z, 1.0, 24.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.3, d) * (0.4 + 0.6 * smoothstep(0.2, 0.42, d));
          gl_FragColor = vec4(vec3(1.0, 0.72, 0.84) * a * vA * 0.8, 1.0); }` });
      const bp = new THREE.Points(g, pm); bp.frustumCulled = false; bp.userData.ro = 2; world.add(bp);
    }
    // soft glow card behind each pod (one instanced draw instead of a sprite per pod)
    instanced(new THREE.PlaneGeometry(2.8, 4.0), mat(/* glsl */`
      void main(){ vec2 p = (vUv - 0.5) * vec2(2.8, 4.0); float e = exp(-dot(p * vec2(1.25, 0.62), p * vec2(1.25, 0.62)) * 1.4);
        gl_FragColor = vec4(PINK * e * 0.2 * (0.7 + 0.3 * uInt + 0.5 * uBeat), 1.0); }`, { additive: true, side: THREE.DoubleSide }),
      parts(L(0, 1.6, -0.75)), world).userData.ro = 0;
    instanced((() => { const g = new THREE.PlaneGeometry(2.8, 2.8); g.rotateX(-PI / 2); return g; })(), mat(/* glsl */`
      void main(){ float r = length(vUv - 0.5) * 2.8; float pr = fwidth(r);
        float ring = 1.0 - smoothstep(0.012, 0.012 + pr * 1.5, abs(r - 1.0));
        float ring2 = 1.0 - smoothstep(0.006, 0.006 + pr * 1.5, abs(r - 1.16 - 0.05 * cos(atan(vUv.y - 0.5, vUv.x - 0.5) * 8.0)));
        vec3 c = HOT * ring * (0.8 + 0.8 * uBeat) + PINK * ring2 * 0.5 + PINK * exp(-r * r * 2.2) * 0.38;
        gl_FragColor = vec4(c * smoothstep(1.4, 1.28, r), 1.0); }`, { additive: true }), podM.map((m) => m.clone().multiply(L(0, 0.012, 0))), root).renderOrder = 15;
    const cone = new THREE.CylinderGeometry(0.22, 0.95, H - 3.15, 28, 1, true); cone.translate(0, (H - 3.15) / 2 + 3.15, 0);
    const shafts = instanced(cone, mat(/* glsl */`
      void main(){ float f = abs(dot(normalize(vN), normalize(CAM - vW)));
        float h = clamp((vW.y - 3.15) / ${f3(H - 3.15)}, 0.0, 1.0);
        float n = 0.75 + 0.25 * sin(vW.y * 3.0 + uTime * 0.7 + vI.z);
        gl_FragColor = vec4(PINK * pow(f, 2.0) * (1.0 - h) * (1.0 - h) * 0.15 * n * (0.7 + 0.5 * uInt + 0.6 * uBeat), 1.0); }`, { additive: true }), podM, root);
    shafts.renderOrder = 30; haze.push(shafts);
  }

  // ---------- haze: soft pink veils beside the portal + slow bokeh ----------
  {
    const hz = mat(/* glsl */`
      void main(){ vec2 p = vUv - 0.5; float e = (1.0 - smoothstep(0.1, 0.5, abs(p.x))) * (1.0 - smoothstep(0.0, 0.5, abs(p.y + 0.05)));
        float n = 0.6 + 0.4 * sin(vUv.y * 5.0 + uTime * 0.3 + vUv.x * 3.0) * sin(vUv.x * 4.0 - uTime * 0.2);
        gl_FragColor = vec4(mix(PINK, WHITE, 0.1) * e * n * 0.075 * (0.6 + 0.6 * uInt + 0.8 * uBeat), 1.0); }`, { additive: true, side: THREE.DoubleSide });
    for (const [x, z, ry, w, h] of [[-3.6, -4.6, 0.5, 2.8, 7.0], [3.6, -4.6, -0.5, 2.8, 7.0], [0, -2.6, 0, 9.0, 3.2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), hz); p.position.set(x, z === -2.6 ? 6.6 : h / 2, z); p.rotation.y = ry; p.renderOrder = 31; fx.add(p); haze.push(p);
    }
    const N = LOW ? 50 : 110, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { const r = Math.sqrt(Math.random()) * 5.6, a = Math.random() * PI * 2; pos.set([Math.sin(a) * r, 0.6 + Math.random() * 6.4, Math.cos(a) * r], i * 3); seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const bm = new THREE.ShaderMaterial({ uniforms: { ...U }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime; uniform float uPx; attribute float seed; varying float vA;
        void main(){ vec3 p = position; p.y += sin(uTime * 0.12 + seed * 20.0) * 0.4; p.x += sin(uTime * 0.09 + seed * 11.0) * 0.5; p.z += cos(uTime * 0.07 + seed * 7.0) * 0.5;
          vA = 0.5 + 0.5 * sin(uTime * 0.5 + seed * 30.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp((0.09 + 0.16 * seed) * uPx * projectionMatrix[1][1] / -mv.z, 1.0, 90.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.36, d) * (0.55 + 0.45 * smoothstep(0.25, 0.45, d));
        gl_FragColor = vec4(vec3(1.0, 0.45, 0.68) * a * vA * 0.07, 1.0); }` });
    const bk = new THREE.Points(g, bm); bk.frustumCulled = false; bk.renderOrder = 33; fx.add(bk); haze.push(bk);
  }
}

export function pinkRoomCfg(tunnelU) {
  return { name: 'room1', center: [0, 0], rotY: 0, pal: 'pink', focal: 'tunnel', screen: true, tunnelU, deluxe: true,
    podIdx: [], doors: [{ ang: 0, style: 1 }, { ang: PI / 4, style: 2 }], wallGLSL, ceilGLSL, floorGLSL, extra };
}
