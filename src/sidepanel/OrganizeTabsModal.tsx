import { useEffect, useMemo, useRef, useState } from "react";
import type { TabInfo, Folder, FolderItem } from "../shared/types";
import { createFolder, addItemToFolder } from "../shared/folderStorage";
import { getAIGroupingSuggestions } from "../shared/aiGroupingService";
import { getSettings } from "../shared/settingsStorage";

interface TabGroup {
  name: string;
  hostname: string;
  tabs: TabInfo[];
}

/**
 * Extract a clean display name from a hostname.
 * Strips 'www.' prefix and capitalizes the domain name.
 * E.g., 'www.github.com' -> 'GitHub', 'docs.google.com' -> 'Google Docs'
 */
function getDisplayName(hostname: string): string {
  // Strip www. prefix
  const cleanHost = hostname.replace(/^www\./, "");

  // Known domain -> friendly name mappings
  const knownDomains: Record<string, string> = {
    "github.com": "GitHub",
    "mail.google.com": "Gmail",
    "docs.google.com": "Google Docs",
    "drive.google.com": "Google Drive",
    "calendar.google.com": "Google Calendar",
    "meet.google.com": "Google Meet",
    "youtube.com": "YouTube",
    "stackoverflow.com": "Stack Overflow",
    "reddit.com": "Reddit",
    "twitter.com": "Twitter",
    "x.com": "X",
    "linkedin.com": "LinkedIn",
    "slack.com": "Slack",
    "notion.so": "Notion",
    "figma.com": "Figma",
    "vercel.com": "Vercel",
    "netlify.com": "Netlify",
    "amazon.com": "Amazon",
    "wikipedia.org": "Wikipedia",
    "medium.com": "Medium",
    "discord.com": "Discord",
    "twitch.tv": "Twitch",
    "spotify.com": "Spotify",
    "netflix.com": "Netflix",
    "facebook.com": "Facebook",
    "instagram.com": "Instagram",
    "whatsapp.com": "WhatsApp",
    "dropbox.com": "Dropbox",
    "trello.com": "Trello",
    "jira.atlassian.net": "Jira",
    "confluence.atlassian.net": "Confluence",
  };

  // Check if cleanHost matches a known domain
  if (knownDomains[cleanHost]) return knownDomains[cleanHost];

  // Check if cleanHost is a subdomain of a known domain
  for (const [domain, name] of Object.entries(knownDomains)) {
    if (cleanHost.endsWith("." + domain)) return name;
  }

  // Generic: extract the main domain name and capitalize
  const parts = cleanHost.split(".");
  // For subdomains like 'app.example.com', merge to parent 'example.com'
  // Take the second-to-last part as the main name
  const mainPart = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
}

/**
 * Merge subdomains to their parent domain.
 * E.g., 'docs.google.com' and 'mail.google.com' both map to 'google.com'
 */
