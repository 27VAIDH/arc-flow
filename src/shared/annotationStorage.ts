import type { Annotation } from "./types";

const STORAGE_KEY = "annotations";

async function getAll(): Promise<Annotation[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as Annotation[]) || [];
}

async function setAll(annotations: Annotation[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: annotations });
}

export async function saveAnnotation(a: Annotation): Promise<void> {
  const annotations = await getAll();
  const idx = annotations.findIndex((x) => x.id === a.id);
  if (idx >= 0) {
    annotations[idx] = a;
  } else {
    annotations.push(a);
  }
  await setAll(annotations);
}

export async function getAnnotationsForUrl(url: string): Promise<Annotation[]> {
  const annotations = await getAll();
  return annotations.filter((a) => a.url === url);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const annotations = await getAll();
  await setAll(annotations.filter((a) => a.id !== id));
}

export async function getAllAnnotations(): Promise<Annotation[]> {
  return getAll();
}

export async function exportAnnotations(
  format: "json" | "markdown"
): Promise<string> {
  const annotations = await getAll();

  if (format === "json") {
    return JSON.stringify(annotations, null, 2);
  }

  // Markdown: group by page URL
  const byPage = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const key = a.url;
    if (!byPage.has(key)) {
      byPage.set(key, []);
    }
    byPage.get(key)!.push(a);
  }

  const lines: string[] = ["# Annotations", ""];

  for (const [url, pageAnnotations] of byPage) {
    const title = pageAnnotations[0].pageTitle || url;
    lines.push(`## ${title}`);
    lines.push(`URL: ${url}`, "");

    for (const a of pageAnnotations) {
      const date = new Date(a.createdAt).toLocaleString();
      const colorEmoji =
        a.color === "#FFEB3B"
          ? "🟡"
          : a.color === "#81C784"
            ? "🟢"
            : a.color === "#64B5F6"
              ? "🔵"
              : "⚪";
      if (a.type === "highlight") {
        lines.push(`> ${colorEmoji} ${a.text}`);
        lines.push(`> — *${date}*`);
      } else {
        lines.push(`> ${colorEmoji} ${a.text}`);
        lines.push(`> **Note:** ${a.comment || ""}`);
        lines.push(`> — *${date}*`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
