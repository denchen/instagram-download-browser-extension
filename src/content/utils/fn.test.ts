// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { MediaType } from "../../constants";
import { TAKEN_AT, carousel, fullUrl, owner, photo, video } from "../../test/fixtures";
import { fromUnixSeconds } from "./filename";

// fn.ts caches media ids and API responses in module-level maps, so each test
// gets a fresh copy of the module.
let fn: typeof import("./fn");

beforeEach(async () => {
  vi.resetModules();
  fn = await import("./fn");
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

const container = (hrefs: string[]) => {
  const article = document.createElement("article");
  article.innerHTML = hrefs.map((href) => `<a href="${href}"></a>`).join("");
  return article;
};

describe("findPostId", () => {
  it.each([
    ["/reels/REELCODE/", "REELCODE"],
    ["/reel/REELCODE/", "REELCODE"],
    ["/stories/some_user/3456789/", "3456789"],
    ["/p/POSTCODE/", "POSTCODE"],
    ["/some_user/p/POSTCODE/", "POSTCODE"],
  ])("reads the id straight off %s", (pathname, id) => {
    // The container's link would be a different post: the URL must win.
    expect(fn.findPostId(container(["/p/OTHER/"]), pathname)).toBe(id);
  });

  it("scans the container on pages whose URL names no post", () => {
    expect(fn.findPostId(container(["/some_user/", "/p/POSTCODE/"]), "/")).toBe("POSTCODE");
  });

  it("accepts a /<user>/reel/<code>/ link", () => {
    expect(fn.findPostId(container(["/some_user/reel/REELCODE/"]), "/")).toBe("REELCODE");
  });

  it("accepts several links to the same post", () => {
    const links = ["/p/POSTCODE/", "/p/POSTCODE/liked_by/", "/some_user/"];
    expect(fn.findPostId(container(links), "/")).toBe("POSTCODE");
  });

  it("refuses a container holding more than one post", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(fn.findPostId(container(["/p/FIRST/", "/p/SECOND/"]), "/")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("FIRST, SECOND"));
  });

  it("returns null when the container links to no post", () => {
    expect(fn.findPostId(container(["/some_user/", "/explore/"]), "/")).toBeNull();
  });
});

const urlOf = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString();

describe("getUrlFromInfoApi", () => {
  const APP_ID = "1234567890";
  const MEDIA_ID = "9876543210";
  const INFO_URL = `https://i.instagram.com/api/v1/media/${MEDIA_ID}/info/`;
  const PERMALINK = "https://www.instagram.com/p/POSTCODE/";

  const mockApi = (item: unknown, status = 200) => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = urlOf(input);
      if (url === PERMALINK) {
        return Promise.resolve(new Response(`<script>{"media_id":"${MEDIA_ID}"}</script>`));
      }
      if (url === INFO_URL) {
        return Promise.resolve(new Response(JSON.stringify({ items: [item] }), { status }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  beforeEach(() => {
    window.history.replaceState(null, "", "/p/POSTCODE/");
    const script = document.createElement("script");
    script.type = "application/json";
    script.text = `{"X-IG-App-ID":"${APP_ID}"}`;
    document.body.append(script);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("resolves a single photo to its largest rendition and owner", async () => {
    mockApi(photo("single", { owner: owner("poster"), coauthor_producers: [owner("collab")] }));
    const res = await fn.getUrlFromInfoApi(document.body);
    expect(res).toMatchObject({
      url: fullUrl("single"),
      owner: "poster",
      coauthor_producers: ["collab"],
    });
  });

  it("calls the info API with the app id", async () => {
    const fetchMock = mockApi(photo("single"));
    await fn.getUrlFromInfoApi(document.body);
    const init = fetchMock.mock.calls.find(([input]) => urlOf(input) === INFO_URL)?.[1];
    expect(init?.headers).toMatchObject({ "X-IG-App-ID": APP_ID });
  });

  it("labels a post with no owner as unknown", async () => {
    mockApi(photo("single"));
    expect(await fn.getUrlFromInfoApi(document.body)).toMatchObject({ owner: "unknown" });
  });

  it("resolves a carousel slide, taking the post's time and owner", async () => {
    mockApi(carousel([photo("slide0"), video("slide1"), photo("slide2")]));
    const res = await fn.getUrlFromInfoApi(document.body, 1);
    expect(res).toMatchObject({
      url: "https://cdn.example/slide1.mp4",
      taken_at: TAKEN_AT,
      owner: "post_owner",
    });
  });

  it("prefers a slide's own owner over the post's", async () => {
    mockApi(carousel([photo("slide0", { owner: owner("slide_owner") })]));
    expect(await fn.getUrlFromInfoApi(document.body, 0)).toMatchObject({ owner: "slide_owner" });
  });

  it("refuses an index past the end of the carousel instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApi(carousel([photo("slide0"), photo("slide1")]));
    expect(await fn.getUrlFromInfoApi(document.body, 2)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("out of range"));
  });

  it("caches the media id and info response per post", async () => {
    const fetchMock = mockApi(photo("single"));
    await fn.getUrlFromInfoApi(document.body);
    await fn.getUrlFromInfoApi(document.body);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when the info API fails", async () => {
    mockApi(photo("single"), 429);
    expect(await fn.getUrlFromInfoApi(document.body)).toBeNull();
  });

  it("returns null without fetching when the page has no app id", async () => {
    document.body.innerHTML = "";
    const fetchMock = mockApi(photo("single"));
    expect(await fn.getUrlFromInfoApi(document.body)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("downloadResource", () => {
  const URL_JPG = "https://cdn.example/v/t51/abc_n.jpg?stp=dst-jpg";
  let sendMessage: Mock<(message: unknown) => Promise<{ ok: boolean; error?: string }>>;

  beforeEach(() => {
    sendMessage = vi.fn<(message: unknown) => Promise<{ ok: boolean; error?: string }>>();
    sendMessage.mockResolvedValue({ ok: true });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks the background to save under @username/", async () => {
    await fn.downloadResource({
      url: URL_JPG,
      username: "groot",
      datetime: fromUnixSeconds(TAKEN_AT),
    });
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({
      type: "file_download",
      data: { url: URL_JPG, filename: "@groot/2025.08.12T16.54.23.jpg" },
    });
  });

  it("includes the type prefix, index and extension from the URL", async () => {
    await fn.downloadResource({
      url: "https://cdn.example/v/t16/clip.mp4",
      username: "groot",
      datetime: fromUnixSeconds(TAKEN_AT),
      type: MediaType.Story,
      index: 2,
    });
    expect((sendMessage.mock.calls[0][0] as { data: { filename: string } }).data.filename).toBe(
      "@groot/story - 2025.08.12T16.54.23 02.mp4",
    );
  });

  it("refuses a payload with no media URL instead of throwing on it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await fn.downloadResource({ url: undefined as any, username: "groot" });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("No media URL to download"),
      expect.anything(),
    );
  });

  it("files a download with no username under @unknown/ and says why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await fn.downloadResource({ url: URL_JPG, datetime: fromUnixSeconds(TAKEN_AT) });
    expect((sendMessage.mock.calls[0][0] as { data: { filename: string } }).data.filename).toBe(
      "@unknown/2025.08.12T16.54.23.jpg",
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("@unknown/"));
  });

  describe("in-page fallback", () => {
    const clicked: { href: string; download: string }[] = [];
    const params = { url: URL_JPG, username: "groot", datetime: fromUnixSeconds(TAKEN_AT) };
    let click: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicked.push({ href: this.href, download: this.download });
      });
      clicked.length = 0;
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(() =>
          Promise.resolve(new Response(new Blob(["x"], { type: "image/jpeg" }))),
        ),
      );
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:https://www.instagram.com/fake");
    });

    it("saves in the page when the background rejects the download", async () => {
      sendMessage.mockResolvedValue({ ok: false, error: "USER_CANCELED" });
      await fn.downloadResource(params);
      await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
      expect(fetch).toHaveBeenCalledWith(URL_JPG, expect.anything());
      expect(clicked[0].download).toBe("2025.08.12T16.54.23.jpg");
    });

    it("saves in the page when the background is unreachable", async () => {
      sendMessage.mockRejectedValue(new Error("Receiving end does not exist."));
      await fn.downloadResource(params);
      await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    });

    it("saves a blob: stream in the page without involving the background", async () => {
      await fn.downloadResource({ ...params, url: "blob:https://www.instagram.com/stream" });
      expect(sendMessage).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(clicked).toStrictEqual([
        { href: "blob:https://www.instagram.com/stream", download: "2025.08.12T16.54.23.mp4" },
      ]);
    });
  });
});

describe("checkType", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148", "ios"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36", "android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", "pc"],
  ])("classifies %s as %s", (userAgent, type) => {
    vi.stubGlobal("navigator", { userAgent });
    expect(fn.checkType()).toBe(type);
  });
});
