# PRODUCT REQUIREMENTS DOCUMENT

## ArcFlow v1.1

### User Delight & Stickiness Update

___

**Version 1.1 | February 2026**
**Author:** Vaidh (Product & Data)
**Status:** Draft | **Classification:** Open Source
**Predecessor:** ArcFlow PRD v1.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Motivation & Goals](#2-motivation--goals)
3. [v1.0 Status & Lessons](#3-v10-status--lessons)
4. [Feature Specification](#4-feature-specification)
5. [Technical Architecture](#5-technical-architecture)
6. [UI/UX Design](#6-uiux-design)
7. [Implementation Plan](#7-implementation-plan)
8. [Success Metrics](#8-success-metrics)
9. [Risks & Mitigations](#9-risks--mitigations)
10. [Appendix](#10-appendix)

---

## 1. Executive Summary

ArcFlow v1.0 is feature-complete with ~85% of the original PRD delivered, including all P0/P1 features and most P2 power-user features. The extension now provides a robust sidebar experience with pinned apps, nested folders, workspaces, auto-archive, tab suspension, command palette, AI tab grouping, split view, Air Traffic Control, session management, focus mode, and onboarding.

**ArcFlow v1.1 focuses on user delight and stickiness** — three targeted features that make ArcFlow indispensable for daily use and reduce friction during workspace setup, tab discovery, and context switching:

1. **Workspace Templates** — Pre-built workspace configurations for instant onboarding (Developer, Student, Creative, etc.)
2. **Tab Preview on Hover** — Rich info card showing page title, URL, domain, time since last active, and workspace badge when hovering over a tab in the sidebar
3. **Quick Notes per Workspace** — Collapsible notepad area per workspace for quick thoughts, links, and TODOs that persist across sessions

These features are scoped as low-to-medium effort with high user impact, designed to ship within a single development sprint (2 weeks).

---

## 2. Motivation & Goals

### 2.1 Why v1.1?

While v1.0 delivers a powerful tab management system, user feedback and self-testing reveal three friction points:

1. **Workspace setup is manual and tedious.** Creating a new workspace requires individually pinning apps and creating folders from scratch. Users who could benefit most from workspaces (those with distinct work/personal/project contexts) face a cold-start problem.

2. **Tab identification requires clicking.** With 20+ tabs in a workspace, users can't quickly identify a tab's content without clicking it. Favicons and truncated titles are often insufficient, especially for tabs from the same domain (e.g., multiple GitHub repos, multiple Google Docs).

3. **Context switching loses mental state.** When switching between workspaces, users lose their "where was I?" context. There's no lightweight place to jot down what they were doing, what to pick up next, or relevant links for the current task.

### 2.2 Goals

| Goal | Metric | Target |
|------|--------|--------|
| Reduce workspace setup time | Time to first meaningful workspace | < 30 seconds (from ~3 minutes manual) |
| Improve tab identification speed | Time to find a specific tab | 40% reduction via hover preview |
| Increase workspace switching confidence | Self-reported "context loss" | Eliminate "where was I?" moments |
| Increase daily active use | Sidebar interaction sessions/day | +20% over v1.0 baseline |

### 2.3 Non-Goals for v1.1

- **NG-v1.1-1:** Custom user-created templates (deferred to v1.2 — v1.1 ships built-in templates only)
- **NG-v1.1-2:** Tab screenshot thumbnails (MV3 limitation — `chrome.tabs.captureVisibleTab` requires active tab focus and is too intrusive)
- **NG-v1.1-3:** Rich-text or markdown notes (v1.1 ships plain-text notes; rich editing deferred)
- **NG-v1.1-4:** Note sync across devices (follows v1.0 local-only storage principle)
- **NG-v1.1-5:** Template sharing/import between users (deferred to community feature set)

---

## 3. v1.0 Status & Lessons

### 3.1 Shipped Features (v1.0)

| Tier | Feature | Status |
|------|---------|--------|
| P0 | Persistent Side Panel | Shipped |
| P0 | Pinned Apps (per-workspace) | Shipped |
| P0 | Folder-Based Tab Organization | Shipped |
| P0 | Active Tab Indicator & Switching | Shipped |
| P0 | Quick Tab Search (Fuzzy) | Shipped |
| P0 | Light/Dark Theme | Shipped |
| P1 | Workspaces (Spaces) | Shipped |
| P1 | Tab Auto-Archiving | Shipped |
| P1 | Tab Suspension & Memory Management | Shipped |
| P1 | Keyboard Shortcuts (Ctrl+Shift+1-4) | Shipped |
| P1 | Command Palette (Ctrl+Shift+K) | Shipped |
| P1 | Settings Panel | Shipped |
| P2 | AI Tab Grouping (Heuristic) | Shipped |
| P2 | Split View | Shipped |
| P2 | Air Traffic Control | Shipped |
| P2 | Session Save/Restore | Shipped |
| P2 | Focus Mode (URL Redirect) | Shipped |
| P2 | Onboarding Flow | Shipped |

### 3.2 Lessons from v1.0

1. **Per-workspace data model was the right call.** The v2 schema migration (pinned apps and folders per workspace) eliminated tab leakage and created clear workspace boundaries.
2. **Chrome's 4-command limit is real.** We used all 4 `chrome.commands` slots for workspace switching. Any new keyboard shortcuts must use the command palette or in-panel event listeners.
3. **Onboarding gets users started, but doesn't set up *meaningful* workspaces.** The 3-step flow helps pin apps and create a folder, but doesn't help users establish workflow-specific contexts.
4. **The sidebar footer is crowded.** Workspace switcher, settings, focus mode toggle, and memory stats all compete for Zone 5 space. New UI should avoid adding to the footer.

---

## 4. Feature Specification

### 4.1 Feature 1: Workspace Templates

#### 4.1.1 Overview

Pre-built workspace configurations that give users a curated starting point for common workflows. Templates pre-populate pinned apps and folders based on the use case, eliminating the cold-start problem.

#### 4.1.2 Template Catalog

| Template | Emoji | Accent Color | Pinned Apps | Pre-built Folders |
|----------|-------|-------------|-------------|-------------------|
| Developer | `💻` | `#22C55E` (green) | GitHub, StackOverflow, MDN, localhost:3000, npm | "Repos", "Docs", "Issues" |
| Student | `📚` | `#3B82F6` (blue) | Google Drive, Notion, Canvas/Blackboard, Wikipedia, Google Scholar | "Courses", "Research", "Assignments" |
| Creative | `🎨` | `#EC4899` (pink) | Figma, Dribbble, Behance, Pinterest, Coolors | "Inspiration", "Projects", "Assets" |
| Work | `💼` | `#F59E0B` (amber) | Gmail, Slack, Notion, Google Calendar, Jira | "Projects", "Meetings", "References" |
| Research | `🔬` | `#8B5CF6` (purple) | Google Scholar, PubMed, Zotero, arXiv, Wikipedia | "Papers", "Notes", "Data" |
| Personal | `🏠` | `#EF4444` (red) | Gmail, YouTube, Reddit, Twitter/X, Netflix | "Entertainment", "Shopping", "Bookmarks" |

#### 4.1.3 Entry Points

Templates are available at two moments:

1. **During onboarding (Step 2 enhancement):** After pinning apps in Step 1, Step 2 becomes "Choose a workspace template" instead of "Create your first folder." Users can select a template or skip to create a blank workspace.

2. **During workspace creation:** When clicking the "+" button in the workspace switcher, a modal offers "Blank Workspace" or one of the templates. The current simple inline creation is replaced with a template picker modal.

#### 4.1.4 Behavior

- Selecting a template creates a new workspace with the template's name, emoji, accent color, pinned apps, and empty folders.
- Pinned apps are added with their URLs — favicon and title resolve on first load.
- Users can rename, recolor, and modify the workspace immediately after creation (it's a starting point, not a constraint).
- Templates do not open any tabs — they only set up the workspace structure.
- If a template's pinned app URL is already pinned in another workspace, it's still added (workspaces are independent).

#### 4.1.5 Technical Notes

- Templates are defined as a static constant in `src/shared/constants.ts` — no network requests.
- Each template is a `WorkspaceTemplate` type: `{ name, emoji, accentColor, pinnedApps: { url, title }[], folders: string[] }`.
- Applying a template calls `createWorkspace()` then `addPinnedAppToWorkspace()` and `createFolder()` for each item.
- Template data is ~2KB total (6 templates × ~20 fields each). Zero runtime cost when not in use.

---

### 4.2 Feature 2: Tab Preview on Hover

#### 4.2.1 Overview

A rich info card that appears when hovering over a tab entry in the sidebar. Shows contextual information that helps users identify tabs without clicking, especially useful when multiple tabs share the same domain.

#### 4.2.2 Preview Card Content

The preview card displays:

| Field | Source | Example |
|-------|--------|---------|
| Page Title | `tab.title` (full, not truncated) | "ArcFlow - Product Requirements Document v1.0" |
| Full URL | `tab.url` | "https://github.com/user/arc-flow/blob/main/ArcFlow_PRD_v1.md" |
| Domain | Extracted from URL | "github.com" |
| Favicon | `tab.favIconUrl` (32x32, larger than sidebar) | GitHub favicon |
| Last Active | Computed from `lastActiveAt` timestamp | "Active 23 minutes ago" / "Active now" |
| Workspace Badge | Workspace name + emoji | "💻 Developer" |
| Tab Status | Derived from tab state | "Suspended" / "Playing audio" / "" |

#### 4.2.3 Interaction Design

- **Trigger:** Mouse hover over a tab entry in the sidebar (Zone 3 — Folder/Tab Tree).
- **Delay:** 400ms hover delay before showing (prevents flash on quick mouse movement).
- **Position:** Card appears to the right of the hovered tab entry, aligned to the top of the entry. If insufficient space on the right (sidebar near right edge), card appears to the left.
- **Dismiss:** Card hides immediately on mouse-out from both the tab entry and the card itself. Moving mouse onto the card keeps it visible (for URL copying).
- **Width:** 280px fixed width.
- **Animation:** 100ms fade-in, immediate fade-out.
- **No preview for:** Pinned apps row (those already have tooltips), archive entries (already show time).

#### 4.2.4 URL Display

The full URL is displayed with smart truncation:
- Protocol (`https://`) is hidden.
- Path segments beyond 60 characters are truncated with `...` in the middle.
- URL is selectable/copyable (click-to-copy with a small copy icon).

#### 4.2.5 "Last Active" Formatting

| Duration | Display |
|----------|---------|
| Currently active tab | "Active now" (green dot) |
| < 1 minute | "Active just now" |
| 1–59 minutes | "Active X minutes ago" |
| 1–23 hours | "Active X hours ago" |
| 1–6 days | "Active X days ago" |
| 7+ days | "Active on Feb 10" (date format) |

#### 4.2.6 Technical Notes

- Implemented as a `TabPreviewCard` React component rendered as a portal (to escape sidebar overflow).
- Uses `onMouseEnter` / `onMouseLeave` on tab entries with a `setTimeout` for the 400ms delay.
- `lastActiveAt` is already tracked in the service worker for auto-archive. The side panel requests it via `chrome.runtime.sendMessage({ type: 'get-tab-info', tabId })`.
- The workspace badge uses the existing `tabWorkspaceMap` to look up which workspace a tab belongs to.
- No new Chrome APIs needed — all data is already available from existing tab tracking.
- Performance: card is lazily rendered only on hover. No preloading of preview data.

---

### 4.3 Feature 3: Quick Notes per Workspace

#### 4.3.1 Overview

A collapsible notepad area within each workspace for jotting down quick thoughts, links, TODOs, and context. Helps users maintain mental state across workspace switches — answering "where was I?" when returning to a workspace.

#### 4.3.2 UI Design

- **Location:** Between Zone 3 (Folder/Tab Tree) and Zone 4 (Archive Section). This creates a new sub-zone (Zone 3.5).
- **Collapsed state (default):** A single-line header: "📝 Notes" with a character count badge and expand chevron. Takes up ~32px.
- **Expanded state:** A resizable textarea (min 80px, max 200px height) with the note content. The textarea is auto-focused on expand.
- **Persistence:** Notes auto-save on every keystroke (debounced at 500ms) to `chrome.storage.local`.
- **Per-workspace:** Each workspace has its own independent note. Switching workspaces shows that workspace's note.

#### 4.3.3 Note Features

- **Plain text only** (v1.1 scope). No markdown rendering, no rich text.
- **Character limit:** 2,000 characters per workspace note. Counter shows `X / 2000` when > 1,500 characters.
- **Timestamps:** "Last edited: 5 min ago" shown below the textarea in muted text.
- **Clear action:** A small "Clear" button (with confirmation) to empty the note.
- **Keyboard shortcut:** No dedicated shortcut (use command palette "Focus Notes" action).
- **Collapse memory:** The collapsed/expanded state persists per workspace.

#### 4.3.4 Suggested Use Cases

These are communicated via placeholder text that rotates:
- "What are you working on in this workspace?"
- "Jot down links, TODOs, or context for later..."
- "Quick notes to help you pick up where you left off"

#### 4.3.5 Data Model Extension

The `Workspace` type gains a new field:

```typescript
interface Workspace {
  // ... existing fields
  notes: string;              // Plain text, max 2000 chars
  notesCollapsed: boolean;    // UI state
  notesLastEditedAt: number;  // Timestamp for "Last edited" display
}
```

#### 4.3.6 Technical Notes

- Notes are stored directly in the workspace object in `chrome.storage.local`.
- Auto-save is debounced at 500ms using a `useCallback` + `setTimeout` pattern (consistent with existing debouncing patterns).
- Schema migration: v2 → v3. Migration adds `notes: ''`, `notesCollapsed: true`, `notesLastEditedAt: 0` to each existing workspace.
- Storage impact: 2,000 chars × ~2 bytes = ~4KB per workspace. With 10 workspaces, ~40KB — negligible against the 10MB `chrome.storage.local` quota.
- The `QuickNotes` component is a new file: `src/sidepanel/QuickNotes.tsx`.
- Command palette gains a new action: "Focus Notes" — expands and focuses the notes textarea.
- Session save/restore includes notes in the workspace snapshot.

---

## 5. Technical Architecture

### 5.1 New Files

| File | Purpose |
|------|---------|
| `src/sidepanel/WorkspaceTemplates.tsx` | Template picker modal component |
| `src/sidepanel/TabPreviewCard.tsx` | Hover preview card component |
| `src/sidepanel/QuickNotes.tsx` | Per-workspace notes component |
| `src/shared/templates.ts` | Template definitions (static data) |

### 5.2 Modified Files

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add `WorkspaceTemplate` type; extend `Workspace` with notes fields |
| `src/shared/workspaceStorage.ts` | Add `createWorkspaceFromTemplate()`; schema v2→v3 migration |
| `src/shared/constants.ts` | Add template catalog constant |
| `src/sidepanel/App.tsx` | Integrate `TabPreviewCard` and `QuickNotes`; update workspace creation flow |
| `src/sidepanel/WorkspaceSwitcher.tsx` | Replace inline creation with template picker modal |
| `src/sidepanel/Onboarding.tsx` | Update Step 2 to offer template selection |
| `src/sidepanel/CommandPalette.tsx` | Add "Focus Notes" command |
| `src/sidepanel/SessionManager.tsx` | Include notes in session snapshot/restore |
| `src/background/service-worker.ts` | Add `get-tab-info` message handler for preview card data |

### 5.3 Chrome API Usage

No new Chrome API permissions are required for v1.1. All features use existing permissions:

| Feature | APIs Used | Already Permitted? |
|---------|-----------|-------------------|
| Workspace Templates | `chrome.storage.local` | Yes |
| Tab Preview | `chrome.tabs.get()`, `chrome.runtime.sendMessage` | Yes (tabs, storage) |
| Quick Notes | `chrome.storage.local` | Yes |

### 5.4 Schema Migration (v2 → v3)

```typescript
function migrateV2ToV3(workspaces: Workspace[]): Workspace[] {
  return workspaces.map(ws => ({
    ...ws,
    notes: ws.notes ?? '',
    notesCollapsed: ws.notesCollapsed ?? true,
    notesLastEditedAt: ws.notesLastEditedAt ?? 0,
  }));
}
```

### 5.5 Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| Tab preview hover creates frequent re-renders | Card is lazily mounted only on hover; unmounted on mouse-out |
| Notes auto-save causes storage writes | Debounced at 500ms; only writes if content changed |
| Template picker modal loads images | No images — template picker uses emoji + text only |
| Schema migration on upgrade | Migration is O(n) over workspaces; typical n < 10 |

---

## 6. UI/UX Design

### 6.1 Workspace Template Picker Modal

```
┌─────────────────────────────────┐
│  Create Workspace               │
│                                 │
│  ○ Blank Workspace              │
│                                 │
│  ── Or start from a template ── │
│                                 │
│  ┌─────────┐  ┌─────────┐      │
│  │ 💻      │  │ 📚      │      │
│  │Developer│  │ Student  │      │
│  │ 5 apps  │  │ 5 apps   │      │
│  │ 3 dirs  │  │ 3 dirs   │      │
│  └─────────┘  └─────────┘      │
│  ┌─────────┐  ┌─────────┐      │
│  │ 🎨      │  │ 💼      │      │
│  │Creative │  │  Work    │      │
│  │ 5 apps  │  │ 5 apps   │      │
│  │ 3 dirs  │  │ 3 dirs   │      │
│  └─────────┘  └─────────┘      │
│  ┌─────────┐  ┌─────────┐      │
│  │ 🔬      │  │ 🏠      │      │
│  │Research │  │Personal  │      │
│  │ 5 apps  │  │ 5 apps   │      │
│  │ 3 dirs  │  │ 3 dirs   │      │
│  └─────────┘  └─────────┘      │
│                                 │
│  [Cancel]              [Create] │
└─────────────────────────────────┘
```

- **Layout:** 2-column grid of template cards.
- **Card content:** Emoji (large), name, count of pinned apps and folders.
- **Selection:** Single-select with highlight border. "Blank Workspace" is selected by default.
- **Create button:** Creates the workspace (blank or from template) and switches to it.
- **Styling:** Matches existing modal patterns (OrganizeTabsModal, SessionManager).

### 6.2 Tab Preview Card

```
┌──────────────────────────────┐
│ 🌐  github.com               │
│                              │
│ ArcFlow - Product            │
│ Requirements Document v1.0   │
│                              │
│ github.com/user/arc-flow/    │
│ blob/main/ArcFlow_PRD_v1.md 📋│
│                              │
│ ⏱ Active 23 minutes ago      │
│ 💻 Developer                  │
└──────────────────────────────┘
```

- **Header:** Large favicon (24x24) + domain name.
- **Title:** Full page title, word-wrapped (max 2 lines).
- **URL:** Full URL with smart truncation, copy icon on hover.
- **Footer:** Last active time + workspace badge.
- **Styling:** Dark surface (`gray-800` in dark mode, `white` in light mode), subtle shadow, 8px border radius.

### 6.3 Quick Notes Area

```
── Collapsed ──────────────────
📝 Notes (142 chars)          ▸

── Expanded ───────────────────
📝 Notes                      ▾
┌──────────────────────────────┐
│ TODO:                        │
│ - Review PR #42              │
│ - Update API docs            │
│ - Schedule standup           │
│                              │
│                              │
└──────────────────────────────┘
Last edited: 5 min ago   Clear
```

- **Position:** Below folder/tab tree, above archive section.
- **Collapse/Expand:** Click header row or chevron icon.
- **Textarea:** Full-width, resizable vertically (min 80px, max 200px).
- **Character count:** Shown when approaching limit (> 1,500 chars).
- **Last edited:** Muted text, relative time format.
- **Clear button:** Small text button, confirms before clearing.

---

## 7. Implementation Plan

### 7.1 Sprint 7: Delight & Stickiness (2 Weeks)

#### Week 1: Templates + Quick Notes

| Day | Task | Effort |
|-----|------|--------|
| 1 | Define `WorkspaceTemplate` type and template catalog in `templates.ts` | 2h |
| 1 | Schema v2→v3 migration (add notes fields to Workspace) | 2h |
| 2 | `WorkspaceTemplates.tsx` — template picker modal component | 4h |
| 2 | `createWorkspaceFromTemplate()` in `workspaceStorage.ts` | 2h |
| 3 | Integrate template picker into `WorkspaceSwitcher.tsx` (replace inline creation) | 3h |
| 3 | Update `Onboarding.tsx` Step 2 to offer templates | 3h |
| 4 | `QuickNotes.tsx` — notes component with auto-save | 4h |
| 4 | Integrate `QuickNotes` into `App.tsx` layout | 2h |
| 5 | Add "Focus Notes" to command palette; include notes in session save/restore | 3h |
| 5 | Testing: templates, notes, migration | 3h |

#### Week 2: Tab Preview + Polish

| Day | Task | Effort |
|-----|------|--------|
| 6 | `TabPreviewCard.tsx` — preview card component with layout | 4h |
| 6 | Add `get-tab-info` message handler to service worker | 2h |
| 7 | Integrate hover triggers on tab entries in `App.tsx` | 3h |
| 7 | Implement hover delay, positioning, and dismiss logic | 3h |
| 8 | URL copy-to-clipboard, relative time formatting utility | 2h |
| 8 | Dark/light mode styling for all three features | 2h |
| 9 | Integration testing: all features together, edge cases | 4h |
| 9 | Performance check: hover doesn't cause jank, notes save doesn't block | 2h |
| 10 | Accessibility: ARIA labels, keyboard support for preview card dismiss | 2h |
| 10 | Final polish, version bump to 1.1.0 | 2h |

**Total effort:** ~53 hours (2-week sprint for a solo developer)

### 7.2 Testing Strategy

| Feature | Test Type | What to Verify |
|---------|-----------|----------------|
| Workspace Templates | Unit | Template data integrity; `createWorkspaceFromTemplate` creates correct structure |
| Workspace Templates | Integration | Template picker modal → workspace creation → sidebar shows template content |
| Workspace Templates | Migration | v2 workspaces gain notes fields without data loss |
| Tab Preview | Unit | Relative time formatting; URL truncation; card content rendering |
| Tab Preview | Integration | Hover → delay → card appears → mouse-out → card disappears |
| Tab Preview | Edge cases | Suspended tab preview; tab with no favicon; very long URL |
| Quick Notes | Unit | Auto-save debounce; character limit enforcement; clear with confirmation |
| Quick Notes | Integration | Notes persist across workspace switch; notes included in session save |
| Quick Notes | Edge cases | Rapid typing doesn't cause storage thrash; empty note shows placeholder |

---

## 8. Success Metrics

### 8.1 Feature-Specific Metrics

| Feature | Metric | Target | Measurement |
|---------|--------|--------|-------------|
| Workspace Templates | Template usage rate | > 50% of new workspaces use a template | Count template vs. blank workspace creations in storage |
| Workspace Templates | Time to first workspace | < 30 seconds | Self-measurement during testing |
| Tab Preview | Hover-to-identify time | Tab identified without clicking | Self-reporting + observation |
| Tab Preview | Click-through reduction | 30% fewer exploratory tab clicks | Compare tab switch patterns before/after |
| Quick Notes | Notes adoption | > 60% of active workspaces have non-empty notes | Check `notes.length > 0` in workspace data |
| Quick Notes | Context switch confidence | "Where was I?" moments eliminated | Self-reporting |

### 8.2 Overall v1.1 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily sidebar interactions | +20% over v1.0 baseline | Self-tracking |
| Workspace creation rate | +50% increase (templates lower barrier) | Count workspaces in storage |
| Feature retention after 1 week | All 3 features still actively used | Self-reporting |
| No performance regression | All v1.0 performance budgets still met | Chrome DevTools profiling |

---

## 9. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R-v1.1-1 | Template pinned app URLs become stale (sites change URLs) | Low | Medium | Templates use stable root URLs (e.g., `github.com` not `github.com/specific-page`). Users can edit after creation. |
| R-v1.1-2 | Hover preview causes sidebar jank with 100+ tabs | Medium | Low | Card is portal-rendered, not in scroll flow. Hover only triggers on single tab at a time. Lazy mount/unmount. |
| R-v1.1-3 | Notes storage impacts workspace write performance | Low | Low | Notes are debounced (500ms). Only 2KB max per workspace. Existing workspace writes handle much larger payloads. |
| R-v1.1-4 | Schema migration v2→v3 causes data loss | High | Very Low | Migration is additive (new fields with defaults). Existing fields untouched. Migration tested with snapshot of real data. |
| R-v1.1-5 | Zone 3.5 (notes) reduces folder/tab tree visible area | Medium | Medium | Notes default to collapsed (32px). Expanded state is capped at 200px. Users can collapse to recover space. |
| R-v1.1-6 | Template names overlap with user's existing workspace names | Low | Medium | Templates create workspaces with " (Template)" suffix if name exists. Users can rename immediately. |

---

## 10. Appendix

### 10.1 Template Pinned App URLs

| App | URL |
|-----|-----|
| GitHub | `https://github.com` |
| StackOverflow | `https://stackoverflow.com` |
| MDN | `https://developer.mozilla.org` |
| localhost:3000 | `http://localhost:3000` |
| npm | `https://www.npmjs.com` |
| Google Drive | `https://drive.google.com` |
| Notion | `https://www.notion.so` |
| Canvas | `https://canvas.instructure.com` |
| Wikipedia | `https://en.wikipedia.org` |
| Google Scholar | `https://scholar.google.com` |
| Figma | `https://www.figma.com` |
| Dribbble | `https://dribbble.com` |
| Behance | `https://www.behance.net` |
| Pinterest | `https://www.pinterest.com` |
| Coolors | `https://coolors.co` |
| Gmail | `https://mail.google.com` |
| Slack | `https://app.slack.com` |
| Google Calendar | `https://calendar.google.com` |
| Jira | `https://www.atlassian.com/software/jira` |
| PubMed | `https://pubmed.ncbi.nlm.nih.gov` |
| Zotero | `https://www.zotero.org` |
| arXiv | `https://arxiv.org` |
| YouTube | `https://www.youtube.com` |
| Reddit | `https://www.reddit.com` |
| Twitter/X | `https://x.com` |
| Netflix | `https://www.netflix.com` |

### 10.2 Relative Time Formatting Reference

```typescript
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (diff < 60000) return 'Active just now';
  if (minutes < 60) return `Active ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `Active ${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `Active ${days} day${days > 1 ? 's' : ''} ago`;
  return `Active on ${new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
```

### 10.3 Glossary (New Terms)

| Term | Definition |
|------|-----------|
| **Workspace Template** | A pre-built workspace configuration with pinned apps and folder structure for a specific use case (e.g., Developer, Student). |
| **Tab Preview Card** | A hover-triggered info card showing full tab details (title, URL, domain, last active time, workspace). |
| **Quick Notes** | A collapsible plain-text notepad area attached to each workspace for jotting down context and TODOs. |
| **Schema Migration** | The process of upgrading the stored data format when new fields are added. v1.1 migrates from schema v2 to v3. |

---

*End of Document — ArcFlow v1.1 PRD*
*3 features | ~53 hours estimated effort | 1 sprint (2 weeks)*
