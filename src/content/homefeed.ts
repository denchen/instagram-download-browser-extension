import type { PageHandler } from "./handlers";
import { CLASS_CUSTOM_BUTTON, likeIconSelector, tagIconSelector } from "../constants";
import type { IconColor } from "../types/global";
import { addCustomBtn } from "./button";
import { postOnClicked } from "./post";
import { storageCache } from "./utils/storage";
import { handleVideoMaskClip } from "./utils/video";

export class FeedPageHandler implements PageHandler {
  match(url: URL, pathnameList: string[]) {
    const isFeedPage = pathnameList.length === 2 && pathnameList[1] === "feed";
    return url.pathname === "/" || isFeedPage;
  }

  process(iconColor: IconColor) {
    this.handleVideo();

    const articleList = document.querySelectorAll("article");
    for (const article of articleList) {
      const tagNode = article.querySelector(tagIconSelector);
      if (tagNode) {
        article.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
          const emptyNode = img.parentElement?.nextElementSibling;
          if (emptyNode instanceof HTMLDivElement && emptyNode.childNodes.length === 0) {
            emptyNode.style.pointerEvents = "none";
          }
        });
      } else {
        article.querySelectorAll<HTMLImageElement>(":scope img").forEach((img) => {
          img.style.zIndex = "999";
        });
      }
      const likeBtn = article.querySelector(likeIconSelector);
      if (likeBtn && article.getElementsByClassName(CLASS_CUSTOM_BUTTON).length === 0) {
        addCustomBtn(
          likeBtn.parentNode?.parentNode?.parentNode?.parentNode?.parentNode?.parentNode
            ?.parentNode,
          iconColor,
        );
      }
    }
  }

  onCustomButtonClick(target: HTMLAnchorElement) {
    return postOnClicked(target);
  }

  private handleVideo() {
    const { setting_enable_video_controls } = storageCache.settings;
    if (!setting_enable_video_controls) return;

    const videos = document.querySelectorAll("video");
    for (const video of videos) {
      const videoPlayerMaskDiv = video
        .closest('[data-visualcompletion="ignore-late-mutation"]')
        ?.querySelector('div[role="group"]');
      if (videoPlayerMaskDiv instanceof HTMLDivElement) {
        handleVideoMaskClip(videoPlayerMaskDiv, video);
      }
    }
  }
}
