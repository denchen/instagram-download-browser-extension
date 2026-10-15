// The post cache: feed and profile-grid posts captured from Instagram's own
// GraphQL responses as the user scrolls, so a download can skip the two
// requests the media API path costs (the /p/<code>/ page, then
// /api/v1/media/<id>/info/). See #3.
//
// Pure on purpose — no chrome.*, DOM or fetch — because both sides use it: the
// background extracts and stores posts, the content script reads them back and
// also extracts from the page's embedded data.

import type { MediaAuthor, MediaItem } from "../../types/media";
import { getImgOrVideoUrl, largestCandidate } from "./media";

/** Each post is stored under its own key, so a save writes only what changed. */
export const POST_KEY_PREFIX = "post:";
/** `[code, expiresAt]` pairs, least recently seen first. */
export const POST_INDEX_KEY = "posts_index";
const POST_CACHE_LIMIT = 2000;

export type PostIndex = [code: string, expiresAt: number | null][];

/**
 * A post that can be cached. The shortcode is the storage key, so an item
 * without one is dropped by postsFromGraphql rather than stored unkeyed.
 */
export type CachedPost = MediaItem & { code: string };

// Measured 2026-10-06 on hand-browsed tabs. Both arrive as XHR responses from
// /graphql/query, which both backgrounds already route to saveGraphqlQuery.
const FEED_CONNECTION = "xdt_api__v1__feed__timeline__connection";
const GRID_CONNECTION = "xdt_api__v1__feed__user_timeline_graphql_connection";

/**
 * The posts in a GraphQL response from the home feed or a profile grid.
 *
 * The feed nests a post from a followed account at `node.media`, and one from
 * an account the user does not follow at `node.explore_story.media` (measured
 * 2026-10-08; same fields either way). It also mixes in edges that are not
 * posts at all (suggested users, ads, end-of-feed markers), so anything
 * without a shortcode is dropped. The grid's `node` is the post itself.
 *
 * Not covered: "Suggested for you" cards. Their only GraphQL data is
 * `xig_user_by_igid_v2…media_dict` from /api/graphql, which is three preview
 * thumbnails of the suggested account with no taken_at, author or rendition
 * sizes — not enough to name or size a download — so those posts fall back to
 * the media API.
 */
export function postsFromGraphql(json: unknown): CachedPost[] {
  const data = prop(json, "data");
  const feed = prop(prop(data, FEED_CONNECTION), "edges");
  const grid = prop(prop(data, GRID_CONNECTION), "edges");
  return [
    ...(Array.isArray(feed)
      ? feed.map(
          (edge: unknown) =>
            prop(prop(edge, "node"), "media") ??
            prop(prop(prop(edge, "node"), "explore_story"), "media"),
        )
      : []),
    ...(Array.isArray(grid) ? grid.map((edge: unknown) => prop(edge, "node")) : []),
  ].filter((media): media is CachedPost => typeof prop(media, "code") === "string");
}

