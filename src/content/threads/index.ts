import { CLASS_CUSTOM_BUTTON } from "../../constants";
import { addCustomBtn } from "../button";
import type { IconColor } from "../../types/global";
import type { PageHandler } from "../handlers";
import { storageCache } from "../utils/storage";
import { handleThreadsButton } from "./button";

// The start of the like (heart) icon's path. Threads has shipped it both as
// `M16.5 2C14.8335 2 …` and minified as `M16.5 2c-1.666 0-…`, so match only
// the shared prefix rather than the whole `d`.
const LIKE_ICON_PATH_PREFIX = "M16.5 2";

// The action row holds like, reply, repost and share. It is the first ancestor
// of the like icon with at least that many children; a fixed parent count broke
// when Threads added a wrapper level.
const ACTION_ROW_MIN_CHILDREN = 4;
const ACTION_ROW_MAX_DEPTH = 10;

function findActionRow(node: Element) {
  let el: Element | null = node.querySelector(`path[d^="${LIKE_ICON_PATH_PREFIX}"]`);
  for (let depth = 0; el && el !== node && depth < ACTION_ROW_MAX_DEPTH; depth++) {
    if (el.children.length >= ACTION_ROW_MIN_CHILDREN) return el;
    el = el.parentElement;
  }
  return null;
}

function handleList(list: Element[], iconColor: IconColor) {
  list.forEach((n) => {
    const node = n.firstElementChild?.firstElementChild;
    if (!node) return;
    // text post doesn't need to add button
    if (node.querySelector("picture") || node.querySelector("video")) {
      const btnContainer = findActionRow(node);
      if (btnContainer && btnContainer.getElementsByClassName(CLASS_CUSTOM_BUTTON).length === 0) {
        addCustomBtn(btnContainer, iconColor);
      }
    }
  });
}

// Threads keeps previously visited pages mounted but hidden, so posts under a
// `hidden` ancestor belong to a page the user has navigated away from.
function visiblePosts(pageletPrefix: string) {
  return [...document.querySelectorAll(`div[data-pagelet^="${pageletPrefix}"]`)].filter(
    (n) => !n.closest("[hidden]"),
  );
}

// Posts are found by their `data-pagelet` prefix across the whole document.
// This used to start from `#barcelona-page-layout`, which Threads removed, and
// chose one prefix per URL. Every prefix is scanned on every page because the
// multi-column layout shows a profile or a post beside the home feed while the
// URL stays `/`.
const POST_PAGELET_PREFIXES = [
  "threads_logged_out_feed_",
  "threads_feed_",
  "threads_search_results_",
  "threads_post_page_",
  "threads_profile_posts_timeline_",
];

function handleThreads(iconColor: IconColor) {
  for (const prefix of POST_PAGELET_PREFIXES) {
    handleList(visiblePosts(prefix), iconColor);
  }
}

export class ThreadsPageHandler implements PageHandler {
  match(url: URL) {
    return url.origin === "https://www.threads.com";
  }

  process(iconColor: IconColor) {
    if (storageCache.settings.setting_enable_threads) {
      handleThreads(iconColor);
    }
  }

  // handleThreadsButton is synchronous. `async` is what makes this return the
  // promise the dispatcher's `.catch(console.error)` needs, and routes a throw
  // into that catch instead of out of the click listener.
  // oxlint-disable-next-line require-await
  async onCustomButtonClick(target: HTMLAnchorElement) {
    return handleThreadsButton(target);
  }
}
