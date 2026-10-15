import { CONFIG_LIST } from "../../constants";

interface StorageSettings {
  setting_show_open_in_new_tab_icon: boolean;
  setting_show_download_all_icon: boolean;
  setting_enable_threads: boolean;
  setting_enable_video_controls: boolean;
  setting_video_highest_quality: boolean;
}

type SettingKey = keyof StorageSettings;

/** storage.sync carries nothing but these, and nothing else has a reader. */
function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS_UNTIL_LOADED, key);
}

/**
 * What each setting reads as before init() resolves, and for any key storage
 * has never been written. These are the values the call sites already saw
 * from an absent key: the four UI toggles stay dark rather than appear and
 * then vanish, while highest-quality downloads stay on, since a lower
 * quality file cannot be upgraded once it is saved.
 *
 * The install hook writes every key as true, so this only covers the gap.
 */
const SETTINGS_UNTIL_LOADED: StorageSettings = {
  setting_show_open_in_new_tab_icon: false,
  setting_show_download_all_icon: false,
  setting_enable_threads: false,
  setting_enable_video_controls: false,
  setting_video_highest_quality: true,
};

class StorageCache {
  public settings: StorageSettings = { ...SETTINGS_UNTIL_LOADED };
  private initialized = false;

  public async init() {
    if (this.initialized) return;

    this.settings = {
      ...SETTINGS_UNTIL_LOADED,
      ...(await chrome.storage.sync.get(CONFIG_LIST)),
    };

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync") {
        for (const [key, { newValue }] of Object.entries(changes)) {
          if (!isSettingKey(key)) continue;
          // A removed key falls back to its seed rather than to false, which
          // would turn highest-quality off; see SETTINGS_UNTIL_LOADED.
          this.settings[key] =
            newValue === undefined ? SETTINGS_UNTIL_LOADED[key] : newValue === true;
        }
      }
    });

    this.initialized = true;
  }
}

export const storageCache = new StorageCache();

export const initStorageCache = () => storageCache.init();
