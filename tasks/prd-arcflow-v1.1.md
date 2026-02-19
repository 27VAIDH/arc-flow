# ArcFlow v1.1 - Structured Product Requirements Document

**Version:** 1.1 | **Date:** February 2026
**Author:** Vaidh | **Status:** Implementation-Ready
**Source:** Converted from `ArcFlow_PRD_v1.1.md` (narrative PRD)
**Predecessor:** `tasks/prd-arcflow.md` (v1.0 structured PRD, US-001 through US-040)

---

## 1. Product Overview

ArcFlow v1.1 is a targeted update focused on **user delight and stickiness**. It adds three features to the existing v1.0 extension: Workspace Templates for fast onboarding, Tab Preview on Hover for quick tab identification, and Quick Notes per Workspace for context persistence across workspace switches.

### 1.1 Design Principles (Inherited from v1.0)

1. **Sidebar-First** -- All features live within the existing side panel.
2. **Progressive Complexity** -- Templates help beginners; notes and preview help power users.
3. **Zero-Config Defaults** -- Templates work out of the box; notes default to collapsed.
4. **Performance is a Feature** -- Hover preview is lazy-mounted; notes auto-save is debounced.
5. **Data Ownership** -- All data stays in `chrome.storage.local`.

### 1.2 Scope

**In Scope (v1.1):**
- 6 built-in workspace templates (Developer, Student, Creative, Work, Research, Personal)
- Tab hover preview card with full title, URL, domain, last active time, workspace badge
- Plain-text quick notes per workspace with auto-save
- Schema migration v2 → v3 for notes fields
- Integration with onboarding flow and workspace creation flow

**Non-Goals (v1.1):**
- NG-1: Custom user-created templates
- NG-2: Tab screenshot thumbnails
- NG-3: Rich-text or markdown notes
- NG-4: Notes sync across devices
- NG-5: Template sharing/import between users

---

## 2. Technical Context

### 2.1 New Files

| File | Purpose |
|------|---------|
| `src/sidepanel/WorkspaceTemplates.tsx` | Template picker modal |
| `src/sidepanel/TabPreviewCard.tsx` | Hover preview card |
| `src/sidepanel/QuickNotes.tsx` | Per-workspace notes |
| `src/shared/templates.ts` | Static template definitions |

### 2.2 Modified Files

| File | Changes |
|------|---------|
| `src/shared/types.ts` | `WorkspaceTemplate` type; extend `Workspace` with notes fields |
| `src/shared/workspaceStorage.ts` | `createWorkspaceFromTemplate()`; v2→v3 migration |
| `src/sidepanel/App.tsx` | Integrate preview card + quick notes; update workspace creation |
| `src/sidepanel/WorkspaceSwitcher.tsx` | Template picker modal on "+" click |
| `src/sidepanel/Onboarding.tsx` | Step 2 template selection option |
| `src/sidepanel/CommandPalette.tsx` | "Focus Notes" command |
| `src/sidepanel/SessionManager.tsx` | Notes in session snapshot |
| `src/background/service-worker.ts` | `get-tab-info` message handler |

### 2.3 Chrome API Permissions

No new permissions required. Uses existing: `storage`, `tabs`, `sidePanel`.

### 2.4 Data Model Changes

```
Workspace (v3 — adds 3 fields to v2):
  ... existing v2 fields ...
  notes: string              // Plain text, max 2000 chars, default ''
  notesCollapsed: boolean    // UI state, default true
  notesLastEditedAt: number  // Timestamp, default 0

WorkspaceTemplate (new type):
  id: string
  name: string
  emoji: string
  accentColor: string
  pinnedApps: { url: string, title: string }[]
  folders: string[]
```

---

## 3. User Stories

User stories continue from v1.0 numbering (US-041 onwards).

---

### 3.1 Feature: Workspace Templates

#### US-041: Template Data and Type Definitions

**As a** developer,
**I want** workspace templates defined as static typed data,
**so that** template features have a reliable, type-safe data source.

