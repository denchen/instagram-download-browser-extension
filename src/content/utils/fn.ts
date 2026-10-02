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

/**
 * The post's shortcode: taken from the URL where the URL names it, and scraped
 * from the DOM only when it does not.
 *
 * The DOM scan previously returned the *first* `/p/<code>/` link in the
 * container, which is correct only when the container holds exactly one post.
 * Callers pass containers that can hold several — `post-detail.ts` and
 * `profile-reel.ts` both pass all of `section main`, and a profile grid tile's
 * ancestor <article> can span the whole grid — so a first-match could resolve a
 * different post than the one clicked and download its media under a
 * completely plausible filename.
 *
 * Two changes. `/p/<code>/` and `/<username>/p/<code>/` are now read straight
 * off the pathname, which is exact and skips the scan entirely for detail pages.
 * And when the scan does run, more than one distinct code means the click is
 * ambiguous, so it refuses instead of guessing: failing visibly beats
 * downloading the wrong post.
 *
 * Refusing is not the ideal end state for a grid, where the right answer is the
 * post link nearest the clicked element. That needs `target` threaded through
 * getDataFromAPI and getUrlFromInfoApi, and is left as a follow-up.
 */
function findPostId(articleNode: HTMLElement) {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/reels/')) {
        return pathname.split('/')[2];
    } else if (pathname.startsWith('/stories/')) {
        return pathname.split('/')[3];
    } else if (pathname.startsWith('/reel/')) {
        return pathname.split('/')[2];
    }

    // A permalink names the post outright, so there is nothing to infer. Covers
    // both `/p/<code>/` and the `/<username>/p/<code>/` form.
    const fromUrl = pathname.match(/^\/(?:[^/]+\/)?p\/([^/]+)\//);
    if (fromUrl) return fromUrl[1];

    // `/p/<code>/` and `/reel/<code>/` both yield a shortcode findMediaId can
    // use, so they share one set and one ambiguity check.
    const codes = new Set<string>();
    for (const anchor of articleNode.querySelectorAll('a')) {
        const link = anchor.getAttribute('href');
        if (!link) continue;
        const post = link.match(/\/p\/([^/]+)\//);
        if (post) {
            codes.add(post[1]);
            continue;
        }
        const segments = link.split('/').filter((e) => e);
        if (segments.length === 3 && segments[1] === 'reel') {
            codes.add(segments[2]);
        }
    }

    if (codes.size > 1) {
        console.warn(
            `This container holds ${codes.size} different posts (${[...codes].join(', ')}), so which ` +
            `one was clicked cannot be determined from it. Refusing rather than guessing — taking the ` +
            `first would download a different post under a correct-looking filename.`
        );
        return null;
    }
    return codes.size === 1 ? [...codes][0] : null;
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

/**
 * Extracts the rendition size Instagram encodes in a URL — `stp=..._s150x150`,
 * or a `/s640x640/` path segment — so it can be read off the download log
 * without eyeballing a 400-character URL.
 *
 * Reports the size, deliberately without a verdict. Calling a rendition
 * "downscaled" requires the post's candidate ladder, and the only path that
 * yields a sized URL is the DOM fallback — which runs precisely because the
 * media API lookup failed, so the ladder is unavailable exactly where the
 * judgement would be needed.
 *
 * An earlier version guessed with a 1080 constant and was wrong: measured
 * originals run to 3072x4096 and 4032x3024, so 1080 is one rung on a 14-rung
 * ladder rather than the ceiling, and the check stayed silent on the very case
 * it existed to catch (#2). A real verdict needs the cache from #3, which would
 * put the ladder in reach on the fallback path.
 *
 * Silence here means no size token was present, which is not proof of a
 * full-resolution download. File size remains the reliable tell.
 */
function describeRendition(url: string) {
    const match = url.match(/[_/][sp](\d{2,4})x(\d{2,4})/);
    return match ? ` (${match[1]}x${match[2]} rendition)` : '';
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
    console.log(`Downloading${describeRendition(url)}: ${url}`);
    const filename = await getFilenameFromUrl(params);

    // A blob: URL is a MediaSource stream owned by the page; the background
    // has no way to fetch it, so these keep the anchor path and land flat in
    // the downloads root rather than under @username/.
    if (url.startsWith('blob:')) {
        console.warn(`In-page video stream, so this saves to the downloads root with no @username/ folder — an <a download> cannot create directories: ${filename}.mp4`);
        forceDownload(url, filename, 'mp4');
        return;
    }

    // An unresolved username used to mean no folder at all, silently, so the
    // file landed in the downloads root with nothing explaining why. Several
    // paths can get here without a name: the DOM scrapes in post.ts,
    // post-detail.ts and profile-reel.ts all rely on deep selectors that can
    // miss, and post.ts's geometric fallback returns no API data at all, which
    // forces those scrapes. Fall back to @unknown so the root stays clean and
    // the folder name itself flags the problem - matching what the API path
    // already does when it cannot identify an owner.
    let folder = getUserFolder(username);
    if (!folder) {
        console.warn(`Could not resolve a username for ${url}; filing under @unknown/. Both the media API and the DOM fallback failed to identify the poster.`);
        folder = '@unknown';
    }
    const path = `${folder}/${filename}.${getExtensionFromUrl(url)}`;

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
