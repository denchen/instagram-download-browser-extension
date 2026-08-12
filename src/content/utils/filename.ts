import dayjs, { Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import { FILENAME_DATETIME_FORMAT, MediaType, TYPE_FILENAME_PREFIX } from "../../constants";

dayjs.extend(utc);

export interface DownloadParams {
    url: string;
    username?: string;
    datetime?: string | null | Dayjs | number;
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
        const filename = pathnameArr[pathnameArr.length - 1];
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
 * Without this guard `dayjs(bad).format()` yields the literal string
 * "Invalid Date", which would collapse every such download onto one filename.
 */
function formatTimestamp(datetime?: DownloadParams['datetime']) {
    const parsed = datetime === undefined || datetime === null ? null : dayjs(datetime);
    return (parsed?.isValid() ? parsed : dayjs()).utc().format(FILENAME_DATETIME_FORMAT);
}

/** `@username`, the per-user download subfolder. Empty when there's no username. */
export function getUserFolder(username?: string) {
    // Instagram usernames are [A-Za-z0-9._] so this is belt-and-braces, but a
    // stray separator would let the name escape the intended directory, and a
    // pure-dot name would be rejected by chrome.downloads outright.
    const cleaned = (username ?? '').trim().replace(/[/\\]/g, '');
    if (!cleaned || /^\.+$/.test(cleaned)) return '';
    return `@${cleaned}`;
}

/**
 * Base name, no extension and no directory: `[<type prefix>]<timestamp>[ <NN>]`.
 * Used for single files and for entries inside a zip, so it must not include
 * the `@username/` folder — that's applied by the download path only.
 */
export const getFilenameFromUrl = async ({ datetime, index, type }: DownloadParams) => {
    const prefix = type ? TYPE_FILENAME_PREFIX[type] : '';
    const suffix = index === undefined ? '' : ` ${index.toString().padStart(2, '0')}`;
    return `${prefix}${formatTimestamp(datetime)}${suffix}`;
};

/** `@username - <timestamp>`, the name of the zip itself (no folder, no type prefix). */
export const getZipFilename = ({ username, datetime }: Pick<DownloadParams, 'username' | 'datetime'>) => {
    const timestamp = formatTimestamp(datetime);
    const folder = getUserFolder(username);
    return folder ? `${folder} - ${timestamp}` : timestamp;
};
