const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Gradle writes compile output under expo-modules-autolinking/android whenever
// the app is built locally, and rewrites it while Metro is still crawling. The
// watcher then calls fs.watch() on a directory that has already been replaced
// and `expo start` dies with ENOENT (-4058). Nothing in there is ever imported
// by the bundle, so keep it out of the crawl entirely.
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  /node_modules[\\/]expo-modules-autolinking[\\/]android[\\/].*[\\/]build([\\/]|$)/,
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
