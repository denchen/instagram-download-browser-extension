import { CONFIG_LIST } from '../../constants';

interface StorageSettings {
    setting_show_open_in_new_tab_icon?: boolean;
    setting_show_download_all_icon?: boolean;
    setting_enable_threads?: boolean;
    setting_enable_video_controls?: boolean;

    [key: string]: any;
}

class StorageCache {
    public settings: StorageSettings = {};
    private initialized = false;

    public async init() {
        if (this.initialized) return;

        this.settings = await chrome.storage.sync.get(CONFIG_LIST);

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'sync') {
                for (const [key, { newValue }] of Object.entries(changes)) {
                    this.settings[key] = newValue;
                }
            }
        });

        this.initialized = true;
    }
}

export const storageCache = new StorageCache();

export const initStorageCache = () => storageCache.init();
