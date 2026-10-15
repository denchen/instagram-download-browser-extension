import { EXTENSION_ID } from "./constants";
import { asArray, isArray, path } from "./content/utils/json";

// Saved unbound on purpose: the replacement below calls it with
// `.apply(this, arguments)`, re-binding it to each XHR instance.
// oxlint-disable-next-line typescript/unbound-method
const oldXHROpen = window.XMLHttpRequest.prototype.open;

window.XMLHttpRequest.prototype.open = function (method, url) {
  if (method === "GET" && typeof url === "string") {
    if (url.includes("/api/v1/feed/reels_media/?reel_ids=")) {
      this.addEventListener("load", function () {
        void chrome.runtime.sendMessage(EXTENSION_ID, {
          data: this.responseText,
          api: "/api/v1/feed/reels_media/?reel_ids=",
        });
      });
    }
  }

  if (method === "POST") {
    switch (url) {
      case "/ajax/bulk-route-definitions/":
      case "https://www.instagram.com/ajax/bulk-route-definitions/":
        this.addEventListener("load", function () {
          void forwardStoryUserIds(this.responseText);
        });
        break;
      case "/ajax/route-definition/":
      case "https://www.threads.com/ajax/route-definition/":
        this.addEventListener("load", function () {
          void chrome.runtime.sendMessage(EXTENSION_ID, {
            type: "threads_searchResults",
            data: this.responseText,
          });
        });
        break;
      case "/graphql/query":
      case "https://www.instagram.com/graphql/query":
        this.addEventListener("load", function () {
          void chrome.runtime.sendMessage(EXTENSION_ID, {
            api: "https://www.instagram.com/graphql/query",
            data: this.responseText,
          });

          forwardThreadsItems(this.responseText);
        });
        break;
      case "https://www.instagram.com/api/graphql":
      case "https://www.threads.com/graphql/query":
      case "/api/graphql":
        this.addEventListener("load", function () {
          void chrome.runtime.sendMessage(EXTENSION_ID, {
            api: "https://www.instagram.com/api/graphql",
            data: this.responseText,
          });
          // The home feed's pages arrive here as `feedData` (measured
          // 2026-10-12); profile pages still come through /graphql/query.
          if (window.location.host === "www.threads.com") {
            forwardThreadsItems(this.responseText);
          }
        });
        break;
      default:
        break;
    }
  }

  // Forwarded verbatim: the replacement must accept every overload of open()
  // that the page might call, including the ones this file does not read.
  // oxlint-disable-next-line prefer-rest-params
  return oldXHROpen.apply(this, arguments as unknown as Parameters<XMLHttpRequest["open"]>);
};

// Maps each opened story's username to its user_id for the background to
// remember. Route paths look like `/stories/{username}/{?initial_media_id}/`.
async function forwardStoryUserIds(responseText: string) {
  try {
    // Instagram prefixes JSON responses with `for (;;);` to defeat JSON
    // hijacking; everything after it is the body.
    const body = responseText.split(/\s*for\s+\(;;\);\s*/)[1];
    if (!body) return;
    const payloads = path(JSON.parse(body), "payload", "payloads");
    for (const [key, value] of Object.entries(payloads ?? {})) {
      if (!key.startsWith("/stories/")) continue;
      const username = key.split("/")[2];
      const user_id = path(value, "result", "exports", "rootView", "props", "user_id");
      if (username === undefined || user_id === undefined) continue;
      await chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "stories",
        data: { username, user_id },
      });
    }
  } catch {}
}

// Sends the Threads posts in a GraphQL response to the background, which
// caches them by post code for the download button to look up.
function forwardThreadsItems(responseText: string) {
  const send = (items: unknown[]) => {
    if (items.length === 0) return;
    void chrome.runtime.sendMessage(EXTENSION_ID, { type: "threads", data: items });
  };
  /** The thread items under `data.<key>.edges`, at whichever depth they sit. */
  const itemsUnder = (data: unknown, key: string, ...rest: string[]) =>
    asArray(path(data, "data", key, "edges")).flatMap((i) =>
      asArray(rest.length > 0 ? path(i, ...rest) : path(i, "node", "thread_items")),
    );

  try {
    const data: unknown = JSON.parse(responseText);
    if (isArray(path(data, "data", "feedData", "edges"))) {
      send(
        asArray(path(data, "data", "feedData", "edges")).flatMap((i) =>
          asArray(
            path(i, "node", "text_post_app_thread", "thread_items") ??
              path(i, "node", "thread_items") ??
              path(i, "text_post_app_thread", "thread_items"),
          ),
        ),
      );
    }
    send(itemsUnder(data, "mediaData"));
    send(itemsUnder(data, "data"));
    send(itemsUnder(data, "results"));
    const replyPost = path(data, "data", "replyPost");
    if (typeof replyPost === "object" && replyPost !== null) {
      send([replyPost]);
    }
    send(itemsUnder(data, "searchResults", "node", "thread", "thread_items"));
  } catch (error) {
    console.log(error);
  }
}
