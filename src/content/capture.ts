// ArcFlow content script — captures selected text for workspace notes

function createOverlayPopup(
  selectedText: string,
  onSave: (annotation: string) => void,
  onCancel: () => void
) {
  // Remove any existing popup
  const existing = document.getElementById("arcflow-capture-popup");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "arcflow-capture-popup";
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.3);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const popup = document.createElement("div");
  popup.style.cssText = `
    background: #1e1e2e;
    color: #e0e0e0;
    border-radius: 12px;
    padding: 16px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    font-size: 13px;
  `;

  // Preview of selected text (first 200 chars)
  const preview = document.createElement("div");
  preview.style.cssText = `
    background: #2a2a3e;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 12px;
    max-height: 100px;
    overflow-y: auto;
    font-size: 12px;
    color: #b0b0c0;
    line-height: 1.4;
    border-left: 3px solid #7c5cfc;
  `;
  const truncated =
    selectedText.length > 200 ? selectedText.slice(0, 200) + "…" : selectedText;
  preview.textContent = truncated;

  // Source URL display
  const source = document.createElement("div");
  source.style.cssText = `
    font-size: 11px;
    color: #888;
    margin-bottom: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  source.textContent = `From: ${document.title}`;

  // Annotation input
  const annotationLabel = document.createElement("div");
  annotationLabel.style.cssText = `font-size: 11px; color: #999; margin-bottom: 4px;`;
  annotationLabel.textContent = "Add a note (optional):";

  const annotationInput = document.createElement("input");
  annotationInput.type = "text";
  annotationInput.placeholder = "Your annotation…";
  annotationInput.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    background: #2a2a3e;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 8px 10px;
    color: #e0e0e0;
    font-size: 12px;
    outline: none;
    margin-bottom: 12px;
  `;

  // Buttons
  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = `display: flex; gap: 8px; justify-content: flex-end;`;

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "Skip";
  skipBtn.style.cssText = `
    background: transparent;
    border: 1px solid #555;
    border-radius: 6px;
    padding: 6px 14px;
    color: #aaa;
    font-size: 12px;
    cursor: pointer;
  `;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.style.cssText = `
    background: #7c5cfc;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
  `;

  buttonRow.appendChild(skipBtn);
  buttonRow.appendChild(saveBtn);

  popup.appendChild(preview);
  popup.appendChild(source);
  popup.appendChild(annotationLabel);
  popup.appendChild(annotationInput);
  popup.appendChild(buttonRow);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Focus annotation input
  setTimeout(() => annotationInput.focus(), 50);

  const cleanup = () => overlay.remove();

  saveBtn.addEventListener("click", () => {
    onSave(annotationInput.value.trim());
    cleanup();
  });

  skipBtn.addEventListener("click", () => {
    onCancel();
    cleanup();
  });

  // Enter in annotation triggers save
  annotationInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave(annotationInput.value.trim());
      cleanup();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      cleanup();
    }
  });

  // Click outside popup closes it
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      onCancel();
      cleanup();
    }
  });
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; selectedText?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { action: string; annotation?: string }) => void
  ) => {
    if (message.type === "ARCFLOW_CAPTURE_SELECTION") {
      const selectedText =
        message.selectedText || window.getSelection()?.toString()?.trim() || "";
      if (!selectedText) {
        sendResponse({ action: "cancel" });
        return;
      }

      // Show overlay popup for optional annotation
      createOverlayPopup(
        selectedText,
        (annotation) => {
          sendResponse({ action: "save", annotation });
        },
        () => {
          // Save without annotation (skip just saves with no annotation)
          sendResponse({ action: "save", annotation: "" });
        }
      );

      return true; // Keep the message channel open for async response
    }

    if (message.type === "ARCFLOW_CAPTURE_SNIPPET") {
      const selectedText =
        message.selectedText || window.getSelection()?.toString()?.trim() || "";
      if (!selectedText) {
        sendResponse({ action: "cancel" });
        return;
      }

      // Reuse the same overlay popup for snippet annotation
      createOverlayPopup(
        selectedText,
        (annotation) => {
          sendResponse({ action: "save", annotation });
        },
        () => {
          sendResponse({ action: "cancel" });
        }
      );

      return true; // Keep the message channel open for async response
    }

    if (message.type === "ARCFLOW_NOTES_FULL") {
      alert(
        "ArcFlow Notes: Notes are full (5,000 character limit reached). Please clear some notes first."
      );
    }
  }
);
