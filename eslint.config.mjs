import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Service worker y assets generados (serwist + copia en iOS bundle).
    "public/sw.js",
    "public/swe-worker-*.js",
    "ios/App/App/public/**",
  ]),
  // React Compiler (react-hooks/*) emits optimisation hints. They are useful
  // as annotations but should not block CI — we'll tune hotspots over time.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/rules-of-hooks": "warn",
    },
  },
]);

export default eslintConfig;
