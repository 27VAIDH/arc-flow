import { resetChromeStore } from "../test/chrome.mock";
import {
  getPinnedApps,
  addPinnedApp,
  removePinnedApp,
  reorderPinnedApps,
} from "./storage";

beforeEach(() => {
  resetChromeStore();
  vi.clearAllMocks();
});

describe("pinnedApps storage", () => {
  it("returns an empty array when nothing is stored", async () => {
    const apps = await getPinnedApps();
    expect(apps).toEqual([]);
  });

  it("adds a pinned app and retrieves it", async () => {
    const app = await addPinnedApp({
      id: "app-1",
      url: "https://example.com",
      title: "Example",
      favicon: "https://example.com/favicon.ico",
    });

    expect(app.sortOrder).toBe(0);

    const apps = await getPinnedApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].url).toBe("https://example.com");
  });

  it("removes a pinned app", async () => {
    await addPinnedApp({
      id: "app-1",
      url: "https://example.com",
      title: "Example",
      favicon: "",
    });
    await addPinnedApp({
      id: "app-2",
      url: "https://other.com",
      title: "Other",
      favicon: "",
    });

    await removePinnedApp("app-1");

    const apps = await getPinnedApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe("app-2");
  });

  it("enforces the maximum pinned apps limit", async () => {
    for (let i = 0; i < 12; i++) {
      await addPinnedApp({ id: `app-${i}`, url: "", title: "", favicon: "" });
    }

    await expect(
      addPinnedApp({ id: "app-13", url: "", title: "", favicon: "" })
    ).rejects.toThrow(/Maximum/);
  });

  it("reorders pinned apps", async () => {
    await addPinnedApp({ id: "a", url: "", title: "A", favicon: "" });
    await addPinnedApp({ id: "b", url: "", title: "B", favicon: "" });
    await addPinnedApp({ id: "c", url: "", title: "C", favicon: "" });

    await reorderPinnedApps(["c", "a", "b"]);

    const apps = await getPinnedApps();
    expect(apps.map((a) => a.id)).toEqual(["c", "a", "b"]);
  });
});
