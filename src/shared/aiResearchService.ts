import { getSettings } from "./settingsStorage";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.0-flash-001";
const MIN_GAP_MS = 2000;

let lastCallTime = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_GAP_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS - elapsed));
  }
  lastCallTime = Date.now();
}

async function callOpenRouter(
  apiKey: string,
  prompt: string,
  maxTokens: number = 1024
): Promise<string> {
  await waitForRateLimit();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "chrome-extension://arcflow",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

export async function summarizePage(text: string): Promise<string> {
  const settings = await getSettings();
  if (!settings.openRouterApiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  const truncated = text.slice(0, 8000);
  const prompt = `Summarize the following web page content in 2-3 concise paragraphs. Focus on the key points, main arguments, and important details.\n\n${truncated}`;

  return callOpenRouter(settings.openRouterApiKey, prompt, 512);
}

export async function connectPages(summaries: string[]): Promise<string> {
  const settings = await getSettings();
  if (!settings.openRouterApiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  const numbered = summaries.map((s, i) => `Page ${i + 1}:\n${s}`).join("\n\n");
  const prompt = `Analyze the connections between these page summaries. Identify:\n1. Common themes across pages\n2. Contradictions or disagreements\n3. Knowledge gaps (what's missing)\n\nFormat your response with clear sections for each.\n\n${numbered}`;

  return callOpenRouter(settings.openRouterApiKey, prompt, 1024);
}

export async function generateBrief(
  summaries: string[],
  topic: string
): Promise<string> {
  const settings = await getSettings();
  if (!settings.openRouterApiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  const numbered = summaries
    .map((s, i) => `Source ${i + 1}:\n${s}`)
    .join("\n\n");
  const topicClause = topic
    ? `Focus the brief on the topic: "${topic}".`
    : "Determine the main topic from the sources.";
  const prompt = `Generate a comprehensive research brief from these sources. ${topicClause}\n\nFormat with these sections:\n## Summary\nA concise overview of findings.\n\n## Key Findings\nBulleted list of the most important discoveries.\n\n## Sources\nBrief note on what each source contributed.\n\n${numbered}`;

  return callOpenRouter(settings.openRouterApiKey, prompt, 1536);
}
