// Choosing a DASH rendition, and remembering which manifest belongs to which
// progressive URL. No fetching or muxing here, so it stays unit-testable; the
// muxer lives in dash-mux.ts and is loaded only when a download needs it.

/**
 * What a DASH download needs: one video stream, plus the audio stream when the
 * media has sound. Both are single-file fragmented MP4s (`BaseURL` +
 * `SegmentBase`), which is the only layout measured on Instagram.
 */
export interface DashStreams {
  videoUrl: string;
  audioUrl: string | null;
  width: number;
  height: number;
  codecs: string;
}

/**
 * Picks the tallest video representation and the highest-bandwidth audio one,
 * or null when the manifest offers nothing taller than the progressive file.
 *
 * Height, not bandwidth, decides. Measured 2026-10-10 on photo-with-music
 * stories, the 1080p VP9 stream was sometimes *smaller* than the 720p H.264
 * progressive file (a still image compresses to almost nothing), so the
 * highest bitrate is not always the sharpest.
 *
 * Measured 2026-10-10 across reels, stories and carousel videos, the
 * progressive file is always Instagram's fixed 720p encode (`...C3.720...`)
 * while the manifest tops out at the upload's resolution: 1080p, or 1440p for
 * one reel. Media uploaded at 720p gets a 720p manifest, and this returns null
 * for it, which keeps the plain one-file download.
 *
 * `progressiveHeight` of 0 means unknown, in which case any video stream wins.
 * No measured manifest topped out below its progressive file.
 */
export function pickDashStreams(manifest: string, progressiveHeight: number): DashStreams | null {
  const doc = new DOMParser().parseFromString(manifest, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  // One period on every measured manifest. More would mean ad breaks or
  // splices, where picking per period is a different problem; refuse.
  if (doc.querySelectorAll("Period").length !== 1) return null;

  const reps = [...doc.querySelectorAll("Representation")].map((rep) => ({
    kind: kindOf(rep),
    url: rep.querySelector("BaseURL")?.textContent?.trim() ?? "",
    width: Number(rep.getAttribute("width")) || 0,
    height: Number(rep.getAttribute("height")) || 0,
    bandwidth: Number(rep.getAttribute("bandwidth")) || 0,
    codecs: rep.getAttribute("codecs") ?? rep.parentElement?.getAttribute("codecs") ?? "",
  }));

  type Rep = (typeof reps)[number];
  const best = (candidates: Rep[], better: (a: Rep, b: Rep) => boolean) =>
    candidates.reduce<Rep | undefined>((top, r) => (!top || better(r, top) ? r : top), undefined);

  const video = best(
    reps.filter((r) => r.kind === "video" && r.url && r.height > 0),
    (a, b) => a.height > b.height || (a.height === b.height && a.bandwidth > b.bandwidth),
  );
  if (!video || video.height <= progressiveHeight) return null;

  const audio = best(
    reps.filter((r) => r.kind === "audio" && r.url),
    (a, b) => a.bandwidth > b.bandwidth,
  );

  return {
    videoUrl: video.url,
    audioUrl: audio?.url ?? null,
    width: video.width,
    height: video.height,
    codecs: video.codecs,
  };
}

function kindOf(rep: Element): "video" | "audio" | null {
  const set = rep.parentElement;
  const type =
    rep.getAttribute("mimeType") ??
    set?.getAttribute("mimeType") ??
    set?.getAttribute("contentType") ??
    "";
  if (type.startsWith("video")) return "video";
  if (type.startsWith("audio")) return "audio";
  // No type anywhere: dimensions are what a video representation has.
  return rep.hasAttribute("width") ? "video" : null;
}

/**
 * Manifests by the progressive URL getImgOrVideoUrl handed out for the same
 * media item. That URL is what reaches downloadResource from all nine
 * download paths, so keying on it lets the DASH path find its manifest without
 * every caller having to carry one. Bounded, because a long scroll session
 * resolves many more items than are ever downloaded.
 */
const manifests = new Map<string, { manifest: string; height: number }>();
const MAX_REMEMBERED = 200;

export function rememberDashManifest(url: string, manifest: string, height: number) {
  manifests.delete(url);
  manifests.set(url, { manifest, height });
  if (manifests.size > MAX_REMEMBERED) {
    manifests.delete(manifests.keys().next().value!);
  }
}

export function dashManifestFor(url: string) {
  return manifests.get(url) ?? null;
}
