// Renders public/icons/icon.svg to the PNG sizes the manifests list. The PNGs
// are committed, so this runs only when the SVG changes: `pnpm run icons`.
// Chrome rejects SVG manifest icons, which is why the PNGs exist at all.
import { readFile, writeFile } from "node:fs/promises";

import { Resvg } from "@resvg/resvg-js";

const dir = new URL("../public/icons/", import.meta.url);
const svg = await readFile(new URL("icon.svg", dir));

for (const size of [16, 32, 48, 96, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  await writeFile(new URL(`icon-${size}.png`, dir), png);
  console.log(`icon-${size}.png`);
}
