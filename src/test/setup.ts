import "@testing-library/jest-dom/vitest";
import { chromeMock } from "./chrome.mock";

// Provide a global chrome stub so modules that reference chrome.* can be imported
Object.defineProperty(globalThis, "chrome", { value: chromeMock });
