import {
  CONFIG_LIST,
  type ContentMessage,
  MESSAGE_BLOB_DOWNLOAD,
  MESSAGE_FILE_DOWNLOAD,
  MESSAGE_OPEN_URL,
} from "../constants";
import type { ReelsMedia } from "../types/global";
import { limitMapSize, saveGraphqlQuery, saveStories } from "./fn";
import { asArray, findKey, isArray, path, prop } from "../content/utils/json";

browser.runtime.onInstalled.addListener(() => {
  void applyDefaultSettings();
});

async function applyDefaultSettings() {
  // Every setting is a boolean that defaults on.
  const result = await browser.storage.sync.get(CONFIG_LIST);

  const updates: Record<string, boolean> = {};
  CONFIG_LIST.forEach((i) => {
    if (result[i] === undefined) {
      updates[i] = true;
    }
  });

  if (Object.keys(updates).length > 0) {
    await browser.storage.sync.set(updates);
  }

  // `reels` was written alongside `reels_media` but never read; clear what
  // older versions left behind.
  await browser.storage.local.remove("reels");

  // Firefox lets the user withhold host permissions; ask for them.
  if (
    !(await browser.permissions.contains({
      origins: ["https://www.instagram.com/*", "https://www.threads.com/*"],
    }))
  ) {
    await browser.runtime.openOptionsPage();
  }
}

browser.runtime.onStartup.addListener(() => {
  void browser.storage.local.set({ stories_user_ids: [], id_to_username_map: [] });
});

async function listenInstagram(
  details: browser.webRequest._OnBeforeRequestDetails,
  jsonData: unknown,
) {
  switch (details.url) {
    case "https://www.instagram.com/api/graphql":
      await saveStories(jsonData);
      break;
    case "https://www.instagram.com/graphql/query":
      await saveGraphqlQuery(jsonData);
      break;
    default:
      if (details.url.startsWith("https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=")) {
        const { reels_media } = (await browser.storage.local.get(["reels_media"])) as {
          reels_media?: ReelsMedia.ReelsMedum[];
        };
        const incoming = (jsonData as ReelsMedia.Root).reels_media;
        // Replace any tray entry this response also carries, keep the rest.
        const newArr = (reels_media ?? []).filter((i) => !incoming.find((j) => j.id === i.id));
        await browser.storage.local.set({ reels_media: [...newArr, ...incoming] });
      }
      break;
  }
}

async function listenThreads(
  details: browser.webRequest._OnBeforeRequestDetails,
  jsonData: unknown,
) {
  async function addThreads(data: unknown[]) {
    const { threads } = (await browser.storage.local.get(["threads"])) as {
      threads?: [string, unknown][];
    };
    const newMap = new Map(threads ?? []);
    for (const item of data) {
      if (!item) continue;
      // A thread item wraps its post; a bare post carries the code itself.
      const code = path(item, "post", "code") ?? prop(item, "code");
      if (typeof code === "string") {
        newMap.delete(code);
        newMap.set(code, item);
      }
    }
    limitMapSize(newMap, 200);
    await browser.storage.local.set({ threads: Array.from(newMap) });
  }

  /** The thread items under `data.<key>.edges`, at whichever depth they sit. */
  const itemsUnder = (key: string, ...rest: string[]) =>
    asArray(path(jsonData, "data", key, "edges")).flatMap((i) =>
      asArray(rest.length > 0 ? path(i, ...rest) : path(i, "node", "thread_items")),
    );

  // The home feed's pages arrive on /api/graphql (measured 2026-10-12);
  // profile pages still come through /graphql/query.
  if (
    details.url === "https://www.threads.com/graphql/query" ||
    details.url === "https://www.threads.com/api/graphql"
  ) {
    if (isArray(path(jsonData, "data", "feedData", "edges"))) {
      await addThreads(
        asArray(path(jsonData, "data", "feedData", "edges")).flatMap((i) =>
          asArray(
            path(i, "node", "text_post_app_thread", "thread_items") ??
              path(i, "node", "thread_items") ??
              path(i, "text_post_app_thread", "thread_items"),
          ),
        ),
      );
    } else if (isArray(path(jsonData, "data", "mediaData", "edges"))) {
      await addThreads(itemsUnder("mediaData"));
    } else if (isArray(path(jsonData, "data", "data", "edges"))) {
      await addThreads(itemsUnder("data"));
    } else if (typeof path(jsonData, "data", "replyPost") === "object") {
      await addThreads([path(jsonData, "data", "replyPost")]);
    } else if (isArray(path(jsonData, "data", "searchResults", "edges"))) {
      await addThreads(itemsUnder("searchResults", "node", "thread", "thread_items"));
    } else if (isArray(path(jsonData, "data", "results", "edges"))) {
      await addThreads(itemsUnder("results"));
    } else if (typeof path(jsonData, "data", "data") === "object") {
      await addThreads([path(jsonData, "data", "data")]);
    }
  }

  if (details.url === "https://www.threads.com/ajax/route-definition/") {
    const edges = path(findKey(jsonData, "searchResults"), "edges");
    if (isArray(edges)) {
      await addThreads(edges.flatMap((i) => asArray(path(i, "node", "thread", "thread_items"))));
    }
  }
}

