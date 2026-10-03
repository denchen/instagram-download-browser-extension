import { downloadResource, openInNewTab } from "../utils/fn";
import { fromUnixSeconds, getMediaName } from "../utils/filename";
import { MediaType } from "../../constants";

function findFeedDataEdges(obj: Record<string, any>): Array<Record<string, any>> | null {
  if (obj) {
    if (Array.isArray(obj.edges)) {
      return obj.edges;
    }
    if (Array.isArray(obj.relatedPosts?.threads)) {
      return obj.relatedPosts.threads;
    }
  }

  for (const key in obj) {
    if (typeof obj[key] === "object") {
      const result = findFeedDataEdges(obj[key]);
      if (result) {
        return result;
      }
    } else if (Array.isArray(obj[key])) {
      for (const item of obj[key]) {
        const result = findFeedDataEdges(item);
        if (result) {
          return result;
        }
      }
    }
  }

  return null;
}

function handleMedia(post: any, action: "download" | "open") {
  const { giphy_media_info, carousel_media, image_versions2, video_versions, text_post_app_info } =
    post;
  const final = (obj: any) => {
    if (action === "download") {
      downloadResource({ ...obj, type: MediaType.Threads });
    } else {
      openInNewTab(obj.url);
    }
  };

  if (giphy_media_info?.first_party_cdn_proxied_images?.fixed_height?.webp) {
    const url = giphy_media_info?.first_party_cdn_proxied_images?.fixed_height?.webp;
    final({
      url: url,
      username: post.user.username,
      datetime: fromUnixSeconds(post.taken_at),
      id: getMediaName(url),
    });
  }
  if (Array.isArray(carousel_media) && carousel_media.length > 0) {
    carousel_media.forEach((item: any) => {
      const url = item.video_versions?.[0]?.url || item.image_versions2?.candidates?.[0]?.url;
      if (!url) return;
      final({
        url: url,
        username: post.user.username,
        datetime: fromUnixSeconds(post.taken_at),
        id: getMediaName(url),
      });
    });
  } else {
    const url = video_versions?.[0]?.url || image_versions2?.candidates?.[0]?.url;
    if (url) {
      final({
        url: url,
        username: post.user.username,
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
          username: post.user.username,
          datetime: fromUnixSeconds(post.taken_at),
          id: getMediaName(inlineUrl),
        });
      } else if (data && Array.isArray(data.carousel_media)) {
        data.carousel_media.forEach((item: any) => {
          const itemUrl =
            item.video_versions?.[0]?.url || item.image_versions2?.candidates?.[0]?.url;
          if (!itemUrl) return;
          final({
            url: itemUrl,
            username: post.user.username,
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
  const { threads } = await chrome.storage.local.get(["threads"]);
  const threadMap = new Map(threads || []);
  const thread = threadMap.get(postCode) as Record<string, any> | undefined;

  if (thread) {
    handleMedia(thread.post || thread, action);
    return;
  } else {
    for (const script of window.document.scripts) {
      try {
        const innerHTML = script.innerHTML;
        const json = JSON.parse(innerHTML);
        if (innerHTML.includes("thread_items")) {
          const arr = findFeedDataEdges(json);

          if (Array.isArray(arr)) {
            const match = arr
              .flatMap(
                (i) =>
                  i.node?.text_post_app_thread?.thread_items ||
                  i.node?.thread_items ||
                  i.node?.thread?.thread_items ||
                  i.text_post_app_thread?.thread_items ||
                  i.thread_items,
              )
              .find((i: Record<string, any> | undefined) => i?.post.code === postCode);

            if (match) {
              const { post } = match;
              handleMedia(post, action);
              return;
            }
          }
        }
      } catch {}
    }
  }
}
