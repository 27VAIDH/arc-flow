import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";

export interface Command {
  id: string;
  name: string;
  shortcut?: string;
  icon: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

const RECENT_COMMANDS_KEY = "commandPaletteRecent";
const MAX_VISIBLE = 8;

export default function CommandPalette({
  commands,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Load recent commands on mount
  useEffect(() => {
    chrome.storage.local.get(RECENT_COMMANDS_KEY, (result) => {
      const ids = (result[RECENT_COMMANDS_KEY] as string[] | undefined) ?? [];
      setRecentIds(ids);
    });
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(commands, {
        keys: [{ name: "name", weight: 1 }],
        threshold: 0.4,
        includeScore: true,
      }),
    [commands]
  );

  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show recent commands first, then the rest
      const recent: Command[] = [];
      const rest: Command[] = [];
      for (const cmd of commands) {
        if (recentIds.includes(cmd.id)) {
          recent.push(cmd);
        } else {
          rest.push(cmd);
        }
      }
      // Sort recent by their order in recentIds
      recent.sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
      return [...recent, ...rest];
    }
    return fuse.search(query).map((result) => result.item);
  }, [query, commands, fuse, recentIds]);

  const visibleCommands = filteredCommands.slice(0, MAX_VISIBLE);

  const executeCommand = useCallback(
    (command: Command) => {
      // Save to recent
      const updated = [
        command.id,
        ...recentIds.filter((id) => id !== command.id),
      ].slice(0, 5);
      chrome.storage.local.set({ [RECENT_COMMANDS_KEY]: updated });

      onClose();
      command.action();
    },
    [onClose, recentIds]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < visibleCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : visibleCommands.length - 1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (visibleCommands[selectedIndex]) {
          executeCommand(visibleCommands[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [visibleCommands, selectedIndex, executeCommand, onClose]
  );

  // Reset selection when query changes
  useEffect(() => {
    const timer = setTimeout(() => setSelectedIndex(0), 0);
    return () => clearTimeout(timer);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const iconMap: Record<string, React.ReactNode> = {
    workspace: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path
          fillRule="evenodd"
          d="M3.25 3A2.25 2.25 0 0 0 1 5.25v9.5A2.25 2.25 0 0 0 3.25 17h13.5A2.25 2.25 0 0 0 19 14.75v-9.5A2.25 2.25 0 0 0 16.75 3H3.25ZM2.5 9v5.75c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75V9h-7.25v3a.75.75 0 0 1-1.5 0V9H2.5Z"
          clipRule="evenodd"
        />
      </svg>
    ),
    folder: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z" />
      </svg>
    ),
    suspend: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" />
      </svg>
    ),
    theme: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.061-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.061-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.061ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.061Z" />
      </svg>
    ),
    settings: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path
          fillRule="evenodd"
          d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          clipRule="evenodd"
        />
      </svg>
    ),
    search: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
    ),
    plus: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
      </svg>
    ),
    focus: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path
          fillRule="evenodd"
          d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
          clipRule="evenodd"
        />
      </svg>
    ),
    split: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path
          fillRule="evenodd"
          d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v11.5A2.25 2.25 0 0 1 15.75 18H4.25A2.25 2.25 0 0 1 2 15.75V4.25ZM9.25 3.5H4.25a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5V3.5Zm1.5 13h5a.75.75 0 0 0 .75-.75V4.25a.75.75 0 0 0-.75-.75h-5v13Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  };

  const getIcon = (iconName: string): React.ReactNode => {
    return (
      iconMap[iconName] ?? (
        <span className="w-4 h-4 flex items-center justify-center text-xs">
          {iconName}
        </span>
      )
    );
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center pt-16"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-frosted"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-[480px] max-w-[calc(100%-32px)] bg-white dark:bg-arc-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-arc-border overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200/80 dark:border-arc-border">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5 text-gray-400 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-arc-text-primary placeholder-gray-400 dark:placeholder-arc-text-secondary"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={
              visibleCommands[selectedIndex]
                ? `cmd-${visibleCommands[selectedIndex].id}`
                : undefined
            }
            aria-autocomplete="list"
          />
          <kbd className="text-xs text-gray-400 dark:text-arc-text-secondary bg-gray-100 dark:bg-arc-surface-hover px-1.5 py-0.5 rounded-md">
            esc
          </kbd>
        </div>

        {/* Command list */}
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[320px] overflow-y-auto py-1"
        >
          {visibleCommands.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-arc-text-secondary">
              No commands found
            </div>
          ) : (
            visibleCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                id={`cmd-${cmd.id}`}
                role="option"
                aria-selected={index === selectedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  executeCommand(cmd);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors duration-100 ${
                  index === selectedIndex
                    ? "bg-indigo-50 dark:bg-arc-accent/10 text-arc-accent dark:text-arc-accent-hover"
                    : "text-gray-700 dark:text-arc-text-primary hover:bg-gray-50 dark:hover:bg-arc-surface-hover"
                }`}
              >
                <span className="shrink-0 text-gray-500 dark:text-arc-text-secondary">
                  {getIcon(cmd.icon)}
                </span>
                <span className="flex-1 truncate">{cmd.name}</span>
                {cmd.shortcut && (
                  <kbd className="text-xs text-gray-400 dark:text-arc-text-secondary bg-gray-100 dark:bg-arc-surface-hover px-1.5 py-0.5 rounded-md shrink-0">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
