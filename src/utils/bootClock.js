// TEMP DEBUG utility — delete this file alongside every `[BOOT]` log once the
// real startup timing is confirmed on a device. Captured as early as possible
// (imported first thing in App.js) so every [BOOT] log across the app shares
// one clock and can be lined up into a single timeline.
export const BOOT_START = Date.now();
export const since = () => `${Date.now() - BOOT_START}ms`;
