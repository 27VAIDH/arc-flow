import { useEffect, useRef } from "react";
import Popover from "./Popover";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: ContextMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus first item on mount
  useEffect(() => {
    const firstBtn = containerRef.current?.querySelector("button");
    firstBtn?.focus();
  }, []);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const buttons = containerRef.current?.querySelectorAll("button");
    if (!buttons || buttons.length === 0) return;
    const focused = document.activeElement as HTMLElement;
    const idx = Array.from(buttons).indexOf(focused as HTMLButtonElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = idx < buttons.length - 1 ? idx + 1 : 0;
      buttons[next].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = idx > 0 ? idx - 1 : buttons.length - 1;
      buttons[prev].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      buttons[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      buttons[buttons.length - 1].focus();
    }
  };

  return (
    <Popover x={x} y={y} onClose={onClose}>
      <div
        ref={containerRef}
        role="menu"
        aria-label="Context menu"
        onKeyDown={handleMenuKeyDown}
      >
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-arc-text-primary hover:bg-gray-100 dark:hover:bg-arc-surface-hover focus:outline-none focus:bg-gray-100 dark:focus:bg-arc-surface-hover transition-colors duration-200"
          >
            {item.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}
