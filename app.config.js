// The app resolves its API bases in src/api/config.js from EXPO_PUBLIC_* env vars
// (.env for local runs, eas.json `env` for builds) — the values mirrored into
// `extra` below are informational only. Default is the TLS edge; set
// EXPO_PUBLIC_API_HOST=192.168.1.5 to point at a backend on your LAN instead.
const host = process.env.EXPO_PUBLIC_API_HOST || '';
const edge = process.env.EXPO_PUBLIC_API_ORIGIN || 'https://api.ggfix.in';
const masterPort = process.env.EXPO_PUBLIC_MASTER_PORT || '8091';
const masterBase =
  process.env.EXPO_PUBLIC_MASTER_DATA_BASE ||
  process.env.EXPO_PUBLIC_MASTER_BASE ||
  (host ? `http://${host}:${masterPort}` : edge);

export default {
  expo: {
    name: 'ggfix Shop',
    slug: 'ggfixshop',
    // EAS account/organization that owns the project (from your Expo dashboard).
    // Verify this matches expo.dev → your account. Change if different.
    owner: 'snandhas-organization',
    version: '1.0.0',
    platforms: ['ios', 'android', 'web'],
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    jsEngine: 'hermes',
    icon: './assets/logo.png',
    splash: { image: './assets/logo.png', resizeMode: 'contain', backgroundColor: '#ffffff' },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.ggfix.shopapp',
      infoPlist: {
        // iOS has no shared Downloads folder, so a saved statement lands in the
        // app's own Documents directory. These two keys are what make that
        // directory show up in the Files app under "ggfix Shop" — without them
        // the file is saved somewhere the owner cannot reach.
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
        NSLocationWhenInUseUsageDescription:
          'We use your location to show pickup-enabled repair shops nearby and to set your default delivery address.',
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    android: {
      package: 'com.ggfix.shopapp',
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff' },
      // READ_CONTACTS backs Cash Book → Add Customer → "Add from Contacts".
      // POST_NOTIFICATIONS backs the "Download complete" receipt a saved
      // statement leaves in the shade (Android 13+).
      // The expo-contacts plugin below injects the first too, but they are
      // listed here so the manifest's permission set is readable in one place.
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'READ_CONTACTS',
        'POST_NOTIFICATIONS',
      ],
    },
    plugins: [
      ['expo-local-authentication', { faceIDPermission: 'Use Face ID to unlock GGFIX.' }],
      // Cleartext HTTP for the plain-http backend. The bare android.usesCleartextTraffic
      // key is ignored by Expo prebuild — it must be set via expo-build-properties.
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: true,
            // Ship native libraries for real phones only (arm64-v8a). This drops the
            // emulator-only ABIs (x86/x86_64, ~52MB) and old 32-bit devices
            // (armeabi-v7a, ~16MB), shrinking the universal APK from ~114MB to ~50MB.
            // buildArchs writes `reactNativeArchitectures` into gradle.properties.
            buildArchs: ['arm64-v8a'],
          },
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'We use your location to show pickup-enabled repair shops nearby.',
        },
      ],
      [
        'expo-contacts',
        {
          contactsPermission:
            'We use your contacts so you can pick a customer or supplier from your phone book instead of typing the number.',
        },
      ],
    ],
    extra: {
      API_HOST: host || edge,
      API_BASE_URL: null,
      AUTH_BASE: null,
      MASTER_BASE: masterBase,
      TICKET_BASE: null,
      TECHNICIAN_BASE: null,
      SHOP_BASE: null,
      INVENTORY_BASE: null,
      MARKETPLACE_BASE: null,
      PICKUP_BASE: null,
      ORDER_BASE: null,
      // Required for EAS builds. Get this value by running `npx eas init`
      // (it prints the ID), or copy it from expo.dev → your project → settings.
      eas: {
        projectId:
          process.env.EAS_PROJECT_ID ||
          '2282d02b-e384-47b7-8689-1871a9fee61e',
      },
    },
  },
};
