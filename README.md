# Resonance Chamber v5 (WebXR, three.js r169, static files, no build step)
Serve this folder over HTTPS, open it in the Meta Quest browser and tap ENTER VR.

Three rooms joined in a triangle. Each room has a doorway to each of the other two, so you can walk the loop in either direction with the left stick:
1. **Pink chamber** (start, redesigned in v4): true pink palette (hot pink, bubblegum and rose, with warm pink-black shadows). A grand portal around the spiral tunnel with stepped bezels, neon rings, a slowly turning petal iris and a flower halo. A crown chandelier with ring tiers, hanging crystal strands and a soft light cone. Fan-vault ribs, a balcony ring, an arcade of arches with rose windows, and a glossy mandala floor (marble slabs, glow rings, a ring of petal inlays, a rosette and a twinkling bead ring). Ten upgraded empty glowing pods (metal bases, iridescent glass, light columns, floating halos). The curved screen sits above the portal.
2. **Crimson vortex room**: blood-red to rose, with a funnel vortex and a lub-dub heartbeat pulse, a dark glossy floor with veins that pulse outward from the vortex and double heartbeat ripples, gyroscope rings and four empty pods.
3. **Monochrome op-art room**: purely abstract black and white (moiré walls, chevrons, a warped checker floor, a spiral tunnel, striped monoliths, rings and spheres). Slow motion only, with no flashing.

Corridors (every corridor floor has glowing arrows flowing toward the far doorway, tinted to that corridor's colour blend and laid over a patterned floor that blends between the two rooms: petal inlays at pink ends, pulsing veins and ripples at crimson ends, a warped checker at monochrome ends, plus border rails with diamond beads):
- Pink to crimson: layered neon arches, light flowing along the walls, a glossy reflective floor and drifting particles.
- Crimson to monochrome: the colour drains out into black and white stripes and checkers.
- Monochrome to pink (new, diagonal): the reverse, with colour blooming back into pink.

- Doorways: each one is an animated veil that previews the next space. As you get close it opens like an iris and the next space is drawn behind it, so a quick walk-through stays continuous with no fade. A brief fade is kept only as a safety net for a snap-teleport straight through a closed veil.
- Only the current space (plus any neighbour whose doorway is open) is drawn.
- One beat clock (4 s beat, surge every 4th beat, ~2-minute build) drives every room and corridor.
- Audio (starts on ENTER VR / "Start sound"): each room has its own bed, crossfaded by your position along each of the three corridors.
- All shaders are compiled at load. Adaptive quality in VR: below ~60 fps it drops haze and shafts first, then reflections, then particles.
- **Control panels (new in v5):** a lectern-height panel stands beside the arrival spot in every room, styled to match it. It has big buttons for Animation Speed (0.25x to 2x, default 1x), Brightness (30% to 150%, default 100%) and Reset.
  - Quest: point the laser and pull the trigger (with a short haptic pulse), or physically poke a button with the controller tip or your index finger (hand tracking: poke or pinch).
  - Desktop: hover and click.
  - The settings are global, so every panel shows the same values, and they are saved in localStorage.
  - Speed scales the whole clock: shaders, rotations, particles, the beat, the scheduled audio hits and LFOs, and video playback. The ambient beds keep their pitch.
  - Brightness multiplies every shader's output.
- Controls: left stick moves, right stick snap-turns 30°. On desktop: drag to look, WASD to walk.

URL options: ?quality=low · ?scale=1.2 · ?mirror=0 · ?video=0|blend|full · ?fov=0..1 · ?particles=500 · ?spatial=0 · ?room=2|3 (start in room 2 or 3)
