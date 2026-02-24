// ArcFlow content script — annotation toolbar for highlighting and notes
// Imperative DOM only — no React. Injects floating toolbar on text selection.

import type { Annotation } from "../shared/types";

const TOOLBAR_ID = "arcflow-annotate-toolbar";
const NOTE_INPUT_ID = "arcflow-annotate-note-input";

const HIGHLIGHT_COLORS = [
  { name: "yellow", hex: "#FFEB3B" },
  { name: "green", hex: "#81C784" },
  { name: "blue", hex: "#64B5F6" },
];

// --- XPath utilities ---

function getXPath(node: Node): string {
  if (node.nodeType === Node.DOCUMENT_NODE) return "/";
  if (!node.parentNode) return "";

  const siblings = Array.from(node.parentNode.childNodes).filter(
    (n) => n.nodeName === node.nodeName,
  );
  const index = siblings.indexOf(node as ChildNode) + 1;
  const parentPath = getXPath(node.parentNode);
  const name = node.nodeName.toLowerCase();
  return `${parentPath}/${name}${siblings.length > 1 ? `[${index}]` : ""}`;
}

function getSelectionXPath(
  range: Range,
): { xpath: string; textOffset: number; textLength: number } | null {
  const startContainer = range.startContainer;
  const parentEl =
    startContainer.nodeType === Node.TEXT_NODE
      ? startContainer.parentElement
      : (startContainer as Element);
  if (!parentEl) return null;

  const xpath = getXPath(parentEl);

  // Calculate text offset within the parent element
  let textOffset = 0;
  const walker = document.createTreeWalker(parentEl, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current === range.startContainer) {
      textOffset += range.startOffset;
      break;
    }
    textOffset += (current.textContent ?? "").length;
    current = walker.nextNode();
  }

  return { xpath, textOffset, textLength: range.toString().length };
}

// --- Toolbar ---

function removeToolbar(): void {
  const existing = document.getElementById(TOOLBAR_ID);
  if (existing) existing.remove();
  const noteInput = document.getElementById(NOTE_INPUT_ID);
  if (noteInput) noteInput.remove();
}

function createToolbar(rect: DOMRect, onHighlight: (color: string) => void, onNote: () => void): void {
  removeToolbar();

  const toolbar = document.createElement("div");
  toolbar.id = TOOLBAR_ID;
  toolbar.style.cssText = `
    position: fixed;
    top: ${rect.top - 44}px;
    left: ${rect.left + rect.width / 2}px;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 4px;
    background: #1e1e2e;
    border-radius: 8px;
    padding: 6px 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
  `;

  // Highlight color buttons
  for (const color of HIGHLIGHT_COLORS) {
    const btn = document.createElement("button");
    btn.title = `Highlight ${color.name}`;
    btn.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid transparent;
      background: ${color.hex};
      cursor: pointer;
      padding: 0;
      transition: border-color 0.15s;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.borderColor = "#fff";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.borderColor = "transparent";
    });
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onHighlight(color.hex);
    });
    toolbar.appendChild(btn);
  }

  // Divider
  const divider = document.createElement("div");
  divider.style.cssText = `width: 1px; height: 20px; background: #444; margin: 0 4px;`;
  toolbar.appendChild(divider);

  // Note button
  const noteBtn = document.createElement("button");
  noteBtn.textContent = "📝";
  noteBtn.title = "Add note";
  noteBtn.style.cssText = `
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  `;
  noteBtn.addEventListener("mouseenter", () => {
    noteBtn.style.background = "#333";
  });
  noteBtn.addEventListener("mouseleave", () => {
    noteBtn.style.background = "transparent";
  });
  noteBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onNote();
  });
  toolbar.appendChild(noteBtn);

  document.body.appendChild(toolbar);
}

function showNoteInput(
  rect: DOMRect,
  onSave: (comment: string) => void,
  onCancel: () => void,
): void {
  // Remove toolbar but keep note input
  const toolbar = document.getElementById(TOOLBAR_ID);
  if (toolbar) toolbar.remove();

  const container = document.createElement("div");
  container.id = NOTE_INPUT_ID;
  container.style.cssText = `
    position: fixed;
    top: ${rect.top - 80}px;
    left: ${rect.left + rect.width / 2}px;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: #1e1e2e;
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    gap: 6px;
    align-items: center;
  `;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Add a note…";
  input.style.cssText = `
    width: 200px;
    background: #2a2a3e;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 6px 10px;
    color: #e0e0e0;
    font-size: 12px;
    outline: none;
  `;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.style.cssText = `
    background: #7c5cfc;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
  `;

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave(input.value.trim());
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  });

  saveBtn.addEventListener("click", () => {
    onSave(input.value.trim());
  });

  container.appendChild(input);
  container.appendChild(saveBtn);
  document.body.appendChild(container);

  setTimeout(() => input.focus(), 50);
}

// --- Annotation creation ---

