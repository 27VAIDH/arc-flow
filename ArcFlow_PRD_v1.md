# PRODUCT REQUIREMENTS DOCUMENT

## ArcFlow

### An Arc-Inspired Productivity Sidebar for Chrome

___

**Version 1.0 | February 2026**
**Author:** Vaidh (Product & Data)
**Status:** Draft | **Classification:** Open Source

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Competitive Analysis](#3-competitive-analysis)
4. [Product Vision & Principles](#4-product-vision--principles)
5. [Target Users](#5-target-users)
6. [Feature Specification](#6-feature-specification)
7. [Technical Architecture](#7-technical-architecture)
8. [Information Architecture & UI Layout](#8-information-architecture--ui-layout)
9. [Sprint Plan](#9-sprint-plan)
10. [Success Metrics](#10-success-metrics)
11. [Risks & Mitigations](#11-risks--mitigations)
12. [Open Questions & Decisions Needed](#12-open-questions--decisions-needed)
13. [Appendix](#13-appendix)

---

## 1. Executive Summary

ArcFlow is an open-source Chrome extension that brings Arc Browser's revolutionary sidebar-first navigation paradigm to Google Chrome. With Arc Browser's development officially discontinued (acquired by Atlassian for $610M in 2025) and its features frozen, millions of power users are seeking Arc-like productivity within their existing browser. ArcFlow fills this gap by leveraging Chrome's Side Panel API (chrome.sidePanel), Tabs API, and Tab Groups API to deliver a persistent vertical sidebar with workspaces, pinned apps, folder-based tab organization, intelligent search, and automated tab management.

The extension addresses five core pain points validated across competitive research: tab overload (average users maintain 10–20+ open tabs), context-switching friction between work and personal browsing, lost tabs buried in horizontal tab strips, messy bookmarks that go unused, and the desire for a cleaner, minimal browser UI. ArcFlow targets individual power users initially, with a roadmap toward open-source community distribution and eventual Chrome Web Store publication.

---

## 2. Problem Statement

### 2.1 The Tab Crisis

The horizontal tab bar, largely unchanged since Opera introduced tabbed browsing in 2000, remains the dominant paradigm across Chrome, Firefox, Safari, and Edge. Despite Chrome's introduction of Tab Groups in 2020, fundamental problems persist:

- **Visual Collapse:** Beyond 8–10 tabs, favicons disappear, titles truncate to unreadable fragments, and users resort to hovering over each tab to identify content.
- **Flat Hierarchy:** All tabs exist at the same level regardless of importance. A mission-critical work document sits alongside a casual Reddit thread with no visual differentiation.
- **No Contextual Separation:** Work tabs, personal tabs, and project-specific research intermingle in a single horizontal strip, creating cognitive overhead during context switches.
- **Ephemeral Organization:** Tab groups provide color-coding but no persistence across sessions. Bookmarks are a separate system entirely, creating a fractured organizational model.

### 2.2 The Arc Vacuum

Arc Browser demonstrated that a sidebar-first approach with Spaces, pinned tabs, auto-archiving, and split view could dramatically improve browsing productivity. However, with The Browser Company pivoting to their AI browser Dia and being acquired by Atlassian, Arc is in maintenance mode with no new features planned. Existing alternatives (Zen Browser, Vivaldi, SigmaOS, Sidekick) each require users to abandon Chrome entirely, giving up their extension ecosystem, sync infrastructure, and muscle memory.

### 2.3 The Gap

Existing Chrome extensions like Side Space, VertiTab, and ArcThing attempt to replicate Arc's sidebar but each has significant limitations: Side Space focuses primarily on vertical tab listing without deep folder hierarchies; VertiTab is built on Sidebery and lacks native Chrome integration polish; ArcThing provides basic window/tab management without the workspace intelligence that made Arc transformative. None offer the integrated experience of pinned apps + nested folders + workspaces + intelligent tab lifecycle management that Arc delivered as a cohesive whole.

---

## 3. Competitive Analysis

### 3.1 Browser-Level Competitors

| Feature | Arc | Zen Browser | Vivaldi | Sidekick | SigmaOS |
|---|---|---|---|---|---|
| Vertical Sidebar | Core | Core | Optional | Core | Core |
| Workspaces / Spaces | Yes (Spaces) | Yes | Workspaces | Sessions | Workspaces |
| Pinned Apps | Yes (Favorites) | Essentials | Web Panels | Sidebar Apps | Locked Tabs |
| Nested Folders | Yes | Tab Folders (Aug 2025) | Tab Stacking | No | No |
| Auto-Archive Tabs | Yes (configurable) | Via extension | No | Tab Suspender | Page Suspension |
| Split View | Up to 4 tabs | Grid (up to 4) | Tab Tiling | Split View | Side-by-side |
| Air Traffic Control | Yes | No | No | Redirect Rules | No |
| Boosts (CSS inject) | Yes | Zen Mods | CSS Mods | No | No |
| Command Bar | Yes | URL Bar Commands | Quick Commands | Global Search | Lazy Search |
| Media Controls | Built-in | PiP Controller | No native | No | No |
| Container/Profiles | Profiles per Space | Firefox Containers | User Profiles | Multi-session | Separate Profiles |
| Platform | Mac, Win, iOS | Mac, Win, Linux | All platforms | Mac, Win, Linux | macOS only |
| Engine | Chromium | Gecko (Firefox) | Chromium | Chromium | WebKit |
| Price | Free | Free (OSS) | Free | Free/$12/mo | Free/$20/mo |
| Status (2026) | Maintenance | Active (Beta) | Active | Acquired by Perplexity | Active |

### 3.2 Chrome Extension Competitors

| Extension | Approach | Strengths | Weaknesses |
|---|---|---|---|
| Side Space | AI vertical tabs in Side Panel | AI grouping, cross-browser sync, memory mgmt | No nested folders, paid for unlimited spaces |
| VertiTab | Tree-style tabs (Sidebery port) | 20+ features, AI grouping, cloud sync | Complex UI, Firefox port limitations |
| ArcThing | Window/tab sidebar organizer | Clean Arc-inspired UI, free | Basic features, no workspaces |
| Tab Nodes Tree | Tree-style tab hierarchy | Visual tree structure | No workspace separation |
| Workona | Tab/workspace manager | Team collaboration, project spaces | Separate new tab page, not a sidebar |

### 3.3 Key Competitive Insights

- **The sidebar is table stakes:** Every modern productivity browser uses a vertical sidebar. This is the baseline, not the differentiator.
- **Workspaces win loyalty:** Across all competitors, workspace/space functionality is the #1 cited feature for retention. Users who set up workspaces rarely switch back.
- **Auto-archiving is underserved:** Only Arc offered polished tab auto-archiving. No Chrome extension replicates this. It's a major opportunity.
- **Nesting depth matters:** Power users (researchers, developers, analysts) consistently request deeper folder nesting. Flat tab lists are insufficient for complex workflows.
- **Performance is a dealbreaker:** Sidekick and SigmaOS received significant criticism for performance issues. Extension overhead must be minimal.

---

## 4. Product Vision & Principles

### 4.1 Vision Statement

> "ArcFlow transforms Chrome's side panel into a command center for your browsing life — organizing tabs into contextual workspaces, surfacing what matters, and archiving what doesn't — so you can focus on your work, not your browser."

### 4.2 Design Principles

- **Sidebar-First, Not Tab-Bar Replacement:** ArcFlow complements Chrome's existing UI rather than fighting it. The native tab bar remains available; the sidebar becomes the primary navigation surface.
- **Progressive Complexity:** A new user should find value in 30 seconds (pinning a few sites). A power user should discover depth over weeks (nested folders, auto-archiving rules, keyboard shortcuts).
- **Zero-Config Defaults, Full Customization:** Sensible defaults out of the box. Every behavior should be configurable for those who want control.
- **Performance is a Feature:** The extension must add negligible memory and CPU overhead. Tab suspension and lazy loading are first-class concerns.
- **Data Ownership:** All data stored locally via chrome.storage. Optional sync via Chrome's built-in sync. No external servers, no telemetry, no accounts required.
- **Open Source First:** MIT-licensed. Community contributions welcome. Transparent development process.

---

## 5. Target Users

### 5.1 Primary Persona: The Knowledge Worker

A professional who spends 6+ hours daily in their browser across work tools (Gmail, Slack, Notion, Jira), research, and personal browsing. They typically have 15–40+ tabs open, frequently lose important tabs, and struggle with context-switching between work projects and personal browsing. They've heard of or tried Arc but can't switch from Chrome due to enterprise requirements, extension dependencies, or sync ecosystem lock-in.

### 5.2 Secondary Persona: The Researcher / Student

A student, academic, or analyst who opens dozens of tabs per research session, needs to save and restore research contexts, and wants to organize findings by topic or project. They value the ability to "pause" a research session and resume it days later with all tabs intact.

### 5.3 Tertiary Persona: The Tab Hoarder

A user who chronically accumulates 50–100+ tabs out of "I might need this later" anxiety. They need automated cleanup, smart archiving, and the confidence that closed tabs are recoverable. They're the users who most benefit from tab lifecycle management.

---

## 6. Feature Specification

### 6.1 Feature Tiers

Features are organized into three tiers based on priority, technical complexity, and user impact. This aligns with an iterative delivery strategy.

| Tier | Theme | Timeline | Description |
|---|---|---|---|
| P0 (Must-Have) | Core Sidebar Experience | Sprint 1–2 (Weeks 1–4) | Minimum viable product: sidebar, pinned apps, folders, basic tab management |
| P1 (Should-Have) | Workspace Intelligence | Sprint 3–4 (Weeks 5–8) | Workspaces, auto-archive, tab search, keyboard shortcuts |
| P2 (Nice-to-Have) | Power User Features | Sprint 5–6 (Weeks 9–12) | AI grouping, drag-to-split, custom rules, import/export |

### 6.2 P0: Core Sidebar Experience

#### 6.2.1 Persistent Side Panel

**Chrome API:** `chrome.sidePanel` (Manifest V3)

The sidebar is the foundation of ArcFlow. It renders as a persistent panel on the left side of the browser window via Chrome's Side Panel API. The panel remains open across tab navigation and survives page reloads. Users toggle it via the extension's toolbar icon or a configurable keyboard shortcut.

- Sidebar width is resizable by the user (Chrome handles this natively).
- Sidebar state (open/closed) persists across browser restarts.
- Sidebar content is a single-page React application rendered within the side panel HTML.
- Dark mode and light mode support, following system preferences by default.

#### 6.2.2 Pinned Apps (Favorites Row)

**Chrome API:** `chrome.tabs.create()`, `chrome.storage.local`

A horizontal row of favicon icons at the top of the sidebar, representing the user's most-used web applications. Clicking a pinned app either switches to the existing tab (if already open) or opens a new tab. This replicates Arc's Favorites section.

- Users add apps by right-clicking any tab and selecting "Pin to ArcFlow."
- Pinned apps are stored as URL + favicon + display name.
- Visual indicator (dot/glow) shows which pinned apps have an active tab.
- Drag-and-drop reordering within the pinned row.
- Maximum of 12 pinned apps (scrollable beyond that).
- Right-click context menu: Rename, Remove, Open in New Tab, Edit URL.

#### 6.2.3 Folder-Based Tab Organization

**Chrome API:** `chrome.tabs`, `chrome.tabGroups`, `chrome.storage.local`

Below the pinned apps row, the sidebar displays a tree structure of folders and tabs. This is the primary navigation surface and replaces the horizontal tab bar as the user's main way to find and switch between tabs.

- **Folders:** User-created containers that can hold tabs, bookmarks, or other folders (nesting up to 3 levels deep). Folders are collapsible and persist across sessions.
- **Active Tabs:** Currently open tabs are displayed with their title, favicon, and a close button. Clicking switches to that tab.
- **Saved Links:** Users can save URLs into folders without opening them as tabs. These act as organized bookmarks within the sidebar context.
- Drag-and-drop tabs between folders.
- Drag tabs from Chrome's native tab bar into the sidebar to organize them.
- Visual distinction between active tabs (bold, colored dot) and saved links (dimmed).
- Folder-level actions: Collapse All, Open All Tabs, Close All Tabs, Rename, Delete.

#### 6.2.4 Active Tab Indicator & Switching

**Chrome API:** `chrome.tabs.onActivated`, `chrome.tabs.update()`

The sidebar highlights the currently active tab and provides instant switching.

- Active tab is visually highlighted with a colored left border and bold text.
- Clicking any tab in the sidebar immediately switches Chrome to that tab.
- Tab titles update in real-time as pages load or change titles.
- Favicons load lazily and cache locally for performance.
- Audio indicator icon for tabs playing media.

#### 6.2.5 Quick Tab Search

**Chrome API:** `chrome.tabs.query()`, `chrome.history.search()`

A search bar at the top of the sidebar (below pinned apps) that provides fuzzy search across all open tabs, saved links, and recent history.

- Activated by clicking the search bar or pressing a keyboard shortcut (default: `Ctrl+Shift+F`).
- Searches across: tab titles, URLs, folder names, and saved link titles.
- Results ranked by relevance with fuzzy matching.
- Selecting a result switches to that tab or opens the saved link.

### 6.3 P1: Workspace Intelligence

#### 6.3.1 Workspaces (Spaces)

**Chrome API:** `chrome.storage.local`, `chrome.tabs.query()`, `chrome.windows`

Workspaces are isolated browsing contexts within the sidebar, each with its own set of pinned apps, folders, and active tabs. Switching workspaces changes the visible sidebar content and can optionally hide/show the corresponding tabs.

- Each workspace has a name, emoji icon, and accent color.
- Switching workspaces hides tabs from other workspaces (optional, configurable).
- A "Default" workspace always exists and cannot be deleted.
- Users can create unlimited workspaces.
- Workspace switcher displayed as icon strip at the bottom of the sidebar.
- Keyboard shortcut to cycle workspaces (default: `Ctrl+Shift+1/2/3...`).
- New tabs opened from within a workspace are automatically assigned to that workspace.

#### 6.3.2 Tab Auto-Archiving

**Chrome API:** `chrome.tabs.onUpdated`, `chrome.alarms`, `chrome.tabs.discard()`

Automatically manages tab lifecycle to prevent tab overload. This is the feature most cited by Arc users as transformative and least replicated by competitors.

- Tabs inactive for a configurable duration (default: 12 hours) are moved to an "Archive" section.
- Archived tabs are discarded (unloaded from memory) but remain listed in the sidebar.
- Clicking an archived tab restores it.
- Pinned apps and tabs in folders marked as "Keep" are exempt from auto-archiving.
- Archive history is searchable and browsable.
- Configurable archiving rules: by time, by domain, or manual exemptions.

#### 6.3.3 Comprehensive Keyboard Shortcuts

Power users expect full keyboard navigability. ArcFlow provides a configurable shortcut system:

- Toggle sidebar: `Ctrl+Shift+S` (customizable).
- Search tabs: `Ctrl+Shift+F`.
- Switch workspace: `Ctrl+Shift+[1-9]`.
- New folder: `Ctrl+Shift+N`.
- Close current tab: `Ctrl+W` (native, but sidebar updates reactively).
- Navigate sidebar items: Arrow keys when sidebar is focused.
- Command palette (quick actions): `Ctrl+Shift+K`.

#### 6.3.4 Tab Suspension & Memory Management

**Chrome API:** `chrome.tabs.discard()`

- Tabs inactive beyond a threshold are automatically discarded (unloaded from memory).
- Discarded tabs retain their title and favicon in the sidebar.
- Visual indicator (dimmed/grayed) for discarded tabs.
- Manual "Suspend All" and "Suspend Others" actions.
- Memory savings displayed in sidebar footer.

### 6.4 P2: Power User Features

#### 6.4.1 AI-Powered Tab Grouping

Automatic categorization of open tabs based on domain, content similarity, and user patterns. Uses on-device heuristics (domain clustering, title keyword extraction) for privacy-first grouping. Optional integration with an LLM API for more intelligent grouping.

- One-click "Organize All Tabs" action.
- Suggested folder names based on tab content.
- Rule-based auto-grouping: e.g., all GitHub tabs go to "Dev" folder.

#### 6.4.2 Split View Trigger

**Chrome API:** `chrome.windows.create()`, `chrome.windows.update()`

Drag a tab onto another tab in the sidebar to open them side-by-side in separate windows, simulating Arc's split view. While Chrome extensions cannot create true in-window splits, side-by-side window management provides a close approximation.

#### 6.4.3 Air Traffic Control (Link Routing Rules)

Users define rules for where externally-opened links (from Slack, email, etc.) should land:

- Rule format: "Links from \*slack.com\* open in Workspace: Work."
- Domain-based routing to specific workspaces.
- Default workspace for unmatched links.

#### 6.4.4 Session Save / Restore

- Save current workspace state as a named session.
- Restore sessions to reopen all tabs in their original folder structure.
- Export sessions as JSON for sharing or backup.
- Import sessions from JSON.

#### 6.4.5 Distraction Blocker

Inspired by Sidekick's redirect rules. Users can configure URL redirect rules that activate during focus mode:

- Attempting to visit twitter.com redirects to a configured productive URL.
- Focus mode toggle in sidebar footer.
- Configurable block/redirect list.
- Optional Pomodoro timer integration.

---

## 7. Technical Architecture

### 7.1 Extension Structure (Manifest V3)

ArcFlow is built as a Chrome Extension using Manifest V3, the current and required extension format for Chrome Web Store publication.

| Component | Technology | Purpose |
|---|---|---|
| Manifest | manifest.json (MV3) | Extension metadata, permissions, side panel declaration |
| Side Panel | React 18 + Tailwind CSS | Primary UI surface rendered in chrome.sidePanel |
| Service Worker | background.js | Event handling, tab listeners, alarms, storage management |
| Content Script | content.js (minimal) | Context menu integration, page-level interactions |
| Storage | chrome.storage.local/sync | Workspace data, pinned apps, folder structure, settings |
| Build Tool | Vite + TypeScript | Module bundling, hot reload during development |

### 7.2 Chrome API Permission Map

| Permission | APIs Used | Justification |
|---|---|---|
| sidePanel | chrome.sidePanel | Core sidebar functionality |
| tabs | chrome.tabs.* | Tab management, switching, creating, closing |
| tabGroups | chrome.tabGroups.* | Native tab group integration |
| storage | chrome.storage.local/sync | Persist workspaces, folders, settings |
| alarms | chrome.alarms | Auto-archive timer, tab suspension scheduler |
| contextMenus | chrome.contextMenus | Right-click "Pin to ArcFlow" |
| history | chrome.history.search() | Search integration for recently closed tabs |
| commands | chrome.commands | Configurable keyboard shortcuts |
| favicon | chrome.tabs (favicon URL) | Display tab/site icons in sidebar |

### 7.3 Data Model

All data is stored locally via `chrome.storage.local`. The core data structures are:

- **Workspace:** `{ id, name, emoji, color, pinnedApps[], folders[], isDefault }`
- **PinnedApp:** `{ id, url, title, favicon, sortOrder }`
- **Folder:** `{ id, name, parentId (nullable for nesting), items[], isCollapsed, sortOrder }`
- **FolderItem:** `{ id, type: 'tab' | 'link', tabId (if active), url, title, favicon, isArchived }`
- **Settings:** `{ autoArchiveMinutes, theme, sidebarWidth, keyboardShortcuts, focusMode }`
- **ArchiveEntry:** `{ url, title, favicon, archivedAt, fromWorkspaceId, fromFolderId }`

### 7.4 Performance Budget

| Metric | Target | Measurement |
|---|---|---|
| Initial sidebar render | < 200ms | Time from panel open to first paint |
| Tab switch latency | < 50ms | Time from sidebar click to tab activation |
| Memory overhead (idle) | < 15MB | Extension process memory with 50 tabs |
| Memory overhead (active) | < 30MB | Extension process memory during interaction |
| Storage footprint | < 5MB | Local storage for 5 workspaces, 200 items |
| Background CPU | < 0.1% | Service worker idle CPU usage |

---

## 8. Information Architecture & UI Layout

### 8.1 Sidebar Layout (Top to Bottom)

The sidebar is organized into distinct zones, each serving a specific function:

- **Zone 1 – Search Bar:** A compact search input at the very top. Expands to a full search overlay when focused.
- **Zone 2 – Pinned Apps Row:** A horizontal scrollable row of favicon circles (32x32px). Maximum one row visible; scrolls horizontally if > 8 items.
- **Zone 3 – Folder/Tab Tree:** The primary content area. A scrollable tree view of folders and tabs. This zone takes up the majority of sidebar real estate (~60-70%).
- **Zone 4 – Archive Section:** A collapsible section below the tree showing recently archived tabs. Shows last 10 items by default.
- **Zone 5 – Footer Bar:** Contains workspace switcher icons, settings gear, and optional focus mode toggle/memory stats.

### 8.2 Visual Design Language

- **Color Palette:** Neutral base (gray-50 to gray-900 for light/dark mode). Accent colors from workspace theme. Active states use primary blue (#2E75B6).
- **Typography:** Inter or system font stack. 13px for tab titles, 11px for URLs/metadata, 14px for folder names.
- **Spacing:** 8px base grid. 4px between tab items, 12px between folders, 16px section padding.
- **Icons:** Lucide icon set for UI controls. Real favicons for tabs and pinned apps.
- **Animations:** Subtle 150ms transitions for expand/collapse, hover states, and workspace switching. No jarring or heavy animations.
- **Dark Mode:** Full dark mode support following `prefers-color-scheme` media query. Manual toggle available in settings.

---

## 9. Sprint Plan

### 9.1 Sprint 1: Foundation (Weeks 1–2)

**Goal:** A working sidebar with pinned apps and a flat tab list.

- Project scaffolding: Vite + React + TypeScript + Tailwind + MV3 manifest.
- Side Panel registration and basic HTML rendering.
- Service worker with tab event listeners (onCreated, onRemoved, onActivated, onUpdated).
- Tab list component: display all open tabs with favicons and titles.
- Tab switching: click a tab in sidebar to activate it.
- Pinned apps: add, remove, reorder, click-to-switch/open.
- Context menu: right-click tab → "Pin to ArcFlow."
- Basic light/dark theme support.
- Chrome local storage for pinned apps persistence.

### 9.2 Sprint 2: Organization (Weeks 3–4)

**Goal:** Folder-based organization, drag-and-drop, and basic search.

- Folder creation, renaming, deletion UI.
- Nested folders (up to 3 levels).
- Drag-and-drop: tabs into folders, reorder folders, reorder tabs within folders.
- Saved links: ability to save a URL into a folder without opening as tab.
- Tab search bar with fuzzy matching across open tabs and saved links.
- Tab close from sidebar (X button).
- Visual indicators: active tab highlight, audio playing, discarded state.
- Folder-level actions: Open All, Close All, Collapse All.

### 9.3 Sprint 3: Workspaces (Weeks 5–6)

**Goal:** Multi-workspace support with independent sidebar states.

- Workspace data model and storage schema.
- Workspace CRUD: create, rename, set emoji/color, delete.
- Workspace switcher UI in sidebar footer.
- Tab-to-workspace assignment (tabs belong to one workspace at a time).
- Workspace isolation: switching hides/shows relevant tabs (configurable).
- Keyboard shortcuts for workspace switching.
- Default workspace that cannot be deleted.
- New tab assignment: tabs opened within a workspace auto-assign to it.

### 9.4 Sprint 4: Intelligence (Weeks 7–8)

**Goal:** Auto-archive, tab suspension, and command palette.

- Auto-archive engine: track tab last-active timestamps, archive after threshold.
- Archive section in sidebar with restore-on-click.
- Tab suspension (`chrome.tabs.discard`) for memory management.
- Memory stats display in sidebar footer.
- Command palette (`Ctrl+Shift+K`): quick actions searchable by name.
- Settings panel: theme, auto-archive duration, shortcuts, workspace preferences.
- Import/export settings and workspace data as JSON.

### 9.5 Sprint 5–6: Power Features (Weeks 9–12)

**Goal:** AI grouping, split view, Air Traffic Control, and polish.

- AI tab grouping (domain-based + optional LLM integration).
- Split view: drag tab onto another to open side-by-side windows.
- Air Traffic Control: link routing rules by domain to workspace.
- Session save/restore functionality.
- Focus mode with URL redirect rules.
- Onboarding flow for first-time users.
- Performance audit and optimization pass.
- Accessibility audit (keyboard navigation, screen reader support).
- Chrome Web Store listing preparation.
- Open-source repository setup (GitHub, README, contributing guide, MIT license).

---

## 10. Success Metrics

### 10.1 Personal Use KPIs (Initial Phase)

| Metric | Target | Measurement Method |
|---|---|---|
| Daily Active Use | Used every workday | Self-reporting + sidebar open count |
| Average Open Tabs | Reduced by 40% | Before/after comparison over 2 weeks |
| Context Switch Time | < 2 seconds | Time to find correct workspace/tab |
| Tab Recovery Rate | 90% of needed tabs found via sidebar/archive | Self-reporting |
| Performance Impact | No perceptible slowdown | Subjective + memory monitoring |

### 10.2 Community Metrics (Post-Launch)

| Metric | Target (6 months) | Measurement Method |
|---|---|---|
| GitHub Stars | 500+ | GitHub repository metrics |
| Weekly Active Users | 1,000+ | Chrome Web Store analytics |
| Chrome Web Store Rating | 4.5+ stars | Store reviews |
| Bug Reports Resolved | < 7 day avg resolution | GitHub Issues tracker |
| Community PRs Merged | 10+ per quarter | GitHub PR metrics |

---

## 11. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Chrome Side Panel API limitations (no min-width control, user can resize to very small) | Medium | High | Design responsive UI that degrades gracefully. Show collapsed icon-only mode at narrow widths. |
| Chrome deprecates or changes Side Panel API | Critical | Low | Monitor Chromium extension changelogs. Architecture allows fallback to popup + new-tab page. |
| Performance degradation with 100+ tabs | High | Medium | Virtualized list rendering (react-window). Lazy favicon loading. Debounced tab event handlers. |
| User data loss on extension update | High | Low | Versioned storage schema with migration scripts. Backup reminder on major updates. |
| Chrome Web Store rejection | Medium | Low | Adhere to single-purpose policy. Clear privacy policy. No remote code execution. |
| Scope creep during development | Medium | High | Strict tier-based prioritization. Ship P0 before starting P1. User testing at each tier. |
| Competition from Chrome's native vertical tabs (testing late 2025) | High | Medium | Differentiate through workspaces, folders, and auto-archiving. Native vertical tabs are flat lists without organization. |

---

## 12. Open Questions & Decisions Needed

- **Naming:** "ArcFlow" is a working title. Should we choose something more distinctive that doesn't reference Arc directly, given potential trademark concerns?
- **Tab Bar Behavior:** Should ArcFlow attempt to visually hide Chrome's native tab bar (via CSS injection on chrome pages, which has limitations), or simply encourage users to keep it as a secondary reference?
- **Sync Strategy:** `chrome.storage.sync` has a 100KB limit. For users with many workspaces/folders, should we implement our own sync mechanism or keep it local-only initially?
- **AI Grouping Backend:** Should AI tab grouping be purely on-device (domain heuristics + keyword extraction), or should we offer optional LLM integration (Anthropic API call)? Privacy implications vs. quality tradeoffs.
- **Mobile Companion:** Should the roadmap include a companion Chrome extension for Android Chrome, or is this purely a desktop experience?
- **Monetization (Long-term):** If ArcFlow gains traction, should premium features (AI grouping, cloud sync, team workspaces) be gated behind a paid tier, or remain fully free/open-source?
- **Relationship with Existing Extensions:** Should ArcFlow integrate with or be interoperable with extensions like Side Space, or position as a standalone alternative?

---

## 13. Appendix

### 13.1 Glossary

- **Workspace:** An isolated browsing context with its own set of pinned apps, folders, and tabs. Analogous to Arc's Spaces.
- **Pinned App:** A frequently-used website represented as a favicon icon in the sidebar's top row. Clicking switches to or opens the app.
- **Folder:** A user-created container for organizing tabs and saved links. Supports nesting.
- **Auto-Archive:** The process of automatically moving inactive tabs to an archive section and discarding them from memory.
- **Tab Discard:** Chrome's built-in mechanism (`chrome.tabs.discard`) that unloads a tab from memory while keeping it in the tab strip.
- **Air Traffic Control:** Rules-based routing of externally-opened links to specific workspaces.
- **Side Panel:** Chrome's native surface (`chrome.sidePanel` API) for hosting extension UI alongside the main browsing area.
- **Command Palette:** A keyboard-activated quick-action menu for performing sidebar operations without mouse interaction.

### 13.2 Reference Materials

- Chrome Side Panel API Documentation: [developer.chrome.com/docs/extensions/reference/api/sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- Chrome Tabs API Documentation: [developer.chrome.com/docs/extensions/reference/api/tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- Chrome Tab Groups API: [developer.chrome.com/docs/extensions/reference/api/tabGroups](https://developer.chrome.com/docs/extensions/reference/api/tabGroups)
- Arc Browser Wikipedia: [en.wikipedia.org/wiki/Arc_(web_browser)](https://en.wikipedia.org/wiki/Arc_(web_browser))
- Zen Browser Documentation: [docs.zen-browser.app](https://docs.zen-browser.app)
- Side Space Extension: [sidespace.app](https://sidespace.app)

---

*End of Document*
