import { beforeEach, describe, expect, it, vi } from "vitest";

import { limitMapSize, saveGraphqlQuery, savePosts } from "./fn";
import { fullUrl, owner, photo } from "../test/fixtures";

describe("limitMapSize", () => {
  it("evicts the oldest entries first", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ]);
    limitMapSize(map, 2);
    expect([...map.keys()]).toStrictEqual(["c", "d"]);
  });

  it("treats a re-inserted key as newest", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    // The save* writers delete then set, so a refreshed entry survives eviction.
    map.delete("a");
    map.set("a", 1);
    limitMapSize(map, 1);
    expect([...map.keys()]).toStrictEqual(["a"]);
  });

  it("leaves a map at or under the limit alone", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    limitMapSize(map, 2);
    expect(map.size).toBe(2);
  });

  it("caps at 200 by default", () => {
    const map = new Map(Array.from({ length: 250 }, (_, i) => [i, i]));
    limitMapSize(map);
    expect(map.size).toBe(200);
    expect(map.keys().next().value).toBe(50);
  });
});

describe("saveGraphqlQuery", () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    // Like the real API, every call yields before touching the data, which is
    // what lets concurrent read-modify-write cycles interleave.
    const tick = () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: async (keys: string[]) => {
            await tick();
            return Object.fromEntries(keys.map((key) => [key, store[key]]));
          },
          set: async (items: Record<string, unknown>) => {
            await tick();
            Object.assign(store, items);
          },
        },
      },
    });
  });

  it("keeps both highlights and stories when one response carries both", async () => {
    await saveGraphqlQuery({
      data: {
        xdt_api__v1__feed__reels_media__connection: { edges: [{ node: { id: "highlight:1" } }] },
        xdt_api__v1__feed__reels_media: { reels_media: [{ id: "story:1" }] },
      },
    });
    const ids = (store.stories_reels_media as [string, unknown][]).map(([id]) => id);
    expect(ids).toStrictEqual(["highlight:1", "story:1"]);
    expect(store.highlights_data).toStrictEqual([["highlight:1", { id: "highlight:1" }]]);
  });

  it("writes nothing for a response with no media it recognises", async () => {
    await saveGraphqlQuery({ data: { unrelated: true } });
    expect(store).toStrictEqual({});
  });
});

describe("savePosts", () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: (keys: string[]) =>
            Promise.resolve(Object.fromEntries(keys.map((key) => [key, store[key]]))),
          set: (items: Record<string, unknown>) =>
            Promise.resolve(void Object.assign(store, items)),
          remove: (keys: string[]) => Promise.resolve(keys.forEach((key) => delete store[key])),
        },
      },
    });
  });

  const feed = (...codes: string[]) => ({
    data: {
      xdt_api__v1__feed__timeline__connection: {
        edges: codes.map((code) => ({ node: { media: photo(code, { code, user: owner("me") }) } })),
      },
    },
  });

  it("stores each post under its own key, slimmed, and indexes it", async () => {
    await savePosts(feed("A", "B"));
    expect(store["post:A"]).toMatchObject({
      code: "A",
      owner: owner("me"),
      image_versions2: { candidates: [{ url: fullUrl("A") }] },
    });
    expect(store.posts_index).toStrictEqual([
      ["A", null],
      ["B", null],
    ]);
  });

  it("moves a post seen again to the most recent end of the index", async () => {
    await savePosts(feed("A", "B"));
    await savePosts(feed("A"));
    expect((store.posts_index as [string, unknown][]).map(([code]) => code)).toStrictEqual([
      "B",
      "A",
    ]);
  });

  it("removes the stored entries of evicted posts", async () => {
    const past = Math.floor((Date.now() - 1000) / 1000).toString(16);
    store.posts_index = [["OLD", Date.now() - 1000]];
    store["post:OLD"] = { image_versions2: { candidates: [{ url: `https://x/?oe=${past}` }] } };
    await savePosts(feed("A"));
    expect(store).not.toHaveProperty("post:OLD");
    expect(store.posts_index).toStrictEqual([["A", null]]);
  });

  it("runs as part of saveGraphqlQuery", async () => {
    await saveGraphqlQuery(feed("A"));
    expect(store).toHaveProperty("post:A");
  });
});