function createAnnotation(
  type: "highlight" | "note",
  text: string,
  color: string,
  xpath: string,
  textOffset: number,
  textLength: number,
  fallbackScrollY: number,
  comment?: string,
): Annotation {
  return {
    id: crypto.randomUUID(),
    url: window.location.href,
    pageTitle: document.title,
    type,
    text,
    comment,
    color,
    xpath,
    textOffset,
    textLength,
    fallbackScrollY,
    createdAt: Date.now(),
  };
}

function saveAnnotation(annotation: Annotation): void {
  chrome.runtime.sendMessage({
    type: "SAVE_ANNOTATION",
    annotation,
  }).catch(() => {
    // Service worker may not be available
  });
}

// --- Selection handler ---

let currentSelection: {
  text: string;
  range: Range;
  rect: DOMRect;
  xpathInfo: { xpath: string; textOffset: number; textLength: number };
} | null = null;

function handleSelectionChange(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    return;
  }

  const text = selection.toString().trim();
  if (!text) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  const xpathInfo = getSelectionXPath(range);
  if (!xpathInfo) return;

  currentSelection = { text, range, rect, xpathInfo };

  createToolbar(
    rect,
    // onHighlight
    (color: string) => {
      if (!currentSelection) return;
      const annotation = createAnnotation(
        "highlight",
        currentSelection.text,
        color,
        currentSelection.xpathInfo.xpath,
        currentSelection.xpathInfo.textOffset,
        currentSelection.xpathInfo.textLength,
        window.scrollY + currentSelection.rect.top,
      );
      saveAnnotation(annotation);
      removeToolbar();
      window.getSelection()?.removeAllRanges();
      currentSelection = null;
    },
    // onNote
    () => {
      if (!currentSelection) return;
      const sel = currentSelection;
      showNoteInput(
        sel.rect,
        (comment: string) => {
          const annotation = createAnnotation(
            "note",
            sel.text,
            HIGHLIGHT_COLORS[0].hex, // default yellow for notes
            sel.xpathInfo.xpath,
            sel.xpathInfo.textOffset,
            sel.xpathInfo.textLength,
            window.scrollY + sel.rect.top,
            comment,
          );
          saveAnnotation(annotation);
          removeToolbar();
          window.getSelection()?.removeAllRanges();
          currentSelection = null;
        },
        () => {
          removeToolbar();
          currentSelection = null;
        },
      );
    },
  );
}

// Debounce the mouseup selection handler
let selectionTimeout: ReturnType<typeof setTimeout> | null = null;

document.addEventListener("mouseup", () => {
  if (selectionTimeout) clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(handleSelectionChange, 100);
});

// Dismiss toolbar on click outside
document.addEventListener("mousedown", (e) => {
  const toolbar = document.getElementById(TOOLBAR_ID);
  const noteInput = document.getElementById(NOTE_INPUT_ID);
  const target = e.target as Node;

  if (toolbar && !toolbar.contains(target) && (!noteInput || !noteInput.contains(target))) {
    removeToolbar();
    currentSelection = null;
  }
  if (noteInput && !noteInput.contains(target) && (!toolbar || !toolbar.contains(target))) {
    removeToolbar();
    currentSelection = null;
  }
});

// --- Annotation rendering on page load ---

const ARCFLOW_MARK_CLASS = "arcflow-annotation-mark";
const ARCFLOW_NOTE_CLASS = "arcflow-annotation-note-indicator";
const ARCFLOW_FALLBACK_CLASS = "arcflow-annotation-fallback";

function resolveXPath(xpath: string): Node | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return result.singleNodeValue;
  } catch {
    return null;
  }
}

