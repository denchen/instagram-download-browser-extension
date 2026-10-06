import { MediaType } from "../constants";
import { downloadResource, openInNewTab } from "./utils/fn";

async function profileOnClicked(target: HTMLAnchorElement) {
  const arr = window.location.pathname.split("/").filter((e) => e);
  const username =
    arr.length === 1 ? arr[0] : document.querySelector("main header h2")?.textContent;
  // The header renders the avatar at full resolution (1080×1080 measured
  // 2026-10-06), so its src is the image to save. Upstream also looked up a
  // `user_profile_pic_url` cache first, but nothing has written that key since
  // upstream's c06e1ab (2024), so the lookup always missed.
  const url = document.querySelector("header img")?.getAttribute("src");
  if (typeof url === "string") {
    if (target.className.includes("download-btn")) {
      // No post time exists for an avatar, so `datetime` is left off and
      // the filename falls back to the download time.
      await downloadResource({
        url: url,
        username: username ?? undefined,
        id: username!,
        type: MediaType.Profile,
      });
    } else {
      await openInNewTab(url);
    }
  }
}

import type { IconColor } from "../types/global";
import { CLASS_CUSTOM_BUTTON } from "../constants";
import { addCustomBtn, addVideoDownloadCoverBtn } from "./button";
import { getProfileHeaderRow } from "./utils/dom";
import type { PageHandler } from "./handlers";
import { VIDEO_SVG_PATH } from "../constants";
import { postOnClicked } from "./post";

export class ProfilePageHandler implements PageHandler {
  // process() runs every two seconds; one warning per page load is enough.
  private warnedMissingRow = false;

  match(url: URL, pathnameList: string[]) {
    return (
      pathnameList.length === 1 ||
      (pathnameList.length === 2 && ["tagged", "reels"].includes(pathnameList[1]))
    );
  }

  process(iconColor: IconColor) {
    const headerRow = getProfileHeaderRow();
    if (headerRow) {
      if (headerRow.getElementsByClassName(CLASS_CUSTOM_BUTTON).length === 0) {
        addCustomBtn(headerRow, iconColor);
      }
    } else if (document.querySelector("main header img") && !this.warnedMissingRow) {
      // The header has rendered but its layout no longer matches, which used
      // to mean the avatar buttons vanished with no trace.
      this.warnedMissingRow = true;
      console.warn(
        "Profile header found, but not the username row with the options button; avatar download buttons not added.",
      );
    }

    const pathnameList = window.location.pathname.split("/").filter((e) => e);
    const postsRows = document
      .querySelector("header")
      ?.parentElement?.lastElementChild?.querySelectorAll(
        `:scope>div>div>div>div ${pathnameList.length === 1 ? ">div" : ""}`,
      );

    postsRows?.forEach((row) => {
      row.childNodes.forEach((item) => {
        if (
          item instanceof HTMLDivElement &&
          item.getElementsByClassName(CLASS_CUSTOM_BUTTON).length === 0
        ) {
          const videoSvg = item.querySelector(`path[d="${VIDEO_SVG_PATH}"]`);
          if (videoSvg || pathnameList.includes("reels")) {
            addVideoDownloadCoverBtn(item);
          }
        }
      });
    });
  }

  onCustomButtonClick(target: HTMLAnchorElement) {
    if (getProfileHeaderRow()?.contains(target)) {
      return profileOnClicked(target);
    }
    return postOnClicked(target);
  }
}
