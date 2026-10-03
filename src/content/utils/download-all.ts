import { fromUnixSeconds } from "./filename";
import { MediaType } from "../../constants";
import { downloadResource, getDataFromAPI, getImgOrVideoUrl } from "./fn";

/**
 * Downloads every item of a post as its own file, replacing the previous
 * zip-the-carousel behaviour (#4).
 *
 * There is no browser split here. The zip needed one: Chrome assembled the
 * archive in the content script, while Firefox shipped blobs to its background
 * because it can structured-clone them over runtime.sendMessage. Individual
 * files go through downloadResource, which already works on both, so
 * handleZipChrome, handleZipFirefox, the user-agent dispatch between them, the
 * MESSAGE_ZIP_DOWNLOAD round trip and the @zip.js/zip.js dependency are all gone.
 *
 * Slides are awaited in sequence rather than fired in parallel. That paces the
 * CDN fetches for free and keeps the downloads list in slide order.
 *
 * The zip's caption.txt entry is dropped. Writing it as a sibling file is not
 * cheap: a content-script blob URL cannot be used by the background (it is
 * origin-scoped) and an MV3 service worker has no URL.createObjectURL, so the
 * options are an unverified data: URL or the <a download> path, which cannot
 * create the @username/ directory.
 */
export async function handleDownloadAll(articleNode: HTMLElement) {
    const data = await getDataFromAPI(articleNode);
    if (!data) {
        console.warn('Could not read this post from the media API, so there is nothing to download.');
        return;
    }

    // The button shows on every post, not only carousels, so a single-media
    // post downloads its one item rather than doing nothing. Same result as the
    // plain download button.
    if (!('carousel_media' in data)) {
        await downloadResource({
            url: getImgOrVideoUrl(data),
            username: data.owner?.username,
            datetime: fromUnixSeconds(data.taken_at),
            type: MediaType.Post,
        });
        return;
    }

    // Per-slide metadata matches what the zip derived, so the filenames are
    // exactly what it used to write *inside* the archive: `index` supplies the
    // zero-padded ordinal that keeps slides distinct when they share the post's
    // timestamp, which carousel items normally do.
    for (let i = 0; i < data.carousel_media.length; i++) {
        const resource = data.carousel_media[i];
        await downloadResource({
            url: getImgOrVideoUrl(resource),
            username: resource.owner?.username || data.owner?.username,
            datetime: fromUnixSeconds(resource.taken_at ?? data.taken_at),
            index: i + 1,
            type: MediaType.Post,
        });
    }
}
