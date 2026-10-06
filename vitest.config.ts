import { defineConfig } from "vitest/config";

export default defineConfig({
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
