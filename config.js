// Site defaults for Google Drive streaming. URL params (?pink=&crimson=&mono=&barn=&key=) and settings saved on the device override these.
// The key is a browser key restricted to the Drive API and to https://fubecaelder-cpu.github.io/*, so it is safe to publish.
export const DRIVE_DEFAULTS = {
  key: 'AIzaSyDxWnFH4WXT6PchGC41afk5fnYZCC7m_jg',
  // parent folder "Resonance Chamber Videos" (11BslvaY9UtfjnIXFefWoHosfakwHaXQx)
  folders: [
    '1MnqCwqPWlydsSFfsi-9DBNNQDKLK668j',   // Pink Room
    '1OHoJhFtNwnFHEGM9rpVABPdkHPuV2IgF',   // Crimson Room
    '17GxD2HPaYf9uV1Sm6oE88P5ZoKrPP3wz',   // Op-Art Room
    '1AuYLwVSCvwkxwlrREkRoCWOM0ipGmUfX',   // Little Moo Barn (v22; its "Pods" subfolder is 1OhyaGi6AIdTRntBFQA5APWG9JCshsMPv)
  ],
  pollSeconds: 60,
  // v21: public Cloud Storage bucket with <room>/manifest.json (built by sync_gcs.py); main screens try it before Drive
  gcs: 'https://storage.googleapis.com/resonance-chamber-videos',
};

// v24 Moo Track: where the narrator audio and the cue list come from. URL params ?moo=<audio url | Drive link | Drive file id | gcs:path | assets/file.mp3 | default>
// and ?moocues=<json url | Drive link | Drive file id> override these; a file chosen with the pickers overrides everything for the session.
// Leave `narrator` empty to auto-find: assets/moo_narrator.(mp3|m4a|ogg|wav), then gs://BUCKET/moo/narrator.(mp3|m4a), then an audio file with "moo" in its name in the
// Little Moo Barn Drive folder. Until one is found a generated placeholder track plays. Cues: moo_cues.json (also looked for as "moo_cues.json" in the barn Drive folder / GCS moo/).
export const MOO_DEFAULTS = {
  narrator: '',
  cues: '',
  autoFind: true,
  // v28: drop a .glb / .gltf (embedded) / .vrm into the Drive folder "Miss Moo Model" and the newest one replaces the code-built Miss Moo.
  // Order tried: ?moomodel=<url | Drive link/id | gcs:path | off>, then GCS model/manifest.json (sync_gcs.py), then the Drive folder, then the built-in figure.
  modelFolder: '1B6yh_ZRRGWyTYIFNGlokrdnZKKnFZ4fT',
};
