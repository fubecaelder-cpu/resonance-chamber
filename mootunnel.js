// v24 (trimmed in v37): the "Moo tunnel" — a cartoon VR-headset installation inside the last stretch of the crimson-to-barn diagonal corridor (cF), on the Little Moo
// Barn side. Hanging cables slung between the corridor's neon arches, cartoon visor headsets dangling from them, little wall screens, floor cables
// and a "MOO TRACK" sign. Everything is instanced/merged (a dozen draw calls) and lives in the corridor's `world` group, so the floor mirror copies it.
// The headset lenses and the wall screens light up in a wave (far end first) on "prop" cues: see MOO_U.uPropT (seconds since the cue) / uPropK (strength).
import { THREE, makeKit, instanced, mtx, canvasTex } from './shared.js?v=38c';
import { BARN_GLSL, MAT_GLSL } from './barnroom.js?v=38c';

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

  // v37: the hanging VR headsets, ceiling cables and drop cables were removed (too cluttered); prop cues now just light the wall screens.
  const cylU = new THREE.CylinderGeometry(1, 1, 1, 6), haloG = new THREE.PlaneGeometry(0.95, 0.62);

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

  // v37: floor cables and cable ramps removed.

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
