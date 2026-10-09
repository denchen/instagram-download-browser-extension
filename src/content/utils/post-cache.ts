// The post cache: feed and profile-grid posts captured from Instagram's own
// GraphQL responses as the user scrolls, so a download can skip the two
// requests the media API path costs (the /p/<code>/ page, then
// /api/v1/media/<id>/info/). See #3.
//
// Pure on purpose — no chrome.*, DOM or fetch — because both sides use it: the
// background extracts and stores posts, the content script reads them back and
// also extracts from the page's embedded data.

import { getImgOrVideoUrl, largestCandidate } from "./media";

/** Each post is stored under its own key, so a save writes only what changed. */
export const POST_KEY_PREFIX = "post:";
/** `[code, expiresAt]` pairs, least recently seen first. */
export const POST_INDEX_KEY = "posts_index";
export const POST_CACHE_LIMIT = 2000;

export type PostIndex = [code: string, expiresAt: number | null][];

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
export function postsFromGraphql(json: any): Record<string, any>[] {
  const feed = json?.data?.[FEED_CONNECTION]?.edges;
  const grid = json?.data?.[GRID_CONNECTION]?.edges;
  return [
    ...(Array.isArray(feed)
      ? feed.map((edge: any) => edge?.node?.media ?? edge?.node?.explore_story?.media)
      : []),
    ...(Array.isArray(grid) ? grid.map((edge: any) => edge?.node) : []),
  ].filter((media) => typeof media?.code === "string");
}

/**
 * The home feed's first screen is embedded in the page HTML rather than
 * fetched, so the background never sees it. Finds the feed connection however
 * deeply the page's bootstrap JSON nests it.
 */
export function postsFromEmbedded(json: unknown): Record<string, any>[] {
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
 * Keys are only set when present, because callers branch on
 * `"carousel_media" in data`, which an explicit undefined would satisfy.
 */
export function slimPost(media: Record<string, any>): Record<string, any> {
  const post: Record<string, any> = { code: media.code, taken_at: media.taken_at };
  // The API names the author `owner`; both timeline payloads call it `user`.
  const username = media.owner?.username ?? media.user?.username;
  if (username) post.owner = { username };
  if (Array.isArray(media.coauthor_producers)) {
    post.coauthor_producers = media.coauthor_producers.map((u: any) => ({
      username: u?.username,
    }));
  }
  if (Array.isArray(media.carousel_media)) {
    post.carousel_media = media.carousel_media.map((slide: any) => {
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

function slimRenditions(item: Record<string, any>) {
  const slim: Record<string, any> = {};
  const videoUrl = item.video_versions?.[0]?.url;
  if (videoUrl) slim.video_versions = [{ url: videoUrl }];
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
export function postExpiry(post: Record<string, any>): number | null {
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
 * For the older caches (reels, profile reels, highlights), which store raw
 * media and used to serve an entry however old it was. Those caches persist
 * across restarts, so an entry can outlive its signed URL; downloading it
 * then fails at the CDN instead of reaching the paths that would work.
 *
 * True means treat the entry as a miss. An item with no readable expiry, or no
 * item at all, is left to the caller as before.
 */
export function cachedUrlExpired(item: Record<string, any> | undefined, what: string) {
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
