import { checkType, downloadResource, getUrlFromInfoApi, openInNewTab } from "./utils/fn";
import { type DownloadParams, fromUnixSeconds, getMediaName } from "./utils/filename";
import type { Stories } from "../types/stories";
import type { MediaReel } from "../types/media";
import type { ReelsMedia } from "../types/global";
import { getParentSectionNode } from "./utils/dom";
import { getImgOrVideoUrl, storyExpired } from "./utils/media";
import { findKey, path, prop } from "./utils/json";
import { CLASS_CUSTOM_BUTTON, MediaType, shareIconSelector } from "../constants";
import { storageCache } from "./utils/storage";
import { handleStoriesVideoVolumeChange, handleVideoMaskClip } from "./utils/video";
import { addCustomBtn } from "./button";
import type { PageHandler } from "./handlers";
import { highlightsOnClicked } from "./highlights";

async function storyGetUrl(target: HTMLElement, sectionNode: Element) {
  const res = await getUrlFromInfoApi(target);
  let url = res?.url;
  if (!url) {
    const source = sectionNode.querySelector("video > source");
    const img = sectionNode.querySelector<HTMLImageElement>('img[decoding="sync"]');
    const video = sectionNode.querySelector("video");
    if (source) {
      url = source.getAttribute("src") ?? undefined;
    } else if (img) {
      // srcset is widest-last; the entry before the first width descriptor
      // is the plain URL.
      const fromSrcset = img.srcset.split(/ \d+w/g)[0]?.trim();
      if (fromSrcset) return fromSrcset;
      url = img.getAttribute("src") ?? undefined;
    } else if (video) {
      url = video.getAttribute("src") ?? undefined;
    }
  }
  return url;
}

function findStories(json: unknown) {
  return findKey(json, "xdt_api__v1__feed__reels_media") as
    | Stories.XdtApiV1FeedReelsMedia
    | undefined;
}

export class StoriesPageHandler implements PageHandler {
  private isHighLights = false;
  private containerNode: Element | null = null;

  match(url: URL) {
    return url.pathname.startsWith("/stories/");
  }

  process() {
    if (window.location.pathname.startsWith("/stories/highlights/")) {
      this.isHighLights = true;
    }
    const node = document
      .querySelector("section")
      ?.querySelector('img[decoding="sync"]')?.nextSibling;
    if (node instanceof HTMLDivElement) {
      node.style.pointerEvents = "none";
    }
    let wrapperDiv = document.querySelector(
      "body>div:not([hidden])>div>div>div:not([hidden])>div:not([hidden])>div>div section",
    );
    if (checkType() === "android") {
      wrapperDiv = document.querySelector(
        "body>div:not([hidden])>div>div>div:not([hidden])>div:not([hidden])>div>div>div>div",
      );
    }
    if (!wrapperDiv) {
      return;
    }
    this.containerNode = wrapperDiv;
    const storyMenuBtn = wrapperDiv.querySelector("svg circle");
    if (storyMenuBtn && wrapperDiv?.getElementsByClassName(CLASS_CUSTOM_BUTTON).length === 0) {
      addCustomBtn(
        storyMenuBtn.parentNode?.parentNode?.parentNode?.parentNode?.parentNode,
        "white",
      );
    }
    this.handleVideo(wrapperDiv);
  }

