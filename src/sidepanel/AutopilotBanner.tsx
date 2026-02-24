import { useEffect, useState, useCallback } from "react";
import type { ServiceWorkerMessage } from "../shared/types";

interface AutopilotBannerState {
  workspaceId: string;
  workspaceName: string;
  countdown: number;
}

export default function AutopilotBanner() {
  const [banner, setBanner] = useState<AutopilotBannerState | null>(null);

  useEffect(() => {
    const handleMessage = (message: ServiceWorkerMessage) => {
      if (message.type === "AUTOPILOT_SWITCH") {
        setBanner({
          workspaceId: message.workspaceId,
          workspaceName: message.workspaceName,
          countdown: 10,
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Countdown timer — auto-dismiss after reaching 0
  useEffect(() => {
    if (!banner) return;
    if (banner.countdown <= 0) {
      setBanner(null);
      return;
    }

    const timer = setTimeout(() => {
      setBanner((prev) =>
        prev ? { ...prev, countdown: prev.countdown - 1 } : null
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, [banner]);

  const handleUndo = useCallback(() => {
    chrome.runtime.sendMessage({ type: "AUTOPILOT_UNDO" }).catch(() => {
      // Service worker may not be available
    });
    setBanner(null);
  }, []);

  if (!banner) return null;

  return (
    <div className="mx-3 my-2 px-3 py-2 rounded-lg bg-arc-accent/15 border border-arc-accent/30 flex items-center gap-2 text-xs animate-fade-in">
      <span className="flex-1 text-arc-text dark:text-arc-text-dark">
        Switched to <strong>{banner.workspaceName}</strong>
      </span>
      <button
        onClick={handleUndo}
        className="px-2 py-1 rounded text-arc-accent font-medium hover:bg-arc-accent/20 transition-colors"
      >
        Undo ({banner.countdown}s)
      </button>
    </div>
  );
}
