import "./index.scss";

import { CONFIG_LIST } from "../constants";

// The markup lives in public/popup/index.html. Every setting is a checkbox
// whose id is its storage key, so this only has to sync the two.

if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
  document.querySelector("main")?.classList.add("mobile");
}

const version = document.getElementById("version");
// chrome-types declares getManifest() as a bare index signature, so the
// version arrives untyped.
const manifestVersion: unknown = chrome.runtime?.getManifest().version;
if (version && typeof manifestVersion === "string") {
  version.textContent = `v${manifestVersion}`;
}

const checkboxes = CONFIG_LIST.map((id) => document.getElementById(id)).filter(
  (el): el is HTMLInputElement => el instanceof HTMLInputElement,
);

for (const checkbox of checkboxes) {
  checkbox.addEventListener("change", () => {
    void chrome.storage.sync.set({ [checkbox.id]: checkbox.checked });
  });
}

void chrome.storage.sync.get(CONFIG_LIST).then((res) => {
  for (const checkbox of checkboxes) checkbox.checked = !!res[checkbox.id];
});
