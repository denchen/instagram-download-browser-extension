// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { dashManifestFor, pickDashStreams, rememberDashManifest } from "./dash";
import { getImgOrVideoUrl } from "./media";
import { dashManifest } from "../../test/fixtures";

const REEL_LADDER = [
  { height: 640, width: 360, bandwidth: 457_000 },
  { height: 960, width: 540, bandwidth: 1_416_000 },
  { height: 1280, width: 720, bandwidth: 2_809_000 },
  { height: 1920, width: 1080, bandwidth: 4_068_000 },
];

describe("pickDashStreams", () => {
  it("picks the tallest video and the audio when they beat the 720p progressive file", () => {
    expect(pickDashStreams(dashManifest("reel", REEL_LADDER), 1280)).toStrictEqual({
      videoUrl: "https://cdn.example/reel_v1920.mp4",
      audioUrl: "https://cdn.example/reel_audio.mp4",
      width: 1080,
      height: 1920,
      codecs: "vp09.00.40.08.00.01.01.01.00",
    });
  });

  // An upload at 720p gets a 720p manifest; the one-file download is as good.
  it("returns null when nothing is taller than the progressive file", () => {
    const ladder = REEL_LADDER.filter((r) => r.height <= 1280);
    expect(pickDashStreams(dashManifest("reel", ladder), 1280)).toBeNull();
  });

  // A photo-with-music story's 1080p stream can be the smallest one.
  it("ranks by height, not bandwidth", () => {
    const ladder = [
      { height: 1280, width: 720, bandwidth: 900_000 },
      { height: 1920, width: 1080, bandwidth: 30_000 },
    ];
    expect(pickDashStreams(dashManifest("story", ladder), 1280)?.height).toBe(1920);
  });

  it("returns no audio URL for a silent video", () => {
    const manifest = dashManifest("carousel", REEL_LADDER, { audio: false });
    expect(pickDashStreams(manifest, 1280)?.audioUrl).toBeNull();
  });

  it("takes any video stream when the progressive height is unknown", () => {
    const ladder = REEL_LADDER.slice(0, 1);
    expect(pickDashStreams(dashManifest("reel", ladder), 0)?.height).toBe(640);
  });

  it("refuses a manifest with more than one period", () => {
    const manifest = dashManifest("reel", REEL_LADDER).replace(
      "</Period>",
      '</Period><Period id="1"></Period>',
    );
    expect(pickDashStreams(manifest, 1280)).toBeNull();
  });

  it("returns null for a manifest that does not parse", () => {
    expect(pickDashStreams("<MPD><Period>", 1280)).toBeNull();
  });
});

describe("manifest registry", () => {
  it("is filled by getImgOrVideoUrl for a video with a manifest", () => {
    const manifest = dashManifest("registered", REEL_LADDER);
    const url = getImgOrVideoUrl({
      video_versions: [{ url: "https://cdn.example/registered.mp4", height: 1280 }],
      video_dash_manifest: manifest,
    });
    expect(dashManifestFor(url)).toStrictEqual({ manifest, height: 1280 });
  });

  it("knows nothing about a video without a manifest", () => {
    const url = getImgOrVideoUrl({ video_versions: [{ url: "https://cdn.example/plain.mp4" }] });
    expect(dashManifestFor(url)).toBeNull();
  });

  it("forgets the oldest entry past its bound", () => {
    rememberDashManifest("https://cdn.example/oldest.mp4", "<MPD/>", 1280);
    for (let i = 0; i < 200; i++)
      rememberDashManifest(`https://cdn.example/${i}.mp4`, "<MPD/>", 1280);
    expect(dashManifestFor("https://cdn.example/oldest.mp4")).toBeNull();
    expect(dashManifestFor("https://cdn.example/199.mp4")).not.toBeNull();
  });
});
