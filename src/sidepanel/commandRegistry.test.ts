import { buildCommands } from "./commandRegistry";
import type { Workspace } from "../shared/types";

const noop = () => {};

const defaultHandlers = {
  onSwitchWorkspace: noop,
  onCreateFolder: noop,
  onSuspendOthers: noop,
  onToggleTheme: noop,
  onOpenSettings: noop,
  onSearchTabs: noop,
  onNewWorkspace: noop,
  onToggleFocusMode: noop,
  onSplitView: noop,
  onSaveSession: noop,
  onRestoreSession: noop,
  onFocusNotes: noop,
  onToggleDeepWork: noop,
  onRestoreYesterdayTabs: noop,
  onExportWorkspace: noop,
  onImportWorkspace: noop,
  onTimeMachine: noop,
  onAnnotations: noop,
  onTabGraph: noop,
};

describe("buildCommands", () => {
  it("returns static commands when there are no workspaces", () => {
    const commands = buildCommands({ workspaces: [], ...defaultHandlers });

    const ids = commands.map((c) => c.id);
    expect(ids).toContain("new-folder");
    expect(ids).toContain("toggle-theme");
    expect(ids).toContain("open-settings");
    expect(ids).not.toContain(expect.stringContaining("switch-workspace-"));
  });

  it("generates a switch command for each workspace", () => {
    const workspaces: Workspace[] = [
      {
        id: "ws-1",
        name: "Work",
        emoji: "💼",
        accentColor: "#ff0000",
        pinnedApps: [],
        folders: [],
        sortOrder: 0,
        notes: "",
        notesCollapsed: true,
        notesLastEditedAt: 0,
      },
      {
        id: "ws-2",
        name: "Personal",
        emoji: "🏠",
        accentColor: "#00ff00",
        pinnedApps: [],
        folders: [],
        sortOrder: 1,
        notes: "",
        notesCollapsed: true,
        notesLastEditedAt: 0,
      },
    ];

    const commands = buildCommands({ workspaces, ...defaultHandlers });

    const switchCmds = commands.filter((c) =>
      c.id.startsWith("switch-workspace-")
    );
    expect(switchCmds).toHaveLength(2);
    expect(switchCmds[0].name).toContain("Work");
    expect(switchCmds[1].name).toContain("Personal");
  });

  it("calls the correct handler when a command action is invoked", () => {
    const onToggleTheme = vi.fn();
    const commands = buildCommands({
      workspaces: [],
      ...defaultHandlers,
      onToggleTheme,
    });

    const themeCmd = commands.find((c) => c.id === "toggle-theme");
    themeCmd?.action();

    expect(onToggleTheme).toHaveBeenCalledOnce();
  });
});
