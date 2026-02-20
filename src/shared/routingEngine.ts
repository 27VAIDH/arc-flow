import type { RoutingRule } from "./types";

/**
 * Convert a glob pattern to a RegExp.
 * - `**` matches everything (including `/`)
 * - `*` matches anything except `/`
 * - All other regex special chars are escaped.
 *
 * The pattern is matched against the full URL (protocol + host + path).
 */
function globToRegex(pattern: string): RegExp {
  // Escape regex special characters except * which we handle specially
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      regexStr += ".*";
      i += 2;
    } else if (pattern[i] === "*") {
      regexStr += "[^/]*";
      i += 1;
    } else if ("{}()[]^$+?.\\|".includes(pattern[i])) {
      regexStr += "\\" + pattern[i];
      i += 1;
    } else {
      regexStr += pattern[i];
      i += 1;
    }
  }
  return new RegExp("^" + regexStr + "$", "i");
}

/**
 * Match a URL against a list of routing rules.
 * Returns the workspaceId of the first matching enabled rule, or null if none match.
 *
 * The pattern is matched against the URL without the protocol prefix,
 * so `github.com/*` matches `https://github.com/repo`.
 * Patterns starting with `*.` match any subdomain,
 * so `*.google.com/*` matches `https://docs.google.com/page`.
 */
export function matchRoute(
  url: string,
  rules: RoutingRule[]
): string | null {
  // Strip protocol (https://, http://) for matching
  const urlWithoutProtocol = url.replace(/^https?:\/\//, "");

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const regex = globToRegex(rule.pattern);

    // Try matching against URL without protocol
    if (regex.test(urlWithoutProtocol)) {
      return rule.workspaceId;
    }

    // Also try matching against full URL (for patterns that include protocol like *://domain/*)
    if (regex.test(url)) {
      return rule.workspaceId;
    }
  }

  return null;
}