**Acceptance Criteria:**
- [ ] AC-041.1: `WorkspaceTemplate` type defined in `src/shared/types.ts` with fields: `id`, `name`, `emoji`, `accentColor`, `pinnedApps[]`, `folders[]`
- [ ] AC-041.2: 6 templates defined in `src/shared/templates.ts`: Developer, Student, Creative, Work, Research, Personal
- [ ] AC-041.3: Each template has 4-5 pinned app URLs and 3 folder names
- [ ] AC-041.4: Template data is exported as a `WORKSPACE_TEMPLATES` constant array
- [ ] AC-041.5: All pinned app URLs are stable root URLs (no path-specific URLs that may break)
- [ ] AC-041.6: TypeScript compiles without errors with the new types

**Functional Requirements:**
- FR-041.1: Template type is `{ id: string, name: string, emoji: string, accentColor: string, pinnedApps: { url: string, title: string }[], folders: string[] }`
- FR-041.2: Template IDs are kebab-case strings (e.g., `"developer"`, `"student"`)
- FR-041.3: Template data is purely static — no network requests, no dynamic generation

---

#### US-042: Create Workspace from Template

**As a** user,
**I want** to create a workspace pre-populated with pinned apps and folders from a template,
**so that** I can start using a purpose-built workspace in seconds instead of setting it up manually.

**Acceptance Criteria:**
- [ ] AC-042.1: `createWorkspaceFromTemplate(templateId)` function exists in `workspaceStorage.ts`
- [ ] AC-042.2: Calling it creates a new workspace with the template's name, emoji, and accent color
- [ ] AC-042.3: All template pinned apps are added to the new workspace
- [ ] AC-042.4: All template folders are created as top-level empty folders in the workspace
- [ ] AC-042.5: The new workspace is set as the active workspace after creation
- [ ] AC-042.6: If a workspace with the same name already exists, the new one gets " (2)" suffix
- [ ] AC-042.7: No tabs are opened — template only sets up workspace structure
- [ ] AC-042.8: Verify: call `createWorkspaceFromTemplate('developer')`, inspect storage — workspace has 5 pinned apps and 3 folders

**Functional Requirements:**
- FR-042.1: Function signature: `createWorkspaceFromTemplate(templateId: string): Promise<Workspace>`
- FR-042.2: Uses existing `createWorkspace()`, `addPinnedAppToWorkspace()`, and `createFolder()` internally
- FR-042.3: Pinned apps are added with `url` and `title` from template; `favicon` resolves to default (Chrome fetches on first visit)

---

#### US-043: Template Picker Modal

**As a** user,
**I want** a modal to choose between a blank workspace and templates when creating a new workspace,
**so that** I can see available templates and pick one with a single click.

**Acceptance Criteria:**
- [ ] AC-043.1: Clicking "+" in the workspace switcher opens a "Create Workspace" modal
- [ ] AC-043.2: Modal displays "Blank Workspace" as the first option (selected by default)
- [ ] AC-043.3: Below that, 6 template cards in a 2-column grid
- [ ] AC-043.4: Each template card shows: emoji (large), name, pinned apps count, folders count
- [ ] AC-043.5: Clicking a card selects it (single-select, highlight border)
- [ ] AC-043.6: "Create" button creates the selected workspace (blank or template) and closes the modal
- [ ] AC-043.7: "Cancel" button closes the modal without creating anything
- [ ] AC-043.8: Modal supports dark mode with appropriate styling
- [ ] AC-043.9: Modal is keyboard navigable (Tab to focus cards, Enter to select, Escape to cancel)
- [ ] AC-043.10: Verify in browser: click "+", select "Developer" template, click Create — workspace appears with pre-populated apps and folders

**Functional Requirements:**
- FR-043.1: Component: `WorkspaceTemplates.tsx` — self-contained modal
- FR-043.2: Props: `isOpen: boolean`, `onClose: () => void`, `onSelect: (templateId: string | null) => void`
- FR-043.3: Styling matches existing modal patterns (see `OrganizeTabsModal.tsx`)
- FR-043.4: Template cards: 140px min-width, 8px border-radius, 2px accent-color border on selection

