// Pure helpers for Instagram media payloads and URLs. Kept free of DOM,
// fetch and chrome.* so they can be unit-tested without a browser.

import { rememberDashManifest } from "./dash";

/**
 * Picks the largest photo rendition by pixel area. Largest-first ordering is a
 * convention, not a contract; if it changed, `candidates[0]` would silently
 * shrink every download. Falls back to the first entry when dimensions are
 * missing, and returns undefined for a missing or empty ladder.
 *
 * Not applied to video_versions; see getImgOrVideoUrl.
 */
export function largestCandidate(candidates?: Record<string, any>[]) {
  if (!candidates || candidates.length === 0) return undefined;
  return candidates.reduce((best, current) => {
    const bestArea = (best.width ?? 0) * (best.height ?? 0);
    const currentArea = (current.width ?? 0) * (current.height ?? 0);
    return currentArea > bestArea ? current : best;
  });
}

/**
 * The one place that picks which rendition of a media item to download: the
 * video if there is one, otherwise the largest photo. Every download path must
 * call this rather than inline `video_versions?.[0] || candidates[0]` (#1).
 *
 * `item` is not optional-chained: an undefined item means an index past the end
 * of a carousel, which must throw. Only the fields inside an item are optional.
 * An empty `video_versions` falls through to the cover image rather than
 * throwing.
 *
 * `video_versions[0]` is fine because there is nothing to choose between.
 * Measured 2026-10-05 (stories, highlights) and 2026-10-10 (reels, carousel
 * videos): three entries typed 101/102/103 with one byte-identical URL and no
 * dimensions, a fixed 720p progressive H.264 file. Anything sharper exists only
 * in `video_dash_manifest`, remembered here for downloadResource.
 */
export function getImgOrVideoUrl(item: Record<string, any>) {
  const video = item.video_versions?.[0];
  if (video?.url) {
    // See pickDashStreams.
    if (typeof item.video_dash_manifest === "string") {
      rememberDashManifest(video.url, item.video_dash_manifest, Number(video.height) || 0);
    }
    return video.url as string;
  }
  return largestCandidate(item.image_versions2?.candidates)?.url;
}

/**
 * Extracts the rendition size encoded in a URL (`stp=..._s150x150` or a
 * `/s640x640/` segment) for the download log.
 *
 * Reports the size without a verdict. Judging "downscaled" needs the candidate
 * ladder, and only the DOM fallback yields a sized URL, where the ladder isn't
 * available (the post cache keeps only the largest rendition). A fixed 1080
 * threshold was tried and was wrong: originals reach 4032x3024 (#2).
 *
 * No size token is not proof of full resolution; file size is the tell.
 */
export function describeRendition(url: string) {
  const match = url.match(/[_/][sp](\d{2,4})x(\d{2,4})/);
  return match ? ` (${match[1]}x${match[2]} rendition)` : "";
}
