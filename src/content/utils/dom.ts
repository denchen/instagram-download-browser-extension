export function getParentArticleNode(node: HTMLElement | null) {
  if (node === null) return null;
  if (node.tagName === "ARTICLE") {
    return node;
  }
  return getParentArticleNode(node.parentElement);
}

export function getParentSectionNode(node: HTMLElement | null) {
  if (node === null) return null;
  if (node.tagName === "SECTION") {
    return node;
  }
  return getParentSectionNode(node.parentElement);
}

export function getCurrentStepFromDotsList(dotslists: NodeListOf<Element>) {
  const nodes = Array.from(dotslists);
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].getAttribute("aria-current")) {
      return i;
    }
  }
  const counts = nodes.map((node) => node.classList.length);
  const baseCount = Math.min(...counts);
  return nodes.findIndex((node) => node.classList.length === baseCount + 1);
}

/**
 * The profile header's username row, which holds the username heading and the
 * "…" options button side by side. Found from the options icon, an SVG of
 * three circles, rather than a fixed path, because Instagram changes the
 * wrapper depth: `section>main>div>header>section:nth-child(2)` stopped
 * matching when an extra div appeared above the header.
 *
 * Measured 2026-10-06: `main header > … > div (row) > div[role=button] > div >
 * svg > circle ×3`, with the heading in the row's other child.
 */
export function getProfileHeaderRow(root: ParentNode = document) {
  const header = root.querySelector("main header");
  const row = header?.querySelector("svg circle")?.closest('[role="button"]')?.parentElement;
  // A row outside the header, or without the username, means the structure
  // changed again; refuse rather than put the buttons somewhere arbitrary.
  if (!header || !row || !header.contains(row) || !row.querySelector("h1, h2")) return null;
  return row;
}
