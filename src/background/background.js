import browser from 'webextension-polyfill';

browser.webRequest.onSendHeaders.addListener(async ({url, tabId}) => {
    if (!tabId || tabId < 0)
      return;

    const maxAttempts = 8;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await browser.tabs.sendMessage(tabId, {componentsUrl: url});
        return;
      } catch (e) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }
  },
  {
    urls: ['https://*.netacad.com/*/components.json']
  }
);

browser.webRequest.onBeforeSendHeaders.addListener((details) => {
    return {
      requestHeaders: details.requestHeaders.map(header => {
        if (header.name.toLowerCase() === 'cache-control') {
          return {
            name: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate'
          };
        }
        return header;
      })
    };
  },
  {urls: ['https://*.netacad.com/*/components.json']},
  ["requestHeaders"]
);
