# Resonance Chamber v10 (WebXR, three.js r169, static files, no build step)
Serve this folder over HTTPS, open it in the Meta Quest browser and tap ENTER VR.

Four rooms on the corners of a square (v22), every room joined to every other one (see v22 below). Older text below still describes the original triangle layout:
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

## Moving the main monitor (v9, v10: same in every room, down to the floor)
Each control panel has a **SCREEN** wing on its left (the MEDIA wing stays on the right). It moves the main monitor in that room only, and works exactly the same way in all three rooms: every room has the same monitor (same size and default spot) and the same clear monitor bay in front of its focal wall, so the ranges and steps are identical.
- **HEIGHT (bottom edge)**: Down / Up in 0.25 m steps, all the way down until the screen's bottom edge rests on the floor (at any size and tilt), and up to just under the ceiling.
- **DISTANCE**: Farther / Closer in 0.4 m steps along the room's centre line, up to 2.38 m forward at 100% size (bigger screens have a little less room).
- **SIZE**: Smaller / Bigger, 60% to 180% in 10% steps.
- **TILT**: Face up / Face down, −10° to +30° in 5° steps.
- **RESET** puts it back in its default spot.

Under each value the wing shows the range available right now (for example "FLOOR 0.00 – 6.16 m" and "0.00 – 2.38 m"). A step that would pass the floor, the ceiling or the end of the bay stops exactly there; when a bigger size or a tilt needs room, the screen lifts off the floor or steps forward just enough. The screen never goes into the walls, the portal or vortex, or the side decor. To make the bay clear and identical in every room, v10 moved the pink chandelier towards the entrance, moved the pods a little further in (pink now has 8, crimson 4), set the side pylons back against the wall, left the ceiling ribs and beams out over the bay, and moved the op-art monoliths and spheres forward. High up, the screen hangs from two thin rods to the ceiling; low down it stands on two small feet instead. Settings are saved per room on the device (older saves are clamped into the new limits). Video, Drive playlists and letterboxing work at any size.

## Google Drive playlists (v7, on by default)
Each room streams its own Google Drive folder as a looping playlist on its monitor, with nothing to configure. The defaults live in `config.js`: a browser API key restricted to the Drive API and `https://fubecaelder-cpu.github.io/*`, plus the Pink Room, Crimson Room and Op-Art Room subfolders of "Resonance Chamber Videos" (shared as Anyone with the link). Only the room you are in downloads and decodes. A room whose folder is empty shows its built-in visuals, and every folder is checked once a minute, so videos dropped in later start without a reload.
- To add videos, drop MP4 files (H.264 video, AAC audio, 1080p or smaller) into a room's folder. Files play in name order (natural sort: 2 before 10).
- Choosing a file or pasting a URL in the bottom-left box takes over the screens until **Back to Drive playlists** (or DEFAULT on the MEDIA panel) is pressed.
- MEDIA panel in a Drive room: PLAY/PAUSE, NEXT, LOOP (PLAYLIST or REPEAT 1), DEFAULT (built-in visuals in this room; PLAY brings Drive back), VOLUME.
- Overrides: the "Google Drive folders" section of the page box (saved on the device), or URL params `?pink=<folderId>&crimson=<folderId>&mono=<folderId>&key=<apiKey>`.

## v11

- **Floor reflection fix:** the mirrored copy of each room now only draws what is above the floor, so nothing that dips below the floor (portal rings, tunnel base) can flip up and show above the floor line. Applied in every room and corridor.
- **Pod media:** every pod (pink and crimson glass tubes, op-art monoliths) shows a glowing holographic panel that shuffles images (JPG, PNG, WEBP, animated GIF) and videos from Google Drive. It uses the room folder's `Pods` subfolder if there is one, otherwise the room folder itself. Each pod shows a different item and crossfades every 8–12 s. Images are downscaled to small textures, and at most 2 muted video pods play at once, only in the room you are in. If nothing loads, the pods keep their plain glow. Folders are checked once a minute.
- **Panel:** MEDIA wing has **PODS ON/OFF** and **SHUFFLE**. SCREEN wing has an **OPACITY** row (100% down to 10% in 10% steps), saved per room and the same in every room. RESET goes back to 100%.

## v14

