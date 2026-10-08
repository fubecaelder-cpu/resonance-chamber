# Resonance Chamber v3 (WebXR, three.js r169, static files, no build step)
Serve this folder over HTTPS, open it in the Meta Quest browser and tap ENTER VR.

Three connected spaces, walked through seamlessly with the left stick:
1. **Pink chamber** (start): the v2 room, with the spiral tunnel, the curved screen and the pods. A glowing doorway is behind the start position.
2. **Crimson vortex room**: reached through a short corridor whose colour shifts from pink to red. Darker blood-red to rose palette and deeper blacks. The focal point is a large funnel vortex with a lub-dub heartbeat pulse. It also has hanging gyroscope rings, four empty pods, and a doorway on the right side.
3. **Monochrome op-art room**: reached through a second corridor (red to white). Purely abstract black and white: a moiré ring wall, chevrons, a warped spiral-checker floor, a ray/ring ceiling, a checkered spiral tunnel, a slowly turning spiral disc, and striped monoliths, rings and spheres. All motion is slow (0.03 to 0.3 Hz). Nothing flashes or strobes, and the brightness changes only with the 4-second beat and a 0.25 Hz breath.

- Only the room you are in is drawn and animated. Each doorway is an opaque animated "veil" previewing the next room's look. A short colour fade hides the moment you step through.
- One beat clock (4 s beat, surge every 4th beat, ~2-minute build) drives all rooms, so the rhythm continues across doorways.
- Audio (starts on ENTER VR / "Start sound"): each room has its own bed, crossfaded by position along the corridors.
  - Room 1: ambient_loop.mp3, a warm drone, a kick and riser, chimes, and a positional tunnel hum.
  - Room 2: a deep 41 Hz drone that opens with the build, slow breath noise, a heavy lub-dub heartbeat, and a positional vortex rumble.
  - Room 3: a clean fifth pad with a slow tremolo, a crisp short pulse on the beat, and soft 1 Hz ticks.
- All shaders for all rooms are compiled at load, so entering a room doesn't stutter.
- Sharpness, glossy floor reflections, and the adaptive quality from v2 are kept. In VR, below ~60 fps it turns off haze and shafts first, then reflections, then particles.
- Controls: left stick moves, right stick snap-turns 30°. On desktop: drag to look, WASD to walk.

URL options: ?quality=low · ?scale=1.2 · ?mirror=0 · ?video=0|blend|full · ?fov=0..1 · ?particles=500 · ?spatial=0 · ?room=2|3 (start in room 2 or 3)
