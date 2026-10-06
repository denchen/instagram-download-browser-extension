// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG_LIST } from "../constants";

const html = readFileSync(resolve(import.meta.dirname, "../../public/popup/index.html"), "utf8");

const checkbox = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`);

// The stored settings arrive asynchronously; open-in-new-tab is stored as true
// but starts unchecked, so it flipping marks the load as done.
const settingsLoaded = () =>
  vi.waitFor(() => expect(checkbox("setting_show_open_in_new_tab_icon")?.checked).toBe(true));

// Smoke test for the popup: runs the real entry point against the real markup
// and a stubbed chrome.storage.sync.
describe("popup", () => {
  let set: ReturnType<typeof vi.fn<(items: Record<string, boolean>) => Promise<void>>>;

  beforeEach(async () => {
    set = vi.fn<(items: Record<string, boolean>) => Promise<void>>().mockResolvedValue();
    vi.stubGlobal("chrome", {
      storage: {
        sync: {
          get: vi.fn<() => Promise<Record<string, boolean>>>().mockResolvedValue({
            setting_show_open_in_new_tab_icon: true,
            setting_show_download_all_icon: false,
            setting_enable_video_controls: true,
            setting_enable_threads: false,
          }),
          set,
        },
      },
    });
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    vi.resetModules();
    await import("./index");
  });

  // The markup and CONFIG_LIST are maintained separately; a setting missing
  // from either side would silently never load or never save.
  it("has a checkbox for every setting", () => {
    for (const id of CONFIG_LIST) expect(checkbox(id)).not.toBeNull();
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(CONFIG_LIST.length);
  });

  it("shows the stored values", async () => {
    await settingsLoaded();
    expect(
      [
        "setting_show_open_in_new_tab_icon",
        "setting_show_download_all_icon",
        "setting_enable_video_controls",
        "setting_enable_threads",
      ].map((id) => checkbox(id)?.checked),
    ).toStrictEqual([true, false, true, false]);
  });

  it("saves the new value each time a setting is toggled", async () => {
    await settingsLoaded();
    checkbox("setting_enable_threads")?.click();
    checkbox("setting_enable_threads")?.click();
    expect(set.mock.calls).toStrictEqual([
      [{ setting_enable_threads: true }],
      [{ setting_enable_threads: false }],
    ]);
  });
});
