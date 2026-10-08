// Site defaults for Google Drive streaming. URL params (?pink=&crimson=&mono=&key=) and settings saved on the device override these.
// The key is a browser key restricted to the Drive API and to https://fubecaelder-cpu.github.io/*, so it is safe to publish.
export const DRIVE_DEFAULTS = {
  key: 'AIzaSyDxWnFH4WXT6PchGC41afk5fnYZCC7m_jg',
  // parent folder "Resonance Chamber Videos" (11BslvaY9UtfjnIXFefWoHosfakwHaXQx)
  folders: [
    '1MnqCwqPWlydsSFfsi-9DBNNQDKLK668j',   // Pink Room
    '1OHoJhFtNwnFHEGM9rpVABPdkHPuV2IgF',   // Crimson Room
    '17GxD2HPaYf9uV1Sm6oE88P5ZoKrPP3wz',   // Op-Art Room
  ],
  pollSeconds: 60,
};
