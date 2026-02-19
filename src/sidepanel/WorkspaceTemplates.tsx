import { useState } from "react";
import { WORKSPACE_TEMPLATES } from "../shared/templates";

interface WorkspaceTemplatesProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (templateId: string | null) => void;
}

export default function WorkspaceTemplates({
  isOpen,
  onClose,
  onCreate,
}: WorkspaceTemplatesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = () => {
    onCreate(selectedId);
    setSelectedId(null);
  };

  const handleCancel = () => {
    setSelectedId(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Create Workspace"
      onKeyDown={(e) => {
        if (e.key === "Escape") handleCancel();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          Create Workspace
        </h2>

        {/* Blank workspace option */}
        <button
          className={`mb-3 flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
            selectedId === null
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500"
          }`}
          onClick={() => setSelectedId(null)}
          aria-label="Create blank workspace"
        >
          <span className="text-xl">➕</span>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Blank Workspace
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Start from scratch
            </div>
          </div>
        </button>

        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Or start from a template
          </span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
        </div>

        {/* Template grid */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {WORKSPACE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                selectedId === template.id
                  ? "bg-opacity-10 dark:bg-opacity-20"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500"
              }`}
              style={
                selectedId === template.id
                  ? {
                      borderColor: template.accentColor,
                      backgroundColor: `${template.accentColor}15`,
                    }
                  : undefined
              }
              onClick={() => setSelectedId(template.id)}
              aria-label={`Create ${template.name} workspace with ${template.pinnedApps.length} apps and ${template.folders.length} folders`}
            >
              <div className="mb-1 text-xl">{template.emoji}</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {template.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {template.pinnedApps.length} apps &middot;{" "}
                {template.folders.length} folders
              </div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            onClick={handleCreate}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
