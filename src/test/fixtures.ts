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
