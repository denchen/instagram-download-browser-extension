import { describe, expect, it } from "vitest";

import { asArray, findKey, isArray, path, prop } from "./json";

describe("prop", () => {
  it("reads one property of an object", () => {
    expect(prop({ a: 1 }, "a")).toBe(1);
  });

  it("gives undefined for anything that is not an object", () => {
    expect(prop("a string", "length")).toBeUndefined();
    expect(prop(null, "a")).toBeUndefined();
    expect(prop(undefined, "a")).toBeUndefined();
  });
});

describe("path", () => {
  it("walks a chain of keys", () => {
    expect(path({ a: { b: { c: 1 } } }, "a", "b", "c")).toBe(1);
  });

  it("stops at the first missing step instead of throwing", () => {
    expect(path({ a: {} }, "a", "b", "c")).toBeUndefined();
  });
});

describe("asArray", () => {
  it("passes an array through and replaces anything else", () => {
    expect(asArray([1, 2])).toStrictEqual([1, 2]);
    expect(asArray("nope")).toStrictEqual([]);
    expect(asArray(undefined)).toStrictEqual([]);
  });
});

describe("isArray", () => {
  // Array.isArray narrows unknown to any[], which puts back the any the
  // rest of this module exists to remove.
  it("recognises arrays", () => {
    expect(isArray([])).toBe(true);
    expect(isArray({ length: 0 })).toBe(false);
  });
});

describe("findKey", () => {
  it("finds a key at the top level", () => {
    expect(findKey({ target: 1 }, "target")).toBe(1);
  });

  it("finds a key nested in objects and arrays", () => {
    const obj = { data: { results: [{ other: 1 }, { deep: { target: "found" } }] } };
    expect(findKey(obj, "target")).toBe("found");
  });

  // The hand-rolled walks this replaced checked each property in turn, so
  // they returned the nested hit here. Shallow-first is the rule that can be
  // stated; every key it is used with appears once per payload.
  it("prefers a direct hit over a nested one", () => {
    const obj = { first: { target: "nested" }, target: "top-level" };
    expect(findKey(obj, "target")).toBe("top-level");
  });

  it("returns falsy values instead of skipping them", () => {
    expect(findKey({ a: { target: 0 } }, "target")).toBe(0);
    expect(findKey({ a: { target: null } }, "target")).toBeNull();
  });

  it("walks past null values without throwing", () => {
    expect(findKey({ a: null, b: { target: 1 } }, "target")).toBe(1);
  });

  it("ignores inherited properties", () => {
    const obj: unknown = Object.create({ target: "inherited" });
    expect(findKey(obj, "target")).toBeUndefined();
  });

  it("returns undefined when the key is absent", () => {
    expect(findKey({ a: { b: [1, 2] } }, "target")).toBeUndefined();
  });
});