function findTextRange(
  parentEl: Element,
  textOffset: number,
  textLength: number,
): Range | null {
  const walker = document.createTreeWalker(parentEl, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  let accumulated = 0;

  while (current) {
    const nodeLen = (current.textContent ?? "").length;
    if (accumulated + nodeLen > textOffset) {
      const startInNode = textOffset - accumulated;
      const range = document.createRange();
      range.setStart(current, startInNode);

      // The highlight text may span multiple text nodes
      let endNode: Node = current;
      let endOffset = startInNode;

      let walker2: Node | null = current;
      let accInHighlight = 0;
      while (walker2 && accInHighlight < textLength) {
        const walkerLen = (walker2.textContent ?? "").length;
        const startPos = walker2 === current ? startInNode : 0;
        const available = walkerLen - startPos;

        if (accInHighlight + available >= textLength) {
          endNode = walker2;
          endOffset = startPos + (textLength - accInHighlight);
          break;
        }
        accInHighlight += available;
        endNode = walker2;
        endOffset = walkerLen;
        // Move to next text node
        const tempWalker = document.createTreeWalker(
          parentEl,
          NodeFilter.SHOW_TEXT,
        );
        let found = false;
        let temp = tempWalker.nextNode();
        while (temp) {
          if (found) {
            walker2 = temp;
            break;
          }
          if (temp === walker2) found = true;
          temp = tempWalker.nextNode();
        }
        if (!found || !temp) break;
      }

      try {
        range.setEnd(endNode, endOffset);
        return range;
      } catch {
        return null;
      }
    }
    accumulated += nodeLen;
    current = walker.nextNode();
  }
  return null;
}

function renderHighlightMark(
  range: Range,
  annotation: Annotation,
): HTMLElement | null {
  try {
    const mark = document.createElement("mark");
    mark.className = ARCFLOW_MARK_CLASS;
    mark.dataset.annotationId = annotation.id;
    mark.style.cssText = `
      background-color: ${annotation.color}40;
      border-bottom: 2px solid ${annotation.color};
      padding: 0 1px;
      border-radius: 2px;
      cursor: pointer;
      position: relative;
    `;
    range.surroundContents(mark);
    return mark;
  } catch {
    // surroundContents fails if range spans multiple elements
    // Fall back to highlighting what we can
    try {
      const fragment = range.extractContents();
      const mark = document.createElement("mark");
      mark.className = ARCFLOW_MARK_CLASS;
      mark.dataset.annotationId = annotation.id;
      mark.style.cssText = `
        background-color: ${annotation.color}40;
        border-bottom: 2px solid ${annotation.color};
        padding: 0 1px;
        border-radius: 2px;
        cursor: pointer;
        position: relative;
      `;
      mark.appendChild(fragment);
      range.insertNode(mark);
      return mark;
    } catch {
      return null;
    }
  }
}

function renderNoteIndicator(mark: HTMLElement, annotation: Annotation): void {
  const indicator = document.createElement("span");
  indicator.className = ARCFLOW_NOTE_CLASS;
  indicator.dataset.annotationId = annotation.id;
  indicator.textContent = "\uD83D\uDCDD"; // 📝
  indicator.title = annotation.comment || "Note";
  indicator.style.cssText = `
    display: inline-block;
    font-size: 12px;
    margin-left: 2px;
    cursor: pointer;
    vertical-align: super;
    line-height: 1;
  `;
  mark.insertAdjacentElement("afterend", indicator);
}

function renderFallbackIndicator(annotation: Annotation): void {
  const indicator = document.createElement("div");
  indicator.className = ARCFLOW_FALLBACK_CLASS;
  indicator.dataset.annotationId = annotation.id;
  indicator.style.cssText = `
    position: absolute;
    left: 8px;
    top: ${annotation.fallbackScrollY}px;
    z-index: 2147483646;
    background: ${annotation.color};
    width: 6px;
    height: 24px;
    border-radius: 3px;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    transition: transform 0.15s;
  `;
  indicator.title = annotation.type === "note"
    ? `Note: ${annotation.comment || annotation.text.slice(0, 50)}`
    : `Highlight: ${annotation.text.slice(0, 50)}`;

  indicator.addEventListener("mouseenter", () => {
    indicator.style.transform = "scaleX(2)";
  });
  indicator.addEventListener("mouseleave", () => {
    indicator.style.transform = "scaleX(1)";
  });

  document.body.appendChild(indicator);
}

function renderAnnotation(annotation: Annotation): void {
  // Try XPath-based rendering first
  const node = resolveXPath(annotation.xpath);
  if (node) {
    const el = node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
    if (el) {
      const range = findTextRange(el, annotation.textOffset, annotation.textLength);
      if (range) {
        const mark = renderHighlightMark(range, annotation);
        if (mark) {
          if (annotation.type === "note") {
            renderNoteIndicator(mark, annotation);
          }
          return;
        }
      }
    }
  }

  // XPath failed — fall back to scrollY with floating indicator
  renderFallbackIndicator(annotation);
}

function clearRenderedAnnotations(): void {
  document.querySelectorAll(`.${ARCFLOW_MARK_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
  });
  document.querySelectorAll(`.${ARCFLOW_NOTE_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`.${ARCFLOW_FALLBACK_CLASS}`).forEach((el) => el.remove());
}

function loadAndRenderAnnotations(): void {
  chrome.runtime.sendMessage(
    { type: "GET_ANNOTATIONS", url: window.location.href },
    (response) => {
      if (chrome.runtime.lastError || !response?.annotations) return;
      const annotations = response.annotations as Annotation[];
      if (annotations.length === 0) return;
      clearRenderedAnnotations();
      for (const annotation of annotations) {
        renderAnnotation(annotation);
      }
    },
  );
}

// Render annotations on page load
loadAndRenderAnnotations();

// Listen for SCROLL_TO_ANNOTATION messages from sidebar
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SCROLL_TO_ANNOTATION") {
    const annotationId = message.annotationId as string;
    // Try to find the mark element
    const mark = document.querySelector(
      `.${ARCFLOW_MARK_CLASS}[data-annotation-id="${annotationId}"]`,
    ) as HTMLElement | null;
    const fallback = document.querySelector(
      `.${ARCFLOW_FALLBACK_CLASS}[data-annotation-id="${annotationId}"]`,
    ) as HTMLElement | null;

    const target = mark || fallback;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      // Brief highlight pulse
      const originalBg = target.style.background;
      target.style.transition = "background 0.3s";
      target.style.background = "rgba(124, 92, 252, 0.4)";
      setTimeout(() => {
        target.style.background = originalBg;
      }, 1500);
    }
  }
});