function listener(details: browser.webRequest._OnBeforeRequestDetails) {
  const filter = browser.webRequest.filterResponseData(details.requestId);
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  let data: ArrayBuffer[] = [];
  filter.ondata = (event: { data: ArrayBuffer }) => {
    data.push(event.data);
  };

  const cleanUp = () => {
    data = [];
    try {
      filter.close();
    } catch {}
  };
  // StreamFilter's typings only declare the on* handlers, like ondata/onstop around it.
  // oxlint-disable-next-line unicorn/prefer-add-event-listener
  filter.onerror = cleanUp;

  const onStop = async () => {
    let str = "";
    for (const [i, chunk] of data.entries()) {
      str += decoder.decode(chunk, { stream: i !== data.length - 1 });
    }
    data = [];

    // !use try catch to avoid error that may cause page not working
    try {
      const jsonData: unknown = JSON.parse(str);
      // Not awaited: the response reaches the page only when `finally` writes
      // it, so waiting on storage here would stall Instagram. Failures are
      // still logged instead of surfacing as unhandled rejections.
      void Promise.all([
        listenInstagram(details, jsonData),
        listenThreads(details, jsonData),
      ]).catch((e: unknown) =>
        console.warn(
          `Failed to process an intercepted ${details.url} response; its data was not cached.`,
          e,
        ),
      );
    } catch {
      try {
        // Instagram prefixes JSON responses with `for (;;);` to defeat JSON
        // hijacking; everything after it is the body.
        const body = str.split(/\s*for\s+\(;;\);\s*/)[1];
        // record opened stories by user_id and username
        // routePath	"/stories/{username}/{?initial_media_id}/"
        if (details.url === "https://www.instagram.com/ajax/bulk-route-definitions/" && body) {
          const payloads = path(JSON.parse(body), "payload", "payloads");
          const { stories_user_ids, id_to_username_map } = (await browser.storage.local.get([
            "stories_user_ids",
            "id_to_username_map",
          ])) as {
            stories_user_ids?: [string, unknown][];
            id_to_username_map?: [unknown, string][];
          };
          const nameToId = new Map<string, unknown>(stories_user_ids ?? []);
          const idToName = new Map<unknown, string>(id_to_username_map ?? []);
          for (const [key, value] of Object.entries(payloads ?? {})) {
            if (!key.startsWith("/stories/")) continue;
            // routePath is "/stories/{username}/{?initial_media_id}/".
            const username = key.split("/")[2];
            const userId = path(value, "result", "exports", "rootView", "props", "user_id");
            if (username === undefined || userId === undefined) continue;
            nameToId.set(username, userId);
            idToName.set(userId, username);
          }
          // Not awaited, like the JSON branch above: `finally` releases the
          // response to the page, so storage must not hold it up.
          void browser.storage.local.set({
            stories_user_ids: Array.from(nameToId),
            id_to_username_map: Array.from(idToName),
          });
        }
        if (
          details.url === "https://www.threads.com/ajax/route-definition/" &&
          str.includes("searchResults")
        ) {
          void Promise.all(
            str
              .split(/\s*for\s+\(;;\);\s*/)
              .filter((_) => _)
              .map((i) => listenThreads(details, JSON.parse(i))),
          ).catch((e: unknown) => console.warn(`Failed to cache threads from ${details.url}.`, e));
        }
      } catch {}
    } finally {
      try {
        filter.write(encoder.encode(str));
      } catch {}
      try {
        filter.close();
      } catch {}
    }
  };
  // StreamFilter's typings declare onstop as returning void, so the promise is
  // handed off here rather than returned into a handler that would drop it.
  filter.onstop = () => void onStop();
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const { method, url } = details;

      if (
        method === "GET" &&
        url.startsWith("https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=")
      ) {
        listener(details); // presentation stories in home page top
      }
      if (method === "POST" && url === "https://www.instagram.com/api/graphql") {
        listener(details);
      }
      if (method === "POST" && url === "https://www.instagram.com/graphql/query") {
        listener(details); // see saveGraphqlQuery
      }
      if (method === "POST" && url === "https://www.instagram.com/ajax/bulk-route-definitions/") {
        listener(details);
      }

      // threads
      if (
        method === "POST" &&
        (url === "https://www.threads.com/graphql/query" ||
          url === "https://www.threads.com/api/graphql")
      ) {
        listener(details);
      }
      if (method === "POST" && url === "https://www.threads.com/ajax/route-definition/") {
        listener(details);
      }
    } catch (e) {
      // Nothing in the matching above is expected to throw. If it does,
      // interception stops for that request with no other trace.
      console.warn("webRequest listener threw while matching an intercepted request.", e);
    }
  },
  { urls: ["https://www.instagram.com/*", "https://www.threads.com/*"] },
  ["blocking"],
);

