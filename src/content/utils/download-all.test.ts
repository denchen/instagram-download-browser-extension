import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaType } from "../../constants";
import { TAKEN_AT, carousel, fullUrl, owner, photo, video } from "../../test/fixtures";
import { handleDownloadAll } from "./download-all";
import { downloadResource, getDataFromAPI } from "./fn";

vi.mock(import("./fn"), () => ({
  downloadResource: vi.fn<typeof downloadResource>(),
  getDataFromAPI: vi.fn<typeof getDataFromAPI>(),
}));

const article = {} as HTMLElement;
const downloads = () => vi.mocked(downloadResource).mock.calls.map(([params]) => params);

describe("handleDownloadAll", () => {
  beforeEach(() => {
    vi.mocked(downloadResource).mockReset();
    vi.mocked(getDataFromAPI).mockReset();
  });

  it("downloads every slide of a carousel with a 1-based index", async () => {
    vi.mocked(getDataFromAPI).mockResolvedValue(carousel([photo("a"), video("b"), photo("c")]));
    await handleDownloadAll(article);
    expect(downloads()).toStrictEqual([
      {
        url: fullUrl("a"),
        username: "post_owner",
        datetime: new Date(TAKEN_AT * 1000),
        index: 1,
        type: MediaType.Post,
      },
      {
        url: "https://cdn.example/b.mp4",
        username: "post_owner",
        datetime: new Date(TAKEN_AT * 1000),
        index: 2,
        type: MediaType.Post,
      },
      {
        url: fullUrl("c"),
        username: "post_owner",
        datetime: new Date(TAKEN_AT * 1000),
        index: 3,
        type: MediaType.Post,
      },
    ]);
  });

  it("uses a slide's own owner and time when it has them", async () => {
    const slide = photo("a", { owner: owner("slide_owner"), taken_at: TAKEN_AT + 60 });
    vi.mocked(getDataFromAPI).mockResolvedValue(carousel([slide]));
    await handleDownloadAll(article);
    expect(downloads()[0]).toMatchObject({
      username: "slide_owner",
      datetime: new Date((TAKEN_AT + 60) * 1000),
    });
  });

  it("downloads a single-media post once, without an index", async () => {
    vi.mocked(getDataFromAPI).mockResolvedValue(
      photo("only", { owner: owner("poster"), taken_at: TAKEN_AT }),
    );
    await handleDownloadAll(article);
    expect(downloads()).toStrictEqual([
      {
        url: fullUrl("only"),
        username: "poster",
        datetime: new Date(TAKEN_AT * 1000),
        type: MediaType.Post,
      },
    ]);
  });

  it("downloads nothing when the media API has no data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getDataFromAPI).mockResolvedValue(null);
    await handleDownloadAll(article);
    expect(downloadResource).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
});
