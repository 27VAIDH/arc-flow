import { useEffect, useRef, type ReactNode } from "react";

interface PopoverProps {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export default function Popover({
  x,
  y,
  onClose,
  children,
  className = "",
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      ref.current.style.left = `${Math.max(4, vw - rect.width - 4)}px`;
    }
    if (rect.bottom > vh) {
      ref.current.style.top = `${Math.max(4, vh - rect.height - 4)}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={ref}
      className={`fixed z-50 min-w-[160px] py-1 rounded-xl shadow-2xl bg-white dark:bg-[#23233a] border border-gray-200 dark:border-white/[0.08] animate-slide-up ${className}`}
      style={{ left: x, top: y }}
    >
      {children}
    </div>
  );
}
