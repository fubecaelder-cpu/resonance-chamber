// Site defaults for Google Drive streaming. URL params (?pink=&crimson=&mono=&barn=&key=) and settings saved on the device override these.
// The key is a browser key restricted to the Drive API and to https://fubecaelder-cpu.github.io/*, so it is safe to publish.
export const DRIVE_DEFAULTS = {
  key: 'AIzaSyDxWnFH4WXT6PchGC41afk5fnYZCC7m_jg',
  // parent folder "Resonance Chamber Videos" (11BslvaY9UtfjnIXFefWoHosfakwHaXQx)
  folders: [
    '1MnqCwqPWlydsSFfsi-9DBNNQDKLK668j',   // Pink Room
    '1OHoJhFtNwnFHEGM9rpVABPdkHPuV2IgF',   // Crimson Room
    '17GxD2HPaYf9uV1Sm6oE88P5ZoKrPP3wz',   // Op-Art Room
    '1AuYLwVSCvwkxwlrREkRoCWOM0ipGmUfX',   // Barn Room (v22; its "Pods" subfolder is 1OhyaGi6AIdTRntBFQA5APWG9JCshsMPv)
  ],
  pollSeconds: 60,
  // v21: public Cloud Storage bucket with <room>/manifest.json (built by sync_gcs.py); main screens try it before Drive
  gcs: 'https://storage.googleapis.com/resonance-chamber-videos',
};
