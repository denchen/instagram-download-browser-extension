import { argv } from "node:process";
import { Script } from "node:vm";
import { cp, readFile, writeFile, rm } from "node:fs/promises";

import pkg from "./package.json" with { type: "json" };
import * as esbuild from "esbuild";
import { sassPlugin } from "esbuild-sass-plugin";

const platform = argv[2];
// Watch is opt-in. A plain build has to exit, or it can't be chained — `web-ext
// sign` in particular must not start until the bundle is definitively written.
const watch = argv.includes("--watch");

try {
  await rm(`dist/${platform}`, { recursive: true });
} catch {}

const manifest = JSON.parse(
  await readFile(`./src/manifest.${platform}.json`, { encoding: "utf8" }),
);

// content_scripts run as classic scripts, where an `import` stops the whole
// file, so they get a separate IIFE build. Read from the manifest so a new one
// can't be built as ESM by accident; `foo/bar.js` is built from `src/foo/bar.ts`.
const classicEntryPoints = manifest.content_scripts
  .flatMap((script) => script.js)
  .map((file) => `src/${file.replace(/\.js$/, ".ts")}`);

const entryPoints = ["src/content/index.ts", "src/popup/index.ts"];

if (platform === "chrome") {
  entryPoints.push("src/background/chrome.ts", "src/xhr.ts");
}
if (platform === "firefox") {
  // Only Firefox declares options_ui: the page requests host permissions
  // through browser.permissions, which Chrome doesn't need.
  entryPoints.push("src/background/firefox.ts", "src/options/index.ts");
}

const classicCtx = await esbuild.context({
  entryPoints: classicEntryPoints,
  outdir: `dist/${platform}`,
  outbase: "src",
  bundle: true,
  format: "iife",
});

const ctx = await esbuild.context({
  entryPoints,
  outdir: `dist/${platform}`,
  bundle: true,
  format: "esm",
  splitting: true,
  plugins: [
    sassPlugin({
      embedded: true,
    }),
    {
      name: "copy-manifest",
      setup(build) {
        build.onEnd(async () => {
          await cp("public", `dist/${platform}`, {
            recursive: true,
            filter: (src) => platform === "firefox" || !src.startsWith("public/options"),
          });
          const contents = await readFile(`./src/manifest.${platform}.json`, { encoding: "utf8" });
          const replacedContents = contents.replaceAll("__MSG_extVersion__", pkg.version);
          await writeFile(`dist/${platform}/manifest.json`, replacedContents, { encoding: "utf8" });
          console.log(`[${Date()}] manifest copied and replaced successfully`);
        });
      },
    },
  ],
});

if (watch) {
  await Promise.all([classicCtx.watch(), ctx.watch()]);
  console.log(`[${Date()}] watching ${platform} for changes — Ctrl-C to stop`);
} else {
  // context() alone builds nothing, so a one-shot needs an explicit rebuild.
  // Errors reject here and fail the command, where watch mode would swallow them.
  await Promise.all([classicCtx.rebuild(), ctx.rebuild()]);
  await Promise.all([classicCtx.dispose(), ctx.dispose()]);

  // Independent of how the scripts were built: vm.Script parses its input as a
  // classic script, so a top-level `import` or `export` fails the build here
  // instead of failing silently in the page.
  for (const file of manifest.content_scripts.flatMap((script) => script.js)) {
    const path = `dist/${platform}/${file}`;
    try {
      void new Script(await readFile(path, { encoding: "utf8" }), { filename: path });
    } catch (error) {
      throw new Error(`${path} is a content script but does not parse as a classic script`, {
        cause: error,
      });
    }
  }
}
