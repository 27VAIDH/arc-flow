import { vi } from "vitest";

/**
 * Minimal mock of the chrome.* APIs used across ArcFlow.
 * Expand as needed when new tests touch additional Chrome APIs.
 */

const store: Record<string, unknown> = {};

const storageMock = {
  get: vi.fn(async (keys: string | string[]) => {
    if (typeof keys === "string") {
      return { [keys]: store[keys] };
    }
    const result: Record<string, unknown> = {};
    for (const k of keys) result[k] = store[k];
    return result;
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    const arr = typeof keys === "string" ? [keys] : keys;
    for (const k of arr) delete store[k];
  }),
  clear: vi.fn(async () => {
    for (const k of Object.keys(store)) delete store[k];
  }),
};

export const chromeMock = {
  storage: {
    local: storageMock,
    sync: storageMock,
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
  },
  tabs: {
    query: vi.fn(async () => []),
    update: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
  },
  sidePanel: {
    setOptions: vi.fn(),
    open: vi.fn(),
  },
};

/** Helper to reset the in-memory store between tests */
export function resetChromeStore() {
  for (const k of Object.keys(store)) delete store[k];
}
