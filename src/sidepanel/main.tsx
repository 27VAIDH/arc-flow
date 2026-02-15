import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Mark navigation start for performance measurement
performance.mark("arcflow-render-start");

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Measure initial render time after first paint
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    performance.mark("arcflow-render-end");
    performance.measure(
      "arcflow-initial-render",
      "arcflow-render-start",
      "arcflow-render-end"
    );
    const entry = performance.getEntriesByName("arcflow-initial-render")[0];
    if (entry) {
      console.log(`[ArcFlow] Initial render: ${entry.duration.toFixed(1)}ms`);
    }
  });
});
