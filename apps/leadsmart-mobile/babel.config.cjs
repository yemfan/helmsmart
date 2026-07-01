const path = require("node:path");

const monorepoRoot = path.resolve(__dirname, "../..");

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          extensions: [".tsx", ".ts", ".js", ".json"],
          alias: {
            "@leadsmart/shared": path.join(monorepoRoot, "packages/shared/src"),
            "@leadsmart/api-client": path.join(monorepoRoot, "packages/api-client/src"),
          },
        },
      ],
      // CRITICAL: the worklets plugin MUST be the last entry in this
      // array. It scans every transformed file for `worklet` directives
      // and inlines them into native bytecode; anything that runs after
      // it sees the already-rewritten AST and breaks the worklet
      // contract. As of Reanimated 4 the plugin moved out of
      // react-native-reanimated into react-native-worklets. See:
      // https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/installation
      "react-native-worklets/plugin",
    ],
  };
};
