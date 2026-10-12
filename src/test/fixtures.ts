/**
 * Synthetic Instagram payloads for tests. Each builder produces only the
 * fields the extension reads, with obviously fake usernames, ids and URLs, so
 * no real account or media ends up in the repo.
 */

// 2025-08-12T16:54:23Z
export const TAKEN_AT = 1755017663;

export const imageVersions = (name: string) => ({
  candidates: [
    { url: `https://cdn.example/${name}_s320x320.jpg`, width: 320, height: 320 },
    { url: `https://cdn.example/${name}_full.jpg`, width: 1440, height: 1800 },
    { url: `https://cdn.example/${name}_s640x640.jpg`, width: 640, height: 640 },
  ],
});

/** The URL `getImgOrVideoUrl` should pick for `photo(name)`: the largest rendition. */
export const fullUrl = (name: string) => `https://cdn.example/${name}_full.jpg`;

export const photo = (name: string, extra: Record<string, unknown> = {}) => ({
  image_versions2: imageVersions(name),
  ...extra,
});

export const video = (name: string, extra: Record<string, unknown> = {}) => ({
  video_versions: [{ url: `https://cdn.example/${name}.mp4` }],
  image_versions2: imageVersions(`${name}_cover`),
  ...extra,
});

export const owner = (username: string) => ({ username });

export const carousel = (
  items: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
) => ({
  carousel_media: items,
  taken_at: TAKEN_AT,
  owner: owner("post_owner"),
  ...extra,
});

/**
 * A DASH manifest shaped like Instagram's (measured 2026-10-10): one period,
 * one VP9 representation per rung and one HE-AAC audio representation, each a
 * single file named by `BaseURL` and indexed by `SegmentBase`.
 */
export const dashManifest = (
  name: string,
  ladder: { width: number; height: number; bandwidth: number }[],
  { audio = true } = {},
) => `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT19.038S">
  <Period id="0" duration="PT19.038S">
    <AdaptationSet segmentAlignment="true" maxWidth="1080" maxHeight="1920">
${ladder
  .map(
    (
      r,
    ) => `      <Representation id="${r.height}v" mimeType="video/mp4" codecs="vp09.00.40.08.00.01.01.01.00" width="${r.width}" height="${r.height}" bandwidth="${r.bandwidth}" FBQualityLabel="${r.width}p">
        <BaseURL>https://cdn.example/${name}_v${r.height}.mp4</BaseURL>
        <SegmentBase indexRange="896-999"><Initialization range="0-895"/></SegmentBase>
      </Representation>`,
  )
  .join("\n")}
    </AdaptationSet>${
      audio
        ? `
    <AdaptationSet segmentAlignment="true">
      <Representation id="a" mimeType="audio/mp4" codecs="mp4a.40.5" audioSamplingRate="44100" bandwidth="65000">
        <BaseURL>https://cdn.example/${name}_audio.mp4</BaseURL>
        <SegmentBase indexRange="824-911"><Initialization range="0-823"/></SegmentBase>
      </Representation>
    </AdaptationSet>`
        : ""
    }
  </Period>
</MPD>`;
