import { useCallback, useEffect, useState } from "react";
import { addPinnedApp, getPinnedApps } from "../shared/storage";
import { createFolder } from "../shared/folderStorage";
import { setOnboardingCompleted } from "../shared/onboardingStorage";
import { WORKSPACE_TEMPLATES } from "../shared/templates";
import {
  createWorkspaceFromTemplate,
  setActiveWorkspace,
} from "../shared/workspaceStorage";

interface TopSite {
  url: string;
  title: string;
  favicon: string;
  selected: boolean;
}

function getFavicon(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `${origin}/favicon.ico`;
  } catch {
    return "";
  }
}

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [topSites, setTopSites] = useState<TopSite[]>([]);
  const [folderName, setFolderName] = useState("");
  const [folderCreated, setFolderCreated] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [templateApplied, setTemplateApplied] = useState(false);

  useEffect(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    chrome.history
      .search({ text: "", maxResults: 10, startTime: thirtyDaysAgo })
      .then((items) => {
        const seen = new Set<string>();
        const sites: TopSite[] = [];
        for (const item of items) {
          if (!item.url) continue;
          try {
            const origin = new URL(item.url).origin;
            if (seen.has(origin)) continue;
            seen.add(origin);
            sites.push({
              url: item.url,
              title: item.title || origin,
              favicon: getFavicon(item.url),
              selected: false,
            });
          } catch {
            // skip invalid URLs
          }
        }
        setTopSites(sites);
      })
      .catch(() => {
        // history API may not be available
      });
  }, []);

  const toggleSite = useCallback((idx: number) => {
    setTopSites((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, selected: !s.selected } : s))
    );
  }, []);

  const handlePinSelected = useCallback(async () => {
    setPinning(true);
    const existing = await getPinnedApps();
    const existingOrigins = new Set(
      existing.map((p) => {
        try {
          return new URL(p.url).origin;
        } catch {
          return "";
        }
      })
    );
    const selected = topSites.filter(
      (s) =>
        s.selected &&
        !existingOrigins.has(
          (() => {
            try {
              return new URL(s.url).origin;
            } catch {
              return "";
            }
          })()
        )
    );
    for (const site of selected) {
      try {
        await addPinnedApp({
          id: crypto.randomUUID(),
          url: site.url,
          title: site.title,
          favicon: site.favicon,
        });
        existing.push({
          id: "",
          url: site.url,
          title: site.title,
          favicon: site.favicon,
          sortOrder: 0,
        });
      } catch {
        // max 12 limit reached
        break;
      }
    }
    setPinning(false);
    setStep(1);
  }, [topSites]);

  const handleCreateFolder = useCallback(async () => {
    if (!folderName.trim()) return;
    await createFolder(folderName.trim());
    setFolderCreated(true);
  }, [folderName]);

  const handleApplyTemplate = useCallback(async () => {
    if (!selectedTemplateId) return;
    try {
      const ws = await createWorkspaceFromTemplate(selectedTemplateId);
      await setActiveWorkspace(ws.id);
      setTemplateApplied(true);
    } catch {
      // Ignore errors
    }
  }, [selectedTemplateId]);

  const handleFinish = useCallback(async () => {
    await setOnboardingCompleted();
    onComplete();
  }, [onComplete]);

  const handleSkip = useCallback(async () => {
    await setOnboardingCompleted();
    onComplete();
  }, [onComplete]);

  const stepCount = 4;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to ArcFlow"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-semibold">Welcome to ArcFlow</h1>
        <button
          onClick={handleSkip}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Skip
        </button>
      </div>

      {/* Step indicator dots */}
      <div className="flex items-center justify-center gap-2 py-3">
        {Array.from({ length: stepCount }, (_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === step
                ? "bg-blue-600 dark:bg-blue-400"
                : i < step
                  ? "bg-blue-300 dark:bg-blue-700"
                  : "bg-gray-300 dark:bg-gray-600"
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium mb-1">
                Pin your favorite apps
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Select sites you visit often to pin them to your sidebar for
                quick access.
              </p>
            </div>
            {topSites.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                No browsing history found.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {topSites.map((site, i) => (
                  <li key={site.url}>
                    <button
                      onClick={() => toggleSite(i)}
                      className={`flex items-center gap-3 w-full px-3 py-2 rounded text-sm text-left transition-colors ${
                        site.selected
                          ? "bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400 dark:ring-blue-600"
                          : "hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          site.selected
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        {site.selected && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="w-3 h-3"
                          >
                            <path
                              fillRule="evenodd"
                              d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      {site.favicon ? (
                        <img
                          src={site.favicon}
                          alt=""
                          className="w-4 h-4 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <span className="w-4 h-4 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
                      )}
                      <span className="truncate">{site.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium mb-1">
                Start with a template
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Templates set up a workspace with relevant apps and folders. You
                can skip this and create workspaces later.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {WORKSPACE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`rounded-lg border-2 p-3 text-left transition-colors ${
                    selectedTemplateId === template.id
                      ? "bg-opacity-10 dark:bg-opacity-20"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500"
                  }`}
                  style={
                    selectedTemplateId === template.id
                      ? {
                          borderColor: template.accentColor,
                          backgroundColor: `${template.accentColor}15`,
                        }
                      : undefined
                  }
                  disabled={templateApplied}
                >
                  <div className="mb-1 text-xl">{template.emoji}</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {template.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {template.pinnedApps.length} apps &middot;{" "}
                    {template.folders.length} folders
                  </div>
                </button>
              ))}
            </div>
            {templateApplied && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Workspace created! You can switch to it from the workspace bar.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium mb-1">
                Create your first folder
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Folders help you organize tabs by project, topic, or however you
                like.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g., Work, Research, Shopping..."
                className="flex-1 px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                }}
                disabled={folderCreated}
              />
              <button
                onClick={handleCreateFolder}
                disabled={!folderName.trim() || folderCreated}
                className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {folderCreated ? "Created!" : "Create"}
              </button>
            </div>
            {folderCreated && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Folder &quot;{folderName}&quot; created. You can create more
                later from the sidebar.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-medium mb-1">Explore features</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Here are the key areas of ArcFlow to get you started.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              <li className="flex items-start gap-3 p-3 rounded bg-gray-100 dark:bg-gray-800">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium">Search</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Quickly find any tab, folder, or saved link with fuzzy
                    search.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3 p-3 rounded bg-gray-100 dark:bg-gray-800">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 shrink-0 text-purple-600 dark:text-purple-400 mt-0.5"
                >
                  <path d="M15.988 3.012A2.25 2.25 0 0 0 14.134 2h-8.27A2.25 2.25 0 0 0 4.012 3.012L2 8v6.75A2.25 2.25 0 0 0 4.25 17h11.5A2.25 2.25 0 0 0 18 14.75V8l-2.012-4.988Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium">Workspaces</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Separate your browsing into contexts like Work, Personal, or
                    Research.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3 p-3 rounded bg-gray-100 dark:bg-gray-800">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 shrink-0 text-gray-600 dark:text-gray-400 mt-0.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium">Settings</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Configure auto-archive, themes, focus mode, and more from
                    the gear icon.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            if (step > 0) setStep(step - 1);
          }}
          disabled={step === 0}
          className="px-3 py-1.5 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Back
        </button>
        <button
          onClick={handleSkip}
          className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Skip
        </button>
        {step === 0 && (
          <button
            onClick={() => {
              const hasSelected = topSites.some((s) => s.selected);
              if (hasSelected) {
                handlePinSelected();
              } else {
                setStep(1);
              }
            }}
            disabled={pinning}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pinning
              ? "Pinning..."
              : topSites.some((s) => s.selected)
                ? "Pin & Next"
                : "Next"}
          </button>
        )}
        {step === 1 && (
          <button
            onClick={() => {
              if (selectedTemplateId && !templateApplied) {
                handleApplyTemplate().then(() => setStep(2));
              } else {
                setStep(2);
              }
            }}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            {selectedTemplateId && !templateApplied ? "Create & Next" : "Next"}
          </button>
        )}
        {step === 2 && (
          <button
            onClick={() => setStep(3)}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Next
          </button>
        )}
        {step === 3 && (
          <button
            onClick={handleFinish}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Get Started
          </button>
        )}
      </div>
    </div>
  );
}
