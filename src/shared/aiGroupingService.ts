import type { TabInfo } from "./types";

export interface FolderContext {
  name: string;
  itemCount: number;
}

export interface WorkspaceContext {
  name: string;
}

interface AIGroupSuggestion {
  name: string;
  tabIndices: number[];
  target: "new" | "existing";
  existingFolderName?: string;
  suggestedWorkspace?: string;
}

export interface AIGroupingResult {
  groups: {
    name: string;
    tabs: TabInfo[];
    target: "new" | "existing";
    existingFolderName?: string;
    suggestedWorkspace?: string;
  }[];
  source: "ai" | "fallback";
}

async function callOpenRouterAPI(
  apiKey: string,
  tabs: { title: string; url: string }[],
  folders: FolderContext[],
  workspaces: WorkspaceContext[]
): Promise<AIGroupSuggestion[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const folderContext =
    folders.length > 0
      ? `\n\nExisting folders:\n${JSON.stringify(folders)}`
      : "";
  const workspaceContext =
    workspaces.length > 0
      ? `\n\nWorkspaces:\n${JSON.stringify(workspaces)}`
      : "";

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "chrome-extension://arcflow",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Group these browser tabs into logical folders. Return ONLY a JSON array where each element has "name" (folder name), "tabIndices" (array of 0-based tab indices), "target" ("new" or "existing"), optionally "existingFolderName" (if target is "existing"), and optionally "suggestedWorkspace" (workspace name the group belongs in). Group by topic/purpose, not just domain. Minimum 2 tabs per group. Ungrouped tabs should be omitted. If tabs fit an existing folder, reference it by name instead of creating a new one. Also suggest workspace moves if a tab clearly belongs elsewhere.${folderContext}${workspaceContext}\n\nTabs:\n${JSON.stringify(tabs)}`,
            },
          ],
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return parseAIResponse(text);
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function parseAIResponse(text: string): AIGroupSuggestion[] {
  // Extract JSON array from response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in AI response");

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error("AI response is not an array");

  // Validate structure and normalize new fields
  return parsed
    .filter(
      (item: unknown): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).name === "string" &&
        Array.isArray((item as Record<string, unknown>).tabIndices) &&
        ((item as Record<string, unknown>).tabIndices as unknown[]).every(
          (i) => typeof i === "number"
        )
    )
    .filter((item) => (item.tabIndices as number[]).length >= 2)
    .map((item) => {
      const target =
        item.target === "new" || item.target === "existing"
          ? item.target
          : "new";
      return {
        name: item.name as string,
        tabIndices: item.tabIndices as number[],
        target,
        ...(target === "existing" &&
          typeof item.existingFolderName === "string" && {
            existingFolderName: item.existingFolderName,
          }),
        ...(typeof item.suggestedWorkspace === "string" && {
          suggestedWorkspace: item.suggestedWorkspace,
        }),
      };
    });
}

export async function getAIGroupingSuggestions(
  tabs: TabInfo[],
  openRouterApiKey: string,
  folders: FolderContext[] = [],
  workspaces: WorkspaceContext[] = []
): Promise<AIGroupingResult> {
  if (!openRouterApiKey) {
    return { groups: [], source: "fallback" };
  }

  const tabPayload = tabs.map((t) => ({ title: t.title, url: t.url }));

  try {
    const suggestions = await callOpenRouterAPI(
      openRouterApiKey,
      tabPayload,
      folders,
      workspaces
    );

    // Convert indices to actual tab objects
    const groups = suggestions
      .map((s) => ({
        name: s.name,
        tabs: s.tabIndices
          .filter((i) => i >= 0 && i < tabs.length)
          .map((i) => tabs[i]),
        target: s.target,
        existingFolderName: s.existingFolderName,
        suggestedWorkspace: s.suggestedWorkspace,
      }))
      .filter((g) => g.tabs.length >= 2);

    if (groups.length === 0) {
      return { groups: [], source: "fallback" };
    }

    return { groups, source: "ai" };
  } catch (error) {
    console.error(
      "OpenRouter AI grouping failed, falling back to heuristic:",
      error
    );
    return { groups: [], source: "fallback" };
  }
}
