import type { ReelsMedia } from "../types/global";
import { saveGraphqlQuery, saveStories } from "./fn";
import { asArray, findKey, isArray, path } from "../content/utils/json";
import {
  CONFIG_LIST,
  type ContentMessage,
  MESSAGE_FILE_DOWNLOAD,
  MESSAGE_OPEN_URL,
  type PageMessage,
} from "../constants";

chrome.runtime.onInstalled.addListener(() => {
  void applyDefaultSettings();
});

async function applyDefaultSettings() {
  const result = await chrome.storage.sync.get(CONFIG_LIST);

  // Every setting is a boolean that defaults on.
  const updates: Record<string, boolean> = {};
  CONFIG_LIST.forEach((i) => {
    if (result[i] === undefined) {
      updates[i] = true;
    }
  });

  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates);
  }

  // `reels` was written alongside `reels_media` but never read; clear what
  // older versions left behind.
  await chrome.storage.local.remove("reels");
}

chrome.runtime.onStartup.addListener(() => {
  void chrome.storage.local.set({ stories_user_ids: [], id_to_username_map: [] });
});

/**
 * A download that starts successfully can still fail once headers arrive (an
 * expired CDN signature returns 403). chrome.downloads.download has already
 * resolved by then, so log the interruption here rather than letting the file
 * silently not appear.
 */
function reportDownloadFailures(id: number, filename: string) {
  const onChanged = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== id) return;
    if (delta.error?.current) {
      console.error(`Download of ${filename} failed: ${delta.error.current}`);
    }
    const state = delta.state?.current;
    if (state === "complete" || state === "interrupted") {
      chrome.downloads.onChanged.removeListener(onChanged);
    }
  };
  chrome.downloads.onChanged.addListener(onChanged);
}

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
  console.log(rawMessage, sender);
  const message = rawMessage as ContentMessage;
  if (message.type === MESSAGE_OPEN_URL) {
    void chrome.tabs.create({ url: message.data, index: sender.tab!.index + 1 });
    return false;
  }
  if (message.type === MESSAGE_FILE_DOWNLOAD) {
    const { url, filename } = message.data;
    // See MESSAGE_FILE_DOWNLOAD.
    void (async () => {
      try {
        const id = await chrome.downloads.download({
          url,
          filename,
          conflictAction: "uniquify",
        });
        reportDownloadFailures(id, filename);
        sendResponse({ ok: true, id });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`Could not start download of ${filename}: ${error}`);
        sendResponse({ ok: false, error });
      }
    })();
    return true;
  }
  return false;
});

async function addThreads(data: unknown[]) {
  const { threads } = (await chrome.storage.local.get(["threads"])) as {
    threads?: [string, unknown][];
  };
  const newMap = new Map(threads ?? []);
  for (const item of data) {
    const code = path(item, "post", "code");
    if (typeof code === "string") {
      newMap.set(code, item);
    }
  }
  await chrome.storage.local.set({ threads: Array.from(newMap) });
}

chrome.runtime.onMessageExternal.addListener((rawMessage, sender, sendResponse) => {
  const message = rawMessage as PageMessage;

  if (sender.origin === "https://www.threads.com") {
    if (message.type === "threads_searchResults") {
      const parts = message.data.split(/\s*for\s+\(;;\);\s*/).filter((_) => _);
      // Sequential for the reason saveGraphqlQuery gives: each addThreads is
      // a read-modify-write of the same key, so running them at once lets one
      // overwrite another's update.
      void (async () => {
        for (const part of parts) {
          try {
            const edges = path(findKey(JSON.parse(part), "searchResults"), "edges");
            if (isArray(edges)) {
              await addThreads(
                edges.flatMap((edge) => asArray(path(edge, "node", "thread", "thread_items"))),
              );
            }
          } catch {}
        }
      })();
    } else if (message.type === "threads") {
      void addThreads(message.data);
    }
    return false;
  }
  void (async () => {
    if (message.type === "stories") {
      const { stories_user_ids, id_to_username_map } = (await chrome.storage.local.get([
        "stories_user_ids",
        "id_to_username_map",
      ])) as { stories_user_ids?: [string, unknown][]; id_to_username_map?: [unknown, string][] };
      const { username, user_id } = message.data;
      if (username === undefined) return;
      const nameToId = new Map<string, unknown>(stories_user_ids ?? []);
      const idToName = new Map<unknown, string>(id_to_username_map ?? []);
      nameToId.set(username, user_id);
      idToName.set(user_id, username);
      await chrome.storage.local.set({
        stories_user_ids: Array.from(nameToId),
        id_to_username_map: Array.from(idToName),
      });
    } else if (message.type === undefined) {
      const { api, data } = message;
      try {
        const jsonData: unknown = JSON.parse(data);

        switch (api) {
          default:
            break;
          // Awaited so a failed save lands in the catch below instead of
          // escaping it as an unhandled rejection.
          case "https://www.instagram.com/api/graphql":
            await saveStories(jsonData);
            break;
          case "https://www.instagram.com/graphql/query":
            await saveGraphqlQuery(jsonData);
            break;
          // presentation stories in home page top
          case "/api/v1/feed/reels_media/?reel_ids=": {
            const { reels_media } = (await chrome.storage.local.get(["reels_media"])) as {
              reels_media?: ReelsMedia.ReelsMedum[];
            };
            const incoming = (jsonData as ReelsMedia.Root).reels_media;
            // Replace any tray entry this response also carries, keep the rest.
            const newArr = (reels_media ?? []).filter((i) => !incoming.find((j) => j.id === i.id));
            await chrome.storage.local.set({ reels_media: [...newArr, ...incoming] });
            break;
          }
        }
      } catch (e) {
        // Covers JSON.parse and every saver. Otherwise a failure only shows
        // up much later as a silent DOM fallback.
        console.warn(
          `Failed to process an intercepted ${api} response; its data was not cached.`,
          e,
        );
      }
    }
    sendResponse();
  })();

  return true;
});