---

#### US-044: Templates in Onboarding Flow

**As a** first-time user,
**I want** to select a workspace template during onboarding,
**so that** I start with a useful workspace structure from the very beginning.

**Acceptance Criteria:**
- [ ] AC-044.1: Onboarding Step 2 changes from "Create your first folder" to "Set up your workspace"
- [ ] AC-044.2: Step 2 shows the 6 template cards in a scrollable grid
- [ ] AC-044.3: Users can select one template or skip (existing Skip button still works)
- [ ] AC-044.4: Selecting a template and clicking "Next" creates the workspace immediately
- [ ] AC-044.5: If user already has a "Default" workspace, the template creates a second workspace
- [ ] AC-044.6: Step 3 ("Explore features") remains unchanged
- [ ] AC-044.7: Verify in browser: fresh install, complete onboarding with "Student" template — workspace created with Scholar, Notion, etc.

**Functional Requirements:**
- FR-044.1: Modify `Onboarding.tsx` Step 2 content and handler
- FR-044.2: Reuse `WORKSPACE_TEMPLATES` constant for consistency
- FR-044.3: Template selection is optional — skipping proceeds to Step 3 without creating a template workspace

---

### 3.2 Feature: Tab Preview on Hover

#### US-045: Tab Preview Card Component

**As a** developer,
**I want** a reusable preview card component that displays rich tab info,
**so that** it can be triggered by hover events on tab entries.

**Acceptance Criteria:**
- [ ] AC-045.1: `TabPreviewCard` component renders with: favicon (24x24), domain, full page title (max 2 lines), full URL (smart-truncated), last active time, workspace badge
- [ ] AC-045.2: Component accepts props: `tab: TabInfo`, `position: { top, left }`, `onClose: () => void`
- [ ] AC-045.3: Card is 280px wide with 12px padding
- [ ] AC-045.4: Full URL hides protocol (`https://`), truncates middle if > 60 chars
- [ ] AC-045.5: URL has a click-to-copy icon that copies the full URL to clipboard
- [ ] AC-045.6: "Last active" displays relative time (e.g., "Active 23 minutes ago", "Active now")
- [ ] AC-045.7: Workspace badge shows workspace emoji + name
- [ ] AC-045.8: Suspended tabs show "Suspended" status indicator
- [ ] AC-045.9: Tabs playing audio show "Playing audio" status indicator
- [ ] AC-045.10: Card supports dark and light mode
- [ ] AC-045.11: Card renders as a React portal (to escape sidebar overflow/scroll clipping)
- [ ] AC-045.12: Verify in browser: preview card shows all fields correctly for a sample tab

**Functional Requirements:**
- FR-045.1: Component file: `src/sidepanel/TabPreviewCard.tsx`
- FR-045.2: Use `ReactDOM.createPortal` to render card at document body level
- FR-045.3: Position: card appears to the right of the tab entry; falls back to left if clipped
- FR-045.4: Relative time utility: reuse the same formatter for Quick Notes "Last edited"

---

#### US-046: Hover Trigger and Delay Logic

**As a** user,
**I want** the preview card to appear after a brief hover and disappear when I move away,
**so that** I get useful info without the card being disruptive during normal mouse movement.

**Acceptance Criteria:**
- [ ] AC-046.1: Hovering over a tab entry in the folder/tab tree for 400ms triggers the preview card
- [ ] AC-046.2: Moving the mouse away from the tab entry hides the card immediately
- [ ] AC-046.3: Moving the mouse from the tab entry onto the card keeps the card visible (for URL copying)
- [ ] AC-046.4: Moving the mouse away from the card hides it
- [ ] AC-046.5: Quick mouse movement across tabs does NOT flash multiple cards (debounced by 400ms delay)
- [ ] AC-046.6: Only one preview card is visible at a time
- [ ] AC-046.7: No preview card for pinned apps (they already have hover tooltips)
- [ ] AC-046.8: No preview card for archive entries
- [ ] AC-046.9: Card fades in over 100ms; hides immediately (no fade-out)
- [ ] AC-046.10: Verify in browser: quickly move mouse across 5 tabs — no card flashes; hover on one tab for 400ms+ — card appears

