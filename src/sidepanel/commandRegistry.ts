import type { Workspace } from "../shared/types";
import type { Command } from "./CommandPalette";

export function buildCommands({
  workspaces,
  onSwitchWorkspace,
  onCreateFolder,
  onSuspendOthers,
  onToggleTheme,
  onOpenSettings,
  onSearchTabs,
  onNewWorkspace,
  onToggleFocusMode,
  onSplitView,
  onSaveSession,
  onRestoreSession,
  onFocusNotes,
  onToggleDeepWork,
  onRestoreYesterdayTabs,
  onExportWorkspace,
  onImportWorkspace,
  onTimeMachine,
  onAnnotations,
  onTabGraph,
}: {
  workspaces: Workspace[];
  onSwitchWorkspace: (workspaceId: string) => void;
  onCreateFolder: () => void;
  onSuspendOthers: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onSearchTabs: () => void;
  onNewWorkspace: () => void;
  onToggleFocusMode: () => void;
  onSplitView: () => void;
  onSaveSession: () => void;
  onRestoreSession: () => void;
  onFocusNotes: () => void;
  onToggleDeepWork: () => void;
  onRestoreYesterdayTabs: () => void;
  onExportWorkspace: () => void;
  onImportWorkspace: () => void;
  onTimeMachine: () => void;
  onAnnotations: () => void;
  onTabGraph: () => void;
}): Command[] {
  const commands: Command[] = [];

  // Switch Workspace commands (one per workspace)
  for (const ws of workspaces) {
    commands.push({
      id: `switch-workspace-${ws.id}`,
      name: `Switch to ${ws.emoji} ${ws.name}`,
      icon: "workspace",
      action: () => onSwitchWorkspace(ws.id),
    });
  }

  commands.push({
    id: "new-folder",
    name: "New Folder",
    icon: "folder",
    action: onCreateFolder,
  });

  commands.push({
    id: "suspend-others",
    name: "Suspend Other Tabs",
    icon: "suspend",
    action: onSuspendOthers,
  });

  commands.push({
    id: "toggle-theme",
    name: "Toggle Theme",
    icon: "theme",
    action: onToggleTheme,
  });

  commands.push({
    id: "open-settings",
    name: "Open Settings",
    icon: "settings",
    action: onOpenSettings,
  });

  commands.push({
    id: "search-tabs",
    name: "Search Tabs",
    icon: "search",
    action: onSearchTabs,
  });

  commands.push({
    id: "new-workspace",
    name: "New Workspace",
    icon: "plus",
    action: onNewWorkspace,
  });

  commands.push({
    id: "toggle-focus-mode",
    name: "Toggle Focus Mode",
    icon: "focus",
    action: onToggleFocusMode,
  });

  commands.push({
    id: "split-view",
    name: "Split View Current Tab",
    icon: "split",
    action: onSplitView,
  });

  commands.push({
    id: "save-session",
    name: "Save Session",
    icon: "save",
    action: onSaveSession,
  });

  commands.push({
    id: "restore-session",
    name: "Restore Session",
    icon: "restore",
    action: onRestoreSession,
  });

  commands.push({
    id: "focus-notes",
    name: "Focus Workspace Notes",
    icon: "notes",
    action: onFocusNotes,
  });

  commands.push({
    id: "toggle-deep-work",
    name: "Toggle Deep Work Mode",
    icon: "focus",
    action: onToggleDeepWork,
  });

  commands.push({
    id: "restore-yesterday-tabs",
    name: "Restore yesterday's tabs",
    icon: "restore",
    action: onRestoreYesterdayTabs,
  });

  commands.push({
    id: "export-workspace",
    name: "Export current workspace",
    icon: "save",
    action: onExportWorkspace,
  });

  commands.push({
    id: "import-workspace",
    name: "Import workspace",
    icon: "restore",
    action: onImportWorkspace,
  });

  commands.push({
    id: "time-machine",
    name: "Time Machine",
    icon: "restore",
    action: onTimeMachine,
  });

  commands.push({
    id: "annotations",
    name: "Annotations",
    icon: "notes",
    action: onAnnotations,
  });

  commands.push({
    id: "tab-graph",
    name: "Tab Graph",
    icon: "workspace",
    action: onTabGraph,
  });

  return commands;
}