/** Same as reportDownloadFailures in ./chrome.ts; `onDone` frees a blob URL. */
function reportDownloadFailures(id: number, filename: string, onDone?: () => void) {
  const onChanged = (delta: browser.downloads._OnChangedDownloadDelta) => {
    if (delta.id !== id) return;
    if (delta.error?.current) {
      console.error(`Download of ${filename} failed: ${delta.error.current}`);
    }
    const state = delta.state?.current;
    if (state === "complete" || state === "interrupted") {
      browser.downloads.onChanged.removeListener(onChanged);
      onDone?.();
    }
  };
  browser.downloads.onChanged.addListener(onChanged);
}

browser.runtime.onMessage.addListener(async (rawMessage, sender) => {
  console.log(rawMessage, sender);
  const message = rawMessage as ContentMessage;
  switch (message.type) {
    case MESSAGE_OPEN_URL:
      await browser.tabs.create({ url: message.data, index: sender.tab!.index + 1 });
      break;
    case MESSAGE_FILE_DOWNLOAD: {
      const { url, filename } = message.data;
      // `filename` carries the `@username/` subpath. Verified that Firefox
      // honors a relative subdirectory here, same as Chrome.
      try {
        const id = await browser.downloads.download({
          url,
          filename,
          conflictAction: "uniquify",
        });
        reportDownloadFailures(id, filename);
        return { ok: true, id };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`Could not start download of ${filename}: ${error}`);
        return { ok: false, error };
      }
    }
    case MESSAGE_BLOB_DOWNLOAD: {
      const { blob, filename } = message.data;
      // A muxed DASH video from the content script. The background page has a
      // DOM, so it can mint its own blob: URL for downloads to read; the
      // content script's URL belongs to the page and is not readable here.
      const url = URL.createObjectURL(blob);
      try {
        const id = await browser.downloads.download({
          url,
          filename,
          conflictAction: "uniquify",
        });
        reportDownloadFailures(id, filename, () => URL.revokeObjectURL(url));
        return { ok: true, id };
      } catch (e) {
        URL.revokeObjectURL(url);
        const error = e instanceof Error ? e.message : String(e);
        console.error(`Could not start download of ${filename}: ${error}`);
        return { ok: false, error };
      }
    }
  }
  return undefined;
});
