// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const SETTING_IDS = [
  "setting_show_open_in_new_tab_icon",
  "setting_show_download_all_icon",
  "setting_enable_video_controls",
  "setting_enable_threads",
];

const checkbox = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`);

// The stored settings arrive asynchronously; threads is stored as false but
// defaults to true, so it flipping marks the load as done.
const settingsLoaded = () =>
  vi.waitFor(() => expect(checkbox("setting_enable_threads")?.checked).toBe(false));

// Smoke test for the popup: mounts the real entry point (it renders on
// import) against a stubbed chrome.storage.sync.
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
    document.body.innerHTML = '<div id="root"></div>';
    vi.resetModules();
    await import("./index");
  });

  it("renders a checkbox for every setting", async () => {
    await settingsLoaded();
    for (const id of SETTING_IDS) expect(checkbox(id)).not.toBeNull();
  });

  it("shows the stored values", async () => {
    await settingsLoaded();
    expect(SETTING_IDS.map((id) => checkbox(id)?.checked)).toStrictEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("saves the new value each time a setting is toggled", async () => {
    // Clicking flips a checkbox's DOM state on its own, so checking `.checked`
    // proves nothing. The second save only writes `false` if the component's
    // state really flipped after the first.
    await settingsLoaded();
    checkbox("setting_enable_threads")?.click();
    await vi.waitFor(() => expect(set).toHaveBeenCalledOnce());
    checkbox("setting_enable_threads")?.click();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(set.mock.calls).toStrictEqual([
      [{ setting_enable_threads: true }],
      [{ setting_enable_threads: false }],
    ]);
  });
});
