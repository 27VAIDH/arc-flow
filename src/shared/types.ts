export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  accentColor: string;
  pinnedApps: PinnedApp[];
  folders: Folder[];
  sortOrder: number;
  notes: string;
  notesCollapsed: boolean;
  notesLastEditedAt: number;
  panelColor?: string;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  emoji: string;
  accentColor: string;
  pinnedApps: { url: string; title: string }[];
  folders: string[];
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
    }
  | { type: "OPEN_COMMAND_PALETTE" }
  | { type: "tab-auto-routed"; tabId: number; workspaceId: string }
  | { type: "workspace-suggestion-ready" }
  | {
      type: "duplicate-tab-detected";
      newTabId: number;
      existingTabId: number;
      existingWorkspaceId: string;
      existingWorkspaceName: string;
    }
  | { type: "notes-saved-from-page"; workspaceName: string }
  | { type: "snippet-saved"; workspaceName: string };

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
  | { type: "MOVE_TAB_TO_WORKSPACE"; tabId: number; workspaceId: string }
  | { type: "SUSPEND_TAB"; tabId: number }
  | { type: "SPLIT_VIEW"; tabId: number }
  | {
      type: "UPDATE_FOCUS_MODE";
      enabled: boolean;
      redirectRules: { blockedPattern: string; redirectUrl: string }[];
    }
  | { type: "GET_TAB_INFO"; tabId: number };

export interface Session {
  id: string;
  name: string;
  savedAt: number;
  workspaceSnapshot: {
    pinnedApps: PinnedApp[];
    folders: Folder[];
  };
  tabUrls: { url: string; title: string; favicon: string }[];
}

export interface RoutingRule {
  pattern: string;
  workspaceId: string;
  enabled: boolean;
}

export interface WorkspaceSuggestion {
  suggest: boolean;
  name: string;
  emoji: string;
  reason: string;
  tabIds: number[];
  createdAt: number;
}

export interface RecentlyClosedTab {
  url: string;
  title: string;
  favicon: string;
  workspaceId: string;
  closedAt: number;
}

export interface Snippet {
  id: string;
  text: string;
  annotation: string;
  sourceUrl: string;
  sourceTitle: string;
  savedAt: number;
}

export interface NavigationEvent {
  id: string;
  tabId: number;
  url: string;
  title: string;
  timestamp: number;
  transitionType: string;
  referrerTabId?: number;
  sessionId: string;
}

export interface NavTreeNode {
  event: NavigationEvent;
  children: NavTreeNode[];
}

export interface TabSwitchEntry {
  from: number;
  to: number;
  timestamp: number;
}

export interface Annotation {
  id: string;
  url: string;
  pageTitle: string;
  type: 'highlight' | 'note';
  text: string;
  comment?: string;
  color: string;
  xpath: string;
  textOffset: number;
  textLength: number;
  fallbackScrollY: number;
  createdAt: number;
}

export interface AutopilotCondition {
  type: 'time' | 'domain' | 'displayCount';
  value: string;
}

export interface AutopilotRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: AutopilotCondition[];
  targetWorkspaceId: string;
  priority: number;
  createdAt: number;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  autoArchiveMinutes: number;
  suspendAfterMinutes: number;
  focusMode: {
    enabled: boolean;
    redirectRules: { blockedPattern: string; redirectUrl: string }[];
  };
  openRouterApiKey: string;
  routingRules: RoutingRule[];
  accentColor: string;
  panelColor: string;
  omniboxEnabled: boolean;
  timeMachineEnabled: boolean;
  timeMachineRetentionDays: number;
  autopilotEnabled: boolean;
  autopilotNotify: boolean;
}
