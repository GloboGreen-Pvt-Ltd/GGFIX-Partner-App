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

module.exports = withNativeWind(config, { input: './global.css' });