**Functional Requirements:**
- FR-046.1: Use `onMouseEnter`/`onMouseLeave` events on tab entry elements
- FR-046.2: `setTimeout` with 400ms delay; clear on `onMouseLeave`
- FR-046.3: State: `hoveredTabId: number | null` and `previewPosition: { top, left } | null`
- FR-046.4: Card position calculated from the tab entry's `getBoundingClientRect()`

---

#### US-047: Service Worker Tab Info Endpoint

**As a** developer,
**I want** the service worker to respond with tab info (including last active time),
**so that** the preview card can display data not available from the tabs API alone.

**Acceptance Criteria:**
- [ ] AC-047.1: Service worker handles `{ type: 'get-tab-info', tabId: number }` messages
- [ ] AC-047.2: Response includes: `lastActiveAt` timestamp, workspace name, workspace emoji
- [ ] AC-047.3: If the tab is the currently active tab, `lastActiveAt` returns current time
- [ ] AC-047.4: If the tab's workspace is unknown, returns "Default" workspace info
- [ ] AC-047.5: Response is returned within 50ms (all data is in-memory or local storage)
- [ ] AC-047.6: Verify: send `get-tab-info` message from side panel — receive correct data

**Functional Requirements:**
- FR-047.1: Add message handler in `service-worker.ts` `chrome.runtime.onMessage` listener
- FR-047.2: `lastActiveAt` is already tracked per-tab for auto-archive; reuse that data
- FR-047.3: Workspace lookup via existing `tabWorkspaceMap` and `getWorkspaces()`

---

### 3.3 Feature: Quick Notes per Workspace

#### US-048: Schema Migration v2 → v3

**As a** developer,
**I want** the workspace schema upgraded to include notes fields,
**so that** existing workspaces gain notes support without data loss.

**Acceptance Criteria:**
- [ ] AC-048.1: Schema version constant updated from `2` to `3`
- [ ] AC-048.2: Migration function `migrateV2ToV3` adds `notes: ''`, `notesCollapsed: true`, `notesLastEditedAt: 0` to each workspace
- [ ] AC-048.3: Existing workspace data (name, emoji, color, pinned apps, folders) is preserved exactly
- [ ] AC-048.4: Migration runs automatically on extension load if current schema is v2
- [ ] AC-048.5: New installations start at schema v3 with notes fields present
- [ ] AC-048.6: Verify: create test workspaces in v2 schema, run migration — all data intact, notes fields added

**Functional Requirements:**
- FR-048.1: Migration logic in `workspaceStorage.ts`, following existing v1→v2 migration pattern
- FR-048.2: Migration is idempotent — running on already-v3 data is a no-op
- FR-048.3: `Workspace` interface in `types.ts` updated with: `notes: string`, `notesCollapsed: boolean`, `notesLastEditedAt: number`

---

#### US-049: Quick Notes Component

**As a** user,
**I want** a collapsible notes area in the sidebar for the current workspace,
**so that** I can jot down quick context, TODOs, and links related to my current task.

