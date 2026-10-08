import type { Stories } from "../types/stories";
import type { Highlight } from "../types/highlights";
import type { Reels } from "../types/reels";
import type { ProfileReel } from "../types/profileReel";
import {
  POST_INDEX_KEY,
  POST_KEY_PREFIX,
  type PostIndex,
  postExpiry,
  postsFromGraphql,
  slimPost,
  updateIndex,
} from "../content/utils/post-cache";

export function limitMapSize(map: Map<any, any>, maxSize: number = 200) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
}

// save highlights data from json
export async function saveHighlights(jsonData: Record<string, any>) {
  if (Array.isArray(jsonData.data?.xdt_api__v1__feed__reels_media__connection?.edges)) {
    const data = (
      jsonData as Highlight.Root
    ).data.xdt_api__v1__feed__reels_media__connection.edges.map((i) => i.node);
    const { highlights_data } = await chrome.storage.local.get(["highlights_data"]);
    const newMap = new Map(highlights_data);
    data.forEach((i) => {
      newMap.delete(i.id);
      newMap.set(i.id, i);
    });
    limitMapSize(newMap, 200);
    await chrome.storage.local.set({ highlights_data: [...newMap] });

    //? The presentation stories in home page top url is /stories/{username} now
    //? before was /stories/highlights/{pk}
    //? so we need to save the data to stories_reels_media
    await saveStoriesToLocal(data);
  }
}

// save reels data from json
export async function saveReels(jsonData: Record<string, any>) {
  if (Array.isArray(jsonData.data?.xdt_api__v1__clips__home__connection_v2?.edges)) {
    const data = (jsonData as Reels.Root).data.xdt_api__v1__clips__home__connection_v2.edges.map(
      (i) => i.node.media,
    );
    const { reels_edges_data } = await chrome.storage.local.get(["reels_edges_data"]);
    const newMap = new Map(reels_edges_data);
    data.forEach((i) => {
      newMap.delete(i.code);
      newMap.set(i.code, i);
    });
    limitMapSize(newMap, 200);
    await chrome.storage.local.set({ reels_edges_data: [...newMap] });
  }
}

export async function saveProfileReel(jsonData: Record<string, any>) {
  if (Array.isArray(jsonData.data?.xdt_api__v1__clips__user__connection_v2?.edges)) {
    const data = (
      jsonData as ProfileReel.Root
    ).data.xdt_api__v1__clips__user__connection_v2.edges.map((i) => i.node.media);
    const { profile_reels_edges_data } = await chrome.storage.local.get([
      "profile_reels_edges_data",
    ]);
    const newMap = new Map(profile_reels_edges_data);
    data.forEach((i) => {
      newMap.delete(i.code);
      newMap.set(i.code, i);
    });
    limitMapSize(newMap, 200);
    await chrome.storage.local.set({ profile_reels_edges_data: [...newMap] });
  }
}

// save stories data from json
export async function saveStories(jsonData: Record<string, any>) {
  if (Array.isArray(jsonData.data?.xdt_api__v1__feed__reels_media?.reels_media)) {
    const data = (jsonData as Stories.Root).data.xdt_api__v1__feed__reels_media.reels_media;
    await saveStoriesToLocal(data);
  }
}

async function saveStoriesToLocal(data: Stories.ReelsMedum[]) {
  const { stories_reels_media } = await chrome.storage.local.get(["stories_reels_media"]);
  const newMap = new Map(stories_reels_media);
  data.forEach((i) => {
    newMap.delete(i.id);
    newMap.set(i.id, i);
  });
  limitMapSize(newMap, 200);
  await chrome.storage.local.set({ stories_reels_media: [...newMap] });
}

/**
 * Caches home-feed and profile-grid posts, one storage key per post plus an
 * index, so a download can skip the media API. Unlike the caches above this
 * one is large (2,000 posts), and rewriting it whole on every scroll would
 * mean several MB per response.
 */
export async function savePosts(jsonData: Record<string, any>) {
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
export async function saveGraphqlQuery(jsonData: Record<string, any>) {
  await savePosts(jsonData);
  await saveHighlights(jsonData);
  await saveReels(jsonData);
  await saveStories(jsonData);
  await saveProfileReel(jsonData);
}

export function findValueByKey(obj: Record<string, any>, key: string): any {
  for (const property in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, property)) {
      if (property === key) {
        return obj[property];
      } else if (typeof obj[property] === "object") {
        const result = findValueByKey(obj[property], key);
        if (result !== undefined) {
          return result;
        }
      }
    }
  }
  return undefined;
}
