import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  autoArchiveMinutes: 720, // 12 hours
  suspendAfterMinutes: 720, // 12 hours
  workspaceIsolation: "sidebar-only",
  focusMode: {
    enabled: false,
    redirectRules: [],
  },
  aiGrouping: {
    enabled: false,
    provider: null,
    apiKey: "",
  },
  routingRules: [],
};

export const AUTO_ARCHIVE_OPTIONS = [
  { label: "1 hour", value: 60 },
  { label: "4 hours", value: 240 },
  { label: "12 hours", value: 720 },
  { label: "24 hours", value: 1440 },
  { label: "48 hours", value: 2880 },
  { label: "1 week", value: 10080 },
  { label: "Never", value: 0 },
] as const;

export const SUSPEND_THRESHOLD_OPTIONS = [
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "4 hours", value: 240 },
  { label: "12 hours", value: 720 },
  { label: "24 hours", value: 1440 },
  { label: "Never", value: 0 },
] as const;

export const THEME_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

export const WORKSPACE_ISOLATION_OPTIONS = [
  { label: "Sidebar only", value: "sidebar-only" },
  { label: "Full isolation", value: "full-isolation" },
] as const;