**Acceptance Criteria:**
- [ ] AC-049.1: Notes area appears between the folder/tab tree (Zone 3) and archive section (Zone 4)
- [ ] AC-049.2: Collapsed state shows: "Notes" label with character count badge and expand chevron (~32px height)
- [ ] AC-049.3: Expanded state shows a textarea (min 80px, max 200px height, resizable)
- [ ] AC-049.4: Textarea placeholder rotates between context-appropriate messages
- [ ] AC-049.5: Typing auto-saves to `chrome.storage.local` debounced at 500ms
- [ ] AC-049.6: Character limit of 2,000 characters enforced
- [ ] AC-049.7: Character counter (`X / 2000`) appears when content > 1,500 characters
- [ ] AC-049.8: "Last edited: X ago" timestamp shown below textarea
- [ ] AC-049.9: "Clear" button empties the note (with confirmation dialog)
- [ ] AC-049.10: Collapsed/expanded state persists per workspace
- [ ] AC-049.11: Switching workspaces shows the switched-to workspace's note content
- [ ] AC-049.12: Component supports dark and light mode
- [ ] AC-049.13: Verify in browser: type a note, switch workspace, switch back — note is still there

**Functional Requirements:**
- FR-049.1: Component file: `src/sidepanel/QuickNotes.tsx`
- FR-049.2: Props: `workspaceId: string`, `notes: string`, `notesCollapsed: boolean`, `notesLastEditedAt: number`, `onNotesChange: (notes: string) => void`, `onCollapseToggle: () => void`
- FR-049.3: Auto-save uses `useCallback` with `setTimeout`/`clearTimeout` for 500ms debounce
- FR-049.4: Placeholder messages array: 3 messages, rotate based on `workspaceId.charCodeAt(0) % 3`
- FR-049.5: Textarea uses `resize: vertical` CSS with `min-height: 80px`, `max-height: 200px`

---

#### US-050: Notes Integration with Existing Features

**As a** user,
**I want** notes to work seamlessly with workspace features I already use,
**so that** notes feel like a natural part of the workspace experience.

**Acceptance Criteria:**
- [ ] AC-050.1: Command palette includes "Focus Notes" action that expands and focuses the notes textarea
- [ ] AC-050.2: Session save/restore includes workspace notes in the snapshot
- [ ] AC-050.3: Restoring a session restores the note content for that workspace
- [ ] AC-050.4: Cloning a workspace (if supported) copies the note content
- [ ] AC-050.5: Deleting a workspace deletes its associated notes (no orphaned data)
- [ ] AC-050.6: Workspace export/import (JSON) includes notes
- [ ] AC-050.7: Verify in browser: save session with notes, restore — notes are back; clone workspace — notes copied

**Functional Requirements:**
- FR-050.1: Add `{ id: 'focus-notes', name: 'Focus Notes', icon: 'FileText', action: () => void }` to command registry
- FR-050.2: Session snapshot already captures full `Workspace` object — notes fields are automatically included
- FR-050.3: No special handling needed for delete — notes are part of workspace object, deleted together

---

### 3.4 Cross-Cutting Concerns

#### US-051: Accessibility for v1.1 Features

**As a** user with accessibility needs,
**I want** all v1.1 features to be keyboard-navigable and screen-reader compatible,
**so that** I can use templates, preview cards, and notes regardless of my abilities.

**Acceptance Criteria:**
- [ ] AC-051.1: Template picker modal is keyboard navigable (Tab, Arrow keys, Enter, Escape)
- [ ] AC-051.2: Template cards have ARIA labels: "Create [Template Name] workspace with [N] apps and [N] folders"
- [ ] AC-051.3: Tab preview card is announced by screen readers when it appears
- [ ] AC-051.4: Preview card can be dismissed with Escape key
- [ ] AC-051.5: Quick Notes textarea has ARIA label: "Workspace notes for [Workspace Name]"
- [ ] AC-051.6: Notes collapse/expand button has ARIA expanded state
- [ ] AC-051.7: Character count is announced as `aria-live="polite"` when approaching limit

**Functional Requirements:**
- FR-051.1: Template modal: `role="dialog"`, `aria-modal="true"`, focus trap
- FR-051.2: Preview card: `role="tooltip"`, `aria-describedby` linking to tab entry
- FR-051.3: Notes: `role="region"`, `aria-label`, `aria-expanded` on toggle

---

#### US-052: Performance Validation

**As a** developer,
**I want** all v1.0 performance budgets to remain met after v1.1 changes,
**so that** new features don't degrade the user experience.

