import { MESSAGE_FILE_DOWNLOAD, MESSAGE_OPEN_URL } from '../../constants';
import { DownloadParams, getExtensionFromUrl, getFilenameFromUrl, getUserFolder } from './filename';


export async function openInNewTab(url: string) {
    try {
        await chrome.runtime.sendMessage({ type: MESSAGE_OPEN_URL, data: url });
    } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

async function forceDownload(blob: string, filename: string, extension: string) {
    extension = extension.replace('jpeg', 'jpg');
    const a = document.createElement('a');
    a.href = blob;
    a.download = `${filename}.${extension}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(blob);
    }, 100);
}

const mediaInfoCache: Map<string, any> = new Map(); // key: media id, value: info json
const mediaIdCache: Map<string, string> = new Map(); // key: post id, value: media id

const findAppId = () => {
    const appIdPattern = /"X-IG-App-ID":"([\d]+)"/;
    const bodyScripts: NodeListOf<HTMLScriptElement> = document.querySelectorAll('body > script');
    for (let i = 0; i < bodyScripts.length; ++i) {
        const match = bodyScripts[i].text.match(appIdPattern);
        if (match) return match[1];
    }
    console.log('Cannot find app id');
    return null;
};

function findPostId(articleNode: HTMLElement) {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/reels/')) {
        return pathname.split('/')[2];
    } else if (pathname.startsWith('/stories/')) {
        return pathname.split('/')[3];
    } else if (pathname.startsWith('/reel/')) {
        return pathname.split('/')[2];
    }
    const postIdPattern = /\/p\/([^/]+)\//;
    const aNodes = articleNode.querySelectorAll('a');
    for (let i = 0; i < aNodes.length; ++i) {
        const link = aNodes[i].getAttribute('href');
        if (link) {
            const match = link.match(postIdPattern);
            if (match) return match[1];
            const arr = link.split('/').filter(e => e);
            if (arr.length === 3 && arr[1] === "reel") {
                return arr[2]
            }
        }
    }
    return null;
}

const findMediaId = async (postId: string) => {
    const mediaIdPattern = /instagram:\/\/media\?id=(\d+)|["' ]media_id["' ]:["' ](\d+)["' ]/;
    const match = window.location.href.match(/www.instagram.com\/stories\/[^/]+\/(\d+)/);
    if (match) return match[1];
    if (!mediaIdCache.has(postId)) {
        const postUrl = `https://www.instagram.com/p/${postId}/`;
        const resp = await fetch(postUrl);
        const text = await resp.text();
        const idMatch = text.match(mediaIdPattern);
        if (!idMatch) return null;
        let mediaId = null;
        for (let i = 0; i < idMatch.length; ++i) {
            if (idMatch[i]) mediaId = idMatch[i];
        }
        if (!mediaId) return null;
        mediaIdCache.set(postId, mediaId);
    }
    return mediaIdCache.get(postId);
};

/**
 * Instagram returns several renditions of every photo. They have long been
 * ordered largest-first, so `candidates[0]` is normally the original — but
 * that is a convention, not a contract, and if it ever changed every download
 * would silently shrink. Pick by pixel area instead, falling back to the first
 * entry when dimensions are missing.
 *
 * Deliberately NOT applied to video_versions: those entries carry a `type`
 * denoting different encodings, so largest-area is not reliably "the best one".
 */
function largestCandidate(candidates: Record<string, any>[]) {
    return candidates.reduce((best, current) => {
        const bestArea = (best.width ?? 0) * (best.height ?? 0);
        const currentArea = (current.width ?? 0) * (current.height ?? 0);
        return currentArea > bestArea ? current : best;
    }, candidates[0]);
}

export const getImgOrVideoUrl = (item: Record<string, any>) => {
    if ('video_versions' in item) {
        return item.video_versions[0].url;
    } else {
        return largestCandidate(item.image_versions2.candidates).url;
    }
};

// Instagram serves most post media at 1080px, so a `p1080x1080` URL is the
// original rather than a downscale. Warning on it would make the check noise.
const FULL_SIZE_EDGE = 1080;

/**
 * Instagram encodes server-side resizes in the URL as `stp=..._s150x150` or as
 * a `/s640x640/` path segment. A URL scraped from the DOM is whatever the page
 * rendered, which for a grid thumbnail or an avatar is far smaller than the
 * original. Nothing can recover the full-size URL at that point — the API
 * lookup already failed — so just make the downgrade visible rather than
 * letting it pass as an ordinary download.
 *
 * Best-effort only: not every downscaled URL carries a size token, so silence
 * here is not proof you got the original. File size is the reliable tell.
 */
function warnIfDownscaled(url: string) {
    const match = url.match(/[_/][sp](\d{2,4})x(\d{2,4})/);
    if (!match) return;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (Math.max(width, height) >= FULL_SIZE_EDGE) return;
    console.warn(`Downloading a ${width}x${height} rendition rather than the original — the media API lookup fell back to a page-rendered URL: ${url}`);
}