/** One step into a parsed response, without assuming anything about its shape. */
function prop(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * The home feed's first screen is embedded in the page HTML rather than
 * fetched, so the background never sees it. Finds the feed connection however
 * deeply the page's bootstrap JSON nests it.
 */
export function postsFromEmbedded(json: unknown): CachedPost[] {
  const connection = findKey(json, FEED_CONNECTION);
  return connection ? postsFromGraphql({ data: { [FEED_CONNECTION]: connection } }) : [];
}

function findKey(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  if (Object.hasOwn(value, key)) return (value as Record<string, unknown>)[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Keeps only what the download paths read, in the shape the media API returns,
 * so a cached post goes through the same code as a fetched one. Of the media
 * itself it keeps just the rendition getImgOrVideoUrl would pick: a raw post
 * carries ~14 renditions per item and up to 20 carousel items.
 *
 * Keys are only set when present, so a slimmed post reads the same as a
 * fetched one: a caller testing `carousel_media` sees nothing for a single
 * post rather than an explicit undefined.
 */
export function slimPost(media: CachedPost): CachedPost {
  const post: CachedPost = { code: media.code, taken_at: media.taken_at };
  // The API names the author `owner`; both timeline payloads call it `user`.
  const username = media.owner?.username ?? media.user?.username;
  if (username) post.owner = { username };
  if (Array.isArray(media.coauthor_producers)) {
    post.coauthor_producers = media.coauthor_producers.map((u): MediaAuthor => ({
      username: u?.username,
    }));
  }
  if (Array.isArray(media.carousel_media)) {
    post.carousel_media = media.carousel_media.map((slide) => {
      const item = slimRenditions(slide);
      if (slide.owner?.username) item.owner = { username: slide.owner.username };
      if (slide.taken_at !== undefined) item.taken_at = slide.taken_at;
      return item;
    });
  } else {
    Object.assign(post, slimRenditions(media));
  }
  return post;
}

function slimRenditions(item: MediaItem): MediaItem {
  const slim: MediaItem = {};
  const video = item.video_versions?.[0];
  if (video?.url) {
    slim.video_versions = [{ url: video.url, height: video.height }];
    // The only route to a rendition above 720p; see pickDashStreams.
    if (typeof item.video_dash_manifest === "string") {
      slim.video_dash_manifest = item.video_dash_manifest;
    }
  }
  const largest = largestCandidate(item.image_versions2?.candidates);
  if (largest) {
    slim.image_versions2 = {
      candidates: [{ url: largest.url, width: largest.width, height: largest.height }],
    };
  }
  return slim;
}

/**
 * When the post's first media URL stops working, in epoch milliseconds, or
 * null if no URL says. Instagram signs CDN URLs with an `oe` parameter, the
 * expiry as hex Unix seconds — about 105 hours out when measured 2026-10-06.
 */
export function postExpiry(post: MediaItem): number | null {
  const items = Array.isArray(post.carousel_media) ? post.carousel_media : [post];
  let earliest: number | null = null;
  for (const item of items) {
    const url = getImgOrVideoUrl(item);
    if (!url) continue;
    let oe: string | null = null;
    try {
      oe = new URL(url).searchParams.get("oe");
    } catch {
      continue;
    }
    const seconds = oe ? parseInt(oe, 16) : NaN;
    if (Number.isFinite(seconds) && (earliest === null || seconds * 1000 < earliest)) {
      earliest = seconds * 1000;
    }
  }
  return earliest;
}

/** Ten minutes of slack, so a URL does not expire between lookup and download. */
const EXPIRY_MARGIN_MS = 10 * 60 * 1000;

export function isFresh(expiresAt: number | null, now = Date.now()) {
  return expiresAt === null || expiresAt - EXPIRY_MARGIN_MS > now;
}

/**
 * For the older raw-media caches (reels, profile reels, highlights). They
 * persist across restarts, so an entry can outlive its signed URL and fail at
 * the CDN instead of reaching the paths that would work.
 *
 * True means treat the entry as a miss. An item with no readable expiry, or no
 * item at all, is left to the caller as before.
 */
export function cachedUrlExpired(item: MediaItem | undefined, what: string) {
  if (!item || isFresh(postExpiry(item))) return false;
  console.log(`Cached ${what} has an expired media URL; looking it up again instead.`);
  return true;
}

/**
 * Adds freshly seen posts to the end of the index, then drops anything expired
 * and, past `limit`, whatever has gone longest without being seen. Returns the
 * codes whose stored entries should now be removed.
 */
export function updateIndex(
  index: PostIndex,
  seen: PostIndex,
  now = Date.now(),
  limit = POST_CACHE_LIMIT,
): { index: PostIndex; evicted: string[] } {
  const seenCodes = new Set(seen.map(([code]) => code));
  const evicted: string[] = [];
  const kept: PostIndex = [];
  for (const entry of index) {
    if (seenCodes.has(entry[0])) continue;
    if (isFresh(entry[1], now)) kept.push(entry);
    else evicted.push(entry[0]);
  }
  const next = [...kept, ...seen];
  const overflow = Math.max(0, next.length - limit);
  evicted.push(...next.slice(0, overflow).map(([code]) => code));
  return { index: next.slice(overflow), evicted };
}