**Acceptance Criteria:**
- [ ] AC-052.1: Initial sidebar render still < 200ms (notes section adds < 5ms)
- [ ] AC-052.2: Tab hover does not cause visible jank (preview card renders in < 16ms)
- [ ] AC-052.3: Notes auto-save does not block UI thread (debounced, async storage write)
- [ ] AC-052.4: Template creation completes in < 500ms (5 pinned apps + 3 folders)
- [ ] AC-052.5: Memory overhead increase < 2MB from v1.0 (all features combined)
- [ ] AC-052.6: Bundle size increase < 10KB gzipped from v1.0

**Functional Requirements:**
- FR-052.1: Measure with Chrome DevTools Performance panel
- FR-052.2: Tab preview card uses lazy mount — not in DOM until hover triggers
- FR-052.3: Notes component uses uncontrolled textarea with ref for minimum re-renders

---

## 4. Sprint Mapping

| Sprint | Weeks | User Stories | Goal |
|--------|-------|-------------|------|
| Sprint 7 | 13-14 | US-041 to US-052 | Workspace templates, tab preview, quick notes |

**Sprint 7 breakdown:**

| Phase | Stories | Days | Focus |
|-------|---------|------|-------|
| Week 1, Days 1-2 | US-041, US-048 | 2 | Types, templates data, schema migration |
| Week 1, Days 3-4 | US-042, US-043, US-044 | 2 | Template creation, picker modal, onboarding |
| Week 1, Day 5 | US-049 | 1 | Quick Notes component |
| Week 2, Days 1-2 | US-045, US-047 | 2 | Preview card component, service worker endpoint |
| Week 2, Day 3 | US-046 | 1 | Hover trigger logic |
| Week 2, Day 4 | US-050, US-051 | 1 | Feature integrations, accessibility |
| Week 2, Day 5 | US-052 | 1 | Performance validation, polish, version bump |

---

## 5. Dependencies

| Story | Depends On | Reason |
|-------|-----------|--------|
| US-042 | US-041 | Template creation needs template data |
| US-043 | US-042 | Modal calls `createWorkspaceFromTemplate()` |
| US-044 | US-042 | Onboarding calls `createWorkspaceFromTemplate()` |
| US-045 | US-047 | Preview card needs tab info from service worker |
| US-046 | US-045 | Hover logic triggers preview card component |
| US-049 | US-048 | Notes component needs v3 schema with notes fields |
| US-050 | US-049 | Integration needs notes component to exist |
| US-051 | US-043, US-045, US-049 | Accessibility audit needs all components |
| US-052 | All above | Performance check is final validation |

---

## 6. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R-1 | Template URLs become stale | Low | Medium | Use stable root URLs only; users can edit after creation |
| R-2 | Preview card causes jank on 100+ tabs | Medium | Low | Portal rendering, lazy mount, single card at a time |
| R-3 | Notes auto-save causes storage thrash | Low | Low | 500ms debounce, write only on content change |
| R-4 | Schema v2→v3 migration data loss | High | Very Low | Additive migration, existing fields untouched, test with real data |
| R-5 | Notes section reduces tab tree visible area | Medium | Medium | Default collapsed (32px); max expanded 200px; user can collapse |
| R-6 | Workspace name collision with templates | Low | Medium | Append " (2)" suffix if name exists |

---

## 7. Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| Templates | % of new workspaces using templates | > 50% |
| Templates | Time to first workspace setup | < 30 seconds |
| Preview | Tab identified without clicking | Self-reported improvement |
| Preview | Exploratory tab clicks reduced | 30% fewer |
| Notes | Active workspaces with non-empty notes | > 60% |
| Notes | "Where was I?" context loss | Eliminated |
| Overall | Daily sidebar interactions | +20% vs v1.0 |
| Overall | Performance budget met | All v1.0 targets still passing |

---

*End of Structured PRD — 12 user stories (US-041 to US-052), 80+ acceptance criteria, 40+ functional requirements*