function getParentDomain(hostname: string): string {
  const cleanHost = hostname.replace(/^www\./, "");
  const parts = cleanHost.split(".");
  if (parts.length <= 2) return cleanHost;
  // Return the last two parts (e.g., 'google.com' from 'docs.google.com')
  return parts.slice(-2).join(".");
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Group ungrouped tabs by domain patterns.
 * - Strips 'www.' prefix
 * - Merges subdomains to parent domain
 * - Only suggests groups with 2+ tabs
 * - Excludes tabs already in folders
 */
function groupTabsByDomain(tabs: TabInfo[], folders: Folder[]): TabGroup[] {
  // Collect all tab IDs that are already in folders
  const tabIdsInFolders = new Set<number>();
  for (const folder of folders) {
    for (const item of folder.items) {
      if (item.type === "tab" && item.tabId != null) {
        tabIdsInFolders.add(item.tabId);
      }
    }
  }

  // Filter to ungrouped tabs with valid URLs
  const ungroupedTabs = tabs.filter((tab) => {
    if (tabIdsInFolders.has(tab.id)) return false;
    const hostname = getHostname(tab.url);
    // Exclude chrome:// and edge:// internal pages
    return (
      hostname !== "" &&
      !tab.url.startsWith("chrome://") &&
      !tab.url.startsWith("edge://")
    );
  });

  // Group by parent domain
  const domainMap = new Map<string, TabInfo[]>();
  for (const tab of ungroupedTabs) {
    const hostname = getHostname(tab.url);
    const parentDomain = getParentDomain(hostname);
    const existing = domainMap.get(parentDomain) ?? [];
    existing.push(tab);
    domainMap.set(parentDomain, existing);
  }

  // Only keep groups with 2+ tabs
  const groups: TabGroup[] = [];
  for (const [domain, groupTabs] of domainMap) {
    if (groupTabs.length >= 2) {
      groups.push({
        name: getDisplayName(domain),
        hostname: domain,
        tabs: groupTabs,
      });
    }
  }

  // Sort by number of tabs descending
  groups.sort((a, b) => b.tabs.length - a.tabs.length);

  return groups;
}

export default function OrganizeTabsModal({
  tabs,
  folders,
  onClose,
}: {
  tabs: TabInfo[];
  folders: Folder[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [aiGroups, setAiGroups] = useState<TabGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupingSource, setGroupingSource] = useState<"domain" | "ai">(
    "domain"
  );

  const domainGroups = useMemo(
    () => groupTabsByDomain(tabs, folders),
    [tabs, folders]
  );

  // Try AI grouping on mount
  useEffect(() => {
    let cancelled = false;
    async function tryAIGrouping() {
      const settings = await getSettings();
      if (
        !settings.aiGrouping.enabled ||
        !settings.aiGrouping.provider ||
        !settings.aiGrouping.apiKey
      ) {
        return;
      }

      // Collect tab IDs already in folders
      const tabIdsInFolders = new Set<number>();
      for (const folder of folders) {
        for (const item of folder.items) {
          if (item.type === "tab" && item.tabId != null) {
            tabIdsInFolders.add(item.tabId);
          }
        }
      }

      // Filter to ungrouped tabs
      const ungroupedTabs = tabs.filter((tab) => {
        if (tabIdsInFolders.has(tab.id)) return false;
        return (
          !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://")
        );
      });

      if (ungroupedTabs.length < 2) return;

      setLoading(true);
      const result = await getAIGroupingSuggestions(
        ungroupedTabs,
        settings.aiGrouping
      );

      if (cancelled) return;
      setLoading(false);

      if (result.source === "ai" && result.groups.length > 0) {
        const aiTabGroups: TabGroup[] = result.groups.map((g, i) => ({
          name: g.name,
          hostname: `ai-group-${i}`,
          tabs: g.tabs,
        }));
        setAiGroups(aiTabGroups);
        setTimeout(() => {
          setGroupingSource("ai");
          setSelectedGroups(new Set(aiTabGroups.map((g) => g.hostname)));
        }, 0);
      }
    }

    tryAIGrouping();
    return () => {
      cancelled = true;
    };
  }, [tabs, folders]);

  const groups = aiGroups && groupingSource === "ai" ? aiGroups : domainGroups;

  // Select all groups by default (for domain groups)
  useEffect(() => {
    if (groupingSource === "domain") {
      setTimeout(() => {
        const allHostnames = new Set(domainGroups.map((g) => g.hostname));
        setSelectedGroups(allHostnames);
      }, 0);
    }
  }, [domainGroups, groupingSource]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const toggleGroup = (hostname: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(hostname)) {
        next.delete(hostname);
      } else {
        next.add(hostname);
      }
      return next;
    });
  };

  const handleAcceptSelected = async () => {
    setApplying(true);
    try {
      for (const group of groups) {
        if (!selectedGroups.has(group.hostname)) continue;
        // Create the folder
        const folder = await createFolder(group.name);
        // Add each tab as a FolderItem
        for (const tab of group.tabs) {
          const newItem: FolderItem = {
            id: crypto.randomUUID(),
            type: "tab",
            tabId: tab.id,
            url: tab.url,
            title: tab.title || tab.url,
            favicon: tab.favIconUrl || "",
            isArchived: false,
            lastActiveAt: Date.now(),
          };
          await addItemToFolder(folder.id, newItem);
        }
      }
      onClose();
    } catch {
      // Silently fail — folder creation errors are non-critical
      onClose();
    }
  };

  const handleAcceptAll = async () => {
    // Select all then apply
    setSelectedGroups(new Set(groups.map((g) => g.hostname)));
    setApplying(true);
    try {
      for (const group of groups) {
        const folder = await createFolder(group.name);
        for (const tab of group.tabs) {
          const newItem: FolderItem = {
            id: crypto.randomUUID(),
            type: "tab",
            tabId: tab.id,
            url: tab.url,
            title: tab.title || tab.url,
            favicon: tab.favIconUrl || "",
            isArchived: false,
            lastActiveAt: Date.now(),
          };
          await addItemToFolder(folder.id, newItem);
        }
      }
      onClose();
    } catch {
      onClose();
    }
  };

  if (loading) {
    return (
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
        role="dialog"
        aria-modal="true"
        aria-label="Organize Tabs"
      >
        <div
          ref={ref}
          className="w-[320px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-4"
        >
          <h2 className="text-sm font-semibold mb-2">Organize Tabs</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Analyzing tabs with AI...
          </p>
          <div className="flex justify-center">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
        role="dialog"
        aria-modal="true"
        aria-label="Organize Tabs"
      >
        <div
          ref={ref}
          className="w-[320px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-4"
        >
          <h2 className="text-sm font-semibold mb-2">Organize Tabs</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            No grouping suggestions available. Tabs are either already organized
            or there aren&apos;t enough tabs from the same domain (minimum 2
            needed).
          </p>
          <button
            onClick={onClose}
            className="w-full px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Organize Tabs"
    >
      <div
        ref={ref}
        className="w-[360px] max-h-[80vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold">Organize Tabs</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {groups.length} group{groups.length !== 1 ? "s" : ""} suggested
            {groupingSource === "ai" ? " by AI" : " based on domains"}
          </p>
        </div>

        {/* Group list */}
        <div className="flex-1 overflow-y-auto p-2">
          {groups.map((group) => (
            <div
              key={group.hostname}
              className="mb-2 rounded border border-gray-200 dark:border-gray-600"
            >
              <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750">
                <input
                  type="checkbox"
                  checked={selectedGroups.has(group.hostname)}
                  onChange={() => toggleGroup(group.hostname)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400"
                >
                  <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z" />
                </svg>
                <span className="text-sm font-medium flex-1">{group.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {group.tabs.length} tabs
                </span>
              </label>
              {/* Tab preview list */}
              <div className="px-3 pb-2">
                {group.tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className="flex items-center gap-2 py-0.5 text-xs text-gray-500 dark:text-gray-400"
                  >
                    {tab.favIconUrl ? (
                      <img
                        src={tab.favIconUrl}
                        alt=""
                        className="w-3 h-3 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="w-3 h-3 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
                    )}
                    <span className="truncate">{tab.title || tab.url}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={applying}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            Dismiss
          </button>
          <div className="flex-1" />
          <button
            onClick={handleAcceptSelected}
            disabled={applying || selectedGroups.size === 0}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50"
          >
            {applying
              ? "Applying..."
              : `Accept Selected (${selectedGroups.size})`}
          </button>
          <button
            onClick={handleAcceptAll}
            disabled={applying}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
