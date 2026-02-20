// Tab Energy Score System
// Score 1-100 based on freshness (0-40), visit frequency (0-30), and memory estimate (0-30)

export interface TabEnergyInput {
  tabId: number;
  url: string;
  active: boolean;
}

// Media-heavy domains that typically use more memory
const MEDIA_DOMAINS = new Set([
  "youtube.com",
  "netflix.com",
  "twitch.tv",
  "spotify.com",
  "vimeo.com",
  "dailymotion.com",
  "hulu.com",
  "disneyplus.com",
  "primevideo.com",
  "soundcloud.com",
]);

function getFreshnessScore(lastActiveMs: number, isActive: boolean): number {
  if (isActive) return 40;
  if (lastActiveMs <= 0) return 0;

  const elapsed = Date.now() - lastActiveMs;
  const ONE_HOUR = 60 * 60 * 1000;
  const FOUR_HOURS = 4 * ONE_HOUR;
  const ONE_DAY = 24 * ONE_HOUR;
  const THREE_DAYS = 3 * ONE_DAY;

  if (elapsed < ONE_HOUR) return 35;
  if (elapsed < FOUR_HOURS) return 25;
  if (elapsed < ONE_DAY) return 15;
  if (elapsed < THREE_DAYS) return 5;
  return 0;
}

function getVisitFrequencyScore(activationCount: number): number {
  if (activationCount >= 10) return 30;
  if (activationCount >= 5) return 20;
  if (activationCount >= 2) return 10;
  if (activationCount >= 1) return 5;
  return 0;
}

function getMemoryEstimateScore(url: string): number {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Check if domain or parent domain is a media site
    for (const media of MEDIA_DOMAINS) {
      if (hostname === media || hostname.endsWith(`.${media}`)) {
        return 10;
      }
    }
    return 20; // Unknown/general pages
  } catch {
    return 20;
  }
}

/**
 * Calculate energy score for a tab.
 * @param tab - Tab info (tabId, url, active)
 * @param activationCount - Number of activations in the last 24 hours
 * @param lastActiveAt - Timestamp of last activation (0 if never tracked)
 * @returns Score from 1-100
 */
export function calculateEnergyScore(
  tab: TabEnergyInput,
  activationCount: number,
  lastActiveAt: number
): number {
  const freshness = getFreshnessScore(lastActiveAt, tab.active);
  const frequency = getVisitFrequencyScore(activationCount);
  const memory = getMemoryEstimateScore(tab.url);

  const total = freshness + frequency + memory;
  // Clamp to 1-100
  return Math.max(1, Math.min(100, total));
}
