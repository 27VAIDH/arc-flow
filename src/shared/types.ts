export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  accentColor: string;
  pinnedApps: PinnedApp[];
  folders: Folder[];
  sortOrder: number;
}

export interface PinnedApp {
  id: string;
  url: string;
  title: string;
  favicon: string;
  sortOrder: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  items: FolderItem[];
  isCollapsed: boolean;
  sortOrder: number;
}

export interface FolderItem {
  id: string;
  type: "tab" | "link";
  tabId: number | null;
  url: string;
  title: string;
  favicon: string;
  isArchived: boolean;
  lastActiveAt: number;
}

export interface ArchiveEntry {
  id: string;
  url: string;
  title: string;
  favicon: string;
  archivedAt: number;
  workspaceId: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  autoArchiveMinutes: number;
  suspendAfterMinutes: number;
  workspaceIsolation: "sidebar-only" | "full-isolation";
  focusMode: {
    enabled: boolean;
    redirectRules: { blockedPattern: string; redirectUrl: string }[];
  };
  aiGrouping: {
    enabled: boolean;
    provider: "anthropic" | "openai" | null;
    apiKey: string;
  };
  routingRules: { pattern: string; workspaceId: string }[];
}
