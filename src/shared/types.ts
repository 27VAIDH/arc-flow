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

// Tab info broadcast from service worker to side panel
export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl: string;
  active: boolean;
  audible: boolean;
  discarded: boolean;
  windowId: number;
}

// Messages sent from service worker to side panel
export type ServiceWorkerMessage =
  | { type: "TABS_UPDATED"; tabs: TabInfo[] }
  | { type: "TAB_ACTIVATED"; tabId: number; windowId: number }
  | {
      type: "TAB_WORKSPACE_MAP_UPDATED";
      tabWorkspaceMap: Record<string, string>;
    };

// Messages sent from side panel to service worker
export type SidePanelMessage =
  | { type: "GET_TABS" }
  | { type: "CLOSE_TAB"; tabId: number }
  | { type: "CLOSE_TABS"; tabIds: number[] }
  | { type: "SWITCH_TAB"; tabId: number }
  | { type: "OPEN_PINNED_APP"; url: string; origin: string }
  | { type: "OPEN_PINNED_APP_NEW_TAB"; url: string }
  | { type: "OPEN_URL"; url: string }
  | { type: "GET_TAB_WORKSPACE_MAP" }
  | { type: "MOVE_TAB_TO_WORKSPACE"; tabId: number; workspaceId: string };

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
