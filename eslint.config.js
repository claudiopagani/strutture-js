import js from "@eslint/js";

const runtimeGlobals = Object.fromEntries(
  [
    "AbortController",
    "Buffer",
    "URL",
    "URLSearchParams",
    "clearInterval",
    "clearTimeout",
    "console",
    "fetch",
    "globalThis",
    "performance",
    "process",
    "queueMicrotask",
    "setInterval",
    "setTimeout",
    "self",
    "structuredClone",
  ].map((name) => [name, "readonly"]),
);

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "results/**"],
  },
  {
    files: [
      "src/**/*.js",
      "tests/**/*.js",
      "scripts/**/*.js",
      "examples/**/*.js",
      "validation/**/*.js",
      "benchmarks/**/*.js",
      "benchmarks/**/*.mjs",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: runtimeGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off",
    },
  },
];
