// v24: the "Moo tunnel" — a cartoon VR-headset installation inside the last stretch of the crimson-to-barn diagonal corridor (cF), on the Little Moo
// Barn side. Hanging cables slung between the corridor's neon arches, cartoon visor headsets dangling from them, little wall screens, floor cables
// and a "MOO TRACK" sign. Everything is instanced/merged (a dozen draw calls) and lives in the corridor's `world` group, so the floor mirror copies it.
// The headset lenses and the wall screens light up in a wave (far end first) on "prop" cues: see MOO_U.uPropT (seconds since the cue) / uPropK (strength).
import { THREE, makeKit, instanced, mtx, canvasTex } from './shared.js?v=30';
import { BARN_GLSL, MAT_GLSL } from './barnroom.js?v=30';

export const MOO_U = { uPropT: { value: 99 }, uPropK: { value: 0 }, uMooPulse: { value: 0 }, uMooOn: { value: 0 }, uZ0: { value: 9 } };
const PI = Math.PI;
const LIT = /* glsl */`
  uniform float uPropT; uniform float uPropK; uniform float uMooPulse; uniform float uMooOn; uniform float uZ0;
  // 0..1+: how lit a prop at corridor depth z is. A cue sets uPropT = 0: the wave runs from the far end toward the barn, then fades over ~8 s.
  float propLit(float z, float h){ float dl = max(z - uZ0, 0.0) / 5.5 + h * 0.18; float tt = uPropT - dl;
    return uPropK * smoothstep(0.0, 0.22, tt) * exp(-max(tt, 0.0) * 0.26) + uMooOn * (0.08 + 0.1 * uMooPulse); }
  vec3 candy(float h){ return h < 0.34 ? vec3(1.0, 0.45, 0.68) : (h < 0.67 ? vec3(1.0, 0.78, 0.38) : vec3(0.55, 0.95, 0.8)); }
  float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
const comp = (a, b) => a.clone().multiply(b);

export function buildMooTunnel({ world, root, L, zA, zB, archZ }) {
  const inv = root.matrixWorld.clone().invert();
  const K = makeKit('barn', inv), { mat } = K;
  const U1 = { uniforms: MOO_U };
  MOO_U.uZ0.value = zA;
  const out = new THREE.Group(); out.name = 'mooTunnel'; world.add(out);
  const topY = (x, r = 1.1) => 2.3 + Math.sqrt(Math.max(r * r - x * x, 0.05));   // underside of the neon arches (radius 1.24 tube): hang points follow them
  // stations the cables are strung between: the far end of the installation, every neon arch inside it, then the end
  const st = [zA, ...archZ.filter((z) => z > zA + 0.3 && z < zB - 0.2), zB];
  const mids = []; for (let i = 0; i < st.length - 1; i++) mids.push({ z: (st[i] + st[i + 1]) / 2, len: st[i + 1] - st[i] });

  // ---------- cables slung along the ceiling (5 lines, sagging between stations) ----------
  const cableFS = (colExpr) => `${LIT} void main(){ vec3 N = normalize(vN); float ndl = 0.5 + 0.5 * dot(N, normalize(vec3(0.2, 0.9, 0.35)));
    vec3 base = ${colExpr}; float lit = propLit(vW.z, vH);
    float run = 0.5 + 0.5 * sin(vW.z * 9.0 - uTime * 7.0);
    vec3 c = base * (0.45 + 0.6 * ndl) + candy(fract(vH * 3.7)) * lit * (0.35 + 0.9 * run) + PINK * pow(1.0 - abs(dot(N, normalize(CAM - vW))), 3.0) * 0.18;
    gl_FragColor = vec4(fogit(c, vW), 1.0); }`;
  const SEG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0, 0], [0, -0.07, 0.25], [0, -0.115, 0.5], [0, -0.07, 0.75], [0, 0, 1]].map((p) => new THREE.Vector3(...p))), 14, 0.022, 6);
  const lines = [-0.82, -0.42, 0.0, 0.42, 0.82], segM = [];
  lines.forEach((x, li) => { for (let i = 0; i < st.length - 1; i++) { const sag = 0.85 + 0.5 * ((li * 7 + i * 3) % 5) / 4; segM.push(mtx(x, topY(x), st[i], 0, 0, 1, sag, st[i + 1] - st[i])); } });
  instanced(SEG, mat(cableFS('mix(vec3(0.11, 0.09, 0.09), candy(fract(vH * 5.3 + 0.2)) * 0.8, step(0.5, fract(vH * 9.1)))'), U1), segM, out);

  // ---------- headsets hanging on drop cables ----------
  const visorShape = new THREE.ExtrudeGeometry(roundedShape(0.34, 0.15, 0.06), { depth: 0.11, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.022, bevelSegments: 3, curveSegments: 8 });
  visorShape.translate(0, 0, -0.055);
  const lensG = new THREE.PlaneGeometry(0.28, 0.105);
  const strapG = new THREE.TorusGeometry(0.1, 0.013, 6, 22, PI); strapG.rotateX(-PI / 2); strapG.scale(1.7, 1, 1);
  const capG = new THREE.CylinderGeometry(0.02, 0.026, 0.045, 10), haloG = new THREE.PlaneGeometry(0.95, 0.62), cylU = new THREE.CylinderGeometry(1, 1, 1, 6);
  const vis = [], lens = [], strap = [], caps = [], halo = [], drops = [];
  mids.slice(0, 6).forEach((m, i) => {
    const side = i % 2 ? 1 : -1, x = side * (0.5 + 0.08 * (i % 3)), y = 1.98 + 0.07 * ((i * 5) % 3) - 0.04, z = m.z + 0.04 * side;
    const G = mtx(x, y, z, -side * (0.5 + 0.12 * (i % 2)), 0, 1, 1, 1);
    vis.push(G.clone()); lens.push(comp(G, mtx(0, 0, 0.0825))); strap.push(comp(G, mtx(0, 0, -0.045))); caps.push(comp(G, mtx(0, 0.1, 0))); halo.push(comp(G, mtx(0, 0, 0.16)));
    const top = topY(x, 1.12), len = top - (y + 0.12); drops.push(mtx(x, y + 0.12 + len / 2, z, 0, 0, 0.011, len, 0.011));
  });
  const SHELL = `${LIT} void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); float ndl = 0.5 + 0.5 * dot(N, normalize(vec3(0.25, 0.9, 0.4))); float lit = propLit(vI.z, vH);
    float fr = pow(1.0 - abs(dot(N, V)), 2.5); vec3 c = vec3(0.97, 0.93, 0.86) * (0.5 + 0.55 * ndl) + candy(vH) * (0.15 + 0.5 * lit) * fr * 1.6 + PINK * fr * 0.25;
    gl_FragColor = vec4(fogit(c, vW), 1.0); }`;
  instanced(visorShape, mat(SHELL, U1), vis, out);
  instanced(strapG, mat(`void main(){ vec3 N = normalize(vN); float ndl = 0.5 + 0.5 * dot(N, normalize(vec3(0.2, 0.9, 0.3))); gl_FragColor = vec4(fogit(mix(PINK, vec3(0.12, 0.09, 0.09), 0.55) * (0.5 + 0.55 * ndl), vW), 1.0); }`), strap, out);
  instanced(capG, mat(`${BARN_GLSL}${MAT_GLSL} void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); gl_FragColor = vec4(fogit(brassCol(N, V), vW), 1.0); }`), caps, out);
  instanced(cylU, mat(cableFS('vec3(0.1, 0.085, 0.085)'), U1), drops, out);
  instanced(lensG, mat(`${LIT} void main(){ vec2 uv = vUv; float lit = propLit(vI.z, vH); vec3 tint = candy(vH);
      float dL = rbox(uv - vec2(0.27, 0.5), vec2(0.2, 0.36), 0.16), dR = rbox(uv - vec2(0.73, 0.5), vec2(0.2, 0.36), 0.16);
      float win = 1.0 - smoothstep(-0.02, 0.02, min(dL, dR));
      float streak = smoothstep(0.0, 0.5, 0.5 - abs(uv.x + uv.y * 0.6 - 0.7)) * 0.1;
      vec3 glass = vec3(0.025, 0.03, 0.05) + vec3(streak) + tint * 0.05;
      vec3 on = mix(tint, vec3(1.0), 0.35) * (0.55 + 0.45 * uv.y) * (0.85 + 0.25 * sin(uTime * 3.0 + vH * 20.0));
      vec3 c = mix(vec3(0.05, 0.04, 0.05), glass, win) + on * win * (0.18 + 1.4 * lit) * 1.0;
      gl_FragColor = vec4(c, 1.0); }`, U1), lens, out);
  instanced(haloG, mat(`${LIT} void main(){ float lit = propLit(vI.z, vH); float r = length(vUv - 0.5) * 2.0; float a = exp(-r * r * 3.0) * (1.0 - smoothstep(0.8, 1.0, r));
      gl_FragColor = vec4(candy(vH) * a * lit * 0.55, 1.0); }`, { ...U1, additive: true }), halo, out).userData.ro = 2;

  // ---------- wall screens (cartoon equalizer bars, standby LED when idle) ----------
  const frameG = new THREE.BoxGeometry(0.66, 0.5, 0.1), glassG = new THREE.PlaneGeometry(0.56, 0.4);
  const frames = [], glass = [], ledHalo = [];
  mids.forEach((m, i) => { for (const side of [-1, 1]) {
    const y = 1.5 + 0.09 * (((i + (side > 0 ? 1 : 0)) % 3) - 1), G = mtx(side * 1.235, y, m.z, -side * PI / 2, 0, 1, 1, 1);
    frames.push(G); glass.push(comp(G, mtx(0, 0, 0.052))); ledHalo.push(comp(G, mtx(0, 0, 0.06, 0, 0, 1.3, 1.3, 1)));
  } });
  instanced(frameG, mat(`${BARN_GLSL}${MAT_GLSL} void main(){ vec3 N = normalize(vN); vec3 c = woodCol(vW, N, 0.61); c += HOT * 0.08 * (1.0 - smoothstep(0.0, 0.04, abs(abs(vL.y) - 0.245))) ; gl_FragColor = vec4(fogit(c, vW), 1.0); }`), frames, out);
  instanced(glassG, mat(`${BARN_GLSL}${LIT} void main(){ vec2 uv = vUv; float lit = propLit(vI.z, vH); float t = uTime;
      float n = 10.0, id = floor(uv.x * n), fr = fract(uv.x * n);
      float h = 0.1 + 0.8 * pow(0.5 + 0.5 * sin(t * (1.8 + id * 0.45) + id * 1.9 + vH * 9.0), 1.4);
      float bar = step(uv.y, 0.08 + h * 0.72) * step(0.14, fr) * step(fr, 0.86) * step(0.08, uv.y);
      vec3 bc = mix(vec3(1.0, 0.45, 0.68), vec3(1.0, 0.8, 0.4), id / (n - 1.0));
      float cb = cowB(vec3(uv * 3.2, vH * 7.0)); vec3 bg = mix(vec3(0.08, 0.02, 0.05), vec3(0.34, 0.28, 0.22), cb) * (0.6 + 0.4 * uv.y);
      float scan = 0.88 + 0.12 * sin(uv.y * 150.0 - t * 4.0);
      vec3 on = (bg + bc * bar * 1.5) * scan * (1.0 - 0.5 * smoothstep(0.55, 1.0, length(uv - 0.5) * 1.6));
      vec3 off = vec3(0.025, 0.03, 0.04) + vec3(0.05) * smoothstep(0.1, 0.0, abs(uv.x * 0.8 + uv.y * 0.6 - 0.55));
      float led = 1.0 - smoothstep(0.018, 0.03, length((uv - vec2(0.93, 0.1)) * vec2(0.56, 0.4)));
      off += vec3(1.0, 0.4, 0.62) * led * (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 1.3 + vH * 9.0))) * (1.0 - clamp(lit, 0.0, 1.0));
      vec3 c = mix(off, on * (0.5 + 1.1 * min(lit, 1.4)), smoothstep(0.02, 0.18, lit));
      gl_FragColor = vec4(c, 1.0); }`, U1), glass, out);
  instanced(haloG, mat(`${LIT} void main(){ float lit = propLit(vI.z, vH); vec2 q = (vUv - 0.5) * 2.0; float a = exp(-dot(q, q) * 2.2) * (1.0 - smoothstep(0.8, 1.0, length(q)));
      gl_FragColor = vec4(mix(vec3(1.0, 0.55, 0.75), vec3(1.0, 0.8, 0.5), vH) * a * lit * 0.4, 1.0); }`, { ...U1, additive: true }), ledHalo, out).userData.ro = 2;

  // ---------- floor cables with cable ramps ----------
  const FLOOR = `void main(){ vec3 N = normalize(vN); float ndl = 0.5 + 0.5 * N.y; float s = step(0.5, fract(vW.z * 3.0));
      vec3 c = mix(vec3(0.1, 0.085, 0.085), PINK * 0.9, s * 0.8) * (0.5 + 0.55 * ndl); gl_FragColor = vec4(fogit(c, vW), 1.0); }`;
  for (const [sx, ph] of [[-0.8, 0.0], [0.8, 2.1], [0.62, 4.0]]) {
    const pts = []; for (let z = zA - 0.3; z <= zB + 0.1; z += 0.18) pts.push(new THREE.Vector3(sx + 0.07 * Math.sin(z * 1.7 + ph) + (ph === 4.0 ? 0.1 * Math.sin(z * 0.9) : 0), 0.026, z));
    out.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 0.026, 6), mat(FLOOR)));
  }
  const ramps = []; for (let z = zA + 0.9; z < zB - 0.3; z += 1.45) for (const sx of [-0.8, 0.8]) ramps.push(mtx(sx, 0.022, z, 0, 0, 1, 1, 1));
  instanced(new THREE.BoxGeometry(0.34, 0.044, 0.22), mat(`void main(){ vec3 N = normalize(vN); gl_FragColor = vec4(fogit(vec3(0.95, 0.9, 0.8) * (0.5 + 0.55 * (0.5 + 0.5 * N.y)) + PINK * 0.1, vW), 1.0); }`), ramps, out);

  // ---------- sign: "MOO TRACK" on two chains at the far end (faces the barn) ----------
  const sg = canvasTex(512, 160), g = sg.g;
  g.fillStyle = '#2b1608'; g.beginPath(); g.roundRect(6, 6, 500, 148, 30); g.fill(); g.strokeStyle = '#ffb87a'; g.lineWidth = 8; g.stroke();
  g.strokeStyle = '#ff9fbd'; g.lineWidth = 3; g.beginPath(); g.roundRect(20, 20, 472, 120, 20); g.stroke();
  g.fillStyle = '#fff0d2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 82px system-ui, Segoe UI, Roboto, sans-serif'; g.fillText('MOO TRACK', 256, 84);
  g.fillStyle = '#ffd6a0'; for (const x of [58, 454]) { g.beginPath(); g.arc(x, 80, 13, 0, PI * 2); g.fill(); }
  sg.t.colorSpace = THREE.SRGBColorSpace; sg.t.needsUpdate = true;
  const sy = 3.0, sz = zA + 0.15;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), new THREE.ShaderMaterial({ uniforms: { uMap: { value: sg.t }, uPulse: MOO_U.uMooPulse, uOn: MOO_U.uMooOn },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D uMap; uniform float uPulse; uniform float uOn; varying vec2 vUv; void main(){ vec4 c = texture2D(uMap, vUv); gl_FragColor = vec4(c.rgb * (0.75 + 0.2 * uOn + 0.25 * uPulse * uOn), 1.0); }' }));
  sign.position.set(0, sy, sz); out.add(sign);
  const chainM = [mtx(-0.62, (sy + 0.2 + 3.42) / 2, sz, 0, 0, 0.012, 3.42 - sy - 0.2, 0.012), mtx(0.62, (sy + 0.2 + 3.42) / 2, sz, 0, 0, 0.012, 3.42 - sy - 0.2, 0.012)];
  instanced(cylU, mat(`${BARN_GLSL}${MAT_GLSL} void main(){ vec3 N = normalize(vN); vec3 V = normalize(CAM - vW); gl_FragColor = vec4(fogit(brassCol(N, V), vW), 1.0); }`), chainM, out);
  return { group: out, stations: st, mids, zA, zB };
}
