// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { getCurrentStepFromDotsList, getParentArticleNode, getParentSectionNode } from "./dom";

const dots = (html: string) => {
  document.body.innerHTML = `<div id="dots">${html}</div>`;
  return document.querySelectorAll("#dots > div");
};

describe("getCurrentStepFromDotsList", () => {
  it("returns the dot marked aria-current", () => {
    const list = dots(`
      <div class="dot"></div>
      <div class="dot" aria-current="true"></div>
      <div class="dot"></div>`);
    expect(getCurrentStepFromDotsList(list)).toBe(1);
  });

  it("prefers aria-current over the class-count heuristic", () => {
    const list = dots(`
      <div class="dot active"></div>
      <div class="dot"></div>
      <div class="dot" aria-current="true"></div>`);
    expect(getCurrentStepFromDotsList(list)).toBe(2);
  });

  it("falls back to the one dot carrying an extra class", () => {
    const list = dots(`
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot active"></div>
      <div class="dot"></div>`);
    expect(getCurrentStepFromDotsList(list)).toBe(2);
  });

  it("returns -1 when no dot stands out", () => {
    const list = dots(`<div class="dot"></div><div class="dot"></div>`);
    expect(getCurrentStepFromDotsList(list)).toBe(-1);
  });
});

describe("getParentArticleNode / getParentSectionNode", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="section">
        <article id="article"><div><a id="leaf"></a></div></article>
      </section>
      <div id="orphan"></div>`;
  });

  it("walks up to the nearest article", () => {
    const leaf = document.querySelector<HTMLElement>("#leaf");
    expect(getParentArticleNode(leaf)?.id).toBe("article");
  });

  it("walks up to the nearest section", () => {
    const leaf = document.querySelector<HTMLElement>("#leaf");
    expect(getParentSectionNode(leaf)?.id).toBe("section");
  });

  it("returns the node itself when it is the article", () => {
    const article = document.querySelector<HTMLElement>("#article");
    expect(getParentArticleNode(article)).toBe(article);
  });

  it("returns null when there is no such ancestor", () => {
    const orphan = document.querySelector<HTMLElement>("#orphan");
    expect(getParentArticleNode(orphan)).toBeNull();
    expect(getParentSectionNode(null)).toBeNull();
  });
});
