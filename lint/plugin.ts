import { definePlugin, defineRule, type ESTree } from "@oxlint/plugins";

const SELECTOR_METHODS = new Set(["querySelector", "querySelectorAll"]);

/**
 * Instagram localizes `aria-label`, so a selector keyed on it only matches in
 * one UI language. Select on `data-*`, a class, or an SVG path instead.
 *
 * Replaces an ESLint `no-restricted-syntax` selector whose regex only matched
 * aria-label after a quote, so it missed the usual `[aria-label="Like"]`. This
 * checks every string and template literal anywhere inside the call, so
 * `el.querySelector(cond ? '[aria-label="Like"]' : 'x')` is caught too.
 */
const noAriaLabelSelector = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow aria-label in querySelector selectors" },
    messages: {
      ariaLabel:
        "aria-label is localized, so this selector breaks in other UI languages. Select on data-*, a class, or an SVG path instead.",
    },
  },
  create(context) {
    const check = (node: ESTree.Node, text: string) => {
      if (!/\baria-label\b/.test(text)) return;
      for (let a: ESTree.Node | null = node.parent; a; a = a.parent) {
        if (
          a.type === "CallExpression" &&
          a.callee.type === "MemberExpression" &&
          a.callee.property.type === "Identifier" &&
          SELECTOR_METHODS.has(a.callee.property.name)
        ) {
          context.report({ node, messageId: "ariaLabel" });
          return;
        }
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
});

export default definePlugin({
  meta: { name: "local" },
  rules: { "no-aria-label-selector": noAriaLabelSelector },
});