  async onCustomButtonClick(target: HTMLAnchorElement) {
    if (this.isHighLights) {
      return highlightsOnClicked(target, this.containerNode);
    }
    const pathname = window.location.pathname;
    const pathnameArr = pathname.split("/").filter((e) => e);
    const posterName = pathnameArr[1];

    // MediaReel, not Stories.ReelsMedum: the home tray's reels_media and the
    // stories map reach this with different generated shapes, and what they
    // share is the contract.
    const handleMedia = (item: MediaReel, mediaIndex: number) => {
      const media = item.items?.[mediaIndex];
      if (!media) return false;
      if (storyExpired(media)) {
        return false;
      }
      const url = getImgOrVideoUrl(media);
      const final = (obj: Omit<DownloadParams, "type">) => {
        if (target.className.includes("download-btn")) {
          void downloadResource({ ...obj, type: MediaType.Story });
        } else {
          void openInNewTab(obj.url);
        }
      };
      // No index: each story carries its own taken_at, so timestamps
      // already differ between items in the tray.
      final({
        url: url,
        username: item.user?.username,
        datetime: fromUnixSeconds(media.taken_at),
        id: item.id,
      });
      return true;
    };

    // chrome.storage types every value as `any`; these are what the
    // background writes under each key.
    const { stories_reels_media, stories_user_ids, reels_media } = (await chrome.storage.local.get([
      "stories_reels_media",
      "stories_user_ids",
      "reels_media",
    ])) as {
      stories_reels_media?: [string, Stories.ReelsMedum][];
      stories_user_ids?: [string, string][];
      reels_media?: ReelsMedia.ReelsMedum[];
    };

    const stories_reels_media_data = new Map<string, Stories.ReelsMedum>(stories_reels_media ?? []);

    // no media_id in url
    if (pathnameArr.length === 2) {
      let mediaIndex = 0;
      const steps = target.parentElement!.firstElementChild!.querySelectorAll(":scope>div");
      // multiple media, find the media index
      if (steps.length > 1) {
        steps.forEach((item, index) => {
          if (item.childNodes.length === 1) {
            mediaIndex = index;
          }
        });
      }

      // when open the page from an empty tab, data return with html but not xhr
      if (window.history.length <= 2) {
        for (const script of window.document.scripts) {
          try {
            const innerHTML = script.innerHTML;
            const data: unknown = JSON.parse(innerHTML);
            if (innerHTML.includes("xdt_api__v1__feed__reels_media")) {
              const reel = findStories(data)?.reels_media[0];
              if (reel) {
                handleMedia(reel, mediaIndex);
                return;
              }
            }
          } catch {}
        }
      }

      const user_id =
        posterName === undefined ? undefined : new Map(stories_user_ids ?? []).get(posterName);
      if (typeof user_id === "string") {
        const item = stories_reels_media_data.get(user_id);
        if (item && steps.length === item.items.length) {
          const result = handleMedia(item, mediaIndex);
          if (result) return;
        }
      }

      for (const script of window.document.scripts) {
        try {
          const innerHTML = script.innerHTML;
          const data: unknown = JSON.parse(innerHTML);
          if (innerHTML.includes("rootView")) {
            // The tray's own id for the author, under whichever of the two
            // names this page's bootstrap data uses.
            const props = path(data, "rootView", "props");
            const id = (prop(props, "media_owner_id") ?? prop(props, "id")) as string | undefined;
            const item = id === undefined ? undefined : stories_reels_media_data.get(id);
            if (item) {
              handleMedia(item, mediaIndex);
              return;
            }
          }
        } catch {}
      }
    } else {
      const mediaId = pathnameArr.at(-1)!;

      for (const item of stories_reels_media_data.values()) {
        for (const [i, media] of item.items.entries()) {
          if (media.pk === mediaId) {
            const result = handleMedia(item, i);
            if (result) return;
          }
        }
      }

      for (const script of window.document.scripts) {
        try {
          const innerHTML = script.innerHTML;
          const data: unknown = JSON.parse(innerHTML);
          if (innerHTML.includes("xdt_api__v1__feed__reels_media")) {
            const reel = findStories(data)?.reels_media[0];
            if (reel) {
              handleMedia(
                reel,
                reel.items.findIndex((i) => i.pk === mediaId),
              );
              return;
            }
          }
        } catch {}
      }

      const item = (reels_media ?? []).find((i) => i.media_ids?.includes(mediaId));
      if (item) {
        handleMedia(item, item.media_ids.indexOf(mediaId));
        return;
      }
      const sectionNode = getParentSectionNode(target);
      if (!sectionNode) return;
      const url = await storyGetUrl(target, sectionNode);
      if (url) {
        const postTime = sectionNode.querySelector("time")?.getAttribute("datetime");
        if (target.className.includes("download-btn")) {
          await downloadResource({
            url: url,
            username: posterName,
            datetime: postTime,
            id: getMediaName(url),
            type: MediaType.Story,
          });
        } else {
          await openInNewTab(url);
        }
      }
    }
  }

  private handleVideo(wrapperDiv: Element) {
    if (!storageCache.settings.setting_enable_video_controls) {
      return;
    }

    const videos = wrapperDiv.querySelectorAll("video");
    for (const video of videos) {
      const videoPlayerMaskDiv = video.closest("section")?.querySelector('div[role="group"]');
      if (videoPlayerMaskDiv instanceof HTMLDivElement) {
        handleVideoMaskClip(videoPlayerMaskDiv, video, {
          onVolumeChange: handleStoriesVideoVolumeChange,
          bottomDiv:
            wrapperDiv.querySelector(shareIconSelector)?.parentNode?.parentNode?.parentNode
              ?.parentNode?.parentNode?.parentNode,
        });
      }
    }
  }
}
