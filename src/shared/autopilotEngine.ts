import type { AutopilotRule, AutopilotCondition, AutopilotContext, ScoredRule } from './types';

function matchTimeCondition(value: string, currentTime: Date): boolean {
  const match = value.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) return false;

  const startHour = parseInt(match[1], 10);
  const startMin = parseInt(match[2], 10);
  const endHour = parseInt(match[3], 10);
  const endMin = parseInt(match[4], 10);

  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Handle ranges that cross midnight (e.g., '22:00-06:00')
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function matchDomainCondition(value: string, activeTabUrl: string): boolean {
  try {
    const url = new URL(activeTabUrl);
    const hostname = url.hostname;

    // Support wildcard patterns like '*.example.com' or exact match like 'example.com'
    if (value.startsWith('*.')) {
      const suffix = value.slice(2);
      return hostname === suffix || hostname.endsWith('.' + suffix);
    }
    return hostname === value || hostname.endsWith('.' + value);
  } catch {
    return false;
  }
}

function matchDisplayCountCondition(value: string, displayCount: number): boolean {
  const expected = parseInt(value, 10);
  if (isNaN(expected)) return false;
  return displayCount === expected;
}

function matchCondition(condition: AutopilotCondition, context: AutopilotContext): boolean {
  switch (condition.type) {
    case 'time':
      return matchTimeCondition(condition.value, context.currentTime);
    case 'domain':
      return matchDomainCondition(condition.value, context.activeTabUrl);
    case 'displayCount':
      return matchDisplayCountCondition(condition.value, context.displayCount);
    default:
      return false;
  }
}

export function scoreRules(rules: AutopilotRule[], context: AutopilotContext): ScoredRule[] {
  const scored: ScoredRule[] = [];

  for (const rule of rules) {
    if (!rule.enabled || rule.conditions.length === 0) continue;

    let matchedCount = 0;
    let allMatched = true;

    for (const condition of rule.conditions) {
      if (matchCondition(condition, context)) {
        matchedCount++;
      } else {
        allMatched = false;
      }
    }

    // Only include rules where ALL conditions match
    if (allMatched) {
      scored.push({
        rule,
        score: matchedCount * rule.priority,
      });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function getBestMatch(rules: AutopilotRule[], context: AutopilotContext): AutopilotRule | null {
  const scored = scoreRules(rules, context);
  return scored.length > 0 ? scored[0].rule : null;
}
