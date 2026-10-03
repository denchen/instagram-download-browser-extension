const script = document.createElement('script');
script.setAttribute('type', 'module');
script.setAttribute('src', chrome.runtime.getURL('xhr.js'));
script.addEventListener('load', () => {
   script.remove();
});
(document.head || document.documentElement).appendChild(script);
