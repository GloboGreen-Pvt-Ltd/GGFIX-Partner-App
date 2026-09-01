module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // gluestack-ui pulls in react-stately (.mjs) which uses static class blocks;
    // Metro's default transform doesn't enable them, so add the plugin explicitly.
    plugins: [
      '@babel/plugin-transform-class-static-block',
      // Reanimated 4 worklets plugin — MUST be listed last. Required for the
      // reanimated-based KeyboardAwareScrollView (react-native-keyboard-controller)
      // used for keyboard avoidance on the Customer Details form.
      'react-native-worklets/plugin',
    ],
  };
};
