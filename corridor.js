// Short connecting corridor between two rooms; colours blend from room A's palette to room B's.
// Ends are energy veils (with a solid end wall around the arch) previewing the room beyond.
import { THREE, U, f3, PAL, DW, DH, makeKit, instanced, mtx, archCurve, makeVeil } from './shared.js';

export function buildCorridor(cfg) {
  const { L } = cfg, W = 2.6, HH = 3.6;
  const root = new THREE.Group(); root.name = cfg.name;
  root.position.set(cfg.start[0], 0, cfg.start[1]); root.rotation.y = cfg.dir === 'x' ? Math.PI / 2 : 0; root.updateMatrixWorld(true);
  const K = makeKit(cfg.palA, root.matrixWorld.clone().invert());
  const A = PAL[cfg.palA], B = PAL[cfg.palB];
  const cu = (a) => ({ value: new THREE.Vector3(...a) });
  const uni = { uA: cu(A.PINK), uA2: cu(A.HOT), uB: cu(B.PINK), uB2: cu(B.HOT), uBA: cu(A.BASE), uBB: cu(B.BASE) };
  const HEAD = `uniform vec3 uA; uniform vec3 uA2; uniform vec3 uB; uniform vec3 uB2; uniform vec3 uBA; uniform vec3 uBB;\n`;
  const shell = new THREE.BoxGeometry(W, HH, L); shell.translate(0, HH / 2, L / 2);
  root.add(new THREE.Mesh(shell, K.mat(HEAD + /* glsl */`
    void main(){
      vec3 p = vW; float t = smoothstep(0.08, 0.92, clamp(p.z / ${f3(L)}, 0.0, 1.0));
      vec3 acc = mix(uA, uB, t), acc2 = mix(uA2, uB2, t), base = mix(uBA, uBB, t);
      vec3 col = base;
      float pz = fwidth(p.z);
      float rz = p.z / 0.8; float rib = aline(rz, 0.015, pz / 0.8);
      float e = exp(-abs(p.z - uBeatT * 3.5) * 1.6) * uBeat;              // beat pulse travelling down the corridor
      float flow = pow(0.5 + 0.5 * sin(p.z * 2.0 - uTime * 3.0), 6.0);
      if (p.y < 0.01) {
        float ax = abs(p.x); float px = fwidth(p.x);
        col = base * 0.5;
        col += acc2 * (1.0 - smoothstep(0.02, 0.02 + px * 1.5, abs(ax - 0.9))) * (0.7 + 0.6 * uBeat);
        float d = fract(p.z * 1.2 - uTime * 0.8);
        col += acc * (1.0 - smoothstep(0.02, 0.02 + px * 1.5, ax)) * step(d, 0.5) * 0.7;
        col += acc * rib * 0.5 + acc2 * e * 0.6;
      } else if (p.y > ${f3(HH - 0.01)}) {
        float px = fwidth(p.x);
        col = base * 0.6 + acc2 * (1.0 - smoothstep(0.03, 0.03 + px * 1.5, abs(p.x))) * (0.45 + 0.6 * flow) + acc * rib * 0.4;
      } else {
        float py = fwidth(p.y);
        float panel = aline(p.y / 0.9, 0.01, py / 0.9);
        col = base * (0.8 + 0.4 * smoothstep(0.0, 1.0, p.y)) + acc * panel * 0.25 + acc * rib * (0.35 + 0.8 * flow);
        col += acc2 * (1.0 - smoothstep(0.02, 0.02 + py * 1.5, abs(p.y - 0.15))) * (0.9 + 0.6 * uBeat);
        col += acc2 * (1.0 - smoothstep(0.015, 0.015 + py * 1.5, abs(p.y - 2.9))) * 0.6;
        col += acc * e * 0.5;
      }
      gl_FragColor = vec4(col, 1.0);
    }`, { side: THREE.BackSide, uniforms: uni })));
  // neon arches along the corridor
  const archs = [];
  for (let z = 0.7; z < L - 0.5; z += 1.2) archs.push(mtx(0, 0, z));
  const archGeo = new THREE.TubeGeometry(archCurve(0, 1.22, 2.35, 32), 48, 0.035, 6);
  const glowGeo = new THREE.TubeGeometry(archCurve(0, 1.22, 2.35, 32), 48, 0.15, 8);
  instanced(archGeo, K.mat(HEAD + `void main(){ float t = clamp(vI.z / ${f3(L)}, 0.0, 1.0);
      t = smoothstep(0.15, 0.85, t); gl_FragColor = vec4(mix(mix(uA, uB, t), vec3(1.0), 0.05) * (1.0 + 0.3 * uBeat), 1.0); }`, { uniforms: uni }), archs, root);
  instanced(glowGeo, K.mat(HEAD + `void main(){ float t = clamp(vI.z / ${f3(L)}, 0.0, 1.0); float f = abs(dot(normalize(vN), normalize(CAM - vW)));
      t = smoothstep(0.15, 0.85, t); gl_FragColor = vec4(mix(uA, uB, t) * pow(f, 2.2) * 0.4 * (0.7 + 0.6 * uBeat), 1.0); }`, { uniforms: uni, additive: true }), archs, root).renderOrder = 20;
  // end veils (corridor side)
  const va = makeVeil(cfg.styleA, 1); va.position.z = 0.02; root.add(va);
  const vb = makeVeil(cfg.styleB, 1); vb.position.z = L - 0.02; vb.rotation.y = Math.PI; root.add(vb);
  return { root, cfg };
}
