import { describe, expect, it } from "vitest";

import { describeRendition, getImgOrVideoUrl, largestCandidate } from "./media";

const candidate = (url: string, width?: number, height?: number) => ({ url, width, height });

describe("largestCandidate", () => {
  it("picks the rendition with the largest pixel area, wherever it sits", () => {
    const candidates = [
      candidate("small", 320, 320),
      candidate("largest", 1440, 1800),
      candidate("medium", 1080, 1350),
    ];
    expect(largestCandidate(candidates)?.url).toBe("largest");
  });

  it("compares area, not width", () => {
    const candidates = [candidate("wide", 2000, 100), candidate("square", 1000, 1000)];
    expect(largestCandidate(candidates)?.url).toBe("square");
  });

  it("keeps the first of equally sized renditions", () => {
    const candidates = [candidate("first", 1080, 1080), candidate("second", 1080, 1080)];
    expect(largestCandidate(candidates)?.url).toBe("first");
  });

  it("falls back to the first entry when no rendition has dimensions", () => {
    const candidates = [candidate("first"), candidate("second")];
    expect(largestCandidate(candidates)?.url).toBe("first");
  });

  it.each([
    ["an absent ladder", undefined],
    ["an empty ladder", []],
  ])("returns undefined for %s", (_label, candidates) => {
    expect(largestCandidate(candidates)).toBeUndefined();
  });
});

describe("getImgOrVideoUrl", () => {
  it("returns the first video version for a video, ignoring larger images", () => {
    const item = {
      video_versions: [{ url: "video-0" }, { url: "video-1" }],
      image_versions2: { candidates: [candidate("cover", 4000, 4000)] },
    };
    expect(getImgOrVideoUrl(item)).toBe("video-0");
  });

  it("returns the largest image rendition for a photo", () => {
    const item = {
      image_versions2: {
        candidates: [candidate("small", 150, 150), candidate("full", 3072, 4096)],
      },
    };
    expect(getImgOrVideoUrl(item)).toBe("full");
  });

  // The shapes the stories, highlights, reels, profile-reel and Threads paths
  // hand over. Each used to inline its own `candidates[0]` and so ignored the
  // ladder entirely; these assert they now get the largest rendition.
  it("picks the largest rendition when the ladder is not ordered largest-first", () => {
    const item = {
      image_versions2: {
        candidates: [candidate("s320", 320, 320), candidate("full", 1440, 1800)],
      },
    };
    expect(getImgOrVideoUrl(item)).toBe("full");
  });

  it("falls through to the cover when video_versions is present but empty", () => {
    const item = {
      video_versions: [],
      image_versions2: { candidates: [candidate("cover", 1080, 1080)] },
    };
    expect(getImgOrVideoUrl(item)).toBe("cover");
  });

  it("returns undefined when an item carries neither videos nor candidates", () => {
    expect(getImgOrVideoUrl({})).toBeUndefined();
    expect(getImgOrVideoUrl({ image_versions2: {} })).toBeUndefined();
  });

  // getUrlFromInfoApi's carousel range check is written against this throw:
  // an undefined item means the caller indexed past the end, and that must
  // stay loud rather than resolve to undefined.
  it("throws on an undefined item rather than resolving to undefined", () => {
    expect(() => getImgOrVideoUrl(undefined as any)).toThrow(TypeError);
  });
});

describe("describeRendition", () => {
  it.each([
    ["an stp token", "https://cdn.example/a.jpg?stp=dst-jpg_e35_s150x150_tt6", "150x150"],
    ["a path segment", "https://cdn.example/s640x640/a.jpg", "640x640"],
    ["a p-prefixed token", "https://cdn.example/a.jpg?stp=dst-jpg_p1080x1080", "1080x1080"],
  ])("reports the size from %s", (_label, url, size) => {
    expect(describeRendition(url)).toBe(` (${size} rendition)`);
  });

  it("says nothing when the URL declares no size", () => {
    expect(describeRendition("https://cdn.example/a.jpg?stp=dst-jpg_e35")).toBe("");
  });
});
