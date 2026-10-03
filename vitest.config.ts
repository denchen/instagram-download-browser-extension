import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same React -> Preact aliases as esbuild.config.mjs, so the popup's
  // `react` / `react-dom/client` imports resolve to preact/compat in tests too.
  resolve: {
    alias: {
      "react-dom/client": "preact/compat/client",
      "react/jsx-runtime": "preact/jsx-runtime",
      "react-dom": "preact/compat",
      react: "preact/compat",
    },
  },
  test: {
    // Tests run in Node unless a file opts into the DOM with a
    // `// @vitest-environment happy-dom` docblock.
    environmentOptions: {
      happyDOM: { url: "https://www.instagram.com/" },
    },
    restoreMocks: true,
    unstubGlobals: true,
  },
});
