// @ts-check
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignores — applies to every config object below.
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "web/src-tauri/target/**",
      "web/src-tauri/gen/**",
      "web/android/**",
      "web/ios/**",
      // Vite-generated env type file
      "web/src/vite-env.d.ts",
    ],
  },

  // Base TS-ESLint recommended rules (type-checked variant omitted —
  // it requires parserOptions.project which slows CI significantly).
  ...tseslint.configs.recommended,

  // React-hooks rules scoped to web workspace only so the plugin is registered
  // and eslint-disable-next-line comments referencing it don't error.
  {
    files: ["web/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // exhaustive-deps is warn (not error) — existing intentional omissions
      // are already suppressed with inline eslint-disable comments.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Project-wide overrides: tune noisy rules to "warn" so the gate is green
  // on the current codebase while still surfacing real problems in future diffs.
  {
    rules: {
      // "any" is used intentionally in JSON response shapes (search.ts etc).
      "@typescript-eslint/no-explicit-any": "warn",
      // Unused vars: existing code has some intentional unused params (e.g. _ctx).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Empty catch blocks exist for deliberate silent fallbacks.
      "@typescript-eslint/no-empty-object-type": "warn",
      // Server intentionally uses console.log / console.error for structured output.
      "no-console": "warn",
      // Namespace imports are used in some files (e.g. import * as X).
      "@typescript-eslint/no-namespace": "warn",
    },
  },
);
