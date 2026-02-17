import { useEffect, useRef } from "react";

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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Focus first item on mount
  useEffect(() => {
    const firstBtn = menuRef.current?.querySelector("button");
    firstBtn?.focus();
  }, []);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${vw - rect.width - 4}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${vh - rect.height - 4}px`;
    }
  }, [x, y]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const buttons = menuRef.current?.querySelectorAll("button");
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
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      className="fixed z-50 min-w-[160px] py-1 rounded-xl shadow-xl bg-white dark:bg-arc-surface border border-gray-200 dark:border-arc-border animate-slide-up"
      style={{ left: x, top: y }}
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
  );
}
