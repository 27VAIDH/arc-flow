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

  return commands;
}
