import type { MediaReel } from "../types/media";
import type { Stories } from "../types/stories";
import type { Highlight } from "../types/highlights";
import type { Reels } from "../types/reels";
import type { ProfileReel } from "../types/profileReel";
import { isArray, path } from "../content/utils/json";
import {
  POST_INDEX_KEY,
  POST_KEY_PREFIX,
  type PostIndex,
  postExpiry,
  postsFromGraphql,
  slimPost,
  updateIndex,
} from "../content/utils/post-cache";

export function limitMapSize(map: Map<unknown, unknown>, maxSize: number = 200) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
}

/**
 * Read one of the `[key, value]` caches out of storage, merge entries in,
 * bound it and write it back. Re-inserting a key moves it to the end, which
 * is what makes limitMapSize evict the least recently seen.
 */
async function mergeIntoStoredMap(
  storageKey: string,
  entries: [string | undefined, unknown][],
  limit = 200,
) {
  const stored = (await chrome.storage.local.get([storageKey]))[storageKey] as
    | [string, unknown][]
    | undefined;
  const map = new Map(stored ?? []);
  for (const [key, value] of entries) {
    // An entry with no key cannot be looked up again, so there is no point
    // storing it under one we invented.
    if (key === undefined) continue;
    map.delete(key);
    map.set(key, value);
  }
  limitMapSize(map, limit);
  await chrome.storage.local.set({ [storageKey]: [...map] });
}

// save highlights data from json
async function saveHighlights(jsonData: unknown) {
  if (!isArray(path(jsonData, "data", "xdt_api__v1__feed__reels_media__connection", "edges"))) {
    return;
  }
  const data = (
    jsonData as Highlight.Root
  ).data.xdt_api__v1__feed__reels_media__connection.edges.map((i) => i.node);
  await mergeIntoStoredMap(
    "highlights_data",
    data.map((i) => [i.id, i]),
  );

  // The home page's story tray links to /stories/{username}, so highlights
  // are saved as stories too.
  await saveStoriesToLocal(data);
}

// save reels data from json
async function saveReels(jsonData: unknown) {
  if (!isArray(path(jsonData, "data", "xdt_api__v1__clips__home__connection_v2", "edges"))) {
    return;
  }
  const data = (jsonData as Reels.Root).data.xdt_api__v1__clips__home__connection_v2.edges.map(
    (i) => i.node.media,
  );
  await mergeIntoStoredMap(
    "reels_edges_data",
    data.map((i) => [i.code, i]),
  );
}

async function saveProfileReel(jsonData: unknown) {
  if (!isArray(path(jsonData, "data", "xdt_api__v1__clips__user__connection_v2", "edges"))) {
    return;
  }
  const data = (
    jsonData as ProfileReel.Root
  ).data.xdt_api__v1__clips__user__connection_v2.edges.map((i) => i.node.media);
  await mergeIntoStoredMap(
    "profile_reels_edges_data",
    data.map((i) => [i.code, i]),
  );
}

// save stories data from json
export async function saveStories(jsonData: unknown) {
  if (!isArray(path(jsonData, "data", "xdt_api__v1__feed__reels_media", "reels_media"))) {
    return;
  }
  const data = (jsonData as Stories.Root).data.xdt_api__v1__feed__reels_media.reels_media;
  await saveStoriesToLocal(data);
}

/**
 * Both stories and highlights land here: the home tray links a highlight at
 * /stories/{username} like any story, so the content script looks both up in
 * this one map. MediaReel is what the two payloads actually share -- their
 * generated shapes differ in fields nothing reads.
 */
async function saveStoriesToLocal(data: MediaReel[]) {
  await mergeIntoStoredMap(
    "stories_reels_media",
    data.map((i) => [i.id, i]),
  );
}

/**
 * Caches home-feed and profile-grid posts, one storage key per post plus an
 * index, so a download can skip the media API. Unlike the caches above this
 * one is large (2,000 posts), and rewriting it whole on every scroll would
 * mean several MB per response.
 */
export async function savePosts(jsonData: unknown) {
  const posts = postsFromGraphql(jsonData).map(slimPost);
  if (posts.length === 0) return;
  const stored = await chrome.storage.local.get([POST_INDEX_KEY]);
  const { index, evicted } = updateIndex(
    (stored[POST_INDEX_KEY] as PostIndex | undefined) ?? [],
    posts.map((post): PostIndex[number] => [post.code, postExpiry(post)]),
  );
  await chrome.storage.local.set({
    [POST_INDEX_KEY]: index,
    ...Object.fromEntries(posts.map((post) => [POST_KEY_PREFIX + post.code, post])),
  });
  if (evicted.length > 0) {
    await chrome.storage.local.remove(evicted.map((code) => POST_KEY_PREFIX + code));
  }
}

/**
 * Caches every kind of media a GraphQL query response can carry. Each saver
 * checks for its own payload and returns early otherwise.
 *
 * Sequential on purpose: saveHighlights and saveStories both read-modify-write
 * `stories_reels_media`, so running them concurrently lets one overwrite the
 * other's update.
 */
export async function saveGraphqlQuery(jsonData: unknown) {
  await savePosts(jsonData);
  await saveHighlights(jsonData);
  await saveReels(jsonData);
  await saveStories(jsonData);
  await saveProfileReel(jsonData);
}
