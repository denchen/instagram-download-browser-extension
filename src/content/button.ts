import { CLASS_CUSTOM_BUTTON, MediaType } from "../constants";
import type { IconClassName, IconColor } from "../types/global";
import { checkType, downloadResource } from "./utils/fn";
import { storageCache } from "./utils/storage";

const svgDownloadBtn = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" height="20" width="20"
viewBox="0 0 477.867 477.867" fill="currentColor" xml:space="preserve">
<g>
	 <path d="M443.733,307.2c-9.426,0-17.067,7.641-17.067,17.067v102.4c0,9.426-7.641,17.067-17.067,17.067H68.267
			 c-9.426,0-17.067-7.641-17.067-17.067v-102.4c0-9.426-7.641-17.067-17.067-17.067s-17.067,7.641-17.067,17.067v102.4
			 c0,28.277,22.923,51.2,51.2,51.2H409.6c28.277,0,51.2-22.923,51.2-51.2v-102.4C460.8,314.841,453.159,307.2,443.733,307.2z"/>
</g>
<g>
	 <path d="M335.947,295.134c-6.614-6.387-17.099-6.387-23.712,0L256,351.334V17.067C256,7.641,248.359,0,238.933,0
			 s-17.067,7.641-17.067,17.067v334.268l-56.201-56.201c-6.78-6.548-17.584-6.36-24.132,0.419c-6.388,6.614-6.388,17.099,0,23.713
			 l85.333,85.333c6.657,6.673,17.463,6.687,24.136,0.031c0.01-0.01,0.02-0.02,0.031-0.031l85.333-85.333
			 C342.915,312.486,342.727,301.682,335.947,295.134z"/>
</g>
</svg>`;

const svgNewtabBtn = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="140 -820 680 680" width="20" height="20" fill="currentColor">
	<path d="M212.31-140Q182-140 161-161q-21-21-21-51.31v-535.38Q140-778 161-799q21-21 51.31-21h222.3q12.77 0 21.39 8.62 8.61 8.61 8.61 21.38T456-768.62q-8.62 8.62-21.39 8.62h-222.3q-4.62 0-8.46 3.85-3.85 3.84-3.85 8.46v535.38q0 4.62 3.85 8.46 3.84 3.85 8.46 3.85h535.38q4.62 0 8.46-3.85 3.85-3.84 3.85-8.46v-222.3q0-12.77 8.62-21.39 8.61-8.61 21.38-8.61t21.38 8.61q8.62 8.62 8.62 21.39v222.3Q820-182 799-161q-21 21-51.31 21H212.31ZM760-717.85 409.85-367.69q-8.31 8.3-20.89 8.5-12.57.19-21.27-8.5-8.69-8.7-8.69-21.08 0-12.38 8.69-21.08L717.85-760H590q-12.77 0-21.38-8.62Q560-777.23 560-790t8.62-21.38Q577.23-820 590-820h193.84q15.47 0 25.81 10.35Q820-799.31 820-783.84V-590q0 12.77-8.62 21.38Q802.77-560 790-560t-21.38-8.62Q760-577.23 760-590v-127.85Z" />
</svg>`;

const svgDownloadAllBtn = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" height="20" width="20">
  <title>Download all</title>
  <rect x="7" y="2" width="10" height="2" rx="1"/>
  <rect x="7" y="5.5" width="10" height="2" rx="1"/>
  <path d="M11 10h2v4h3l-4 5-4-5h3z"/>
