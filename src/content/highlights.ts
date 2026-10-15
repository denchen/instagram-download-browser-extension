import { checkType, downloadResource, openInNewTab } from "./utils/fn";
import { fromUnixSeconds, type DownloadParams, getMediaName } from "./utils/filename";
import type { Highlight } from "../types/highlights";
import type { ReelsMedia } from "../types/global";
import { MediaType } from "../constants";
import { getParentSectionNode } from "./utils/dom";
import { getImgOrVideoUrl } from "./utils/media";
import { findKey } from "./utils/json";
import type { MediaReel } from "../types/media";
import { cachedUrlExpired } from "./utils/post-cache";

function findHighlight(json: unknown) {
  return findKey(json, "xdt_api__v1__feed__reels_media__connection") as
    | Highlight.XdtApiV1FeedReelsMediaConnection
    | undefined;
}

export async function highlightsOnClicked(
  target: HTMLAnchorElement,
  containerNode: Element | null,
) {
  const sectionNode = getParentSectionNode(target) ?? containerNode;
  if (!sectionNode) {
    console.warn("cannot find section node");
    return;
  }
  const pathname = window.location.pathname; // "/stories/highlights/18023929792378379/"
  const pathnameArr = pathname.split("/");

  const final = (url: string | undefined, filenameObj?: Omit<DownloadParams, "url" | "type">) => {
    if (target.className.includes("download-btn")) {
      if (filenameObj) {
        void downloadResource({
          url: url,
          ...filenameObj,
          type: MediaType.Highlight,
        });
      } else {
        let posterName = "highlights";
        for (const item of sectionNode.querySelectorAll("a[role=link]")) {
          const hrefArr = item
            .getAttribute("href")
            ?.split("/")
            .filter((_) => _);
          // A single segment is a profile link (`/username/`).
          if (hrefArr?.length === 1 && hrefArr[0]) {
            posterName = hrefArr[0];
            break;
          }
        }
        const postTime = [...sectionNode.querySelectorAll("time")]
          .find((i) => i.classList.length !== 0)
          ?.getAttribute("datetime");
        void downloadResource({
          url: url,
          username: posterName,
          datetime: postTime,
          id: getMediaName(url),
          type: MediaType.Highlight,
        });
      }
    } else {
      void openInNewTab(url);
    }
  };

  let mediaIndex = 0;

  // MediaReel, not Highlight.Node: the Android path reaches this with the
  // home tray's shape instead, and what they share is the contract.
  const handleMedias = (data: MediaReel) => {
    const media = data.items?.[mediaIndex];
    if (!media) {
      console.warn(`no highlight item at index ${mediaIndex}; refusing to guess`);
      return;
    }
    const url = getImgOrVideoUrl(media);
    // No index: each highlight item carries its own taken_at, so their
    // timestamps already differ.
    final(url, {
      username: data.user?.username,
      datetime: fromUnixSeconds(media.taken_at),
      id: data.id,
    });
  };

  target.parentElement?.firstElementChild?.querySelectorAll(":scope>div").forEach((i, idx) => {
    if (i.childNodes.length === 1) {
      mediaIndex = idx;
    }
  });

  const { reels_media, highlights_data } = (await chrome.storage.local.get([
    "reels_media",
    "highlights_data",
  ])) as {
    reels_media?: ReelsMedia.ReelsMedum[];
    highlights_data?: [string, Highlight.Node][];
  };

  //  profile page highlight on Android
  if (checkType() === "android") {
    const itemOnAndroid = (reels_media ?? []).find((i) => i.id === "highlight:" + pathnameArr[3]);
    if (itemOnAndroid && !cachedUrlExpired(itemOnAndroid.items[mediaIndex], "highlight")) {
      handleMedias(itemOnAndroid);
      return;
    }
    for (const item of sectionNode.querySelectorAll<HTMLImageElement>("img")) {
      if (item.srcset !== "") {
        final(item.src);
        return;
      }
    }
  }

  const localData = new Map(highlights_data ?? []).get("highlight:" + pathnameArr[3]);
  if (localData && !cachedUrlExpired(localData.items[mediaIndex], "highlight")) {
    handleMedias(localData);
    return;
  }

  for (const script of window.document.scripts) {
    try {
      const innerHTML = script.innerHTML;
      const data: unknown = JSON.parse(innerHTML);
      if (innerHTML.includes("xdt_api__v1__feed__reels_media__connection")) {
        const edge = findHighlight(data)?.edges[0];
        if (edge) {
          handleMedias(edge.node);
          return;
        }
      }
    } catch {}
  }

  const videoUrl = sectionNode.querySelector("video")?.getAttribute("src");
  if (videoUrl) {
    final(videoUrl);
    return;
  }

  for (const item of sectionNode.querySelectorAll<HTMLImageElement>(
    'img[referrerpolicy="origin-when-cross-origin"]',
  )) {
    if (item.classList.length > 1) {
      final(item.src);
      return;
    }
  }

  alert("download highlights failed!");
}
