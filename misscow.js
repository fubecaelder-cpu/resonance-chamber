// v24: "Miss Moo" — a friendly stylized cartoon cow mascot built from three.js primitives (no human features): cream body with black spots, pink nose,
// little ivory horns, big friendly eyes, a pink collar with a brass cowbell, swishing tail. She walks toward the listener during the Moo Track.
// Built twice from the same shared materials: the real cow and a y-flipped twin (the glossy barn / corridor floors reflect via mirrored copies of the scene).
import { THREE, makeKit, clipMirror } from './shared.js?v=28';
import { BARN_GLSL } from './barnroom.js?v=28';

const PI = Math.PI, TAU = PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (a, b, k) => a + (b - a) * k;

export function createMissMoo() {
  const K = makeKit('barn', new THREE.Matrix4()), { mat } = K;   // identity: "room" coords = world coords (she walks through the corridor and the barn)
  const shade = `vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); float ndl = 0.5 + 0.5 * dot(N, normalize(vec3(0.3, 0.85, 0.45))); float fr = pow(1.0 - abs(dot(N, V)), 2.5);`;
  const flat = (rgb, k = 0.0, pinkRim = 0.25) => mat(`uniform vec3 uC; void main(){ ${shade} vec3 c = uC * (0.52 + 0.58 * ndl) + PINK * fr * ${pinkRim.toFixed(2)} + WHITE * pow(max(dot(reflect(-V, N), normalize(vec3(0.3, 0.8, 0.5))), 0.0), 24.0) * ${k.toFixed(2)};
      gl_FragColor = vec4(fogit(c, vW), 1.0); }`, { uniforms: { uC: { value: new THREE.Color(...rgb) } } });
  const cowM = mat(`${BARN_GLSL} void main(){ ${shade}
      float sp = cowB(vL * 3.6 + vec3(2.3, 5.1, 1.7)); vec3 base = mix(vec3(1.0, 0.96, 0.88), vec3(0.035, 0.03, 0.03), sp);
      vec3 c = base * (0.55 + 0.55 * ndl) + PINK * fr * 0.3 * (1.0 - sp) + WHITE * fr * 0.06; gl_FragColor = vec4(fogit(c, vW), 1.0); }`);
  const headM = mat(`${BARN_GLSL} void main(){ ${shade}
      float cpatch = 1.0 - smoothstep(0.075, 0.095, length((vL - vec3(0.17, 0.08, 0.1)) * vec3(1.0, 1.1, 1.0)));
      float cpatch2 = 1.0 - smoothstep(0.05, 0.065, length(vL - vec3(-0.1, 0.2, -0.05)));
      float sp = max(cpatch, cpatch2); vec3 base = mix(vec3(1.0, 0.96, 0.88), vec3(0.035, 0.03, 0.03), sp);
      vec3 c = base * (0.55 + 0.55 * ndl) + PINK * fr * 0.3 * (1.0 - sp); gl_FragColor = vec4(fogit(c, vW), 1.0); }`);
  const pinkM = flat([1.0, 0.62, 0.72], 0.35, 0.12), darkM = flat([0.05, 0.04, 0.05], 0.4, 0.1), whiteM = flat([1.0, 0.99, 0.96], 0.5, 0.05),
    hornM = flat([1.0, 0.9, 0.7], 0.3, 0.1), tuftM = flat([0.08, 0.06, 0.06], 0.1, 0.1), hoofM = flat([0.16, 0.1, 0.1], 0.2, 0.1);
  const brassM = mat(`${BARN_GLSL} uniform float uRing; void main(){ ${shade} vec3 Rf = reflect(-V, N); float up = 0.5 + 0.5 * Rf.y;
      vec3 c = mix(vec3(0.3, 0.17, 0.05), vec3(1.0, 0.8, 0.42), up * up) + HOT * pow(max(dot(Rf, normalize(vec3(0.3, 0.8, 0.5))), 0.0), 18.0) * 0.9 + HOT * uRing * 0.35;
      gl_FragColor = vec4(fogit(c * 0.9, vW), 1.0); }`, { uniforms: { uRing: { value: 0 } } });
  const ringU = brassM.uniforms.uRing;

  const G = {
    body: new THREE.SphereGeometry(1, 24, 16).scale(0.4, 0.38, 0.76), skull: new THREE.SphereGeometry(0.27, 20, 14), muzzle: new THREE.SphereGeometry(1, 16, 12).scale(0.17, 0.125, 0.14),
    nostril: new THREE.SphereGeometry(0.022, 8, 6), eyeW: new THREE.SphereGeometry(0.085, 14, 10), pupil: new THREE.SphereGeometry(0.052, 12, 8), glint: new THREE.SphereGeometry(0.02, 8, 6),
    ear: new THREE.SphereGeometry(1, 12, 8).scale(0.12, 0.05, 0.075), earIn: new THREE.SphereGeometry(1, 10, 6).scale(0.08, 0.03, 0.045), horn: new THREE.ConeGeometry(0.042, 0.17, 10).translate(0, 0.085, 0),
    tuft: new THREE.SphereGeometry(1, 10, 8).scale(0.085, 0.06, 0.075), collar: new THREE.TorusGeometry(0.2, 0.028, 8, 28), bell: new THREE.CylinderGeometry(0.04, 0.085, 0.13, 14, 1, true).translate(0, -0.075, 0),
    bellTop: new THREE.SphereGeometry(0.04, 10, 6, 0, TAU, 0, PI / 2).translate(0, -0.01, 0), clap: new THREE.SphereGeometry(0.026, 8, 6),
    leg: new THREE.CylinderGeometry(0.07, 0.065, 0.52, 10).translate(0, -0.26, 0), hoof: new THREE.CylinderGeometry(0.08, 0.085, 0.08, 10).translate(0, -0.56, 0),
    tail: new THREE.CylinderGeometry(0.018, 0.014, 0.55, 6).translate(0, -0.275, 0), tailTuft: new THREE.SphereGeometry(1, 10, 8).scale(0.05, 0.1, 0.05).translate(0, -0.6, 0),
  };
  const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.frustumCulled = false; parent.add(o); return o; };

  function build() {
    const root = new THREE.Group(), P = {};
    P.body = new THREE.Group(); P.body.position.y = 0.92; root.add(P.body); mesh(G.body, cowM, P.body);
    // legs hang from the root (so the body can bob without lifting the hooves off the floor)
    P.legs = [[-0.22, 0.4, 0], [0.22, 0.4, PI], [-0.22, -0.42, PI], [0.22, -0.42, 0]].map(([x, z, ph]) => {
      const lg = new THREE.Group(); lg.position.set(x, 0.62, z); lg.userData.ph = ph; root.add(lg); mesh(G.leg, cowM, lg); mesh(G.hoof, hoofM, lg); return lg; });
    P.head = new THREE.Group(); P.head.position.set(0, 1.12, 0.74); P.body.parent.add(P.head); mesh(G.skull, headM, P.head);
    mesh(G.muzzle, pinkM, P.head, 0, -0.1, 0.21); mesh(G.nostril, darkM, P.head, -0.055, -0.085, 0.335); mesh(G.nostril, darkM, P.head, 0.055, -0.085, 0.335);
    P.eyes = [-1, 1].map((s) => { const e = new THREE.Group(); e.position.set(s * 0.145, 0.06, 0.2); e.rotation.y = s * 0.45; P.head.add(e);
      mesh(G.eyeW, whiteM, e); const pu = mesh(G.pupil, darkM, e, 0, 0, 0.045); mesh(G.glint, whiteM, pu, 0.02, 0.025, 0.04); return e; });
    P.ears = [-1, 1].map((s) => { const e = new THREE.Group(); e.position.set(s * 0.26, 0.13, -0.03); e.rotation.z = -s * 0.45; P.head.add(e); mesh(G.ear, cowM, e); mesh(G.earIn, pinkM, e, 0, 0.012, 0.005); e.userData.s = s; return e; });
    for (const s of [-1, 1]) { const h = mesh(G.horn, hornM, P.head, s * 0.125, 0.235, -0.02); h.rotation.z = -s * 0.5; h.rotation.x = 0.12; }
    mesh(G.tuft, tuftM, P.head, 0, 0.255, 0.04);
    const col = mesh(G.collar, pinkM, root, 0, 1.06, 0.6); col.rotation.x = -0.35; col.scale.set(1, 1.1, 1);
    P.bell = new THREE.Group(); P.bell.position.set(0, 0.97, 0.74); root.add(P.bell);
    mesh(G.bell, brassM, P.bell).material = brassM; mesh(G.bellTop, brassM, P.bell); mesh(G.clap, darkM, P.bell, 0, -0.145, 0);
    P.clap = P.bell.children[2]; for (const m of [P.bell.children[0]]) m.material = brassM;   // (open cone: inside is visible)
    P.bell.children[0].material = brassM.clone(); P.bell.children[0].material.side = THREE.DoubleSide; P.bell.children[0].material.uniforms = brassM.uniforms;
    P.tail = new THREE.Group(); P.tail.position.set(0, 1.05, -0.74); root.add(P.tail); mesh(G.tail, cowM, P.tail); mesh(G.tailTuft, tuftM, P.tail);
    return { root, P };
  }
  const real = build(), twin = build();
  const rig = new THREE.Group(); rig.name = 'missMoo'; rig.add(real.root);
  const mirrorRig = new THREE.Group(); mirrorRig.name = 'missMooMirror'; mirrorRig.scale.y = -1; mirrorRig.add(twin.root); clipMirror(mirrorRig);
  const S = { x: 0, z: 0, yaw: 0, walk: 0, phase: 0, t: 0, blink: 2.5, blinkT: 0, look: 0, lookP: 0, bellE: 0, ringT: 99, ear: 0, earAt: 3 };

  function apply(P, st) {
    const w = st.walk, ph = st.phase, t = st.t;
    for (const lg of P.legs) lg.rotation.x = Math.sin(ph + lg.userData.ph) * 0.55 * w;
    P.body.position.y = 0.92 + (0.035 * Math.abs(Math.sin(ph)) * w) + 0.008 * Math.sin(t * 1.9);
    P.body.rotation.z = 0.025 * Math.sin(ph + 0.6) * w; P.body.rotation.x = 0.012 * Math.sin(t * 1.9);
    P.head.position.y = 1.12 + 0.03 * Math.abs(Math.sin(ph + 0.5)) * w + 0.008 * Math.sin(t * 1.9);
    P.head.rotation.set(st.lookP + 0.06 * Math.sin(ph + 0.9) * w, st.look, 0.03 * Math.sin(ph) * w);
    const bl = st.blinkT > 0 ? Math.max(0.08, Math.abs(st.blinkT / 0.14 - 1)) : 1; for (const e of P.eyes) e.scale.y = bl;
    for (const e of P.ears) e.rotation.z = -e.userData.s * (0.45 + 0.1 * Math.sin(t * 1.3 + e.userData.s)) + (e.userData.s > 0 ? st.ear : 0);
    P.bell.rotation.x = 0.12 * Math.sin(ph * 2 + 1.0) * w + st.bellE * 0.7 * Math.sin(st.ringT * 24); P.bell.rotation.z = st.bellE * 0.35 * Math.sin(st.ringT * 19 + 1);
    P.tail.rotation.z = 0.35 * Math.sin(t * 1.7) + 0.2 * Math.sin(ph) * w; P.tail.rotation.x = 0.28 + 0.1 * Math.sin(t * 2.3);
  }
  const API = {
    group: rig, mirror: mirrorRig, state: S,
    /** world position on the floor + heading (radians, 0 = facing +z) */
    place(x, z, yaw) { S.x = x; S.z = z; S.yaw = yaw; for (const g of [rig, mirrorRig]) { g.position.set(x, 0, z); g.rotation.y = yaw; } },
    ring(power = 1) { S.bellE = Math.min(1.4, S.bellE + power); S.ringT = 0; ringU.value = 1; },
    /** dt s, moving 0..1 (how fast she is walking right now), cam: THREE.Vector3 (world position of the viewer's head) */
    update(dt, moving, cam, t) {
      S.t = t; S.walk = ease(S.walk, moving, 1 - Math.exp(-dt * 4)); S.phase += dt * (2.2 + 4.6 * S.walk) * (S.walk > 0.02 ? 1 : 0.0);
      S.ringT += dt; S.bellE *= Math.exp(-dt * 1.6); ringU.value *= Math.exp(-dt * 3.5);
      S.blink -= dt; if (S.blink < 0) { S.blinkT = 0.14; S.blink = 2.2 + Math.random() * 3.2; } if (S.blinkT > 0) S.blinkT = Math.max(0, S.blinkT - dt);
      S.earAt -= dt; if (S.earAt < 0) { S.earAt = 3 + Math.random() * 4; S.ear = 0.5; } S.ear *= Math.exp(-dt * 3);
      let ty = 0, tp = 0;
      if (cam) { const dx = cam.x - S.x, dz = cam.z - S.z, d = Math.hypot(dx, dz); if (d < 7) { const a = wrap(Math.atan2(dx, dz) - S.yaw); ty = Math.max(-0.95, Math.min(0.95, a)); tp = Math.max(-0.2, Math.min(0.25, -Math.atan2(cam.y - 1.3, Math.max(d, 0.5)) * 0.6)); } }
      S.look = ease(S.look, ty, 1 - Math.exp(-dt * 3)); S.lookP = ease(S.lookP, tp, 1 - Math.exp(-dt * 3));
      apply(real.P, S); apply(twin.P, S);
    },
  };
  return API;
}
