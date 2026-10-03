import { MediaType, TYPE_FILENAME_PREFIX } from "../../constants";

export interface DownloadParams {
    url: string;
    username?: string;
    /**
     * A `Date`, or a string `Date` can parse (in practice a `<time datetime>`
     * attribute). Numbers are deliberately not accepted: the API's `taken_at`
     * is in seconds while `Date` takes milliseconds, so pass it through
     * `fromUnixSeconds` rather than leave the unit to the reader.
     */
    datetime?: string | null | Date;
    /**
     * No longer part of the filename. Kept on the interface so the ~10 call
     * sites that compute it don't all have to change; drop it (and their
     * `getMediaName` calls) if you ever want the plumbing gone.
     */
    id?: string;
    index?: number;
    type?: MediaType;
}

export function getMediaName(url: string) {
    try {
        const urlObj = new URL(url);
        const pathnameArr = urlObj.pathname.split('/');
        const filename = pathnameArr.at(-1) ?? '';
        const filenameArr = filename.split('.');
        return filenameArr[0];
    } catch {
        return '';
    }
}

const KNOWN_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov']);

/**
 * Derives the file extension from the URL path rather than from a fetched
 * blob's MIME type, because the background hands the URL straight to
 * chrome.downloads and never sees a response body. Normalizes jpeg -> jpg,
 * which is what the old `setting_format_replace_jpeg_with_jpg` toggle did.
 */
export function getExtensionFromUrl(url: string, fallback = 'jpg') {
    try {
        const lastSegment = new URL(url).pathname.split('/').pop() ?? '';
        if (!lastSegment.includes('.')) return fallback;
        const extension = lastSegment.split('.').pop()!.toLowerCase();
        if (!KNOWN_EXTENSIONS.has(extension)) return fallback;
        return extension === 'jpeg' ? 'jpg' : extension;
    } catch {
        return fallback;
    }
}

/**
 * Falls back to the current time when the post time is missing or unparseable.
 * Both happen in practice: profile pictures carry no timestamp at all, and
 * profile-reel entries pass `undefined` when the DOM has no readable date.
 * Without this guard an unparseable value becomes an Invalid Date, whose
 * `toISOString()` throws.
 *
 * The output is UTC, `YYYY.MM.DDTHH.mm.ss`: `toISOString()` is always UTC, so
 * trim its milliseconds and zone and swap the separators for dots, which are
 * legal on every filesystem where colons are not.
 */
function formatTimestamp(datetime?: DownloadParams['datetime']) {
    const parsed = datetime === undefined || datetime === null ? null : new Date(datetime);
    const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
    return date.toISOString().slice(0, 19).replaceAll(/[-:]/g, '.');
}

export function fromUnixSeconds(seconds: number) {
    return new Date(seconds * 1000);
}

/**
 * `@username`, the per-user download subfolder. Empty when there's no username.
 *
 * The username is always the media's AUTHOR, never the profile you were
 * browsing — a tagged post by @groot on @denchen's page goes to `@groot/`. That
 * keeps one author's media in one place instead of scattering copies across
 * every profile whose tagged grid features them. Callers get this right by
 * resolving from the media payload (`data.owner.username`, `item.user.username`,
 * `res.owner`); `profile.ts` is the sole page-derived case, which is correct
 * because an avatar's author is the page owner. Preserve that when merging
 * upstream: a new download path that passes the page's username would silently
 * misfile rather than error.
 */
export function getUserFolder(username?: string) {
    // Instagram usernames are [A-Za-z0-9._] so this is belt-and-braces, but a
    // stray separator would let the name escape the intended directory, and a
    // pure-dot name would be rejected by chrome.downloads outright.
    const cleaned = (username ?? '').trim().replaceAll(/[/\\]/g, '');
    if (!cleaned || /^\.+$/.test(cleaned)) return '';
    return `@${cleaned}`;
}

/**
 * Base name, no extension and no directory: `[<type prefix>]<timestamp>[ <NN>]`.
 * It must not include the `@username/` folder: the download path applies that,
 * which is what lets one name serve a single download and every item of a
 * multi-image post alike.
 */
export const getFilenameFromUrl = ({ datetime, index, type }: DownloadParams) => {
    const prefix = type ? TYPE_FILENAME_PREFIX[type] : '';
    const suffix = index === undefined ? '' : ` ${index.toString().padStart(2, '0')}`;
    return `${prefix}${formatTimestamp(datetime)}${suffix}`;
};
