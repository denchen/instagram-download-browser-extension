import { EXTENSION_ID } from "./constants";

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
        this.addEventListener("load", async function () {
          try {
            const {
              payload: { payloads },
            } = JSON.parse(this.responseText.split(/\s*for\s+\(;;\);\s*/)[1]);
            for (const [key, value] of Object.entries(payloads)) {
              if (key.startsWith("/stories/")) {
                await chrome.runtime.sendMessage(EXTENSION_ID, {
                  type: "stories",
                  data: {
                    username: key.split("/")[2],
                    // @ts-expect-error value is unknown
                    user_id: value.result.exports.rootView.props.user_id,
                  },
                });
              }
            }
          } catch {}
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

  // oxlint-disable-next-line prefer-rest-params
  return oldXHROpen.apply(this, [].slice.call(arguments) as any);
};

// Sends the Threads posts in a GraphQL response to the background, which
// caches them by post code for the download button to look up.
function forwardThreadsItems(responseText: string) {
  try {
    const data = JSON.parse(responseText);
    if (Array.isArray(data.data?.feedData?.edges)) {
      void chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "threads",
        data: data.data.feedData.edges.flatMap(
          (i: any) =>
            i.node?.text_post_app_thread?.thread_items ||
            i.node?.thread_items ||
            i.text_post_app_thread?.thread_items,
        ),
      });
    }
    if (Array.isArray(data.data?.mediaData?.edges)) {
      void chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "threads",
        data: data.data.mediaData.edges.flatMap((i: any) => i.node.thread_items),
      });
    }
    if (Array.isArray(data.data?.data?.edges)) {
      void chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "threads",
        data: data.data.data.edges.flatMap((i: any) => i.node.thread_items),
      });
    }
    if (Array.isArray(data.data?.results?.edges)) {
      void chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "threads",
        data: data.data.results.edges.flatMap((i: any) => i.node.thread_items),
      });
    }
    if (typeof data.data?.replyPost === "object") {
      void chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "threads",
        data: [data.data.replyPost],
      });
    }
    if (Array.isArray(data.data?.searchResults?.edges)) {
      void chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "threads",
        data: data.data.searchResults.edges.flatMap((i: any) => i.node.thread.thread_items),
      });
    }
  } catch (error) {
    console.log(error);
  }
}
