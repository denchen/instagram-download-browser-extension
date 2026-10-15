/**
 * The slice of an Instagram media payload the extension actually reads.
 *
 * Deliberately not a transcription of a captured response, unlike the
 * generated namespaces beside this file. Those record one sample of a private
 * API in full, including hundreds of fields nothing here touches; this records
 * the contract the download paths depend on, which is what breaks when
 * Instagram changes shape. `slimPost` writes exactly this, so a cached post and
 * a freshly fetched one go through the same code.
 *
 * Everything is optional because every one of these payloads is a parsed
 * response from a private API: the type says which fields are read, not which
 * are guaranteed. Narrow before trusting a value, and prefer refusing over
 * guessing when a field is missing.
 */

/** A photo rendition in the `image_versions2` ladder. */
export interface Rendition {
  url?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

/**
 * A video rendition. There is nothing to choose between the entries of
 * `video_versions`; anything sharper lives in `video_dash_manifest`.
 */
export interface VideoRendition {
  url?: string | undefined;
  height?: number | undefined;
}

/**
 * Whoever a download is filed under: `@username/`. Some payloads carry only
 * the id (a profile reel's `user`), leaving the name to be looked up in the
 * background's id_to_username_map. `username` is null where a sample had it
 * null rather than absent; both mean the same thing to `getUserFolder`.
 */
export interface MediaAuthor {
  username?: string | null | undefined;
  pk?: string | undefined;
}

/**
 * One downloadable item: a single post, one slide of a carousel, a story, a
 * reel or a highlight. The same shape serves all of them because the download
 * paths read the same fields from each.
 */
export interface MediaItem {
  /** Present on posts and reels; the carousel slides of a post have none. */
  code?: string | undefined;
  pk?: string | undefined;
  id?: string | undefined;

  /** Unix *seconds*, not milliseconds. Pass through `fromUnixSeconds`. */
  taken_at?: number | undefined;
  /**
   * Unix seconds, or null on a highlight: an archived story does not expire.
   * Absent and null both mean "no expiry", never "expired in 1970".
   */
  expiring_at?: number | null | undefined;

  /** The media API names the author `owner`; the timeline payloads say `user`. */
  owner?: MediaAuthor | undefined;
  user?: MediaAuthor | undefined;
  coauthor_producers?: MediaAuthor[] | undefined;

  video_versions?: VideoRendition[] | undefined;
  video_dash_manifest?: string | undefined;
  image_versions2?: { candidates?: Rendition[] } | undefined;

  /** Present only on a carousel post; the slides are items in their own right. */
  carousel_media?: MediaItem[] | undefined;
}

/** A tray entry: one author's stories or one highlight, with its items. */
export interface MediaReel {
  id?: string | undefined;
  user?: MediaAuthor | undefined;
  items?: MediaItem[] | undefined;
}
