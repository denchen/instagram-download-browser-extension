// Pure helpers for Instagram media payloads and URLs. Kept free of DOM,
// fetch and chrome.* so they can be unit-tested without a browser.

/**
 * Instagram returns several renditions of every photo. They have long been
 * ordered largest-first, so `candidates[0]` is normally the original — but
 * that is a convention, not a contract, and if it ever changed every download
 * would silently shrink. Pick by pixel area instead, falling back to the first
 * entry when dimensions are missing.
 *
 * Deliberately NOT applied to video_versions: those entries carry a `type`
 * denoting different encodings, so largest-area is not reliably "the best one".
 */
export function largestCandidate(candidates: Record<string, any>[]) {
  return candidates.reduce((best, current) => {
    const bestArea = (best.width ?? 0) * (best.height ?? 0);
    const currentArea = (current.width ?? 0) * (current.height ?? 0);
    return currentArea > bestArea ? current : best;
  }, candidates[0]);
}

export const getImgOrVideoUrl = (item: Record<string, any>) => {
  if ("video_versions" in item) {
    return item.video_versions[0].url;
  } else {
    return largestCandidate(item.image_versions2.candidates).url;
  }
};

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
