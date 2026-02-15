# ArcFlow - Structured Product Requirements Document

**Version:** 1.0 | **Date:** February 2026
**Author:** Vaidh | **Status:** Implementation-Ready
**Source:** Converted from `ArcFlow_PRD_v1.md` (narrative PRD)

---

## 1. Product Overview

ArcFlow is an open-source Chrome extension that brings Arc Browser's sidebar-first navigation to Google Chrome. It leverages Chrome's Side Panel API to deliver a persistent vertical sidebar with pinned apps, folder-based tab organization, workspaces, intelligent tab lifecycle management, and a command palette.

### 1.1 Vision Statement

> "ArcFlow transforms Chrome's side panel into a command center for your browsing life -- organizing tabs into contextual workspaces, surfacing what matters, and archiving what doesn't -- so you can focus on your work, not your browser."

### 1.2 Design Principles

1. **Sidebar-First, Not Tab-Bar Replacement** -- Complement Chrome's existing UI; the native tab bar remains available.
2. **Progressive Complexity** -- Value in 30 seconds for new users; depth over weeks for power users.
3. **Zero-Config Defaults, Full Customization** -- Sensible defaults; every behavior configurable.
4. **Performance is a Feature** -- Negligible memory/CPU overhead; suspension and lazy loading are first-class.
5. **Data Ownership** -- All data local via `chrome.storage`. No external servers, no telemetry, no accounts.
6. **Open Source First** -- MIT-licensed, community contributions welcome.

### 1.3 Target Users

| Persona | Description | Key Need |
|---------|-------------|----------|
| Knowledge Worker | 6+ hrs/day in browser, 15-40+ tabs, multiple work projects | Context separation, quick switching |
| Researcher / Student | Dozens of tabs per session, needs to pause/resume research | Session persistence, folder organization |
| Tab Hoarder | 50-100+ tabs, "might need this later" anxiety | Auto-cleanup, confident recovery |

---

## 2. Resolved Decisions

These open questions from the narrative PRD are resolved:

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| D-1 | Naming | Keep "ArcFlow" as working title; rename before Chrome Web Store launch | Avoid trademark risk at launch; fine for development |
| D-2 | Tab bar behavior | Do NOT hide Chrome's native tab bar | CSS injection on chrome pages is fragile; complementary layer is the design principle |
| D-3 | Sync strategy | Local-only (`chrome.storage.local`) for v1; optional sync deferred to post-launch | `chrome.storage.sync` 100KB limit is too restrictive; avoids complexity |
| D-4 | AI grouping backend | On-device heuristics (domain clustering, keyword extraction) by default; optional opt-in LLM | Privacy-first default; power users can opt in |
| D-5 | Mobile companion | Desktop-only; no mobile companion | Chrome Android extensions are limited; focus resources |
| D-6 | Monetization | Free and open-source for now; decision deferred | Build user base first; premature to gate features |
| D-7 | Relationship with existing extensions | Standalone alternative, not integration layer | Clean architecture; no dependency on third-party extension APIs |

---

## 3. Scope & Non-Goals

### 3.1 In Scope (v1)

- Persistent sidebar via Chrome Side Panel API
- Pinned apps with favicons, reordering, active indicators
- Folder-based tab organization with nesting (up to 3 levels)
- Workspace isolation with independent pinned apps, folders, tabs
- Tab auto-archiving with configurable thresholds
- Tab suspension via `chrome.tabs.discard()`
- Command palette for keyboard-driven actions
- Fuzzy tab search across open tabs, saved links, history
- Light/dark theme (system preference + manual toggle)
- AI tab grouping via on-device heuristics
- Split view via side-by-side window management
- Air Traffic Control (domain-based link routing)
- Session save/restore with JSON import/export
- Focus mode with URL redirect rules
- Onboarding flow for first-time users

### 3.2 Non-Goals

