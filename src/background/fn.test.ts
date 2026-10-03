import { beforeEach, describe, expect, it, vi } from "vitest";

import { findValueByKey, limitMapSize, saveGraphqlQuery } from "./fn";

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

describe("findValueByKey", () => {
  it("finds a key at the top level", () => {
    expect(findValueByKey({ target: 1 }, "target")).toBe(1);
  });

  it("finds a key nested in objects and arrays", () => {
    const obj = { data: { results: [{ other: 1 }, { deep: { target: "found" } }] } };
    expect(findValueByKey(obj, "target")).toBe("found");
  });

  it("returns the first match in depth-first order", () => {
    const obj = { first: { target: "outer-first" }, target: "top-level" };
    expect(findValueByKey(obj, "target")).toBe("outer-first");
  });

  it("returns falsy values instead of skipping them", () => {
    expect(findValueByKey({ a: { target: 0 } }, "target")).toBe(0);
    expect(findValueByKey({ a: { target: null } }, "target")).toBeNull();
  });

  it("walks past null values without throwing", () => {
    expect(findValueByKey({ a: null, b: { target: 1 } }, "target")).toBe(1);
  });

  it("ignores inherited properties", () => {
    const obj = Object.create({ target: "inherited" });
    expect(findValueByKey(obj, "target")).toBeUndefined();
  });

  it("returns undefined when the key is absent", () => {
    expect(findValueByKey({ a: { b: [1, 2] } }, "target")).toBeUndefined();
  });
});

describe("saveGraphqlQuery", () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    // Like the real API, every call yields before touching the data, which is
    // what lets concurrent read-modify-write cycles interleave.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
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
