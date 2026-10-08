import { describe, expect, it } from "vitest";

import { TAKEN_AT, carousel, fullUrl, owner, photo, video } from "../../test/fixtures";
import { getImgOrVideoUrl } from "./media";
import {
  isFresh,
  postExpiry,
  postsFromEmbedded,
  postsFromGraphql,
  slimPost,
  updateIndex,
} from "./post-cache";

const feedResponse = (...nodes: Record<string, unknown>[]) => ({
  data: { xdt_api__v1__feed__timeline__connection: { edges: nodes.map((node) => ({ node })) } },
});
const gridResponse = (...nodes: Record<string, unknown>[]) => ({
  data: {
    xdt_api__v1__feed__user_timeline_graphql_connection: {
      edges: nodes.map((node) => ({ node })),
    },
  },
});

/** A URL signed to expire at `expiresAtMs`, the way Instagram's `oe` encodes it. */
const signed = (name: string, expiresAtMs: number) =>
  `https://cdn.example/${name}.jpg?oe=${Math.floor(expiresAtMs / 1000).toString(16)}`;
const signedPhoto = (name: string, expiresAtMs: number) => ({
  image_versions2: { candidates: [{ url: signed(name, expiresAtMs), width: 1080, height: 1080 }] },
});

describe("postsFromGraphql", () => {
  it("takes posts from unfollowed accounts at node.explore_story.media", () => {
    const posts = postsFromGraphql(
      feedResponse(
        { media: photo("a", { code: "A" }) },
        { media: null, explore_story: { media: photo("b", { code: "B", user: owner("other") }) } },
      ),
    );
    expect(posts.map((p) => p.code)).toStrictEqual(["A", "B"]);
  });

  it("takes feed posts from node.media and skips edges that are not posts", () => {
    const posts = postsFromGraphql(
      feedResponse(
        { media: photo("a", { code: "A" }) },
        { media: null, suggested_users: {} },
        { media: null, end_of_feed_demarcator: {} },
        { media: photo("b", { code: "B" }) },
      ),
    );
    expect(posts.map((p) => p.code)).toStrictEqual(["A", "B"]);
  });

  it("takes grid posts from node itself", () => {
    const posts = postsFromGraphql(gridResponse(photo("a", { code: "A" })));
    expect(posts.map((p) => p.code)).toStrictEqual(["A"]);
  });

  it("returns nothing for a response from any other query", () => {
    expect(
      postsFromGraphql({ data: { xdt_api__v1__clips__home__connection_v2: {} } }),
    ).toStrictEqual([]);
    expect(postsFromGraphql(null)).toStrictEqual([]);
  });
});

describe("postsFromEmbedded", () => {
  it("finds the feed connection however deeply the page nests it", () => {
    const page = {
      require: [
        [
          "ScheduledServerJS",
          "handle",
          null,
          [{ __bbox: { result: feedResponse({ media: photo("a", { code: "A" }) }) } }],
        ],
      ],
    };
    expect(postsFromEmbedded(page).map((p) => p.code)).toStrictEqual(["A"]);
  });

  it("returns nothing when the page carries no feed", () => {
    expect(postsFromEmbedded({ require: [] })).toStrictEqual([]);
  });
});

describe("slimPost", () => {
  it("keeps the rendition the download path would pick, and only that", () => {
    const slim = slimPost(photo("p", { code: "P", taken_at: TAKEN_AT, owner: owner("me") }));
    expect(getImgOrVideoUrl(slim)).toBe(fullUrl("p"));
    expect(slim.image_versions2.candidates).toHaveLength(1);
  });

  it("keeps the video, not its cover", () => {
    const original = video("v", { code: "V" });
    expect(getImgOrVideoUrl(slimPost(original))).toBe(getImgOrVideoUrl(original));
  });

  it("reads the author from `user`, as both timeline payloads name it", () => {
    expect(slimPost(photo("p", { code: "P", user: owner("author") })).owner).toStrictEqual(
      owner("author"),
    );
  });

  it("keeps every carousel slide with its own pick and owner", () => {
    const original = carousel(
      [photo("s0"), video("s1"), photo("s2", { owner: owner("slide_owner") })],
      { code: "C" },
    );
    const slim = slimPost(original);
    expect(slim.carousel_media.map(getImgOrVideoUrl)).toStrictEqual(
      original.carousel_media.map(getImgOrVideoUrl),
    );
    expect(slim.carousel_media[2].owner).toStrictEqual(owner("slide_owner"));
    expect(slim).toMatchObject({ taken_at: TAKEN_AT, owner: owner("post_owner") });
  });

  it("leaves carousel_media unset on a single post, since callers test `in`", () => {
    expect("carousel_media" in slimPost(photo("p", { code: "P" }))).toBe(false);
  });
});

describe("postExpiry", () => {
  const NOW = Date.UTC(2026, 9, 6);

  it("reads the hex oe parameter as epoch seconds", () => {
    const at = NOW + 105 * 3600_000;
    expect(postExpiry(signedPhoto("p", at))).toBe(Math.floor(at / 1000) * 1000);
  });

  it("takes the earliest expiry across carousel slides", () => {
    const soon = NOW + 3600_000;
    const post = carousel([signedPhoto("late", NOW + 7200_000), signedPhoto("soon", soon)]);
    expect(postExpiry(post)).toBe(Math.floor(soon / 1000) * 1000);
  });

  it("returns null when no URL carries an expiry", () => {
    expect(postExpiry(photo("p"))).toBeNull();
  });
});

describe("isFresh", () => {
  const NOW = Date.UTC(2026, 9, 6);

  it("treats an unknown expiry as fresh", () => {
    expect(isFresh(null, NOW)).toBe(true);
  });

  it("refuses a URL within ten minutes of expiring", () => {
    expect(isFresh(NOW + 5 * 60_000, NOW)).toBe(false);
    expect(isFresh(NOW + 15 * 60_000, NOW)).toBe(true);
  });
});

describe("updateIndex", () => {
  const NOW = Date.UTC(2026, 9, 6);
  const LATER = NOW + 86_400_000;

  it("moves a post seen again to the most recent end", () => {
    const { index, evicted } = updateIndex(
      [
        ["A", LATER],
        ["B", LATER],
      ],
      [["A", LATER]],
      NOW,
    );
    expect(index.map(([code]) => code)).toStrictEqual(["B", "A"]);
    expect(evicted).toStrictEqual([]);
  });

  it("past the limit, evicts whatever has gone longest without being seen", () => {
    const { index, evicted } = updateIndex(
      [
        ["A", LATER],
        ["B", LATER],
      ],
      [["C", LATER]],
      NOW,
      2,
    );
    expect(index.map(([code]) => code)).toStrictEqual(["B", "C"]);
    expect(evicted).toStrictEqual(["A"]);
  });

  it("drops expired entries regardless of the limit", () => {
    const { index, evicted } = updateIndex(
      [
        ["OLD", NOW - 1],
        ["B", LATER],
      ],
      [["C", null]],
      NOW,
    );
    expect(index.map(([code]) => code)).toStrictEqual(["B", "C"]);
    expect(evicted).toStrictEqual(["OLD"]);
  });
});
