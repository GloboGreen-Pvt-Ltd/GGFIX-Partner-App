const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Android 11+ package visibility for the receipt share on Booking Thank You.
 *
 * WHY THIS EXISTS AS A PLUGIN
 * `android/` is committed in the working copy but GITIGNORED in the GitHub
 * mirror, so an EAS build never sees the hand-edited AndroidManifest.xml — it
 * runs `expo prebuild` and generates a fresh one from app.config.js. Without
 * this plugin the queries block exists only on this machine, and the cloud build
 * silently ships without it: `Linking.canOpenURL('sms:')` returns false on a
 * phone that has Messages, and react-native-share's shareSingle reports
 * "not installed" on a phone that has WhatsApp. Both routes fall back to the
 * generic share sheet and nobody can tell why.
 *
 * Expo has no first-class `queries` key, and `android.intentFilters` is for
 * filters this app EXPOSES, not for apps it wants to see — hence the manual
 * manifest edit below.
 *
 * Locally the plugin is inert: prebuild does not run when `android/` is present,
 * which is why the same entries are also written into the checked-in manifest.
 * The two must be kept in step.
 */
const PACKAGES = [
  'com.whatsapp',       // WhatsApp
  'com.whatsapp.w4b',   // WhatsApp Business — plenty of shops run only this one
];

const SCHEMES = [
  { action: 'android.intent.action.VIEW', scheme: 'sms' },
  { action: 'android.intent.action.SENDTO', scheme: 'smsto' },
];

module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // `queries` is a sibling of `application`, not a child of it.
    if (!Array.isArray(manifest.queries)) manifest.queries = [{}];
    const queries = manifest.queries[0];

    queries.package = queries.package || [];
    for (const name of PACKAGES) {
      const already = queries.package.some((p) => p?.$?.['android:name'] === name);
      if (!already) queries.package.push({ $: { 'android:name': name } });
    }

    queries.intent = queries.intent || [];
    for (const { action, scheme } of SCHEMES) {
      const already = queries.intent.some(
        (i) => i?.action?.[0]?.$?.['android:name'] === action
          && i?.data?.[0]?.$?.['android:scheme'] === scheme,
      );
      if (already) continue;
      queries.intent.push({
        action: [{ $: { 'android:name': action } }],
        data: [{ $: { 'android:scheme': scheme } }],
      });
    }

    return cfg;
  });
};
