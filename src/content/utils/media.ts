// Pure helpers for Instagram media payloads and URLs. Kept free of DOM,
// fetch and chrome.* so they can be unit-tested without a browser.

/**
 * Instagram returns several renditions of every photo. They have long been
 * ordered largest-first, so `candidates[0]` is normally the original — but
 * that is a convention, not a contract, and if it ever changed every download
 * would silently shrink. Pick by pixel area instead, falling back to the first
 * entry when dimensions are missing.
 *
 * Returns undefined for a missing or empty ladder, so the callers that already
 * tolerated an absent `image_versions2` keep doing so.
 *
 * Deliberately NOT applied to video_versions — see getImgOrVideoUrl.
 */
export function largestCandidate(candidates?: Record<string, any>[]) {
  if (!candidates || candidates.length === 0) return undefined;
  return candidates.reduce((best, current) => {
    const bestArea = (best.width ?? 0) * (best.height ?? 0);
    const currentArea = (current.width ?? 0) * (current.height ?? 0);
    return currentArea > bestArea ? current : best;
  }, candidates[0]);
}

/**
 * The single place that decides which rendition of a media item to download:
 * the video if there is one, otherwise the largest photo rendition.
 *
 * Every download path funnels through here. It did not until 2026-10-04 —
 * stories, highlights, reels, profile reels and Threads each carried their own
 * inline copy of `video_versions?.[0].url || image_versions2.candidates[0].url`,
 * so `largestCandidate` covered one of nine call sites and the other eight kept
 * the silent-downscale exposure it was written to remove (#1). Add a new
 * download path by calling this, not by writing a tenth copy.
 *
 * `item` itself is deliberately not optional-chained: an undefined item means a
 * caller indexed past the end of a carousel, and the TypeError that raises is
 * the loud failure `getUrlFromInfoApi`'s range check is written against. Only
 * the structures *inside* a real item are treated as optional.
 *
 * A present-but-empty `video_versions` falls through to the cover image rather
 * than throwing. Three of the eight inlined copies already behaved that way and
 * five threw; falling through is the one of the two that cannot crash, and the
 * file extension still shows what arrived.
 *
 * `video_versions` still takes `[0]`, whose ordering is unverified (#1): four of
 * the five payload shapes type those entries with no width/height at all, so
 * there is nothing to compare and only `type` discriminates them. This is the
 * only place that reads it apart from the linked-inline-media branch in
 * `threads/post.ts`, so settling that question is now a one-line change here.
 */
export function getImgOrVideoUrl(item: Record<string, any>) {
  return item.video_versions?.[0]?.url || largestCandidate(item.image_versions2?.candidates)?.url;
}

/**
 * Extracts the rendition size Instagram encodes in a URL — `stp=..._s150x150`,
 * or a `/s640x640/` path segment — so it can be read off the download log
 * without eyeballing a 400-character URL.
 *
 * Reports the size, deliberately without a verdict. Calling a rendition
 * "downscaled" requires the post's candidate ladder, and the only path that
 * yields a sized URL is the DOM fallback — which runs precisely because the
 * media API lookup failed, so the ladder is unavailable exactly where the
 * judgement would be needed.
 *
 * An earlier version guessed with a 1080 constant and was wrong: measured
 * originals run to 3072x4096 and 4032x3024, so 1080 is one rung on a 14-rung
 * ladder rather than the ceiling, and the check stayed silent on the very case
 * it existed to catch (#2). A real verdict needs the cache from #3, which would
 * put the ladder in reach on the fallback path.
 *
 * Silence here means no size token was present, which is not proof of a
 * full-resolution download. File size remains the reliable tell.
 */
export function describeRendition(url: string) {
  const match = url.match(/[_/][sp](\d{2,4})x(\d{2,4})/);
  return match ? ` (${match[1]}x${match[2]} rendition)` : "";
}
