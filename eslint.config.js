import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["client/dist/**", "server/dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["client/public/sw.js"],
    languageOptions: {
      globals: {
        caches: "readonly",
        fetch: "readonly",
        self: "readonly",
      },
    },
  },
  {
    files: ["desktop/main.cjs"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        require: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
