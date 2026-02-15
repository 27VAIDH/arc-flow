import type { TabInfo } from "./types";
import type { Settings } from "./types";

interface AIGroupSuggestion {
  name: string;
  tabIndices: number[];
}

interface AIGroupingResult {
  groups: { name: string; tabs: TabInfo[] }[];
  source: "ai" | "fallback";
}

async function callAnthropicAPI(
  apiKey: string,
  tabs: { title: string; url: string }[]
): Promise<AIGroupSuggestion[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Group these browser tabs into logical folders. Return ONLY a JSON array where each element has "name" (folder name) and "tabIndices" (array of 0-based tab indices). Group by topic/purpose, not just domain. Minimum 2 tabs per group. Ungrouped tabs should be omitted.\n\nTabs:\n${JSON.stringify(tabs)}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";
    return parseAIResponse(text);
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

async function callOpenAIAPI(
  apiKey: string,
  tabs: { title: string; url: string }[]
): Promise<AIGroupSuggestion[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Group these browser tabs into logical folders. Return ONLY a JSON array where each element has "name" (folder name) and "tabIndices" (array of 0-based tab indices). Group by topic/purpose, not just domain. Minimum 2 tabs per group. Ungrouped tabs should be omitted.\n\nTabs:\n${JSON.stringify(tabs)}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
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

  // Validate structure
  return parsed
    .filter(
      (item: unknown): item is { name: string; tabIndices: number[] } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).name === "string" &&
        Array.isArray((item as Record<string, unknown>).tabIndices) &&
        ((item as Record<string, unknown>).tabIndices as unknown[]).every(
          (i) => typeof i === "number"
        )
    )
    .filter((item) => item.tabIndices.length >= 2);
}

export async function getAIGroupingSuggestions(
  tabs: TabInfo[],
  settings: Settings["aiGrouping"]
): Promise<AIGroupingResult> {
  if (!settings.enabled || !settings.provider || !settings.apiKey) {
    return { groups: [], source: "fallback" };
  }

  const tabPayload = tabs.map((t) => ({ title: t.title, url: t.url }));

  try {
    let suggestions: AIGroupSuggestion[];
    if (settings.provider === "anthropic") {
      suggestions = await callAnthropicAPI(settings.apiKey, tabPayload);
    } else {
      suggestions = await callOpenAIAPI(settings.apiKey, tabPayload);
    }

    // Convert indices to actual tab objects
    const groups = suggestions
      .map((s) => ({
        name: s.name,
        tabs: s.tabIndices
          .filter((i) => i >= 0 && i < tabs.length)
          .map((i) => tabs[i]),
      }))
      .filter((g) => g.tabs.length >= 2);

    if (groups.length === 0) {
      return { groups: [], source: "fallback" };
    }

    return { groups, source: "ai" };
  } catch {
    return { groups: [], source: "fallback" };
  }
}
