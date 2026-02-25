// ArcFlow content script — captures page text for Research Copilot
// No-op until triggered by CAPTURE_PAGE_TEXT message from service worker

chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: {
      text: string;
      title: string;
      url: string;
    }) => void
  ) => {
    if (message.type === "CAPTURE_PAGE_TEXT") {
      const text = document.body.innerText || "";
      sendResponse({
        text,
        title: document.title,
        url: window.location.href,
      });
    }
  }
);