</svg>`;

function createCustomBtn(svg: string, iconColor: IconColor, className: IconClassName) {
  const newBtn = document.createElement("a");
  newBtn.innerHTML = svg;
  newBtn.className = CLASS_CUSTOM_BUTTON + " " + className;
  newBtn.setAttribute(
    "style",
    `cursor: pointer;padding:8px;z-index: 0;display:inline-flex;color:${iconColor}`,
  );
  newBtn.addEventListener("mouseenter", () => {
    newBtn.style.setProperty("filter", "drop-shadow(0px 0px 10px deepskyblue)");
  });
  newBtn.addEventListener("mouseleave", () => {
    newBtn.style.removeProperty("filter");
  });
  switch (className) {
    case "newtab-btn":
      newBtn.setAttribute("title", "Open In New Tab");
      newBtn.setAttribute("target", "_blank");
      newBtn.setAttribute("rel", "noopener,noreferrer");
      break;
    case "download-btn":
      newBtn.setAttribute("title", "Download");
      break;
    case "download-all-btn":
      newBtn.setAttribute("title", "Download All");
      break;
  }
  return newBtn;
}

export function addCustomBtn(
  node: any,
  iconColor: IconColor,
  position: "before" | "after" = "after",
) {
  const { setting_show_open_in_new_tab_icon, setting_show_download_all_icon } =
    storageCache.settings;
  const downloadBtn = createCustomBtn(svgDownloadBtn, iconColor, "download-btn");
  let newtabBtn, downloadAllBtn;
  if (!(checkType() !== "pc" && window.location.pathname.startsWith("/stories/"))) {
    if (setting_show_open_in_new_tab_icon) {
      newtabBtn = createCustomBtn(svgNewtabBtn, iconColor, "newtab-btn");
    }
  }
  if (
    checkType() === "pc" &&
    setting_show_download_all_icon &&
    window.location.host === "www.instagram.com" &&
    !window.location.pathname.startsWith("/reel") &&
    !window.location.pathname.startsWith("/stories/")
  ) {
    downloadAllBtn = createCustomBtn(svgDownloadAllBtn, iconColor, "download-all-btn");
  }
  if (position === "before") {
    if (newtabBtn) {
      node.insertBefore(newtabBtn, node.firstChild);
    }
    node.insertBefore(downloadBtn, node.firstChild);
    if (downloadAllBtn) {
      node.insertBefore(downloadAllBtn, node.firstChild);
    }
  } else {
    if (newtabBtn) {
      node.appendChild(newtabBtn);
    }
    node.appendChild(downloadBtn);
    if (downloadAllBtn) {
      node.appendChild(downloadAllBtn);
    }
  }
}

export function addVideoDownloadCoverBtn(node: HTMLDivElement) {
  const newBtn = document.createElement("a");
  newBtn.innerHTML = svgDownloadBtn;
  newBtn.className = CLASS_CUSTOM_BUTTON;
  newBtn.setAttribute("style", "cursor: pointer;position:absolute;left:4px;top:4px;color:white");
  newBtn.setAttribute("title", "Download Video Cover");
  newBtn.dataset.videoCoverDownload = "true";
  newBtn.addEventListener("mouseenter", () => {
    newBtn.style.setProperty("scale", "1.1");
  });
  newBtn.addEventListener("mouseleave", () => {
    newBtn.style.removeProperty("scale");
  });
  node.appendChild(newBtn);
}

/**
 * Downloads a grid video tile's cover image. Reached from handleGlobalClick's
 * `data-video-cover-download` branch, NOT through postOnClicked — so nothing
 * here consults the media API and no API data is available.
 *
 * Note the attribute is written as `dataset.videoCoverDownload` in
 * addVideoDownloadCoverBtn and read as the kebab-case
 * `data-video-cover-download` in handleGlobalClick. Same attribute, two
 * spellings, so grepping either form finds only one half of the pair.
 *
 * Both covers reach downloadResource with only a URL, which previously meant no
 * username (an `@unknown/` folder) and no datetime (the timestamp silently
 * became the download time). The username is recoverable from the pathname —
 * the grid only exists at `/<username>/` or `/<username>/reels/` — but the post
 * time is not in the DOM, so MediaType.Cover labels the name instead of
 * pretending the timestamp means something. #3's cache would supply the real
 * `taken_at`, at which point the prefix can stay and the timestamp becomes
 * meaningful.
 */
export function handleVideoCoverDownloadBtn(node: HTMLElement) {
  // `/<username>/` and `/<username>/reels/` show the page owner's own media,
  // so the first segment is the author. `/<username>/tagged/` does NOT — those
  // posts belong to whoever tagged them — and a tile's DOM carries no author,
  // so that case deliberately passes no username and files under `@unknown/`
  // rather than misfiling someone else's cover under the page owner. Folders
  // are the author, never the page browsed; see getUserFolder.
  const segments = window.location.pathname.split("/").filter((e) => e);
  const username = segments[1] === "tagged" ? undefined : segments[0];
  if (window.location.pathname.split("/")[2] === "reels") {
    const bgEl = node.querySelector('[style*="background-image"]');
    if (bgEl) {
      const url = window
        .getComputedStyle(bgEl)
        .getPropertyValue("background-image")
        .match(/url\((.*)\)/)?.[1];
      if (url) {
        void downloadResource({
          url: JSON.parse(url),
          username,
          type: MediaType.Cover,
        });
      }
    }
  } else {
    const imgSrc = node.querySelector("img")?.getAttribute("src");
    if (imgSrc) {
      void downloadResource({
        url: imgSrc,
        username,
        type: MediaType.Cover,
      });
    }
  }
}
