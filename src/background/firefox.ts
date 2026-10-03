import { CONFIG_LIST, MESSAGE_FILE_DOWNLOAD, MESSAGE_OPEN_URL } from "../constants";
import type { ReelsMedia } from "../types/global";
import { findValueByKey, limitMapSize, saveGraphqlQuery, saveStories } from "./fn";

browser.runtime.onInstalled.addListener(async () => {
  // 1. Initialize default settings. Every remaining setting is a boolean that
  // defaults on; filenames are no longer configurable on either browser.
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

  // 2. Check permissions (Firefox specific)
  if (
    !(await browser.permissions.contains({
      origins: ["https://www.instagram.com/*", "https://www.threads.com/*"],
    }))
  ) {
    await browser.runtime.openOptionsPage();
  }
});

browser.runtime.onStartup.addListener(() => {
  void browser.storage.local.set({ stories_user_ids: [], id_to_username_map: [] });
});

async function listenInstagram(
  details: browser.webRequest._OnBeforeRequestDetails,
  jsonData: Record<string, any>,
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
        const { reels_media } = await browser.storage.local.get(["reels_media"]);
        const newArr = (reels_media || []).filter(
          (i: ReelsMedia.ReelsMedum) =>
            !(jsonData as ReelsMedia.Root).reels_media.find((j) => j.id === i.id),
        );
        await browser.storage.local.set({ reels_media: [...newArr, ...jsonData.reels_media] });
      }
      break;
  }
}

async function listenThreads(
  details: browser.webRequest._OnBeforeRequestDetails,
  jsonData: Record<string, any>,
) {
  async function addThreads(data: any[]) {
    const { threads } = await browser.storage.local.get(["threads"]);
    const newMap = new Map(threads);
    for (const item of data) {
      if (!item) continue;
      const code = item.post?.code || item.code;
      if (code) {
        newMap.delete(code);
        newMap.set(code, item);
      }
    }
    limitMapSize(newMap, 200);
    await browser.storage.local.set({ threads: Array.from(newMap) });
  }

  if (details.url === "https://www.threads.com/graphql/query") {
    if (Array.isArray(jsonData.data?.feedData?.edges)) {
      const data = jsonData.data.feedData.edges.flatMap(
        (i: any) =>
          i.node?.text_post_app_thread?.thread_items ||
          i.node?.thread_items ||
          i.text_post_app_thread?.thread_items,
      );
      await addThreads(data);
    } else if (Array.isArray(jsonData.data?.mediaData?.edges)) {
      const data = jsonData.data.mediaData.edges.flatMap((i: any) => i.node.thread_items);
      await addThreads(data);
    } else if (Array.isArray(jsonData.data?.data?.edges)) {
      const data = jsonData.data.data.edges.flatMap((i: any) => i.node.thread_items);
      await addThreads(data);
    } else if (typeof jsonData.data?.replyPost === "object") {
      await addThreads([jsonData.data.replyPost]);
    } else if (Array.isArray(jsonData.data?.searchResults?.edges)) {
      const data = jsonData.data.searchResults.edges.flatMap(
        (i: any) => i.node.thread.thread_items,
      );
      await addThreads(data);
    } else if (Array.isArray(jsonData.data?.results?.edges)) {
      const data = jsonData.data.results.edges.flatMap((i: any) => i.node.thread_items);
      await addThreads(data);
    } else if (typeof jsonData.data?.data === "object") {
      const data = jsonData.data.data;
      await addThreads([data]);
    }
  }

  if (details.url === "https://www.threads.com/ajax/route-definition/") {
    const result = findValueByKey(jsonData, "searchResults");
    if (result && Array.isArray(result.edges)) {
      await addThreads(result.edges.flatMap((i: any) => i.node.thread.thread_items));
    }
  }
}