- **NG-1:** Hiding or replacing Chrome's native tab bar
- **NG-2:** Mobile or Android companion app
- **NG-3:** Cross-browser sync or cloud storage in v1
- **NG-4:** Account system or user authentication
- **NG-5:** Telemetry, analytics, or any data sent to external servers
- **NG-6:** Integration with or interoperability with other sidebar extensions
- **NG-7:** CSS injection / Boosts (Arc's custom CSS per-site feature)
- **NG-8:** Media controls or picture-in-picture management
- **NG-9:** Container / profile isolation (beyond workspace-level separation)
- **NG-10:** Team collaboration or shared workspace features

---

## 4. Technical Stack & Architecture

### 4.1 Technology Choices

| Component | Technology | Purpose |
|-----------|-----------|---------|
| UI Framework | React 18 | Side panel single-page application |
| Styling | Tailwind CSS | Utility-first styling, dark mode support |
| Language | TypeScript | Type safety across all extension components |
| Build Tool | Vite | Fast builds, HMR during development, Chrome extension plugin |
| Extension Format | Manifest V3 | Required for Chrome Web Store; service worker model |
| Storage | `chrome.storage.local` | Persist all user data locally |
| Icons | Lucide React | UI control icons; real favicons for tabs/sites |
| Virtual List | `react-window` | Performant rendering for 100+ tab lists |

### 4.2 Chrome API Permission Map

| Permission | API | Used For |
|-----------|-----|----------|
| `sidePanel` | `chrome.sidePanel` | Core sidebar registration and rendering |
| `tabs` | `chrome.tabs.*` | Tab CRUD, switching, discarding, querying |
| `tabGroups` | `chrome.tabGroups.*` | Native tab group integration |
| `storage` | `chrome.storage.local` | Persist workspaces, folders, pinned apps, settings |
| `alarms` | `chrome.alarms` | Auto-archive timers, suspension scheduler |
| `contextMenus` | `chrome.contextMenus` | Right-click "Pin to ArcFlow" |
| `history` | `chrome.history.search()` | Tab search across recent history |
| `commands` | `chrome.commands` | Configurable keyboard shortcuts |

### 4.3 Data Model

```
Workspace {
  id: string (uuid)
  name: string
  emoji: string
  color: string (hex)
  pinnedApps: PinnedApp[]
  folders: Folder[]
  isDefault: boolean
  createdAt: number (timestamp)
}

PinnedApp {
  id: string (uuid)
  url: string
  title: string
  favicon: string (url)
  sortOrder: number
}

Folder {
  id: string (uuid)
  name: string
  parentId: string | null   // null = top-level; supports nesting up to 3 levels
  items: FolderItem[]
  isCollapsed: boolean
  sortOrder: number
}

FolderItem {
  id: string (uuid)
  type: 'tab' | 'link'
  tabId: number | null      // non-null only when type='tab' and tab is open
  url: string
  title: string
  favicon: string
  isArchived: boolean
  lastActiveAt: number (timestamp)
}

ArchiveEntry {
  url: string
  title: string
  favicon: string
  archivedAt: number (timestamp)
  fromWorkspaceId: string
  fromFolderId: string | null
}

Settings {
  autoArchiveMinutes: number        // default: 720 (12 hours)
  theme: 'system' | 'light' | 'dark'
  keyboardShortcuts: Record<string, string>
  focusMode: {
    enabled: boolean
    redirectRules: { from: string, to: string }[]
  }
  suspendAfterMinutes: number       // default: 60
  workspaceIsolation: boolean       // default: true
}
```

### 4.4 Performance Budget

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Initial sidebar render | < 200ms | Time from panel open to first paint |
| Tab switch latency | < 50ms | Time from sidebar click to tab activation |
| Memory overhead (idle) | < 15MB | Extension process memory with 50 tabs |
| Memory overhead (active) | < 30MB | Extension process memory during interaction |
| Storage footprint | < 5MB | Local storage for 5 workspaces, 200 items |
| Background CPU | < 0.1% | Service worker idle CPU usage |

### 4.5 Extension File Structure (Target)

```
arc-flow/
  manifest.json           # MV3 manifest
  src/
    sidepanel/            # React SPA for the side panel
      index.html
      main.tsx
      App.tsx
      components/
      hooks/
      stores/             # State management
    background/
      service-worker.ts   # Tab events, alarms, storage
    content/
      content.ts          # Minimal: context menu support
    shared/
      types.ts            # Shared TypeScript types
      constants.ts
      storage.ts          # chrome.storage helpers
  public/
    icons/                # Extension icons (16, 48, 128)
  tailwind.config.ts
  vite.config.ts
  tsconfig.json
  package.json
```

---

## 5. UI Layout Specification

The sidebar is organized into five vertical zones (top to bottom):

| Zone | Name | Content | Height |
|------|------|---------|--------|
| Z1 | Search Bar | Compact search input; expands to overlay when focused | ~40px |
| Z2 | Pinned Apps Row | Horizontal scrollable row of favicon circles (32x32px), max 12 | ~48px |
| Z3 | Folder/Tab Tree | Scrollable tree view of folders and tabs (primary content) | ~60-70% |
| Z4 | Archive Section | Collapsible list of recently archived tabs (last 10) | ~15% |
| Z5 | Footer Bar | Workspace switcher icons, settings gear, focus mode toggle, memory stats | ~48px |

### Visual Design Tokens

| Token | Value |
|-------|-------|
| Base font | Inter or system font stack |
| Tab title size | 13px |
| URL/metadata size | 11px |
| Folder name size | 14px |
| Base spacing unit | 8px |
| Tab item gap | 4px |
| Folder gap | 12px |
| Section padding | 16px |
| Active accent | `#2E75B6` |
| Transition duration | 150ms |
| Icon set | Lucide |

---

## 6. Feature Tiers & User Stories

### Tier Overview

| Tier | Theme | Sprint | Weeks |
|------|-------|--------|-------|
| P0 | Core Sidebar Experience | 1-2 | 1-4 |
| P1 | Workspace Intelligence | 3-4 | 5-8 |
| P2 | Power User Features | 5-6 | 9-12 |

---

### 6.1 P0 -- Core Sidebar Experience (Sprint 1-2)

#### US-001: Project Scaffolding

**As a** developer,
**I want** a fully configured project with Vite + React 18 + TypeScript + Tailwind CSS + Manifest V3,
**so that** I can begin building extension features immediately.

**Acceptance Criteria:**
- [ ] AC-001.1: `npm run dev` starts Vite dev server with HMR for the side panel
- [ ] AC-001.2: `npm run build` produces a `dist/` folder loadable as an unpacked Chrome extension
- [ ] AC-001.3: `manifest.json` declares MV3 with `side_panel`, `service_worker`, permissions: `sidePanel`, `tabs`, `storage`, `contextMenus`
- [ ] AC-001.4: TypeScript strict mode enabled; no `any` types in scaffolding code
- [ ] AC-001.5: Tailwind CSS configured with dark mode (`class` strategy)
- [ ] AC-001.6: ESLint + Prettier configured with a single `npm run lint` command
- [ ] AC-001.7: Verify in browser: extension loads without errors in `chrome://extensions`

**Functional Requirements:**
- FR-001.1: Use Vite with `@crxjs/vite-plugin` or equivalent for Chrome extension HMR support
- FR-001.2: Source code organized per the file structure in Section 4.5
- FR-001.3: Shared types file (`src/shared/types.ts`) includes all data model interfaces from Section 4.3

---

#### US-002: Side Panel Registration and Basic Rendering

**As a** user,
**I want** to open ArcFlow's sidebar by clicking the extension icon,
**so that** I see the ArcFlow panel alongside my browsing content.

**Acceptance Criteria:**
- [ ] AC-002.1: Clicking the toolbar icon opens the side panel on the right side of the browser
- [ ] AC-002.2: The side panel renders a React application with the ArcFlow header/logo
- [ ] AC-002.3: The panel persists across tab switches (does not close when switching tabs)
- [ ] AC-002.4: The panel persists across page navigations within a tab
- [ ] AC-002.5: The panel state (open/closed) persists across browser restarts
- [ ] AC-002.6: Verify in browser: open panel, switch tabs, navigate pages -- panel remains visible

**Functional Requirements:**
- FR-002.1: Register side panel via `chrome.sidePanel.setOptions()` in the service worker
- FR-002.2: Side panel HTML points to the React SPA entry point (`sidepanel/index.html`)
- FR-002.3: Use `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` for toolbar icon toggle

---

#### US-003: Service Worker with Tab Event Listeners

**As a** developer,
**I want** the service worker to track all tab lifecycle events,
**so that** the sidebar always reflects the current state of open tabs.

**Acceptance Criteria:**
- [ ] AC-003.1: Service worker registers listeners for `tabs.onCreated`, `tabs.onRemoved`, `tabs.onActivated`, `tabs.onUpdated`, `tabs.onMoved`
- [ ] AC-003.2: Tab state changes are broadcast to the side panel within 100ms
- [ ] AC-003.3: Service worker recovers gracefully from suspension (MV3 service workers can be terminated)
- [ ] AC-003.4: On service worker startup, it queries all existing tabs to build initial state

**Functional Requirements:**
- FR-003.1: Use `chrome.runtime.onMessage` / `chrome.runtime.sendMessage` for service worker <-> side panel communication
- FR-003.2: Tab events are debounced at 50ms to batch rapid changes (e.g., restoring a session)
- FR-003.3: Service worker persists critical state to `chrome.storage.local` so it survives termination

---

#### US-004: Tab List Display

**As a** user,
**I want** to see all my open tabs listed in the sidebar with favicons and titles,
**so that** I can visually scan and identify my tabs without using the native tab bar.

**Acceptance Criteria:**
- [ ] AC-004.1: All open tabs in the current window are listed in the sidebar
- [ ] AC-004.2: Each tab entry shows: favicon (16x16), title (truncated with ellipsis if too long), close button on hover
- [ ] AC-004.3: Tab list updates in real-time as tabs are opened, closed, or change titles
- [ ] AC-004.4: Favicons load lazily and are cached locally
- [ ] AC-004.5: List uses virtual scrolling when tab count exceeds 50
- [ ] AC-004.6: Verify in browser: open 10+ tabs, confirm all appear with correct favicons and titles

**Functional Requirements:**
- FR-004.1: Use `chrome.tabs.query({ currentWindow: true })` for initial tab list
- FR-004.2: Implement with `react-window` `FixedSizeList` for virtual scrolling
- FR-004.3: Tab items are 32px tall with 4px gap between items

---

#### US-005: Tab Switching from Sidebar

**As a** user,
**I want** to click a tab in the sidebar to immediately switch to it,
**so that** I can navigate between tabs faster than using the native tab bar.

**Acceptance Criteria:**
- [ ] AC-005.1: Single-clicking a tab entry activates that tab in Chrome
- [ ] AC-005.2: The active tab is visually highlighted (colored left border + bold text)
- [ ] AC-005.3: Tab switching completes in under 50ms (perceived)
- [ ] AC-005.4: Active tab highlight updates when switching tabs via native tab bar or keyboard shortcuts
- [ ] AC-005.5: Verify in browser: click tabs in sidebar, confirm Chrome switches; switch via native bar, confirm sidebar updates

**Functional Requirements:**
- FR-005.1: Use `chrome.tabs.update(tabId, { active: true })` on click
- FR-005.2: Listen to `chrome.tabs.onActivated` to sync active state bidirectionally
- FR-005.3: Active tab indicator: 3px left border using workspace accent color (default: `#2E75B6`)

---

#### US-006: Pinned Apps -- Add and Remove

**As a** user,
**I want** to pin my most-used websites to a persistent row at the top of the sidebar,
**so that** I can access them with a single click regardless of which tabs are open.

**Acceptance Criteria:**
- [ ] AC-006.1: A horizontal "Pinned Apps" row is displayed below the search bar (Zone 2)
- [ ] AC-006.2: Users can pin a site by right-clicking a tab in the sidebar and selecting "Pin to ArcFlow"
- [ ] AC-006.3: Pinned apps display as favicon circles (32x32px)
- [ ] AC-006.4: Right-clicking a pinned app shows: Rename, Remove, Open in New Tab, Edit URL
- [ ] AC-006.5: "Remove" unpins the app; does not close any associated tab
- [ ] AC-006.6: Pinned apps persist across browser restarts (stored in `chrome.storage.local`)
- [ ] AC-006.7: Maximum 12 pinned apps; row scrolls horizontally beyond 8
- [ ] AC-006.8: Verify in browser: pin a site, restart Chrome, confirm it persists

**Functional Requirements:**
- FR-006.1: PinnedApp data: `{ id, url, title, favicon, sortOrder }`
- FR-006.2: Store pinned apps in `chrome.storage.local` under key `pinnedApps`
- FR-006.3: Clicking a pinned app: if a tab with matching URL origin exists, switch to it; otherwise open a new tab

---

#### US-007: Pinned Apps -- Reorder via Drag-and-Drop

**As a** user,
**I want** to drag pinned apps to rearrange their order,
**so that** I can organize them by importance or frequency.

**Acceptance Criteria:**
- [ ] AC-007.1: Pinned app icons are draggable within the pinned row
- [ ] AC-007.2: Drop target is indicated visually (insertion line or gap)
- [ ] AC-007.3: New order persists immediately to `chrome.storage.local`
- [ ] AC-007.4: Drag-and-drop works with keyboard (arrow keys to move, Enter to confirm) for accessibility
- [ ] AC-007.5: Verify in browser: drag a pinned app to a new position, refresh sidebar, confirm order persists

**Functional Requirements:**
- FR-007.1: Use `@dnd-kit/core` or HTML5 drag-and-drop for reordering
- FR-007.2: Update `sortOrder` field on all affected PinnedApp entries after reorder

---

#### US-008: Pinned Apps -- Active Indicator and Click-to-Switch

**As a** user,
**I want** to see which pinned apps are currently open as tabs,
**so that** I can quickly identify and switch to running apps.

**Acceptance Criteria:**
- [ ] AC-008.1: Pinned apps with an active (open) tab show a colored dot indicator below the favicon
- [ ] AC-008.2: Clicking a pinned app with an active tab switches to that tab
- [ ] AC-008.3: Clicking a pinned app without an active tab opens a new tab with that URL
- [ ] AC-008.4: Active indicator updates in real-time as tabs are opened/closed
- [ ] AC-008.5: Verify in browser: pin Gmail, open Gmail in a tab -- dot appears; close the tab -- dot disappears

**Functional Requirements:**
- FR-008.1: Match pinned app to open tab by URL origin (`new URL(url).origin`)
- FR-008.2: Active dot: 6px circle, positioned center-bottom of the favicon, using workspace accent color

---

#### US-009: Context Menu "Pin to ArcFlow"

**As a** user,
**I want** to right-click any tab in Chrome and select "Pin to ArcFlow,"
**so that** I can pin sites without opening the sidebar first.

**Acceptance Criteria:**
- [ ] AC-009.1: Right-clicking anywhere on a web page shows "Pin to ArcFlow" in the context menu
- [ ] AC-009.2: Selecting it adds the current page to pinned apps using the page's URL, title, and favicon
- [ ] AC-009.3: If the URL is already pinned, the menu item shows "Unpin from ArcFlow" instead
- [ ] AC-009.4: A brief toast/notification confirms the action in the sidebar (if open)
- [ ] AC-009.5: Verify in browser: right-click on a page, select "Pin to ArcFlow," confirm it appears in the pinned row

**Functional Requirements:**
- FR-009.1: Use `chrome.contextMenus.create()` in the service worker with `contexts: ['page']`
- FR-009.2: On click, extract tab info via `chrome.tabs.get(tab.id)` and store as PinnedApp

---

#### US-010: Light/Dark Theme Support

**As a** user,
**I want** the sidebar to match my system's light or dark mode preference,
**so that** the extension feels native and comfortable for my setup.

**Acceptance Criteria:**
- [ ] AC-010.1: Sidebar defaults to system preference (`prefers-color-scheme`)
- [ ] AC-010.2: A manual toggle in the sidebar footer allows override to light/dark/system
- [ ] AC-010.3: Theme changes apply instantly without sidebar reload
- [ ] AC-010.4: Theme preference persists across browser restarts
- [ ] AC-010.5: All UI elements (backgrounds, text, borders, icons) adapt correctly to both themes
- [ ] AC-010.6: Verify in browser: toggle system dark mode, confirm sidebar follows; manually override, confirm it sticks

**Functional Requirements:**
- FR-010.1: Use Tailwind CSS `dark:` variant with `class` strategy
- FR-010.2: Store theme preference in Settings under `theme: 'system' | 'light' | 'dark'`
- FR-010.3: Light base: `gray-50` background, `gray-900` text. Dark base: `gray-900` background, `gray-100` text.

---

#### US-011: Folder CRUD (Create, Rename, Delete)

**As a** user,
**I want** to create, rename, and delete folders in the sidebar,
**so that** I can organize my tabs by project, topic, or context.

**Acceptance Criteria:**
- [ ] AC-011.1: A "New Folder" button or keyboard shortcut (`Ctrl+Shift+N`) creates a folder with an inline editable name
- [ ] AC-011.2: Double-clicking a folder name enters rename mode
- [ ] AC-011.3: Right-clicking a folder shows: Rename, Delete, Open All Tabs, Close All Tabs
- [ ] AC-011.4: Deleting a folder with tabs inside prompts a confirmation ("Close X tabs and delete folder?")
- [ ] AC-011.5: Folder operations persist immediately to `chrome.storage.local`
- [ ] AC-011.6: Verify in browser: create a folder, rename it, add tabs, delete it -- all operations reflect immediately

**Functional Requirements:**
- FR-011.1: Folders stored under their parent workspace in `chrome.storage.local`
- FR-011.2: Folder data: `{ id, name, parentId, items[], isCollapsed, sortOrder }`
- FR-011.3: Folder names must be non-empty; duplicates are allowed (different folders can share names)

---

#### US-012: Nested Folders (Up to 3 Levels)

**As a** user,
**I want** to nest folders inside other folders (up to 3 levels deep),
**so that** I can create hierarchical organization for complex projects.

**Acceptance Criteria:**
- [ ] AC-012.1: Folders can be created inside existing folders
- [ ] AC-012.2: Maximum nesting depth is 3 (root > level 1 > level 2 > level 3)
- [ ] AC-012.3: Attempting to nest beyond 3 levels shows an error message
- [ ] AC-012.4: Nested folders are visually indented (16px per level)
- [ ] AC-012.5: Collapsing a parent folder hides all nested children
- [ ] AC-012.6: Verify in browser: create 3 levels of nested folders with tabs; collapse/expand; confirm depth limit enforced

**Functional Requirements:**
- FR-012.1: Nesting tracked via `parentId` field on Folder
- FR-012.2: Depth validation: count ancestors via `parentId` chain; reject if depth >= 3
- FR-012.3: Visual indentation: `paddingLeft = 16px * depth`

---

#### US-013: Drag-and-Drop Tabs into Folders

**As a** user,
**I want** to drag tabs into folders and reorder them,
**so that** I can organize my browsing by project or topic quickly.

**Acceptance Criteria:**
- [ ] AC-013.1: Tabs in the sidebar are draggable
- [ ] AC-013.2: Dragging a tab over a folder highlights the folder as a drop target
- [ ] AC-013.3: Dropping a tab into a folder moves it there and updates the tree view
- [ ] AC-013.4: Tabs can be reordered within a folder via drag-and-drop
- [ ] AC-013.5: Folders can be reordered among siblings via drag-and-drop
- [ ] AC-013.6: All drag-and-drop changes persist to `chrome.storage.local`
- [ ] AC-013.7: Verify in browser: drag a tab into a folder, reorder tabs within folder, reorder folders

**Functional Requirements:**
- FR-013.1: Use `@dnd-kit/core` with `@dnd-kit/sortable` for consistent DnD across sidebar
- FR-013.2: Drop zones: between items (reorder), on folder (move into), on root area (move to top level)

---

#### US-014: Saved Links in Folders

**As a** user,
**I want** to save URLs into folders without keeping them as open tabs,
**so that** I can build a curated collection of resources organized by project.

**Acceptance Criteria:**
- [ ] AC-014.1: Right-clicking a tab in the sidebar shows "Save Link to Folder..."
- [ ] AC-014.2: A folder picker appears to choose the destination folder
- [ ] AC-014.3: Saved links display with a dimmed style (to distinguish from active tabs)
- [ ] AC-014.4: Clicking a saved link opens it as a new tab
- [ ] AC-014.5: Saved links can be deleted via right-click > "Remove"
- [ ] AC-014.6: Saved links persist across browser restarts
- [ ] AC-014.7: Verify in browser: save a link, close original tab, restart Chrome -- saved link still appears in folder

**Functional Requirements:**
- FR-014.1: Saved links are `FolderItem` with `type: 'link'` and `tabId: null`
- FR-014.2: When a saved link is opened, update it to `type: 'tab'` with the new `tabId`

---

#### US-015: Tab Search with Fuzzy Matching

**As a** user,
**I want** to search across all open tabs and saved links using a search bar,
**so that** I can find any tab instantly without scrolling.

**Acceptance Criteria:**
- [ ] AC-015.1: A search bar is always visible at the top of the sidebar (Zone 1)
- [ ] AC-015.2: Typing filters the tab/folder tree in real-time
- [ ] AC-015.3: Search matches against: tab titles, URLs, folder names, saved link titles
- [ ] AC-015.4: Results use fuzzy matching (e.g., "gml" matches "Gmail")
- [ ] AC-015.5: Pressing Enter on the top result switches to that tab or opens the saved link
- [ ] AC-015.6: Pressing Escape clears the search and restores the full tree view
- [ ] AC-015.7: Search can be activated with keyboard shortcut `Ctrl+Shift+F`
- [ ] AC-015.8: Verify in browser: open 10+ tabs, type partial title, confirm fuzzy matching works

**Functional Requirements:**
- FR-015.1: Use a fuzzy matching library (e.g., `fuse.js`) for search ranking
- FR-015.2: Search is debounced at 150ms to avoid excessive re-renders
- FR-015.3: Results are ranked: exact match > starts-with > fuzzy match > URL match

---

#### US-016: Tab Close from Sidebar

**As a** user,
**I want** to close tabs directly from the sidebar,
**so that** I can manage my tabs without switching to each one.

**Acceptance Criteria:**
- [ ] AC-016.1: Each tab entry shows a close button (X icon) on hover
- [ ] AC-016.2: Clicking the close button closes the tab in Chrome
- [ ] AC-016.3: The tab is removed from the sidebar list immediately
- [ ] AC-016.4: Middle-clicking a tab entry also closes it (mouse convention)
- [ ] AC-016.5: Verify in browser: hover over a tab, click X, confirm tab closes in Chrome and disappears from sidebar

**Functional Requirements:**
- FR-016.1: Use `chrome.tabs.remove(tabId)` on close action
- FR-016.2: Close button: 16x16 Lucide `X` icon, visible only on hover, right-aligned in the tab row

---

#### US-017: Visual Indicators (Active, Audio, Discarded)

**As a** user,
**I want** to see visual indicators for tab states (active, playing audio, suspended),
**so that** I can quickly identify what each tab is doing.

**Acceptance Criteria:**
- [ ] AC-017.1: Active tab: bold text + 3px colored left border
- [ ] AC-017.2: Tab playing audio: speaker icon next to the title
- [ ] AC-017.3: Discarded/suspended tab: dimmed opacity (0.5) and italic text
- [ ] AC-017.4: Indicators update in real-time as tab states change
- [ ] AC-017.5: Verify in browser: play a video in a tab -- speaker icon appears; discard a tab via Chrome -- it dims

**Functional Requirements:**
- FR-017.1: Use `tab.audible` property from `chrome.tabs.onUpdated` for audio detection
- FR-017.2: Use `tab.discarded` property for suspension state
- FR-017.3: Active state tracked via `chrome.tabs.onActivated`

---

#### US-018: Folder-Level Actions

**As a** user,
**I want** bulk actions on folders (Open All, Close All, Collapse All),
**so that** I can manage groups of tabs efficiently.

**Acceptance Criteria:**
- [ ] AC-018.1: Right-click context menu on folder includes: Open All Tabs, Close All Tabs, Collapse All Subfolders
- [ ] AC-018.2: "Open All Tabs" opens all saved links in the folder as new tabs
- [ ] AC-018.3: "Close All Tabs" closes all active tabs in the folder (does not remove saved links)
- [ ] AC-018.4: "Collapse All" collapses the folder and all nested subfolders
- [ ] AC-018.5: Folder header shows a count badge: `(3 tabs, 2 links)`
- [ ] AC-018.6: Verify in browser: add 5 tabs to a folder, use Close All -- all 5 close; saved links remain

**Functional Requirements:**
- FR-018.1: "Open All" iterates folder items where `type === 'link'` and calls `chrome.tabs.create({ url })`
- FR-018.2: "Close All" iterates folder items where `type === 'tab'` and calls `chrome.tabs.remove(tabId)`
- FR-018.3: Count badge updates reactively as items are added/removed

---

### 6.2 P1 -- Workspace Intelligence (Sprint 3-4)

#### US-019: Workspace Data Model and Storage

**As a** developer,
**I want** the workspace data model implemented with storage helpers,
**so that** workspace features have a reliable persistence layer.

**Acceptance Criteria:**
- [ ] AC-019.1: Workspace CRUD operations available via a `workspaceStorage` module
- [ ] AC-019.2: A "Default" workspace is created on first install and cannot be deleted
- [ ] AC-019.3: Each workspace stores independent `pinnedApps[]` and `folders[]`
- [ ] AC-019.4: Storage operations are atomic (use `chrome.storage.local.set` with full workspace object)
- [ ] AC-019.5: Storage module includes migration logic for schema version changes

**Functional Requirements:**
- FR-019.1: Storage key: `workspaces` containing `Workspace[]` array
- FR-019.2: Storage key: `activeWorkspaceId` containing the current workspace ID
- FR-019.3: Storage key: `schemaVersion` for migration tracking (initial value: `1`)
- FR-019.4: All storage helpers return Promises and handle quota errors gracefully

---

#### US-020: Workspace CRUD

**As a** user,
**I want** to create, rename, customize (emoji/color), and delete workspaces,
**so that** I can set up distinct browsing contexts for different areas of my life.

**Acceptance Criteria:**
- [ ] AC-020.1: "New Workspace" action creates a workspace with default name "New Workspace"
- [ ] AC-020.2: Workspace name is inline-editable
- [ ] AC-020.3: Users can set an emoji icon and accent color for each workspace
- [ ] AC-020.4: Deleting a workspace prompts confirmation and offers to move tabs to Default workspace
- [ ] AC-020.5: The Default workspace cannot be deleted or renamed from "Default"
- [ ] AC-020.6: Verify in browser: create workspace, set emoji + color, verify it appears in switcher

**Functional Requirements:**
- FR-020.1: Emoji picker: use a lightweight emoji picker component (e.g., `emoji-mart` lite or a curated list)
- FR-020.2: Color picker: curated palette of 12 colors (matching Tailwind extended palette)
- FR-020.3: Deleted workspace's tabs are closed or moved based on user choice in confirmation dialog

---

#### US-021: Workspace Switcher UI

**As a** user,
**I want** a workspace switcher in the sidebar footer,
**so that** I can quickly switch between my different browsing contexts.

**Acceptance Criteria:**
- [ ] AC-021.1: Workspace switcher is displayed as an icon strip in the sidebar footer (Zone 5)
- [ ] AC-021.2: Each workspace shows its emoji icon with accent color background
- [ ] AC-021.3: Active workspace is visually highlighted (ring/border)
- [ ] AC-021.4: Clicking a workspace icon switches to that workspace
- [ ] AC-021.5: A "+" icon at the end creates a new workspace
- [ ] AC-021.6: Long-press or right-click on workspace icon shows: Rename, Edit Color/Emoji, Delete
- [ ] AC-021.7: Verify in browser: create 3 workspaces, switch between them, confirm sidebar content changes

**Functional Requirements:**
- FR-021.1: Switcher icons: 28x28px circles with emoji centered; active has 2px accent-color ring
- FR-021.2: Switching workspace triggers full sidebar content swap (pinned apps, folders, tabs)

---

#### US-022: Tab-to-Workspace Assignment

**As a** user,
**I want** each tab assigned to exactly one workspace,
**so that** my tabs are organized by context and don't bleed across workspaces.

**Acceptance Criteria:**
- [ ] AC-022.1: New tabs opened within a workspace are auto-assigned to it
- [ ] AC-022.2: Tabs opened from external sources (e.g., clicking a link in another app) go to the active workspace
- [ ] AC-022.3: Users can move a tab to a different workspace via right-click > "Move to Workspace..."
- [ ] AC-022.4: A tab can belong to only one workspace at a time
- [ ] AC-022.5: Verify in browser: open tab in Work workspace, switch to Personal -- tab is not visible

**Functional Requirements:**
- FR-022.1: Track tab-to-workspace mapping in `chrome.storage.local` as `tabWorkspaceMap: Record<number, string>`
- FR-022.2: On `tabs.onCreated`, assign to `activeWorkspaceId`
- FR-022.3: On `tabs.onRemoved`, clean up the mapping entry

---

#### US-023: Workspace Isolation (Hide/Show Tabs)

**As a** user,
**I want** tabs from other workspaces hidden when I switch workspaces,
**so that** I can focus on one context at a time without visual clutter.

**Acceptance Criteria:**
- [ ] AC-023.1: Switching workspaces filters the sidebar to show only that workspace's tabs
- [ ] AC-023.2: Optionally (configurable), non-active workspace tabs are hidden in Chrome's native tab bar using `chrome.tabGroups` (collapsed group)
- [ ] AC-023.3: A setting controls isolation behavior: "Sidebar only" (default) or "Full isolation" (collapse in Chrome too)
- [ ] AC-023.4: "Full isolation" uses Chrome tab groups to collapse/hide other workspace tabs
- [ ] AC-023.5: Verify in browser: enable full isolation, switch workspace -- other tabs collapse in native bar

**Functional Requirements:**
- FR-023.1: "Sidebar only" mode: only filter the sidebar list; Chrome tabs remain visible
- FR-023.2: "Full isolation" mode: use `chrome.tabGroups.update(groupId, { collapsed: true })` to hide tabs
- FR-023.3: Each workspace's tabs are assigned to a Chrome tab group named after the workspace

---

#### US-024: Workspace Keyboard Shortcuts

**As a** user,
**I want** keyboard shortcuts to switch between workspaces,
**so that** I can change contexts instantly without using the mouse.

**Acceptance Criteria:**
- [ ] AC-024.1: `Ctrl+Shift+1` through `Ctrl+Shift+9` switch to workspaces 1-9
- [ ] AC-024.2: Shortcuts are registered via `chrome.commands` in the manifest
- [ ] AC-024.3: Shortcuts work globally (even when sidebar is not focused)
- [ ] AC-024.4: Verify in browser: press `Ctrl+Shift+2` -- switches to second workspace

**Functional Requirements:**
- FR-024.1: Register commands in `manifest.json` under `"commands"` key
- FR-024.2: Chrome limits extensions to 4 `chrome.commands`; use `Ctrl+Shift+K` command palette for workspaces beyond 4
- FR-024.3: Command palette should list "Switch to [workspace name]" as an action

---

#### US-025: Auto-Archive Engine

**As a** user,
**I want** inactive tabs automatically archived after a configurable time period,
**so that** my browser stays clean without manual effort.

**Acceptance Criteria:**
- [ ] AC-025.1: Tabs inactive for longer than the configured threshold (default: 12 hours) are moved to the Archive section
- [ ] AC-025.2: Archived tabs are discarded from memory (`chrome.tabs.discard`)
- [ ] AC-025.3: Pinned apps are exempt from auto-archiving
- [ ] AC-025.4: Tabs in folders marked as "Keep" are exempt
- [ ] AC-025.5: The threshold is configurable in Settings (options: 1h, 4h, 12h, 24h, 48h, 1 week, never)
- [ ] AC-025.6: A `chrome.alarms` timer checks for stale tabs every 5 minutes
- [ ] AC-025.7: Verify in browser: set threshold to 1 minute (for testing), wait -- tab moves to Archive

**Functional Requirements:**
- FR-025.1: Track `lastActiveAt` timestamp on every `FolderItem` with `type: 'tab'`
- FR-025.2: Update `lastActiveAt` on `tabs.onActivated` events
- FR-025.3: Alarm name: `arcflow-auto-archive`; period: 5 minutes
- FR-025.4: Archive check logic: `Date.now() - lastActiveAt > autoArchiveMinutes * 60 * 1000`

---

#### US-026: Archive Section UI with Restore

**As a** user,
**I want** to see my archived tabs in a dedicated section and restore them with one click,
**so that** I can recover tabs that were auto-archived without re-searching for them.

**Acceptance Criteria:**
- [ ] AC-026.1: Archive section appears in Zone 4 of the sidebar, below the folder tree
- [ ] AC-026.2: Shows the 10 most recently archived tabs by default
- [ ] AC-026.3: Each archived entry shows: favicon, title, time since archived
- [ ] AC-026.4: Clicking an archived tab restores it (reloads the URL as a new tab)
- [ ] AC-026.5: The section is collapsible with a header "Archive (X)"
- [ ] AC-026.6: A "Clear Archive" action removes all archived entries (with confirmation)
- [ ] AC-026.7: Verify in browser: archive a tab, see it in Archive, click to restore -- tab reopens

**Functional Requirements:**
- FR-026.1: Archive entries stored as `ArchiveEntry[]` in `chrome.storage.local`
- FR-026.2: Restore: `chrome.tabs.create({ url: entry.url })`, then remove from archive list
- FR-026.3: Archive list capped at 100 entries; oldest are pruned when limit reached

---

#### US-027: Tab Suspension

**As a** user,
**I want** to manually or automatically suspend inactive tabs to free memory,
**so that** Chrome runs faster even with many tabs open.

**Acceptance Criteria:**
- [ ] AC-027.1: Right-click a tab > "Suspend Tab" discards it from memory
- [ ] AC-027.2: "Suspend Others" in the command palette suspends all tabs except the active one
- [ ] AC-027.3: Suspended tabs retain their title and favicon in the sidebar
- [ ] AC-027.4: Suspended tabs are visually dimmed (opacity 0.5, italic)
- [ ] AC-027.5: Clicking a suspended tab in the sidebar reloads it
- [ ] AC-027.6: Tabs inactive beyond `suspendAfterMinutes` setting are auto-suspended
- [ ] AC-027.7: Verify in browser: suspend a tab, confirm it dims; click it, confirm it reloads

**Functional Requirements:**
- FR-027.1: Use `chrome.tabs.discard(tabId)` for suspension
- FR-027.2: Clicking a discarded tab: use `chrome.tabs.update(tabId, { active: true })` -- Chrome auto-reloads
- FR-027.3: Auto-suspension runs on the same alarm as auto-archive; separate threshold setting

---

#### US-028: Memory Stats Display

**As a** user,
**I want** to see how much memory ArcFlow is saving by suspending tabs,
**so that** I feel the tangible benefit of the extension.

**Acceptance Criteria:**
- [ ] AC-028.1: Sidebar footer (Zone 5) shows "X tabs suspended | ~Y MB saved"
- [ ] AC-028.2: Stats update when tabs are suspended or restored
- [ ] AC-028.3: Memory estimate uses a heuristic (e.g., 50MB average per tab)
- [ ] AC-028.4: Verify in browser: suspend 5 tabs, confirm footer shows "5 tabs suspended | ~250 MB saved"

**Functional Requirements:**
- FR-028.1: Count discarded tabs via `chrome.tabs.query({ discarded: true })`
- FR-028.2: Memory estimate: `discardedCount * 50` MB (conservative average)
- FR-028.3: Display in footer as compact text, 11px, secondary color

---

#### US-029: Command Palette

**As a** user,
**I want** a command palette activated by `Ctrl+Shift+K`,
**so that** I can perform any sidebar action via keyboard without navigating the UI.

**Acceptance Criteria:**
- [ ] AC-029.1: `Ctrl+Shift+K` opens a centered modal with a search input
- [ ] AC-029.2: Commands are searchable by name with fuzzy matching
- [ ] AC-029.3: Available commands include: Switch Workspace, New Folder, Suspend Others, Toggle Theme, Open Settings, Search Tabs, New Workspace, Toggle Focus Mode
- [ ] AC-029.4: Arrow keys navigate results; Enter executes the selected command
- [ ] AC-029.5: Escape closes the palette
- [ ] AC-029.6: Recently used commands appear at the top
- [ ] AC-029.7: Verify in browser: press shortcut, type "dark", select "Toggle Theme" -- theme changes

**Functional Requirements:**
- FR-029.1: Command registry: array of `{ id, name, shortcut?, icon, action: () => void }`
- FR-029.2: Register `Ctrl+Shift+K` via `chrome.commands` in manifest
- FR-029.3: Palette UI: fixed overlay, 480px wide, max 8 visible results, dark semi-transparent backdrop

---

#### US-030: Settings Panel

**As a** user,
**I want** a settings panel to configure auto-archive duration, theme, shortcuts, and workspace preferences,
**so that** I can customize ArcFlow to my workflow.

**Acceptance Criteria:**
- [ ] AC-030.1: Settings accessible via gear icon in sidebar footer (Zone 5)
- [ ] AC-030.2: Settings panel opens as an overlay within the side panel
- [ ] AC-030.3: Configurable options: theme, auto-archive threshold, suspend threshold, workspace isolation mode
- [ ] AC-030.4: Changes save immediately (no "Save" button needed)
- [ ] AC-030.5: Settings persist via `chrome.storage.local`
- [ ] AC-030.6: "Reset to Defaults" button restores all settings to initial values (with confirmation)
- [ ] AC-030.7: Verify in browser: change auto-archive to 1 hour, restart Chrome, confirm setting persists

**Functional Requirements:**
- FR-030.1: Settings stored under `settings` key in `chrome.storage.local`
- FR-030.2: UI: sectioned form with toggle switches, dropdowns, and number inputs
- FR-030.3: Default values defined in `src/shared/constants.ts`

---

### 6.3 P2 -- Power User Features (Sprint 5-6)

#### US-031: AI Tab Grouping (Domain Heuristics)

**As a** user,
**I want** to auto-organize my open tabs into suggested folders based on domain and content patterns,
**so that** I can organize 20+ tabs in one click instead of manual sorting.

**Acceptance Criteria:**
- [ ] AC-031.1: "Organize Tabs" button in the sidebar header
- [ ] AC-031.2: Clicking it analyzes all ungrouped tabs and suggests folder groupings
- [ ] AC-031.3: Grouping uses domain clustering (e.g., all `github.com` tabs together)
- [ ] AC-031.4: Suggested folder names are based on domain (e.g., "GitHub", "Google Docs")
- [ ] AC-031.5: User can review suggestions before applying (preview modal)
- [ ] AC-031.6: User can accept all, accept individual groups, or dismiss
- [ ] AC-031.7: Verify in browser: open 15 tabs across 3 domains, click Organize -- 3 folders suggested

**Functional Requirements:**
- FR-031.1: Grouping algorithm: cluster by `new URL(tab.url).hostname`; merge subdomains to parent
- FR-031.2: Folder name generation: use domain name, strip "www.", capitalize
- FR-031.3: Tabs already in folders are excluded from suggestions
- FR-031.4: Minimum 2 tabs per group to suggest a folder

---

#### US-032: Optional LLM Integration for Grouping

**As a** user,
**I want** to opt into AI-powered grouping that understands tab content beyond just domains,
**so that** I get smarter organization (e.g., grouping by project or topic).

**Acceptance Criteria:**
- [ ] AC-032.1: Setting to enable "AI-Enhanced Grouping" (disabled by default)
- [ ] AC-032.2: When enabled, user provides their own API key (Anthropic or OpenAI)
- [ ] AC-032.3: LLM receives tab titles and URLs (NOT page content) and returns suggested groupings
- [ ] AC-032.4: A privacy notice explains what data is sent before enabling
- [ ] AC-032.5: Grouping falls back to domain heuristics if the API call fails
- [ ] AC-032.6: Verify in browser: enable AI grouping, provide API key, organize tabs -- richer groupings appear

**Functional Requirements:**
- FR-032.1: API key stored encrypted in `chrome.storage.local`
- FR-032.2: API payload: `{ tabs: [{ title, url }] }` -- no page content, no cookies, no personal data
- FR-032.3: Timeout: 10 seconds; fallback to US-031 heuristics on failure
- FR-032.4: Support Anthropic Claude API and OpenAI API as providers

---

#### US-033: Split View (Side-by-Side Windows)

**As a** user,
**I want** to open two tabs side-by-side by dragging one onto another,
**so that** I can compare content or reference material while working.

**Acceptance Criteria:**
- [ ] AC-033.1: Dragging a tab onto the "Split" drop zone (on another tab) triggers split view
- [ ] AC-033.2: Split view opens two Chrome windows, each taking half the screen
- [ ] AC-033.3: A "Split View" option is available in the tab right-click menu
- [ ] AC-033.4: Split view can also be triggered from the command palette
- [ ] AC-033.5: Verify in browser: drag Tab A onto Tab B -- two windows appear side by side

**Functional Requirements:**
- FR-033.1: Use `chrome.windows.create()` to open a new window with one tab
- FR-033.2: Use `chrome.windows.update()` to position windows at left-half and right-half of screen
- FR-033.3: Screen dimensions via `chrome.system.display.getInfo()` (requires `system.display` permission if needed, or use window.screen)

---

#### US-034: Air Traffic Control (Link Routing Rules)

**As a** user,
**I want** to define rules that automatically route links to specific workspaces,
**so that** links from Slack go to my Work workspace and links from Reddit go to Personal.

**Acceptance Criteria:**
- [ ] AC-034.1: Settings panel has an "Air Traffic Control" section for managing rules
- [ ] AC-034.2: Rules format: "Links matching `*pattern*` open in Workspace: [name]"
- [ ] AC-034.3: Rules support glob patterns on URLs (e.g., `*slack.com*`, `*github.com/myorg*`)
- [ ] AC-034.4: A "Default workspace for unmatched links" setting
- [ ] AC-034.5: Rules are evaluated on `tabs.onCreated` and the tab is assigned accordingly
- [ ] AC-034.6: Verify in browser: create rule for `*github.com*` -> "Dev" workspace; open a GitHub link -- it goes to Dev

**Functional Requirements:**
- FR-034.1: Rules stored as `routingRules: { pattern: string, workspaceId: string }[]` in settings
- FR-034.2: Pattern matching: convert glob to regex (`*` -> `.*`)
- FR-034.3: Rules evaluated in order; first match wins

---

#### US-035: Session Save/Restore

**As a** user,
**I want** to save my current workspace state as a named session and restore it later,
**so that** I can pause a research context and resume it days later.

**Acceptance Criteria:**
- [ ] AC-035.1: "Save Session" action available in workspace right-click menu and command palette
- [ ] AC-035.2: Saves: all open tabs (URLs, titles), folder structure, pinned apps for the workspace
- [ ] AC-035.3: Sessions are named with timestamp default (editable)
- [ ] AC-035.4: "Restore Session" reopens all tabs in their original folder structure
- [ ] AC-035.5: Restoring prompts: "Replace current tabs or add alongside?"
- [ ] AC-035.6: Verify in browser: save session with 10 tabs, close all, restore -- all 10 tabs reopen

**Functional Requirements:**
- FR-035.1: Session data: `{ id, name, savedAt, workspace: Workspace (snapshot) }`
- FR-035.2: Sessions stored in `chrome.storage.local` under `sessions` key
- FR-035.3: Maximum 20 saved sessions; oldest are warned about before pruning

---

#### US-036: Session Import/Export (JSON)

**As a** user,
**I want** to export sessions as JSON files and import them,
**so that** I can back up my workspace setups or share them with others.

**Acceptance Criteria:**
- [ ] AC-036.1: "Export" button on saved sessions downloads a `.json` file
- [ ] AC-036.2: "Import" button accepts a `.json` file and creates a new session
- [ ] AC-036.3: Imported sessions are validated before creation (schema check)
- [ ] AC-036.4: Invalid imports show a clear error message
- [ ] AC-036.5: Verify in browser: export a session, delete it, import the file -- session restored

**Functional Requirements:**
- FR-036.1: Export format: JSON with schema version for forward compatibility
- FR-036.2: Use `URL.createObjectURL` + download link for export
- FR-036.3: Use `<input type="file" accept=".json">` for import
- FR-036.4: Validate required fields: `name`, `workspace.pinnedApps`, `workspace.folders`

---

#### US-037: Focus Mode with URL Redirect

**As a** user,
**I want** a focus mode that redirects distracting websites to productive ones,
**so that** I can stay on task during deep work sessions.

**Acceptance Criteria:**
- [ ] AC-037.1: Focus mode toggle in the sidebar footer (Zone 5)
- [ ] AC-037.2: When enabled, navigating to a blocked URL redirects to a configured URL
- [ ] AC-037.3: Block/redirect list is configurable in Settings
- [ ] AC-037.4: A visual indicator (colored border or badge) shows when focus mode is active
- [ ] AC-037.5: Focus mode can be toggled via command palette
- [ ] AC-037.6: Verify in browser: enable focus mode, block `twitter.com` -> redirect to `notion.so`, navigate to Twitter -- redirected

**Functional Requirements:**
- FR-037.1: Use `chrome.webNavigation.onBeforeNavigate` or `chrome.declarativeNetRequest` for URL interception
- FR-037.2: Redirect rules stored in `Settings.focusMode.redirectRules`
- FR-037.3: `declarativeNetRequest` preferred for MV3 compliance (no background page needed)
- FR-037.4: Focus mode state persists across browser restarts

---

#### US-038: Onboarding Flow

**As a** first-time user,
**I want** a guided onboarding that helps me set up pinned apps and understand the sidebar,
**so that** I get value from ArcFlow immediately without reading documentation.

**Acceptance Criteria:**
- [ ] AC-038.1: On first install, a 3-step onboarding overlay appears in the side panel
- [ ] AC-038.2: Step 1: "Pin your favorite apps" -- shows top visited sites to pin
- [ ] AC-038.3: Step 2: "Create your first folder" -- guided folder creation
- [ ] AC-038.4: Step 3: "Explore features" -- highlights key areas (search, workspaces, settings)
- [ ] AC-038.5: "Skip" option available at every step
- [ ] AC-038.6: Onboarding does not show again after completion or skip
- [ ] AC-038.7: Verify in browser: install extension fresh, confirm onboarding appears; complete it, reopen -- no onboarding

**Functional Requirements:**
- FR-038.1: Track `onboardingCompleted: boolean` in `chrome.storage.local`
- FR-038.2: Top visited sites via `chrome.history.search({ text: '', maxResults: 10, startTime: 30 days ago })`
- FR-038.3: Onboarding UI: overlay within the side panel, step indicator dots, Back/Next/Skip buttons

---

#### US-039: Performance Audit & Optimization

**As a** developer,
**I want** the extension to meet all performance budget targets,
**so that** users never perceive ArcFlow as slowing down their browser.

**Acceptance Criteria:**
- [ ] AC-039.1: Initial sidebar render < 200ms (measured via Performance API)
- [ ] AC-039.2: Tab switch latency < 50ms
- [ ] AC-039.3: Memory overhead < 15MB idle with 50 tabs
- [ ] AC-039.4: Memory overhead < 30MB active during interaction
- [ ] AC-039.5: Background CPU < 0.1% when idle
- [ ] AC-039.6: Virtual scrolling active for lists > 50 items
- [ ] AC-039.7: Favicon loading is lazy with local caching
- [ ] AC-039.8: Tab event handlers are debounced at 50ms

**Functional Requirements:**
- FR-039.1: Use Chrome DevTools Performance panel for measurement
- FR-039.2: Use `react-window` for all scrollable lists
- FR-039.3: Debounce all `chrome.tabs.onUpdated` handlers at 50ms
- FR-039.4: Lazy-load favicons using `IntersectionObserver`
- FR-039.5: Bundle size audit: main chunk < 200KB gzipped

---

#### US-040: Accessibility Audit

**As a** user with accessibility needs,
**I want** the sidebar to be fully keyboard-navigable and screen-reader compatible,
**so that** I can use ArcFlow regardless of my abilities.

**Acceptance Criteria:**
- [ ] AC-040.1: All interactive elements are focusable via Tab key
- [ ] AC-040.2: Arrow keys navigate the folder/tab tree when focused
- [ ] AC-040.3: All actions have ARIA labels
- [ ] AC-040.4: Color contrast meets WCAG 2.1 AA (4.5:1 minimum for text)
- [ ] AC-040.5: Screen reader announces tab states (active, suspended, playing audio)
- [ ] AC-040.6: No functionality requires mouse-only interaction (drag-and-drop has keyboard alternative)
- [ ] AC-040.7: Verify with screen reader: navigate the full sidebar using VoiceOver/NVDA

**Functional Requirements:**
- FR-040.1: Use semantic HTML (`<nav>`, `<ul>`, `<li>`, `<button>`) throughout
- FR-040.2: Tree view uses ARIA tree pattern (`role="tree"`, `role="treeitem"`)
- FR-040.3: All drag-and-drop operations have keyboard equivalents (per US-007 AC-007.4)
- FR-040.4: Run Lighthouse accessibility audit; target score >= 95

---

## 7. Sprint Mapping

| Sprint | Weeks | User Stories | Goal |
|--------|-------|-------------|------|
| Sprint 1 | 1-2 | US-001 to US-010 | Working sidebar with pinned apps and flat tab list |
| Sprint 2 | 3-4 | US-011 to US-018 | Folder organization, drag-and-drop, search |
| Sprint 3 | 5-6 | US-019 to US-024 | Multi-workspace support |
| Sprint 4 | 7-8 | US-025 to US-030 | Auto-archive, suspension, command palette, settings |
| Sprint 5 | 9-10 | US-031 to US-036 | AI grouping, split view, ATC, sessions |
| Sprint 6 | 11-12 | US-037 to US-040 | Focus mode, onboarding, performance, accessibility |

---

## 8. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|-----------|-----------|
| R-1 | Chrome Side Panel API limitations (no min-width control) | Medium | High | Responsive UI with icon-only collapsed mode at narrow widths |
| R-2 | Chrome deprecates or changes Side Panel API | Critical | Low | Monitor Chromium changelogs; architecture allows fallback to popup + new-tab page |
| R-3 | Performance degradation with 100+ tabs | High | Medium | Virtual list rendering (`react-window`), lazy favicons, debounced events |
| R-4 | User data loss on extension update | High | Low | Versioned storage schema with migration scripts; backup reminder on major updates |
| R-5 | Chrome Web Store rejection | Medium | Low | Adhere to single-purpose policy; clear privacy policy; no remote code execution |
| R-6 | Scope creep during development | Medium | High | Strict tier-based delivery: ship P0 before starting P1 |
| R-7 | Chrome native vertical tabs competition | High | Medium | Differentiate via workspaces + folders + auto-archiving (native is flat lists only) |
| R-8 | `chrome.commands` limited to 4 shortcuts | Medium | Certain | Use command palette (US-029) for actions beyond 4 shortcuts |

---

## 9. Success Metrics

### Personal Use (Initial Phase)

| Metric | Target | Measurement |
|--------|--------|------------|
| Daily active use | Every workday | Sidebar open count |
| Average open tabs | Reduced by 40% | Before/after comparison over 2 weeks |
| Context switch time | < 2 seconds | Time to find correct workspace/tab |
| Tab recovery rate | 90% of needed tabs found via sidebar/archive | Self-reporting |
| Performance impact | No perceptible slowdown | Memory monitoring + subjective |

### Community (Post-Launch)

| Metric | Target (6 months) | Measurement |
|--------|-------------------|------------|
| GitHub Stars | 500+ | Repository metrics |
| Weekly active users | 1,000+ | Chrome Web Store analytics |
| Chrome Web Store rating | 4.5+ stars | Store reviews |
| Bug resolution time | < 7 days average | GitHub Issues |
| Community PRs merged | 10+ per quarter | GitHub PR metrics |

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **Workspace** | Isolated browsing context with its own pinned apps, folders, and tabs. Analogous to Arc's Spaces. |
| **Pinned App** | Frequently-used website as a favicon icon in the sidebar's top row. Click to switch or open. |
| **Folder** | User-created container for organizing tabs and saved links. Supports nesting up to 3 levels. |
| **Saved Link** | A URL stored in a folder without an open tab. Acts as an organized bookmark. |
| **Auto-Archive** | Automatically moving inactive tabs to archive section and discarding from memory. |
| **Tab Discard** | Chrome's `chrome.tabs.discard()` -- unloads tab from memory while keeping it in the tab strip. |
| **Air Traffic Control** | Rules-based routing of links to specific workspaces based on URL patterns. |
| **Command Palette** | Keyboard-activated (`Ctrl+Shift+K`) quick-action menu for performing sidebar operations. |
| **Focus Mode** | Mode that redirects distracting URLs to productive alternatives. |
| **Side Panel** | Chrome's `chrome.sidePanel` API surface for hosting extension UI alongside browsing area. |

---

*End of Structured PRD -- 40 user stories, 120+ acceptance criteria, 100+ functional requirements*