- **Sprint toggle (2× smooth-locomotion speed):** in VR, click either thumbstick. On desktop, press Shift (it toggles, you don't hold it). There is also a SPRINT button on every CHAMBER CONTROLS panel. You get a short haptic pulse, and a small "» SPRINT ON" tag sits low in your view while sprint is on. The setting is saved on the device.
- **Theta binaural beat:** a constant 6 Hz theta beat (200 Hz sine in the left ear, 206 Hz in the right) plays softly under everything, the same in every room and corridor. It starts when sound is turned on, and you need headphones to hear the beat. It runs straight to the stereo output and is never mixed to mono. CHAMBER CONTROLS has a THETA row: on/off plus volume − / + (5–100%, default 30%). The setting is saved on the device.

## v16

- **Hand tracking:** your hands show up as small joint spheres. With the **right hand**, point at the floor: a dotted arc and a ring show where you'll land. Pinch and release to teleport (short fade). You can only land on walkable floor: the ring turns red elsewhere. With the **left hand**, pinch and hold to glide the way you're looking (sprint doubles it). To use the panels, point a hand at a button and pinch, or poke it with your index fingertip.
- **Controllers:** they work as before (left stick moves, right stick snap-turns, stick click toggles sprint). New: aim either controller at the floor and press and release the trigger to teleport.
- **Height:** the site uses the headset's floor-level ("local-floor") tracking, and falls back to plain "local" tracking plus 1.6 m if the headset doesn't offer it. CHAMBER CONTROLS has a **PLAYER HEIGHT** row (down/up in 0.1 m steps from −0.5 to +1.0 m, plus reset), saved on the device.

## v17

- **Thumb-swipe snap turn (hands):** make a loose fist with either hand and slide your thumb tip along the side of your index finger, toward the way you want to turn. Each swipe is one snap turn, with a brief dim as a cue. Pinches from a fisted hand are ignored, so this never teleports or glides you.
- **TURN row** on CHAMBER CONTROLS: SNAP 15°, 30° or 45°, or SMOOTH. The right stick and the thumb swipe use it (in SMOOTH mode the swipe turns 30°). Saved on the device.
- Teleport can no longer land inside a control panel.

## v18

- Thumb-swipe turn is calmer: hold your thumb still for a moment in a fist, then swipe. One swipe makes one turn. Bringing your thumb back to rest never turns you. Rest your thumb about 0.2 s before the next swipe (about 0.55 s between turns at most).

## v22: the Little Moo Barn (4th room) and a square layout

- **New room:** a playful, people-free dairy barn in cream, black and soft pink. Cow-print walls with slowly drifting black spots, a floor of cow-spot tiles that morph, mirrored wooden stalls with brass rails, hay bales and glowing lanterns on both sides, a hanging brass bell, warm golden light, floating glowing glass milk bottles as the video pods, and a swirling milk-and-cream spiral vortex portal where the main screen sits. Audio: a warm rounded pad, soft cowbell-like chimes on the beat, and the same constant 6 Hz theta beat (200/206 Hz) as everywhere.
- **Fully functional like the others:** same control panel in the same spot (speed, brightness, SCREEN wing, Pods on/off/shuffle, Sprint, Media, Height, Turn, Theta), the movable main monitor, glossy floor reflection, room detection and audio crossfade, teleport and all locomotion.
- **Square layout (20 m sides):** pink (0,0), crimson (0,20), op-art (20,20), barn (20,0). Every room has three doorways behind the arrival spot: left and right lead along the sides of the square (6.24 m corridors) and the middle one crosses the square diagonally (14.5 m). The two diagonals cross at the centre of the square, where their walls open up. That is 6 corridors in all, so every room still connects to every other. Each corridor fades between the two rooms' colours and has colour-matched floor arrows.
- **Google:** the barn plays its Drive folder ("Little Moo Barn" inside "Resonance Chamber Videos", with a "Pods" subfolder for the milk-bottle pods) and, once you upload there with `sync_gcs.py`, the Google Cloud copy first (`barn/manifest.json`). Until a video exists the screen shows the milk vortex. URL options: `?barn=<Drive folder link or id>`, `?room=4` (start in the barn), `?gcs=0` (Drive only).
- Doorways in the pink and op-art rooms moved to the new angles (0° and ±45° from the room's axis, the centre line); the pink-room wall pattern and the op-art monoliths follow.

## v23: Little Moo Barn

- The barn is now named **Little Moo Barn** (plaque, Drive-folder field, README). `?barn=<folder>` and `?room=4` work as before. The Drive folder was renamed "Little Moo Barn" (same id, same sharing, "Pods" subfolder unchanged).
- **More stalls:** a continuous run of 6 mirrored wooden stalls down each long side (12 in all, 60°..150° from the arrival axis, clear of the three doorways, the panel and the monitor bay): posts with a lantern on every one, dividers, kick boards, three brass rails, a top beam, a hay-filled feed trough on the wall, hay in every stall and loose hay bales on the floor. All instanced, so it adds only a few draw calls.
- **Sharper cow print:** bigger, bolder spots with crisper edges, near-white cream against true black on the walls, ceiling, floor tiles and the portal bezel. The room's fog no longer washes the print towards brown.

## v24: Moo Track, the wired-headset tunnel and Miss Moo
All playful and cartoon, no people, nothing explicit. It sits on the existing corridor that leads from the Little Moo Barn's back door to the crimson room (layout, zones and walking are unchanged).

**What it is**
- **Moo Track**: a narrator voice slowly circles your head (WebAudio HRTF panner, listener = your head, so it works the same on desktop and in a headset; wear headphones). A heartbeat-like low drone pulses from below you. A cowbell rings and other cues fire at the times in the cue list. The room beds dip to 50% while it plays; the 6 Hz theta beat is untouched. Until you add your own narration a generated placeholder voice plays.
- **Tunnel props** (barn end of the corridor, behind you when you spawn in the barn): sagging cables on the arches, cartoon visor headsets on drop cables, wall screens with equalizer bars and a "MOO TRACK" sign. They glow on `prop` cues. Instanced geometry, a handful of draw calls.
- **Miss Moo**: see v26 below. She starts at the far end of the tunnel and walks closer over the track, stops about 2 m from the barn start spot, and resets on restart.

**Controls** (identical everywhere): the **Moo Track wing** at the right of the panel (START, STOP, RESTART, volume, narration file, cue file, default) and the **"Moo Track · Miss Moo" box** on the 2D page (bottom right) with the same buttons plus URL fields. Starting needs one click/tap/trigger (browser audio rules). Start it inside the barn: the tunnel door is behind you at the spawn.

**Supplying your narration audio** (any one of these; a later one in the list overrides an earlier one)
1. Put the file in Drive: an audio file with "moo" in its name in the Little Moo Barn folder (found automatically).
2. Upload `moo/narrator.mp3` (or `.m4a`) to the public bucket `resonance-chamber-videos`, or drop `assets/moo_narrator.mp3` (`.m4a/.ogg/.wav`) into the site.
3. Set `MOO_DEFAULTS.narrator` in `config.js` (any audio URL, Drive link or file id, `gcs:moo/file.mp3`).
4. Add `?moo=<url | Drive link | Drive file id | gcs:path>` to the page URL. `?moo=default` forces the placeholder.
5. In the page box paste a URL and press Load, or use "Choose narration" / the NARRATION button on the panel to pick a file from the device (kept on the device, not uploaded; inside VR the Quest browser may not show a picker, so pick it on the page before entering VR).
The cross-origin URL must allow CORS (Drive links and the GCS bucket already do). The track length is the audio length.

**Editing the cues** (`moo_cues.json`, or your own file via `?moocues=<url | Drive link | file id>`, `MOO_DEFAULTS.cues`, or "Choose cues JSON"):
```json
{ "title": "My track", "duration": 180, "orbitSeconds": 28,
  "cues": [ { "t": 6, "type": "cowbell", "az": -70, "gain": 1 },
            { "t": 14, "type": "prop" },
            { "t": 22, "type": "stepcloser" } ] }
```
`t` = seconds into the track. `type`: `cowbell` (bell ring from direction `az` degrees, 0 = ahead, plus Miss Moo's bell), `prop` (chime from the tunnel plus the headsets and screens light up), `stepcloser` (hoofsteps and Miss Moo takes a burst of steps closer). `gain` is optional (0 to 2). `duration` only matters for the placeholder; with a narration file the audio length is used. Miss Moo's progress is 35% elapsed time plus 65% steps taken, so put your `stepcloser` cues spread across the track and she arrives at the end. `orbitSeconds` is the time for one lap of the narrator around your head.

**Test hooks**: `window.__moo` (engine, cow, uniforms). Cache-bust is now `?v=38` (it is bumped on every release). Miss Moo model uploads may also be .stl/.obj/.ply (untextured; converted to .glb by the sync, decimated to 150k tris).


## v25: Miss Moo redesign
Miss Moo is now a stylized, wholesome young woman in a cow outfit (`misscow.js`, same API plus `waveNow(sec)`):
- Big warm eyes with lashes and glints, blush, soft smile, dark hair with rose-pink tips, bangs and long back/side locks.
- Cow-ear headband (pink band, ivory horns, cream ears with black tips that flick).
- Cow-print hoodie dress (hood down, long sleeves with pink cuffs, hem below the knee), black leggings, brown fur-cuffed boots, brass cowbell on a ribbon, plush cow-print tail. Fully covered, non-suggestive.
- Animation: sway and bob, blink, head tilt that grows as she nears, a little wave when she is close, bell and tail swing on cowbell cues.
- About 32 merged meshes per figure (64 with the mirror). Behavior (start, walk, stop, restart) is unchanged.


## v26: Miss Moo, sleek cyber-sci-fi redesign
Miss Moo (`misscow.js`, same API plus `flash(power)`) now follows the user's reference images instead of the cow-hoodie look: a stylised, slender adult young woman, fully covered and non-sexual.
- **Hair/face**: short layered white pixie/bob with pink-tinted tips and wispy bangs; pale face with calm half-lidded eyes, pink eye makeup, soft brows and small lips (all painted in a shader; a slow blink closes the eyes).
- **Outfit**: glossy black high-neck long-sleeve bodysuit with glowing neon-pink circuit/hex lines over torso, arms and legs (shader line glow with a soft halo), a glowing padlock emblem on the chest, black gloves (the right one fingerless), chunky glossy platform boots.
- **Cow theme, kept subtle**: a cow-print choker with a small brass cowbell.
- **Light**: pink rim light on the suit and a soft neon-pink light pool on the floor under her.
- **Animation**: relaxed contrapposto (weight on one leg, one hand on the hip), breathing, slow sway, head tilt as she approaches, slow dreamy blinks, glow pulsing slowly with a double-thump at 66 bpm (free-running, the same tempo as the Moo Track heartbeat drone but not phase-locked to it), emblem and lines flare on `prop` cues, bell rings on `cowbell` cues.
- **Behavior unchanged**: far end of the tunnel, walks closer with the track, stops about 2 m from the barn start spot, resets on restart.
- About 18 merged meshes per figure (twice with the mirror).


## v27 — Miss Moo smooth / high-poly
- Geometry rebuilt in `G(Q)`: spline-smoothed closed lathes for torso, limbs and boots (rounded overlapping joint ends, no seams), 70×53 head, real hands (palm + four 3-phalanx tapered fingers with knuckles + opposed 2-segment thumb; right glove fingerless), hair from ~150 swept tapered clumps with smooth normals.
- Distance LOD: high set (Q=2.2, ~108k tris) within ~6.5 m, light set (Q=1.25, ~43.6k tris) beyond and always for the mirror twin. v26 was 9,686 tris per figure. Mesh count unchanged (19 per figure), so draw calls unchanged.

## v28 — swappable Miss Moo model (Drive folder)
- Drop a model into the Drive folder **Miss Moo Model** (inside Resonance Chamber Videos): https://drive.google.com/drive/folders/1B6yh_ZRRGWyTYIFNGlokrdnZKKnFZ4fT . The newest file wins; to swap, upload a new one (or replace/delete the old one). Empty folder = the built-in code Miss Moo.
- Formats: `.glb` (best), `.vrm` (VRM 0.x/1.0 via @pixiv/three-vrm, vendored in `lib/`), `.gltf` only with embedded data. `.fbx` is converted to `.glb` by `sync_gcs.py` (FBX2glTF) and only reaches the site via GCS. Draco/meshopt-compressed files are not supported.
- Load order (`moomodel.js`): `?moomodel=<url | Drive link/id | gcs:path | off>` → `gs://resonance-chamber-videos/model/manifest.json` (if it was made from the folder's newest file) → newest file downloaded straight from Drive → built-in figure.
- Fitting: scaled to 1.68 m, feet on the floor, centred, facing the walk direction (+z; VRM 0.x rotated). Plays a clip named idle/stand (blends a "walk" clip while moving) if present; otherwise procedural sway, head turn toward you and tilt on VRM humanoid / common-named bones (mixamo etc.); unrigged models just glide. Blink uses the VRM `blink` expression. Prop cues flare the model's emissive pink; `?moochoker=1` adds a code-built choker + bell on the neck bone. The model carries its own small light rig.
- Mirror twin: a pose-synced clone when the model is ≤ 70k triangles, otherwise hidden for the model.
- Walk-in / stop at 2 m / reset are unchanged (the model rides the same rig).
- "Sync my videos" (`sync_gcs.py`) now also copies the newest model to `model/missmoo.<ext>` + `model/manifest.json` (`--model-only` for just that).

## v35 — Miss Moo follows you (companion mode, on by default)
- **Follow me**: Miss Moo now goes wherever you go: every room and corridor (the crossing diagonals too), and after a teleport. She keeps about 2–3.5 m away and gets out of your way if you come closer than about 1.5–2 m, sidestepping to a clear spot so she doesn't back into a wall. If you get more than 12 m away, or she gets stuck, she quietly turns up behind you, out of view.
- **Getting around**: she walks on a narrower "Moo-only" floor (room discs plus the middle of each corridor). A coarse grid path-finder (built once at load, re-planned a few times a second) takes her around pods, pillars and the control panel, so she never walks through walls.
- **Animation**: with a rigged model the Walk clip plays at a speed matched to how fast she moves (`?moostride=1.1` sets stride length), and Idle when she stops. The clips blend smoothly, and an optional **Wave** clip plays as a one-shot. She faces where she's walking and turns to face you when standing. The built-in figure gets the same behaviour from its own procedural walk.
- **Playful bits**, one every 6–15 s: hop, twirl, head tilt, tail flick, wave, peek out from beside you, a half circle around you, wander off to look at a pod or screen and trot back, or hide behind a pod and pop out. If you look straight at her for a moment she glows pink. The longer bits stop as soon as you walk off.
- **Moo Track** still takes over while it plays (the scripted tunnel walk), then follow mode resumes.
- **Toggle**: the **FOLLOW ME: ON/OFF** button on the panel's Moo wing, the **🦊 Follow me** button in the 2D Moo box, or `?moofollow=0` / `?moofollow=1` in the URL. The panel and 2D buttons remember your choice (localStorage), and the URL parameter beats the saved setting.
- **Test hooks**: `__moo.companion.S` (position, `info`, current `act`), `__moo.companion.act('hop'|'spin'|'tilt'|'flick'|'wave'|'peek'|'circle'|'wander'|'hide')`, `__moo.setFollow(bool)`, `__moo.cow.ext.weights()` (idle, walk, wave weights and walk time-scale).
- Model: `Foxfire_Ahri_rigged_v2.glb` (same mesh/rig, now with Idle, Walk and Wave clips). Cache-bust `?v=35`.

## v36 — Miss Moo "Circuit Doll" look
- New model `Foxfire_Ahri_circuit.glb`, now the newest file in the Miss Moo Model folder, so it is the one used. Same mesh, rig and clips as v35 (Idle, Walk, Wave); 69,894 triangles, which is under the 70k limit, so the mirror twin still shows.
- Look:
  - glossy black suit and boots covering everything from the neck down, with glowing hot-pink circuit traces baked into a 2048 px emissive map (triplanar PCB pattern: traces, pads, a few diagonal jogs)
  - a small glowing pink padlock emblem at the collar
  - white hair with hot-pink streaks and tips
  - white ears with pink inners
  - glowing pink eyes
  - tails black at the root fading to glowing hot-pink tips, with faint circuit lines
  - gold belt, tassel and boot bows
  - natural light skin on the face, neck and hands
- Materials: base colours are vertex colours. A roughness/metal map makes the suit glossy and the gold metallic.
- The pink lines breathe gently (a slow pulse on any model that has an emissive map). `?moopulse=0` turns the pulse off. When you look at her, the pink glow flash still works on top of it.
- Build scripts (kept off the site): `work/rig/stage2c.py` (colours and masks), `stage3.py` (clips, `TAG=circuit NOEXPORT=1`) and `stage4.py` (padlock, UVs, texture bake, export). Cache-bust `?v=36`.

## v37 — bigger, crawling, curious Miss Moo with spiral eyes
- **Scale +10%** (default 1.68 m → ~1.85 m), applied to her whole rig from the feet so it works for any model; the mirror twin, floor contact, follow distances and walk/crawl cadence all scale with it. Override with `?mooscale=1` (0.6–1.6).
- **Crawl clips** in the rig (`Crawl`, `CrawlDown`, `CrawlUp`; `work/rig/crawl.py`, IK-authored then baked): a playful fox prowl on hands and knees with head up, ears perky and tails up and swishing; `CrawlUp` ends in a little pounce before she stands. `?moocrawlstride=` tunes foot sync.
- **Spiral "hypnosis" eyes**: the eyes are their own `MooEye` material with a planar UV per eye; a hot-pink/black 2-arm spiral (canvas texture, emissive) spins slowly, both eyes the same way, mirror twin included. `?moospiral=0` turns it off, `?moospiralspeed=0.4` (turns/s), `?moospiralcolor=ff1f8f`.
- **Curious companion** (the toggle is now "Companion"): she stays in your room or corridor and follows you when you change rooms, keeps ~1.6 m personal space, and spends most of her time exploring points of interest (monitor 10–30 s, pods/bottles, panels, doorways, barn stalls 5–15 s) — walking over, looking, head tilts, a wave now and then. She glances at you now and then, checks in every 30–60 s, and reacts (looks back, glows, may wave) if you watch her for a moment. Playful moves (hop, spin, peek, circle, hide, crawl…) every 15–35 s; crawl is ~13% of them. The Moo Track still overrides.
- **Moo Track hallway decluttered**: hanging headsets and all cables removed; arches, sign, spiral end, floor arrows and wall screens kept (prop cues now just light the wall screens).
- Model: `Foxfire_Ahri_circuit_v2.glb` (69.9k tris). Test hook `__moo.sim(seconds)` fast-forwards her behaviour. Cache-bust `?v=37`.

## v38 — Ari: stalls, friends, skins, crawl controls, natural movement
**Name.** Miss Moo is now **Ari** in every visible label (panel, 2D box, nameplates, messages). Internal ids, `?moo*` URL parameters, file names, the GCS paths and the **Moo Track** name are unchanged, and the Drive folder is still called **Miss Moo Model** (https://drive.google.com/drive/folders/1B6yh_ZRRGWyTYIFNGlokrdnZKKnFZ4fT).

**Model** `Foxfire_Ahri_circuit_v5.glb` (69,894 tris, under the 70k mirror-twin limit). Clips: Idle, IdleShift, IdleStretch, IdleHairTouch, IdleHipHand, IdleYawn, Walk, Wave, Crawl, CrawlDown, CrawlUp, Sniff, SitDown, SitIdle (cross-legged), SitUp, Nap. Scale **1.21** (about 2.03 m), still fitting doors, corridors, pods and stalls. `?mooscale=` still overrides.

**Body / arms / walk (feedback pass).**
- Applied rest pose (`work/rig/rest.py`): pelvis and chest square, straight legs under the hips (no bow legs), knees and feet forward.
- Arms hang relaxed, palms facing the thighs, thumbs forward, soft elbow bend.
  - Limit: the upper arms sit about **15–18° from vertical**. Her hips and belt stop them going closer without the forearms cutting into the body (the earlier note said 18–20°; the hinge/twist fix gained a few degrees).
- **Left arm fix (v38 live feedback "looks broken, bent weird").**
  - Cause: the rest pass had moved the left elbow joint 5.7 cm down the forearm, so the arm bent mid-forearm.
  - Fix: the joint was put back, and the upper-arm roll was aligned to the elbow hinge.
  - The large forearm pronation (left −162°, right −90°) is now spread smoothly along the forearm skin instead of twisting at the wrist.
  - Both arms are now mirror images: palm-to-thigh 0.89/0.88, thumb-forward 0.89/0.89.
  - Quaternion check over every clip: 0 sign flips.
  - The fast arm snaps in IdleStretch/IdleHairTouch are gone: the hand now travels on an arc around the shoulder.
  - The crawl/sniff elbow no longer slams into full extension (soft IK). The largest single-key arm jumps went from 46° to under 16°; the worst crawl forearm speed went from 965°/s to 460°/s.
- **Walk.**
  - Hips, legs and tails keep their sway, roll and twist.
  - The spine counter-rotates, so the chest, shoulders, neck and head stay level. There is a tiny shoulder counter-twist, no side lean and no root side-sway, and the arm swing stays.
  - Measured lateral wobble over a cycle: chest 0.75 cm, neck 0.77 cm, head 0.78 cm (was 1.5 / 2.1 / 2.4 cm); chest roll 0.16° (was 3.1°).
  - Neutral step width; she always faces where she is walking (heading-vs-velocity 0° max over 1,300+ samples) and retreats by turning away, not walking backwards.
  - Hip twist is clamped.
  - **Turn rate halved:**

    | | Gain | Cap | Notes |
    |---|---|---|---|
    | Old | 4.5/s (7/s when scooting) | about 7 rad/s peak | |
    | New | 2.25/s | 1.75 rad/s | acceleration 5 rad/s²; walks at half speed through sharp turns |

  - Tails swing independently with damping.
- Idle: neutral stance plus varied one-shot gestures (shift, stretch, hair tuck, hand on hip, yawn).
- **Crawl**: smooth feline gait (1.6 s cycle, dense eased keys; hip-height wobble std 2.1 mm vs 8.4 mm before), tails relaxed and trailing.

**v38c — crawl arms and Sit/Sniff toggles.**
- **Crawl left arm fix:** her left arm folded and twisted under the chest when she crawled or sniffed. Three things caused it:
  - The crawl arm IK picked its elbow direction in 90° steps from bones whose rolls differ left vs right, so the left elbow pointed about 77° differently.
  - The sculpt's chest is twisted about 12°, so on all fours the left shoulder sat 5 cm higher. The left arm was pulled straighter (bend 30° vs 60°).
  - The hand was only turned about one bone axis, which could not lay the left palm flat.
- **The fix:**
  - The arms now use an analytic, mirrored two-bone solve (shoulder over the hand, slight elbow bend, elbows pointing back and out).
  - The chest is untwisted by 12.45° on all fours so both shoulders are level.
  - The hand plant gives both arms the same reach.
  - Each palm is laid flat from the hand's own thumb and palm features (fingers forward, thumb in), with about half of the pronation carried by the forearm so the wrist doesn't twist like a candy wrapper.
- **Measured left vs right over the whole crawl cycle:**

  | | Crawl | Sniff |
  |---|---|---|
  | Elbow direction | within 6° | within 5° |
  | Elbow bend | within 10° | within 4° |
  | Hand plant (relative to each shoulder) | within 4 cm | within 4 cm |
  | Palm and fingers | identical | identical |

- **Sitting:** the hands now rest palm-down on the knees, mirrored.
- **Sit / Sniff are toggles** (2D box and VR panel; the button reads ON/OFF and glows when on).
  - **Sit: ON:** she sits (SitDown, then a SitIdle loop) and stays seated, with no auto-stand. **Sit: OFF:** SitUp, then normal companion behaviour.
  - **Sniff: ON:** she keeps sniffing around until it is turned OFF.
  - Pressing Crawl or Crawl: ON, switching to the other toggle, or sending her to a stall turns the active toggle OFF first.
- **Tails retuned (Ahri-style):** a bushy, upward-curving crescent behind her that floats instead of fanning out into 9 spikes or drooping.
  - **Idle:** tips fan about 50° (was about 130°) and stay up (lowest tip about 1.4 m; it was 0.25 m). One slow sway (3.8 s cycle) moves the whole cluster, with the centre tails leading by up to 0.25 s. The base stays nearly still, the motion grows toward the tips, and the wave travels from base to tip.
  - **Moving:** momentum (speed or turning) swings the cluster back and narrows it to about 25–28° at her walk. When she stops, it eases back into the curl over about 2–3 s.
  - **Damping:** every bone uses an over-damped follow-through (no spring, no overshoot, no jelly). The happy tail flick is now a slow swish through the same damping.
  - **Crawl, sit and nap** keep their own tail poses; only the sway and damping are added.
  - **Tuning:** the constants are in the `TAIL` block in `moomodel.js`. Any of them can be overridden from the URL as `?tail_<name>=` (for example `?tail_spread_idle=50`). `?mootailfx=0` shows the clip-only tails.

**Crawl / sit / sniff controls.**
- **Crawl** button (6–10 s), **C** key (Shift+C = hold), and a **Crawl: ON** toggle that keeps her crawling.
- She also crawls naturally for 6–10 s about every 60–90 s of moving.
- **Sit** (cross-legged) and **Sniff** buttons in the 2D "Ari & friends · stalls" box and on the panel's cast wing.

**Stalls (barn).**
- Pick a home stall on the stall plaques (VR) or with the prev/next buttons. Stalls 1–6 are on the right side, 7–12 on the left.
- The chosen stall glows and gets a nameplate. **Send to stall / Let out** toggles her.
  - When sent, she walks there, or turns up there if you are not looking.
  - Inside she idles, wanders, naps (lying sideways) and peeks over the gate; she does not follow you.
- The stall gate swings open as she goes in or out.
- The Moo Track still overrides; she returns to her stall afterwards.
- Saved in localStorage. URL: `?moostall=N`, `?moohome=1|0`, `?moostalls=id:N,...`.

**Skins.**
- Built-in **Circuit Doll** (default) plus **Crimson Fox**, switchable at runtime: the wardrobe mirror in her stall (prev/next), the panel or the 2D box, with a sparkle when it changes.
- Saved per character. URL: `?ariskin=crimson-fox` (or `?mooskin=`).
- Adding a skin: upload `<model file name without .glb>__<Skin Name>__base.png` (plus optional `__emissive.png`, `__orm.png`; jpg/webp also fine) into the same Drive folder as the model, then Sync.
  - Skins are tied to the exact model file name and its UVs; a rebuilt model needs its skin PNGs re-uploaded.
  - The newest upload of a name wins.

**Friends (multi-character roster).**
- Each subfolder of **Miss Moo Model** is a character.
- **To add a friend:**
  1. In Drive, open Resonance Chamber Videos → Miss Moo Model and create a folder named after the friend (e.g. `Luna`).
  2. Upload one `.glb`/`.vrm` (rigged with Idle/Walk clips is best; an unrigged model just glides; auto-rigging is done only when you ask for it).
  3. Optional `settings.json`: `{"name":"Luna","scale":1.0,"rigged":true,"color":"#ff66cc","defaultSkinName":"Original"}`.
  4. Optional skins named as above.
  5. Run Sync.
- Sync writes `model/<slug>/model.glb`, `manifest.json`, `skins.json`, and `model/roster.json`.
- Each character gets a stall, Send/Let out and skins. **All to stalls** sends everyone home. At most **3** can be out at once.
- Characters keep apart and pick different points of interest. Characters in stalls far from you animate at a reduced rate (LOD).
- `?moofriend=1` adds a placeholder friend for testing.

**Known artifacts:**
- the tassel dips through the floor when she sits;
- tails can clip the stall dividers and rails (the stalls are about 1.1 m deep);
- crawl palms sit slightly into the floor;
- the padlock emblem can look slightly offset in some poses.

**v38d — polish pass (model v6).**
- **Belt tassel:** it was rigid to the hips, so it went about 26 cm through the floor when she sat. It now has a 3-bone chain. A drape pass bends any segment that would go under the floor so it lies on the floor instead. Lowest point above the floor: SitDown 8 mm, SitIdle 2 mm, SitUp 5 mm, Nap 22 mm, CrawlUp 11 mm (was −255 to −263 mm in Sit, −26 mm in Nap, −7 mm in CrawlUp).
- **Crawl palms:** an old reach clamp lifted the hand target off the floor along the reach line, so after each step the palm hovered for about 12 frames. It is removed, and the arm solve now keeps the wrist height when it has to pull the hand in. A floor lock plus per-side wrist height and hand pitch keep the palm 0.5–1.0 mm above the floor for the whole stance (about 75% of the cycle, never below the floor) in Crawl and Sniff.
- **Padlock:** it was skinned rigidly to Spine2 while the collar is a Spine2/Neck blend, so it slid up to 5.7 mm off the collar on all fours. It now uses weights fitted to the collar (Spine2 0.62, Neck 0.32, LeftShoulder 0.04, Spine1 0.02). Its largest offset from the collar is 1.3 mm.
- **Standing arms:** the rest pose was re-solved with a collision-checked arm search, and the right clavicle was raised 10° (it also levels the shoulders). Upper arm from vertical: left 15.0° → 9.2°, right 17.1° → 13.6°. The right arm can't go lower without the forearm hitting the hip flare.
- **Walk:** each frame, a counter-roll at the spine/chest and neck/head cancels the sideways sway. Chest and head sway went from 0.75–0.78 cm to 0.0–0.03 cm (hips, legs and tails still sway).
- **Tails in stalls:** each tail segment is kept inside the stall (front rail, dividers, trough, 5 cm margin) while she is home. The constraint is applied after the follow-through filter and blends in and out over 0.4 s. Her model is also centred on her hips now, not on the bounding box: the box includes the tails, so her body sat about 0.5 m in front of her position and went through the front rail when she peeked out.

**v38e — crawl legs, phasing through things, D-Mon size, wings / ears / tails, new characters (model v7).**
- **Crawl legs:** the knee pole search used 90° steps and didn't score the knee's sideways position, so the knees crossed the midline (both about 11–14 cm onto the other side). The pole search now uses 3° steps and penalises the knee leaving its own side. The leg targets also sit 3 cm outside the hip line. Crawl clearance from the midline: knees 5.6 / 8.9 cm, feet 21 cm apart, leg meshes at least 2.6 cm clear. Sniff: knees 7.8 / 10.0 cm. Palms, padlock and tassel are unchanged.
- **Getting stuck:** if a character makes almost no progress toward its goal for 1 s, it phases through. Obstacle, personal-space and peer avoidance are switched off for that move, and it walks straight through pillars, stalls, you and other characters. Phasing stays on while it is still inside something, then normal avoidance resumes. Keeping about 1.6 m from you is still preferred but never blocks movement. In the stall phases they still stay in the stall and can leave when let out.
- **D-Mon** is 30% smaller (scale 0.847 = 1.21 × 0.7). Drive `settings.json` has `"scale": 0.847`, and the code has the same value as a fallback.
- **Extra anatomy (`apx.js`):** the Drive friends are static sculpts with no skeleton. Their wings, bunny ears and tail are now picked out as regions and moved in the vertex shader like Ari's tails. The motion is a slow sway that lags from base to tip and gets stronger toward the tip, plus a lean back when they move or turn. The lean goes through an over-damped filter, so there is no overshoot or jelly. Regions are set per character; a Drive `settings.json` `"appendages"` list overrides them. Ari's ear bones get the same subtle damped motion on top of her clips (`?mooapx=0` turns it off, `?mooapx=debug` tints the regions).
- **Facing:** Angel, Miss Bunny and D-Mon faced away (−Z). They are turned around in code, and a `settings.json` `"yaw"` value (degrees) overrides this.
- **Multi-file characters:** a Drive folder with several mesh files (head, body, hands …) is merged into one figure, keeping each part's original position. When a part exists as both STL and OBJ, the STL is used. Parts named base, stand, pedestal or plinth are dropped, and are used to find which way is up. Studs under the soles are trimmed and the figure is turned to face forward. Makima now has all 10 parts assembled instead of a single hand, and Power has all 4.
- **Esdeath:** her STL is Y-up, so the default Z-up turn left her lying on her back. Her Drive `settings.json` (`"up": "y", "base": "remove"`) stands her upright, and the round display base is cut away (bottom 5.5% of her height).

**Build:** build scripts are kept off the site: `work/rig/rest.py`, `stage3.py`, `crawl.py`, `nap.py`, `gestures.py`, `tassel_rig.py`, `tassel.py`, `padfit.py`, `stage4.py` (`work/rig/pipe.sh`), `legm.py`. Cache-bust `?v=38e` (fifth v38 deploy).
