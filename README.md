# Resonance Chamber v8 (WebXR, three.js r169, static files, no build step)
Serve this folder over HTTPS, open it in the Meta Quest browser and tap ENTER VR.

Three rooms joined in a triangle. Each room has a doorway to each of the other two, so you can walk the loop in either direction with the left stick:
1. **Pink chamber** (start, redesigned in v4): true pink palette (hot pink, bubblegum and rose, with warm pink-black shadows). A grand portal around the spiral tunnel with stepped bezels, neon rings, a slowly turning petal iris and a flower halo. A crown chandelier with ring tiers, hanging crystal strands and a soft light cone. Fan-vault ribs, a balcony ring, an arcade of arches with rose windows, and a glossy mandala floor (marble slabs, glow rings, a ring of petal inlays, a rosette and a twinkling bead ring). Ten upgraded empty glowing pods (metal bases, iridescent glass, light columns, floating halos). The curved screen sits above the portal.
2. **Crimson vortex room**: blood-red to rose, with a funnel vortex and a lub-dub heartbeat pulse, a dark glossy floor with veins that pulse outward from the vortex and double heartbeat ripples, gyroscope rings and four empty pods.
3. **Monochrome op-art room**: purely abstract black and white (moiré walls, chevrons, a warped checker floor, a spiral tunnel, striped monoliths, rings and spheres). Slow motion only, with no flashing.

Corridors (every corridor floor has glowing arrows flowing toward the far doorway, tinted to that corridor's colour blend and laid over a patterned floor that blends between the two rooms: petal inlays at pink ends, pulsing veins and ripples at crimson ends, a warped checker at monochrome ends, plus border rails with diamond beads):
- Pink to crimson: layered neon arches, light flowing along the walls, a glossy reflective floor and drifting particles.
- Crimson to monochrome: the colour drains out into black and white stripes and checkers.
- Monochrome to pink: the reverse, with colour blooming back into pink.

**Symmetric layout (v8):** the three rooms sit at the corners of an equilateral triangle (20 m sides), and each room's focal point (portal, vortex, spiral tunnel) is on the outer wall, away from the middle of the triangle. In every room the two doorways sit at the same spot, 30° either side of the room's centre line, so they mirror each other. The three corridors run straight along the sides of the triangle and are all the same length (6.24 m). Pods, pillars, monoliths and spheres mirror left and right of the centre line. The control panel (with its MEDIA wing) is in the same spot in every room: a few steps in from the doorways, just right of the centre line as you face the focal point, so you see it as soon as you walk in from either doorway. In the crimson room the monitor hangs forward on brackets, above the smaller vortex ring and halo and below the gyroscope rings, so nothing covers the screen.

- Doorways: each one is an animated veil that previews the next space. As you get close it opens like an iris and the next space is drawn behind it, so a quick walk-through stays continuous with no fade. A brief fade is kept only as a safety net for a snap-teleport straight through a closed veil.
- Only the current space (plus any neighbour whose doorway is open) is drawn.
- One beat clock (4 s beat, surge every 4th beat, ~2-minute build) drives every room and corridor.
- Audio (starts on ENTER VR / "Start sound"): each room has its own bed, crossfaded by your position along each of the three corridors.
- All shaders are compiled at load. Adaptive quality in VR: below ~60 fps it drops haze and shafts first, then reflections, then particles.
- **Control panels (new in v5):** a lectern-height panel stands just inside the doorways in every room, at the same spot in each one, styled to match it. It has big buttons for Animation Speed (0.25x to 2x, default 1x), Brightness (30% to 150%, default 100%) and Reset.
- **Your own video on the monitors (new in v6):** every room has a main curved monitor (pink: the field monitor; crimson: a heartbeat/vortex screen; monochrome: a moiré screen above the spiral disc). Use the box at the bottom left of the page (before ENTER VR) to **Choose video file** or **Paste video URL**, or the **MEDIA** wing on each room's control panel: Load, Play/Pause, Default (back to built-in visuals), Volume −/+, Loop, and Screens (all rooms or just this room). One shared video element feeds every monitor; the picture is letterboxed to its own aspect ratio. Files are opened with `URL.createObjectURL` and never leave the device. URLs must be direct .mp4/.webm links from a server that sends CORS headers. The soundtrack comes from the monitor (positional) and the ambient bed dips while it plays. Animation speed does not change the video's speed; brightness does affect it.
  - Quest: point the laser and pull the trigger (with a short haptic pulse), or physically poke a button with the controller tip or your index finger (hand tracking: poke or pinch).
  - Desktop: hover and click.
  - The settings are global, so every panel shows the same values, and they are saved in localStorage.
  - Speed scales the whole clock: shaders, rotations, particles, the beat, the scheduled audio hits and LFOs, and video playback. The ambient beds keep their pitch.
  - Brightness multiplies every shader's output.
- Controls: left stick moves, right stick snap-turns 30°. On desktop: drag to look, WASD to walk.

URL options: ?quality=low · ?scale=1.2 · ?mirror=0 · ?video=0|blend|full · ?fov=0..1 · ?particles=500 · ?spatial=0 · ?room=2|3 (start in room 2 or 3)

## Google Drive playlists (v7, on by default)
Each room streams its own Google Drive folder as a looping playlist on its monitor, with nothing to configure. The defaults live in `config.js`: a browser API key restricted to the Drive API and `https://fubecaelder-cpu.github.io/*`, plus the Pink Room, Crimson Room and Op-Art Room subfolders of "Resonance Chamber Videos" (shared as Anyone with the link). Only the room you are in downloads and decodes. A room whose folder is empty shows its built-in visuals, and every folder is checked once a minute, so videos dropped in later start without a reload.
- To add videos, drop MP4 files (H.264 video, AAC audio, 1080p or smaller) into a room's folder. Files play in name order (natural sort: 2 before 10).
- Choosing a file or pasting a URL in the bottom-left box takes over the screens until **Back to Drive playlists** (or DEFAULT on the MEDIA panel) is pressed.
- MEDIA panel in a Drive room: PLAY/PAUSE, NEXT, LOOP (PLAYLIST or REPEAT 1), DEFAULT (built-in visuals in this room; PLAY brings Drive back), VOLUME.
- Overrides: the "Google Drive folders" section of the page box (saved on the device), or URL params `?pink=<folderId>&crimson=<folderId>&mono=<folderId>&key=<apiKey>`.
