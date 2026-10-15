import { downloadResource, openInNewTab } from "../utils/fn";
import { type DownloadParams, fromUnixSeconds, getMediaName } from "../utils/filename";
import { getImgOrVideoUrl } from "../utils/media";
import { asArray, isArray, path, prop } from "../utils/json";
import type { MediaItem, ThreadsPost } from "../../types/media";
import { MediaType } from "../../constants";

function findFeedDataEdges(obj: unknown): unknown[] | null {
  if (typeof obj !== "object" || obj === null) return null;

  const edges = prop(obj, "edges");
  if (isArray(edges)) return edges;
  const threads = path(obj, "relatedPosts", "threads");
  if (isArray(threads)) return threads;

  for (const child of Object.values(obj)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const result = findFeedDataEdges(item);
        if (result) return result;
      }
    } else {
      const result = findFeedDataEdges(child);
      if (result) return result;
    }
  }

  return null;
}

function handleMedia(post: ThreadsPost, action: "download" | "open") {
  const { giphy_media_info, carousel_media, text_post_app_info } = post;
  const final = (obj: Omit<DownloadParams, "type">) => {
    if (action === "download") {
      void downloadResource({ ...obj, type: MediaType.Threads });
    } else {
      void openInNewTab(obj.url);
    }
  };

  const giphyUrl = giphy_media_info?.first_party_cdn_proxied_images?.fixed_height?.webp;
  if (giphyUrl) {
    const url = giphyUrl;
    final({
      url: url,
      username: post.user?.username,
      datetime: fromUnixSeconds(post.taken_at),
      id: getMediaName(url),
    });
  }
  if (Array.isArray(carousel_media) && carousel_media.length > 0) {
    carousel_media.forEach((item) => {
      const url = getImgOrVideoUrl(item);
      if (!url) return;
      final({
        url: url,
        username: post.user?.username,
        datetime: fromUnixSeconds(post.taken_at),
        id: getMediaName(url),
      });
    });
  } else {
    const url = getImgOrVideoUrl(post);
    if (url) {
      final({
        url: url,
        username: post.user?.username,
        datetime: fromUnixSeconds(post.taken_at),
        id: getMediaName(url),
      });
    } else {
      const data = text_post_app_info?.linked_inline_media;
      if (data && Array.isArray(data.video_versions)) {
        const inlineUrl = data.video_versions[0]?.url;
        if (!inlineUrl) return;
        final({
          url: inlineUrl,
          username: post.user?.username,
          datetime: fromUnixSeconds(post.taken_at),
          id: getMediaName(inlineUrl),
        });
      } else if (data && Array.isArray(data.carousel_media)) {
        data.carousel_media.forEach((item: MediaItem) => {
          const itemUrl = getImgOrVideoUrl(item);
          if (!itemUrl) return;
          final({
            url: itemUrl,
            username: post.user?.username,
            datetime: fromUnixSeconds(post.taken_at),
            id: getMediaName(itemUrl),
          });
        });
      }
    }
  }
}

export async function handleThreadsPost(container: HTMLDivElement, action: "download" | "open") {
  const postCode = [...container.querySelectorAll("a")]
    .find((i) => /\w+\/post\/\w+/.test(i.href))
    ?.href.split("/post/")[1];
  if (!postCode) {
    console.warn("Threads download: no /post/<code> link in this post's container.");
    return;
  }
  const { threads } = await chrome.storage.local.get(["threads"]);
  // What the background stores under "threads": thread items, each wrapping
  // its post, or bare posts. One assertion here rather than one per read.
  const threadMap = new Map(asArray(threads) as [string, ThreadsPost & { post?: ThreadsPost }][]);
  const thread = threadMap.get(postCode);

  if (thread) {
    handleMedia(thread.post ?? thread, action);
    return;
  } else {
    for (const script of window.document.scripts) {
      try {
        const innerHTML = script.innerHTML;
        const json: unknown = JSON.parse(innerHTML);
        if (innerHTML.includes("thread_items")) {
          const arr = findFeedDataEdges(json);

          if (arr) {
            // The same thread_items list reaches us at five different
            // depths depending on which query produced the page.
            const match = arr
              .flatMap((i) =>
                asArray(
                  path(i, "node", "text_post_app_thread", "thread_items") ??
                    path(i, "node", "thread_items") ??
                    path(i, "node", "thread", "thread_items") ??
                    path(i, "text_post_app_thread", "thread_items") ??
                    prop(i, "thread_items"),
                ),
              )
              .find((item) => path(item, "post", "code") === postCode);

            if (match) {
              handleMedia(prop(match, "post") as ThreadsPost, action);
              return;
            }
          }
        }
      } catch {}
    }
    console.warn(
      `Threads download: post ${postCode} is not in the captured feed data or the page's embedded JSON.`,
    );
  }
}
