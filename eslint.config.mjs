import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    // node-pg-migrate migration files: plain CommonJS regardless of package "type".
    files: ["**/migrations/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        exports: "writable",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
  {
    // k6 load test scripts run inside the k6 runtime, not Node — __ENV is a k6 global.
    files: ["**/test/load/*.k6.js"],
    languageOptions: {
      globals: { __ENV: "readonly" },
    },
  },
);
