import type { MediaType } from "../../constants";
import { TYPE_FILENAME_PREFIX } from "../../constants";

export interface DownloadParams {
  url: string;
  username?: string | undefined;
  /**
   * A `Date`, or a string `Date` can parse (in practice a `<time datetime>`
   * attribute). Numbers are deliberately not accepted: the API's `taken_at`
   * is in seconds while `Date` takes milliseconds, so pass it through
   * `fromUnixSeconds` rather than leave the unit to the reader.
   */
  datetime?: string | null | Date | undefined;
  /** Unused in the filename; kept so call sites needn't change. */
  id?: string | undefined;
  index?: number | undefined;
  type?: MediaType | undefined;
}

export function getMediaName(url: string) {
  try {
    const urlObj = new URL(url);
    const pathnameArr = urlObj.pathname.split("/");
    const filename = pathnameArr.at(-1) ?? "";
    const filenameArr = filename.split(".");
    return filenameArr[0];
  } catch {
    return "";
  }
}

const KNOWN_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov"]);

/**
 * Derives the file extension from the URL path rather than from a fetched
 * blob's MIME type, because the background hands the URL straight to
 * chrome.downloads and never sees a response body. Normalizes jpeg -> jpg.
 */
export function getExtensionFromUrl(url: string, fallback = "jpg") {
  try {
    const lastSegment = new URL(url).pathname.split("/").pop() ?? "";
    if (!lastSegment.includes(".")) return fallback;
    const extension = lastSegment.split(".").pop()!.toLowerCase();
    if (!KNOWN_EXTENSIONS.has(extension)) return fallback;
    return extension === "jpeg" ? "jpg" : extension;
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
function formatTimestamp(datetime?: DownloadParams["datetime"]) {
  const parsed = datetime === undefined || datetime === null ? null : new Date(datetime);
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  return date.toISOString().slice(0, 19).replaceAll(/[-:]/g, ".");
}

export function fromUnixSeconds(seconds: number) {
  return new Date(seconds * 1000);
}

/**
 * `@username`, the per-user download subfolder. Empty when there's no username.
 *
 * Always the media's AUTHOR, never the page browsed (see AGENTS.md "Filename
 * invariants"). Resolve it from the payload; a new download path that passes
 * the page's username would silently misfile.
 */
export function getUserFolder(username?: string) {
  // Instagram usernames are [A-Za-z0-9._] so this is belt-and-braces, but a
  // stray separator would let the name escape the intended directory, and a
  // pure-dot name would be rejected by chrome.downloads outright.
  const cleaned = (username ?? "").trim().replaceAll(/[/\\]/g, "");
  if (!cleaned || /^\.+$/.test(cleaned)) return "";
  return `@${cleaned}`;
}

/**
 * Base name, no extension and no directory: `[<type prefix>]<timestamp>[ <NN>]`.
 * It must not include the `@username/` folder: the download path applies that,
 * which is what lets one name serve a single download and every item of a
 * multi-image post alike.
 */
export const getFilenameFromUrl = ({ datetime, index, type }: DownloadParams) => {
  const prefix = type ? TYPE_FILENAME_PREFIX[type] : "";
  const suffix = index === undefined ? "" : ` ${index.toString().padStart(2, "0")}`;
  return `${prefix}${formatTimestamp(datetime)}${suffix}`;
};