function listener(details: browser.webRequest._OnBeforeRequestDetails) {
  const filter = browser.webRequest.filterResponseData(details.requestId);
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  let data: any[] = [];
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

  filter.onstop = async () => {
    let str = "";
    if (data.length === 1) {
      str = decoder.decode(data[0]);
    } else {
      for (let i = 0; i < data.length; i++) {
        const stream = i !== data.length - 1;
        str += decoder.decode(data[i], { stream });
      }
    }
    data = [];

    // !use try catch to avoid error that may cause page not working
    try {
      const jsonData = JSON.parse(str);
      // Not awaited: the response reaches the page only when `finally` writes
      // it, so waiting on storage here would stall Instagram. Failures are
      // still logged instead of surfacing as unhandled rejections.
      void Promise.all([
        listenInstagram(details, jsonData),
        listenThreads(details, jsonData),
      ]).catch((e) =>
        console.warn(
          `Failed to process an intercepted ${details.url} response; its data was not cached.`,
          e,
        ),
      );
    } catch {
      try {
        // record opened stories by user_id and username
        // routePath	"/stories/{username}/{?initial_media_id}/"
        if (details.url === "https://www.instagram.com/ajax/bulk-route-definitions/") {
          const {
            payload: { payloads },
          } = JSON.parse(str.split(/\s*for\s+\(;;\);\s*/)[1]);
          const { stories_user_ids, id_to_username_map } = await browser.storage.local.get([
            "stories_user_ids",
            "id_to_username_map",
          ]);
          const nameToId = new Map(stories_user_ids);
          const idToName = new Map(id_to_username_map);
          for (const [key, value] of Object.entries(payloads)) {
            if (key.startsWith("/stories/")) {
              // @ts-ignore
              const { rootView } = value.result.exports;
              nameToId.set(key.split("/")[2], rootView.props.user_id);
              idToName.set(rootView.props.user_id, key.split("/")[2]);
            }
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
          ).catch((e) => console.warn(`Failed to cache threads from ${details.url}.`, e));
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
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const { method, url } = details;
      const { pathname } = new URL(url);

      if (
        method === "GET" &&
        pathname.startsWith("/api/v1/feed/user/") &&
        pathname.endsWith("/username/")
      ) {
        listener(details); // get user hd_profile_pic_url_info
      }
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
        listener(details); // save highlights data and reels data
      }
      if (method === "POST" && url === "https://www.instagram.com/ajax/bulk-route-definitions/") {
        listener(details);
      }

      // threads
      if (method === "POST" && url === "https://www.threads.com/graphql/query") {
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

/**
 * A download that starts successfully can still fail once headers arrive (an
 * expired CDN signature returns 403), by which point download() has already
 * resolved. Log the interruption rather than letting the file silently not
 * appear. Mirrors reportDownloadFailures in ./chrome.ts.
 */
function reportDownloadFailures(id: number, filename: string) {
  const onChanged = (delta: {
    id: number;
    error?: { current?: string };
    state?: { current?: string };
  }) => {
    if (delta.id !== id) return;
    if (delta.error?.current) {
      console.error(`Download of ${filename} failed: ${delta.error.current}`);
    }
    const state = delta.state?.current;
    if (state === "complete" || state === "interrupted") {
      browser.downloads.onChanged.removeListener(onChanged);
    }
  };
  browser.downloads.onChanged.addListener(onChanged);
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  console.log(message, sender);
  const { type, data } = message;
  switch (type) {
    case MESSAGE_OPEN_URL:
      await browser.tabs.create({ url: data, index: sender.tab!.index + 1 });
      break;
    case MESSAGE_FILE_DOWNLOAD: {
      // `filename` carries the `@username/` subpath. Verified that Firefox
      // honors a relative subdirectory here, same as Chrome.
      try {
        const id = await browser.downloads.download({
          url: data.url,
          filename: data.filename,
          conflictAction: "uniquify",
        });
        reportDownloadFailures(id, data.filename);
        return { ok: true, id };
      } catch (e: any) {
        const error = String(e?.message ?? e);
        console.error(`Could not start download of ${data.filename}: ${error}`);
        return { ok: false, error };
      }
    }
  }
  return undefined;
});
