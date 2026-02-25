import { useEffect } from "react";
import TimeMachineSection from "./TimeMachineSection";
import AnnotationsSection from "./AnnotationsSection";
import TabGraphSection from "./TabGraphSection";
import ResearchCopilotSection from "./ResearchCopilotSection";

export default function ToolsPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-gray-50 dark:bg-[var(--color-arc-panel-bg)]"
      role="dialog"
      aria-modal="true"
      aria-label="Tools"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200/80 dark:border-arc-border">
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-arc-text-secondary dark:hover:text-gray-200 rounded-lg transition-colors duration-200"
          aria-label="Back to sidebar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-arc-text-primary tracking-tight">
          Tools
        </h2>
      </div>

      {/* Tools Content */}
      <div className="flex-1 overflow-y-auto">
        <TimeMachineSection />
        <AnnotationsSection />
        <TabGraphSection />
        <ResearchCopilotSection />
      </div>
    </div>
  );
}
