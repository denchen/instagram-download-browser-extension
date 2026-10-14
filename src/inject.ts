const script = document.createElement("script");
script.setAttribute("type", "module");
script.setAttribute("src", chrome.runtime.getURL("xhr.js"));
script.addEventListener("load", () => {
  script.remove();
});
// At document_start there is no <head> yet, whatever lib.dom's
// non-nullable typing says, so this runs before the page's own scripts.
// oxlint-disable-next-line typescript/strict-boolean-expressions
(document.head || document.documentElement).appendChild(script);
