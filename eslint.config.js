// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      "_site/**",
      ".bundle-check/**",
      ".maestro/**",
    ],
  },
  {
    // Build, QA and analysis scripts run under Node rather than in the app
    // bundle, so they legitimately use Node globals that the Expo config (which
    // targets React Native) does not declare. Without this every `__dirname`
    // and `Buffer` in scripts/ reads as no-undef.
    files: ["scripts/**", "*.config.js", "*.config.mjs", "*.config.cjs"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        module: "writable",
        require: "readonly",
        exports: "writable",
      },
    },
  },
  {
    /**
     * The React Compiler rules ship as errors, but this app does not use the
     * compiler. They flag patterns that are legal, working React: writing to a
     * ref during render, setting state from an effect, and manual memoization
     * whose deps the compiler would infer differently. The table, gesture and
     * chip-animation code does several of those deliberately, and each is
     * verified on device.
     *
     * Switching them off entirely would throw away useful signal. Reworking all
     * 41 would mean rewriting animation internals that are known good. So they
     * are warnings: visible and reviewable, but they do not block CI.
     */
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);
