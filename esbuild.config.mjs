import { argv } from 'node:process';
import { cp, readFile, writeFile, rm } from 'node:fs/promises';

import pkg from './package.json' with { type: 'json' };
import * as esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';

const platform = argv[2];
// Watch is opt-in. A plain build has to exit, or it can't be chained — `web-ext
// sign` in particular must not start until the bundle is definitively written.
const watch = argv.includes('--watch');

try {
   await rm(`dist/${platform}`, { recursive: true });
} catch { }

const entryPoints = ['src/content/index.ts', 'src/content/loader.ts', 'src/popup/index.tsx', 'src/options/index.ts'];

if (platform === 'chrome') {
   entryPoints.push('src/background/chrome.ts', 'src/xhr.ts', 'src/inject.ts');
}
if (platform === 'firefox') {
   entryPoints.push('src/background/firefox.ts');
}

const ctx = await esbuild.context({
   entryPoints,
   outdir: `dist/${platform}`,
   bundle: true,
   format: 'esm',
   splitting: true,
   alias: {
      'react': 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
   },
   plugins: [
      sassPlugin({
         embedded: true
      }),
      {
         name: 'copy-manifest',
         setup(build) {
            build.onEnd(async () => {
               await cp('public', `dist/${platform}`, { recursive: true });
               const contents = await readFile(`./src/manifest.${platform}.json`, { encoding: 'utf8' });
               const replacedContents = contents.replace(/__MSG_extVersion__/g, pkg.version);
               await writeFile(`dist/${platform}/manifest.json`, replacedContents, { encoding: 'utf8' });
               console.log(`[${Date()}] manifest copied and replaced successfully`);
            });
         },
      },
   ],
});

if (watch) {
   await ctx.watch();
   console.log(`[${Date()}] watching ${platform} for changes — Ctrl-C to stop`);
} else {
   // context() alone builds nothing, so a one-shot needs an explicit rebuild.
   // Errors reject here and fail the command, where watch mode would swallow them.
   await ctx.rebuild();
   await ctx.dispose();
}
