const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Gradle/Kotlin compile output under any expo-*-gradle-plugin package gets
// rewritten while Metro is still crawling node_modules, and the watcher's
// fs.watch() call on a directory that just got replaced dies with ENOENT
// (-4058) — seen under expo-modules-autolinking/android, expo-dev-launcher's
// android build AND its expo-dev-launcher-gradle-plugin/build/kotlin cache,
// and expo-modules-core so far, each a new subpath. Nothing under a native
// android/gradle build dir is ever imported by the JS bundle, so block the
// whole class (any build/ dir under an android/ folder, or under a package
// named *-gradle-plugin) instead of listing packages one at a time.
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  /node_modules[\\/].*[\\/]android[\\/].*[\\/]build([\\/]|$)/,
  /node_modules[\\/].*-gradle-plugin[\\/]build([\\/]|$)/,
  /node_modules[\\/].*[\\/]build[\\/]classes[\\/].*/,
];

// `inlineRem: false` is what makes spacing responsive app-wide.
//
// By default NativeWind BAKES the rem base into the compiled stylesheet at
// build time (`inlineRem: 14`), so `p-4` ships as a literal `paddingTop: 14`
// and no screen can ever respond to the device. Turning it off leaves rem
// units unresolved in the bundle, to be read at render time from NativeWind's
// `rem` observable — which `src/theme/remScaling.js` sets to the same
// device curve `theme/metrics.js` uses for `rs()`.
//
// The base is still 14 on a 392pt reference device, so nothing shifts there;
// smaller phones tighten and tablets loosen, which is the point.
module.exports = withNativeWind(config, { input: './global.css', inlineRem: false });
