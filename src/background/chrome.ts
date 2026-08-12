import type { ReelsMedia } from '../types/global';
import { findValueByKey, saveHighlights, saveProfileReel, saveReels, saveStories } from './fn';
import { CONFIG_LIST, MESSAGE_FILE_DOWNLOAD, MESSAGE_OPEN_URL } from '../constants';

chrome.runtime.onInstalled.addListener(async () => {
    const result = await chrome.storage.sync.get(CONFIG_LIST);

    // Every remaining setting is a boolean that defaults on. The filename and
    // datetime format strings are gone — naming is no longer configurable.
    const updates: Record<string, boolean> = {};
    CONFIG_LIST.forEach((i) => {
        if (result[i] === undefined) {
            updates[i] = true;
        }
    });

    if (Object.keys(updates).length > 0) {
        chrome.storage.sync.set(updates);
    }
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.set({ stories_user_ids: [], id_to_username_map: [] });
});

/**
 * A download that starts successfully can still fail once headers arrive (an
 * expired CDN signature returns 403). chrome.downloads.download has already
 * resolved by then, so log the interruption here rather than letting the file
 * silently not appear.
 */
function reportDownloadFailures(id: number, filename: string) {
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id !== id) return;
        if (delta.error?.current) {
            console.error(`Download of ${filename} failed: ${delta.error.current}`);
        }
        const state = delta.state?.current;
        if (state === 'complete' || state === 'interrupted') {
            chrome.downloads.onChanged.removeListener(onChanged);
        }
    };
    chrome.downloads.onChanged.addListener(onChanged);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(message, sender);
    const { type, data } = message;
    if (type === MESSAGE_OPEN_URL) {
        chrome.tabs.create({ url: data, index: sender.tab!.index + 1 });
        return false;
    }
    if (type === MESSAGE_FILE_DOWNLOAD) {
        // `filename` may contain a subdirectory relative to the downloads root,
        // which is the whole reason single-file saves come through here instead
        // of using an <a download> in the content script.
        (async () => {
            try {
                const id = await chrome.downloads.download({
                    url: data.url,
                    filename: data.filename,
                    conflictAction: 'uniquify',
                });
                reportDownloadFailures(id, data.filename);
                sendResponse({ ok: true, id });
            } catch (e: any) {
                const error = String(e?.message ?? e);
                console.error(`Could not start download of ${data.filename}: ${error}`);
                sendResponse({ ok: false, error });
            }
        })();
        return true;
    }
    return false;
});

async function addThreads(data: any[]) {
    const { threads } = await chrome.storage.local.get(['threads']);
    const newMap = new Map(threads);
    for (const item of data) {
        const code = item?.post?.code;
        if (code) {
            newMap.set(code, item);
        }
    }
    await chrome.storage.local.set({ threads: Array.from(newMap) });
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    // console.log(message, sender);
    const { type, data, api } = message;

    if (sender.origin === 'https://www.threads.com') {
        if (type === 'threads_searchResults') {
            data
                .split(/\s*for\s+\(;;\);\s*/)
                .filter((_: any) => _)
                .map(async (i: any) => {
                    try {
                        const result = findValueByKey(JSON.parse(i), 'searchResults');
                        if (result && Array.isArray(result.edges)) {
                            await addThreads(result.edges.map((i: any) => i.node.thread.thread_items).flat());
                        }
                    } catch {
                    }
                });
        } else {
            addThreads(data);
        }
        return false;
    }

    (async () => {
        if (type === 'stories') {
            const {
                stories_user_ids,
                id_to_username_map
            } = await chrome.storage.local.get(['stories_user_ids', 'id_to_username_map']);
            const nameToId = new Map(stories_user_ids);
            const idToName = new Map(id_to_username_map);
            nameToId.set(data.username, data.user_id);
            idToName.set(data.user_id, data.username);
            await chrome.storage.local.set({
                stories_user_ids: Array.from(nameToId),
                id_to_username_map: Array.from(idToName)
            });
        } else {
            try {
                const jsonData = JSON.parse(data);

                switch (api) {
                    case 'https://www.instagram.com/api/graphql':
                        saveStories(jsonData);
                        break;
                    case 'https://www.instagram.com/graphql/query':
                        saveHighlights(jsonData);
                        saveReels(jsonData);
                        saveStories(jsonData);
                        saveProfileReel(jsonData);
                        break;
                    // presentation stories in home page top
                    case '/api/v1/feed/reels_media/?reel_ids=':
                        const { reels, reels_media } = await chrome.storage.local.get(['reels', 'reels_media']);
                        const newArr = (reels_media || []).filter(
                            (i: ReelsMedia.ReelsMedum) => !(jsonData as ReelsMedia.Root).reels_media.find((j) => j.id === i.id)
                        );
                        chrome.storage.local.set({
                            reels: Object.assign({}, reels, data.reels),
                            reels_media: [...newArr, ...jsonData.reels_media],
                        });
                        break;
                }
            } catch {
            }
        }
        sendResponse();
    })();

    return true;
});