export const getDataFromAPI = async (articleNode: HTMLElement) => {
    try {
        const appId = findAppId();
        if (!appId) {
            console.log('Cannot find appid');
            return null;
        }
        const postId = findPostId(articleNode);
        if (!postId) {
            console.log('Cannot find post id');
            return null;
        }
        const mediaId = await findMediaId(postId);
        if (!mediaId) {
            console.log('Cannot find media id');
            return null;
        }
        if (!mediaInfoCache.has(mediaId)) {
            const url = 'https://i.instagram.com/api/v1/media/' + mediaId + '/info/';
            const resp = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: '*/*',
                    'X-IG-App-ID': appId,
                },
                credentials: 'include',
                mode: 'cors',
                referrerPolicy: 'no-referrer',
            });

            if (resp.status !== 200) {
                console.log(`Fetch info API failed with status code: ${resp.status}`);
                return null;
            }
            const respJson = await resp.json();
            mediaInfoCache.set(mediaId, respJson);
        }
        const infoJson = mediaInfoCache.get(mediaId);
        return infoJson.items[0];
    } catch (e: any) {
        console.log(`Uncaught in getUrlFromInfoApi(): ${e}\n${e.stack}`);
        return null;
    }
};

export const getUrlFromInfoApi = async (articleNode: HTMLElement, mediaIdx = 0): Promise<Record<string, any> | null> => {
    const data = await getDataFromAPI(articleNode);
    if (!data) return null;

    if ('carousel_media' in data) {
        // multi-media post
        // Math.max only bounds this below. An index past the end yields
        // undefined and throws in getImgOrVideoUrl, which is the crash seen
        // when a stale ?img_index survives client-side navigation from a
        // longer carousel to a shorter one. Refuse rather than clamp: clamping
        // would quietly download a slide the user is not looking at.
        if (mediaIdx >= data.carousel_media.length) {
            console.warn(
                `Carousel index ${mediaIdx} is out of range for a post with ${data.carousel_media.length} items. ` +
                `?img_index in the URL is stale, which happens when moving between posts with the modal arrows. ` +
                `Reload the page to resync. Not recovering from the slide indicators, since those can be stale ` +
                `from the same navigation and would risk downloading the wrong slide silently.`
            );
            return null;
        }
        const item = data.carousel_media[Math.max(mediaIdx, 0)];
        return {
            ...item,
            url: getImgOrVideoUrl(item),
            taken_at: data.taken_at,
            owner: item.owner?.username || data.owner?.username || "unknown",
            coauthor_producers: data.coauthor_producers?.map((i: any) => i.username) || [],
            origin_data: data,
        };
    } else {
        // single media post
        return {
            ...data,
            url: getImgOrVideoUrl(data),
            owner: data.owner?.username || "unknown",
            coauthor_producers: data.coauthor_producers?.map((i: any) => i.username) || [],
        };
    }
};

/**
 * Fetches inside the page and saves through <a download>. Cannot produce a
 * subfolder — Chrome strips path separators from the download attribute — so
 * this is only for MediaSource blobs (which can't leave the page) and as a
 * fallback when the background is unreachable.
 */
function downloadInPage(url: string, filename: string) {
    fetch(url, {
        headers: new Headers({
            Origin: location.origin,
        }),
        mode: 'cors',
    })
        .then((response) => response.blob())
        .then((blob) => {
            const extension = blob.type.split('/').pop();
            const blobUrl = window.URL.createObjectURL(blob);
            forceDownload(blobUrl, filename, extension || 'jpg');
        })
        .catch((e) => console.error(e));
}

export async function downloadResource(params: DownloadParams) {
    const { url, username } = params;
    console.log(`Downloading ${url}`);
    warnIfDownscaled(url);
    const filename = await getFilenameFromUrl(params);

    // A blob: URL is a MediaSource stream owned by the page; the background
    // has no way to fetch it, so these keep the anchor path and land flat in
    // the downloads root rather than under @username/.
    if (url.startsWith('blob:')) {
        forceDownload(url, filename, 'mp4');
        return;
    }

    const folder = getUserFolder(username);
    const path = `${folder ? `${folder}/` : ''}${filename}.${getExtensionFromUrl(url)}`;

    try {
        const response = await chrome.runtime.sendMessage({
            type: MESSAGE_FILE_DOWNLOAD,
            data: { url, filename: path },
        });
        if (response?.ok) return;
        console.error(`Background download rejected (${response?.error ?? 'no response'}); retrying in-page`);
    } catch (e) {
        console.error('Could not reach the background to download; retrying in-page', e);
    }
    downloadInPage(url, filename);
}

export const checkType = () => {
    if (navigator && navigator.userAgent && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        if (navigator && navigator.userAgent && /(iPhone|iPad|iPod|iOS)/i.test(navigator.userAgent)) {
            return 'ios';
        } else {
            return 'android';
        }
    } else {
        return 'pc';
    }
};

export async function fetchHtml() {
    const resp = await fetch(window.location.href, {
        referrerPolicy: 'no-referrer',
    });
    const content = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    return doc.querySelectorAll('script');
}
