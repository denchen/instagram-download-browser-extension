import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import plugin from "./plugin";

RuleTester.describe = describe;
RuleTester.it = it;

const rule = plugin.rules["no-aria-label-selector"];
const error = { messageId: "ariaLabel" };

new RuleTester().run("no-aria-label-selector", rule, {
  valid: [
    "document.querySelector('[data-testid=\"like\"]');",
    "document.querySelector('a')?.setAttribute('aria-label', 'Like');",
    "document.getElementById('aria-label');",
    "const selector = '[aria-label=\"Like\"]';",
  ],
  invalid: [
    { code: "document.querySelector('[aria-label=\"Like\"]');", errors: [error] },
    { code: "document.querySelector(\"[aria-label='Like']\");", errors: [error] },
    { code: "el.querySelector('div [aria-label]');", errors: [error] },
    { code: 'el.querySelectorAll(\'a[title="x"] [aria-label="Like"]\');', errors: [error] },
    { code: 'el.querySelector(`[aria-label="${label}"]`);', errors: [error] },
    { code: "el.querySelector(cond ? 'svg[aria-label=\"L\"]' : 'svg');", errors: [error] },
  ],
});
