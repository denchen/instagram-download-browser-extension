import { handleThreadsPost } from "./post";

function findContainerNode(target: HTMLAnchorElement) {
  let node = target.parentElement;
  while (node && node.getAttribute("data-pressable-container") !== "true") {
    node = node.parentElement;
  }
  return node;
}

export function handleThreadsButton(target: HTMLAnchorElement) {
  const action = target.className.includes("download-btn") ? "download" : "open";
  const container = findContainerNode(target);

  if (container instanceof HTMLDivElement) {
    void handleThreadsPost(container, action);
  } else {
    console.warn("Threads download: no data-pressable-container around the button.");
  }
}
