import { useEffect, useState, useRef } from "react";
import type { PinnedApp, TabInfo } from "../shared/types";
import { getPinnedApps } from "../shared/storage";

interface PinnedAppsRowProps {
  tabs: TabInfo[];
}

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export default function PinnedAppsRow({ tabs }: PinnedAppsRowProps) {
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPinnedApps().then(setPinnedApps);

    // Listen for storage changes to pinned apps
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.pinnedApps) {
        const apps = (changes.pinnedApps.newValue as PinnedApp[]) ?? [];
        setPinnedApps(apps.sort((a, b) => a.sortOrder - b.sortOrder));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  if (pinnedApps.length === 0) return null;

  // Build set of origins that have open tabs
  const activeOrigins = new Set(
    tabs.map((t) => getOrigin(t.url)).filter(Boolean)
  );

  const handleClick = (app: PinnedApp) => {
    const origin = getOrigin(app.url);
    chrome.runtime.sendMessage({
      type: "OPEN_PINNED_APP",
      url: app.url,
      origin,
    });
  };

  return (
    <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-none"
      >
        {pinnedApps.map((app) => {
          const origin = getOrigin(app.url);
          const hasOpenTab = activeOrigins.has(origin);

          return (
            <button
              key={app.id}
              onClick={() => handleClick(app)}
              className="flex flex-col items-center shrink-0 group"
              title={app.title}
              aria-label={`Open ${app.title}`}
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                {app.favicon ? (
                  <img
                    src={app.favicon}
                    alt=""
                    className="w-5 h-5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    {app.title.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {/* Active indicator dot */}
              <div
                className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                  hasOpenTab ? "bg-[#2E75B6]" : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
