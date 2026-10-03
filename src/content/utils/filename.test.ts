import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaType } from "../../constants";
import {
  fromUnixSeconds,
  getExtensionFromUrl,
  getFilenameFromUrl,
  getMediaName,
  getUserFolder,
} from "./filename";

// 2025-08-12T16:54:23Z
const TAKEN_AT = 1755017663;

describe("getFilenameFromUrl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-02T03:04:05.678Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats the post time as a UTC timestamp with dots for separators", () => {
    expect(getFilenameFromUrl({ url: "", datetime: fromUnixSeconds(TAKEN_AT) })).toBe(
      "2025.08.12T16.54.23",
    );
  });

  it("converts an offset timestamp string to UTC", () => {
    expect(getFilenameFromUrl({ url: "", datetime: "2024-01-01T05:00:00+05:00" })).toBe(
      "2024.01.01T00.00.00",
    );
  });

  it("truncates milliseconds rather than rounding them", () => {
    expect(getFilenameFromUrl({ url: "", datetime: "2024-02-29T23:59:59.999Z" })).toBe(
      "2024.02.29T23.59.59",
    );
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an unparseable string", "not a date"],
  ])("falls back to the current time when the datetime is %s", (_label, datetime) => {
    expect(getFilenameFromUrl({ url: "", datetime })).toBe("2030.01.02T03.04.05");
  });

  it.each([
    [0, " 00"],
    [3, " 03"],
    [12, " 12"],
  ])("pads index %i to two digits", (index, suffix) => {
    expect(getFilenameFromUrl({ url: "", datetime: fromUnixSeconds(TAKEN_AT), index })).toBe(
      `2025.08.12T16.54.23${suffix}`,
    );
  });

  it.each([
    [MediaType.Post, ""],
    [MediaType.Story, "story - "],
    [MediaType.Highlight, "story - "],
    [MediaType.Reel, "reel - "],
    [MediaType.Threads, "thread - "],
    [MediaType.Profile, "profile - "],
    [MediaType.Cover, "cover - "],
  ])("prefixes %s media with %j", (type, prefix) => {
    expect(getFilenameFromUrl({ url: "", datetime: fromUnixSeconds(TAKEN_AT), type })).toBe(
      `${prefix}2025.08.12T16.54.23`,
    );
  });

  it("puts the prefix before the timestamp and the index after it", () => {
    expect(
      getFilenameFromUrl({
        url: "",
        datetime: fromUnixSeconds(TAKEN_AT),
        type: MediaType.Story,
        index: 1,
      }),
    ).toBe("story - 2025.08.12T16.54.23 01");
  });
});

describe("fromUnixSeconds", () => {
  it("treats its argument as seconds, not milliseconds", () => {
    expect(fromUnixSeconds(TAKEN_AT).toISOString()).toBe("2025-08-12T16:54:23.000Z");
  });
});

describe("getUserFolder", () => {
  it("prefixes the username with @", () => {
    expect(getUserFolder("groot")).toBe("@groot");
  });

  it("trims surrounding whitespace", () => {
    expect(getUserFolder("  groot ")).toBe("@groot");
  });

  it.each([
    ["a forward slash", "gr/oot"],
    ["a backslash", "gr\\oot"],
  ])("strips %s so the name cannot escape its folder", (_label, username) => {
    expect(getUserFolder(username)).toBe("@groot");
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["a single dot", "."],
    ["only dots", ".."],
    ["only separators", "/\\/"],
  ])("returns no folder for a username that is %s", (_label, username) => {
    expect(getUserFolder(username)).toBe("");
  });
});

describe("getExtensionFromUrl", () => {
  it.each([
    ["https://cdn.example/v/t51/abc_n.jpg?stp=dst-jpg", "jpg"],
    ["https://cdn.example/v/t51/abc_n.png", "png"],
    ["https://cdn.example/v/t51/abc_n.webp", "webp"],
    ["https://cdn.example/v/t16/abc.mp4?efg=1", "mp4"],
    ["https://cdn.example/v/t16/abc.MOV", "mov"],
  ])("reads the extension from %s", (url, extension) => {
    expect(getExtensionFromUrl(url)).toBe(extension);
  });

  it("normalizes jpeg to jpg", () => {
    expect(getExtensionFromUrl("https://cdn.example/a/b.JPEG")).toBe("jpg");
  });

  it.each([
    ["has no extension", "https://cdn.example/a/b"],
    ["has an unknown extension", "https://cdn.example/a/b.heic"],
    ["has a dot only in a directory", "https://cdn.example/a.b/c"],
    ["is not a URL", "not a url"],
  ])("falls back when the path %s", (_label, url) => {
    expect(getExtensionFromUrl(url)).toBe("jpg");
    expect(getExtensionFromUrl(url, "mp4")).toBe("mp4");
  });
});

describe("getMediaName", () => {
  it("returns the last path segment without its extension", () => {
    expect(getMediaName("https://cdn.example/v/t51/12345_678_n.jpg?stp=dst-jpg_e35")).toBe(
      "12345_678_n",
    );
  });

  it("returns an empty string for something that is not a URL", () => {
    expect(getMediaName("not a url")).toBe("");
  });
});
