import { fromUnixSeconds } from "./filename";
import { MediaType } from "../../constants";
import { downloadResource, getDataFromAPI } from "./fn";
import { getImgOrVideoUrl } from "./media";

/**
 * Downloads every item of a post as its own file (#4). Each goes through
 * downloadResource, so there is no browser split.
 *
 * Slides are awaited in sequence, which paces the CDN fetches and keeps the
 * downloads list in slide order.
 *
 * No caption.txt: Firefox's background can't read a content-script blob URL,
 * and the <a download> fallback can't create the @username/ folder.
 */
export async function handleDownloadAll(articleNode: HTMLElement) {
  const data = await getDataFromAPI(articleNode);
  if (!data) {
    console.warn("Could not read this post from the media API, so there is nothing to download.");
    return;
  }

  // The button shows on every post, so a single-media post downloads its one
  // item, same as the plain download button.
  const slides = data.carousel_media;
  if (!slides) {
    await downloadResource({
      url: getImgOrVideoUrl(data),
      username: data.owner?.username,
      datetime: fromUnixSeconds(data.taken_at),
      type: MediaType.Post,
    });
    return;
  }

  // `index` keeps slides distinct, since they normally share the post's
  // timestamp.
  for (const [i, resource] of slides.entries()) {
    await downloadResource({
      url: getImgOrVideoUrl(resource),
      username: resource.owner?.username || data.owner?.username,
      datetime: fromUnixSeconds(resource.taken_at ?? data.taken_at),
      index: i + 1,
      type: MediaType.Post,
    });
  }
}
