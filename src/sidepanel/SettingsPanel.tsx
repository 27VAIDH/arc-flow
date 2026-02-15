import { useEffect, useState } from "react";
import type { Settings } from "../shared/types";
import {
  getSettings,
  updateSettings,
  resetSettings,
} from "../shared/settingsStorage";
import {
  AUTO_ARCHIVE_OPTIONS,
  SUSPEND_THRESHOLD_OPTIONS,
  THEME_OPTIONS,
  WORKSPACE_ISOLATION_OPTIONS,
  AI_PROVIDER_OPTIONS,
} from "../shared/constants";

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: readonly { label: string; value: string | number }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-gray-700 dark:text-gray-300 shrink-0">
        {label}
      </label>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-gray-100 min-w-[120px]"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.settings) {
        const newSettings = changes.settings.newValue as Settings | undefined;
        if (newSettings) setSettings(newSettings);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleUpdate = (data: Partial<Settings>) => {
    if (!settings) return;
    const updated = { ...settings, ...data };
    setSettings(updated);
    updateSettings(data);
  };

  const handleReset = () => {
    if (window.confirm("Reset all settings to their default values?")) {
      resetSettings().then(setSettings);
    }
  };

  if (!settings) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Settings
        </h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded"
          aria-label="Close settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Appearance */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Appearance
          </h3>
          <div className="space-y-3">
            <SelectField
              label="Theme"
              value={settings.theme}
              options={THEME_OPTIONS}
              onChange={(v) =>
                handleUpdate({
                  theme: v as Settings["theme"],
                })
              }
            />
          </div>
        </section>

        {/* Tab Management */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Tab Management
          </h3>
          <div className="space-y-3">
            <SelectField
              label="Auto-archive after"
              value={settings.autoArchiveMinutes}
              options={AUTO_ARCHIVE_OPTIONS}
              onChange={(v) =>
                handleUpdate({ autoArchiveMinutes: parseInt(v, 10) })
              }
            />
            <SelectField
              label="Suspend after"
              value={settings.suspendAfterMinutes}
              options={SUSPEND_THRESHOLD_OPTIONS}
              onChange={(v) =>
                handleUpdate({ suspendAfterMinutes: parseInt(v, 10) })
              }
            />
          </div>
        </section>

        {/* AI Grouping */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            AI-Enhanced Grouping
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700 dark:text-gray-300 shrink-0">
                Enable AI grouping
              </label>
              <button
                onClick={() =>
                  handleUpdate({
                    aiGrouping: {
                      ...settings.aiGrouping,
                      enabled: !settings.aiGrouping.enabled,
                    },
                  })
                }
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.aiGrouping.enabled
                    ? "bg-blue-600"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    settings.aiGrouping.enabled
                      ? "translate-x-4"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {settings.aiGrouping.enabled && (
              <>
                <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Privacy: Only tab titles and URLs are sent to the AI
                    provider. No page content is shared.
                  </p>
                </div>
                <SelectField
                  label="Provider"
                  value={settings.aiGrouping.provider ?? ""}
                  options={AI_PROVIDER_OPTIONS}
                  onChange={(v) =>
                    handleUpdate({
                      aiGrouping: {
                        ...settings.aiGrouping,
                        provider:
                          v === "anthropic" || v === "openai" ? v : null,
                      },
                    })
                  }
                />
                {settings.aiGrouping.provider && (
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm text-gray-700 dark:text-gray-300 shrink-0">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={settings.aiGrouping.apiKey}
                      onChange={(e) =>
                        handleUpdate({
                          aiGrouping: {
                            ...settings.aiGrouping,
                            apiKey: e.target.value,
                          },
                        })
                      }
                      placeholder={
                        settings.aiGrouping.provider === "anthropic"
                          ? "sk-ant-..."
                          : "sk-..."
                      }
                      className="text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-900 dark:text-gray-100 min-w-[120px] w-full max-w-[180px]"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Workspaces */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Workspaces
          </h3>
          <div className="space-y-3">
            <SelectField
              label="Workspace isolation"
              value={settings.workspaceIsolation}
              options={WORKSPACE_ISOLATION_OPTIONS}
              onChange={(v) =>
                handleUpdate({
                  workspaceIsolation: v as Settings["workspaceIsolation"],
                })
              }
            />
          </div>
        </section>

        {/* Reset */}
        <section className="pt-2">
          <button
            onClick={handleReset}
            className="w-full text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded px-3 py-2 text-center"
          >
            Reset to Defaults
          </button>
        </section>
      </div>
    </div>
  );
}
