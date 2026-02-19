# PRD: ArcFlow v1.1 — Delight & Stickiness Update

## Introduction

ArcFlow v1.1 focuses on four UX improvements that elevate the sidebar panel from functional to delightful. These changes address core interaction pain points — broken drag-and-drop, inconsistent rename behavior — while adding polish features like swipe workspace navigation and panel color customization that increase personalization and stickiness.

**Branch:** `ralph/v1.1-delight-stickiness`

---

## Goals

- Enable fluid swipe navigation between workspaces with visual indicators and arrow fallbacks
- Let users customize the panel window background color (beyond accent color) for deeper personalization
- Completely overhaul drag-and-drop across all three sections (Pinned Apps, Folders, Open Tabs) for reliable, intuitive reordering and cross-section moves
- Fix double-click inline rename so it works consistently across all sections, matching right-click rename behavior
- Zero regressions to existing workspace isolation, tab management, or keyboard shortcuts

---

## User Stories

### Feature 1: Swipe Navigation Between Workspaces

#### US-001: Horizontal Swipe Gesture Between Workspaces
**Description:** As a user, I want to swipe left/right on the sidebar panel to switch between workspaces so that I can navigate quickly without clicking small targets.

**Acceptance Criteria:**
- [ ] Swiping left on the sidebar body switches to the next workspace (by sortOrder)
- [ ] Swiping right switches to the previous workspace
- [ ] Minimum swipe threshold of ~50px to avoid accidental triggers
- [ ] Swipe does not interfere with vertical scrolling of tabs/folders
- [ ] Works on trackpad (two-finger horizontal swipe) and touch devices
- [ ] Workspace switch calls existing `setActiveWorkspace()` flow

#### US-002: Boundary Conditions for Swipe Navigation
**Description:** As a user, when I'm on the first or last workspace, swiping further should give visual feedback that I've reached the edge rather than doing nothing silently.

**Acceptance Criteria:**
- [ ] Swiping right on the first workspace shows a rubber-band/bounce animation (no workspace switch)
- [ ] Swiping left on the last workspace shows the same bounce animation
- [ ] If only 1 workspace exists, swipe gestures are disabled entirely (no bounce, no handler)
- [ ] Edge feedback animation completes within 300ms

#### US-003: Swipe Direction Indicators
**Description:** As a user, I want to see dot indicators showing which workspace I'm on and how many exist, so I have spatial awareness during navigation.

**Acceptance Criteria:**
- [ ] Dot indicators appear in the footer area near the workspace switcher
- [ ] Active workspace dot is highlighted with the workspace's accent color
- [ ] Inactive dots are subtle/muted
- [ ] Dots update immediately on workspace switch (swipe, click, or keyboard shortcut)
- [ ] Dots are hidden when only 1 workspace exists

#### US-004: Arrow Button Fallback Navigation
**Description:** As a user, I want left/right arrow buttons near the workspace switcher as a fallback for navigating between workspaces without swiping.

**Acceptance Criteria:**
- [ ] Left arrow and right arrow buttons flank the workspace dots/switcher area
- [ ] Left arrow is hidden/disabled on first workspace
- [ ] Right arrow is hidden/disabled on last workspace
- [ ] Clicking arrows triggers the same `setActiveWorkspace()` flow as swipe
- [ ] Arrows respect the workspace `sortOrder` for ordering
- [ ] Arrows have hover states using `arc-accent-hover`

---

### Feature 2: Panel Window Color Customization

#### US-005: Add Panel Background Color Setting
**Description:** As a user, I want to change the background color of the entire sidebar panel so I can personalize my workspace environment beyond just the accent color.

**Acceptance Criteria:**
- [ ] New "Panel Color" option in SettingsPanel, placed near the existing "Accent Color" section
- [ ] Uses the same `COLOR_PALETTE` (12 preset colors) as accent color
- [ ] Includes a full color picker (hex input) for custom colors
- [ ] Selected color persists in `Settings` storage via `settingsStorage.ts`
- [ ] Default panel color is the current dark theme background (`#1a1a2e` or equivalent)

#### US-006: Apply Panel Color via CSS Variables
**Description:** As a developer, I need the panel color to be applied through CSS variables so it integrates with the existing theme system.

**Acceptance Criteria:**
- [ ] New CSS variables: `--color-arc-panel-bg` and `--color-arc-panel-bg-secondary` (slightly lighter variant for cards/sections)
- [ ] `useTheme.ts` hook applies panel color on load and on change, similar to `applyAccentColor()`
- [ ] Panel color auto-generates a secondary variant (10% lighter) for nested elements
- [ ] All major background classes in the sidebar reference the new CSS variable
- [ ] Contrast check: text remains readable on light panel colors (auto-switch text to dark if panel color luminance > 0.5)

#### US-007: Per-Workspace Panel Color (Optional Enhancement)
**Description:** As a user, I want each workspace to optionally have its own panel color so switching workspaces feels like entering a distinct environment.

**Acceptance Criteria:**
- [ ] `Workspace` interface extended with optional `panelColor?: string` field
- [ ] If workspace has a `panelColor`, it overrides the global setting
- [ ] If workspace `panelColor` is null/undefined, falls back to global panel color
- [ ] Panel color transitions smoothly (200ms CSS transition) when switching workspaces
- [ ] Color picker appears in workspace context menu under "Customize"

---

### Feature 3: Drag and Drop UX Overhaul

#### US-008: Add Visual Drag Feedback Across All Sections
**Description:** As a user, I want clear visual feedback when dragging items so I know what I'm moving and where it will land.

**Acceptance Criteria:**
- [ ] **Drag ghost/overlay:** All dragged items show a styled overlay (not browser default) with the item's favicon + title
- [ ] **Source dimming:** The original item dims to 30% opacity while being dragged (currently 50% for tabs only)
- [ ] **Drop indicator line:** A colored line (using `arc-accent`) appears between items to show insertion point
- [ ] **Folder highlight:** Folders glow/highlight when a draggable hovers over them as a valid drop target
- [ ] **Invalid drop:** Cursor changes to `not-allowed` when hovering over invalid drop zones
- [ ] Visual feedback is consistent across Pinned Apps, Folders, and Open Tabs sections

#### US-009: Fix Pinned Apps Drag and Drop
**Description:** As a user, I want to reorder pinned apps by dragging them smoothly in the horizontal row.

**Acceptance Criteria:**
- [ ] Pinned app icons can be grabbed and dragged horizontally
- [ ] Other icons animate/shift to make room for the dragged item (smooth 200ms transition)
- [ ] Drop position accurately reflects where the item will land
- [ ] Drag overlay shows the app icon at correct size (32x32)
- [ ] Reorder persists via `reorderPinnedApps()` after drop
- [ ] No accidental clicks trigger when starting a drag (5px activation distance preserved)

#### US-010: Fix Folder Drag and Drop
**Description:** As a user, I want to reorder folders, move items between folders, and drag tabs into folders reliably.

**Acceptance Criteria:**
- [ ] Folders can be reordered among siblings by dragging
- [ ] Folder items can be reordered within the same folder
- [ ] Folder items can be dragged from one folder to another
- [ ] Open tabs can be dragged into folder drop zones
- [ ] Tab-to-folder drop creates a `FolderItem` with correct `title`, `url`, and `favIconUrl`
- [ ] Nested folders maintain parent-child relationships during reorder
- [ ] Expanded/collapsed state of folders is preserved during drag operations
- [ ] Drop zone for folders is generous (entire folder header row, not just the icon)

#### US-011: Fix Open Tabs Drag and Drop
**Description:** As a user, I want to reorder open tabs by dragging them in the tab list.

**Acceptance Criteria:**
- [ ] Tabs can be reordered within the open tabs list by dragging
- [ ] Reordering updates the visual list immediately (optimistic UI)
- [ ] Tab order persists across sidebar re-opens
- [ ] Dragging a tab out of the list toward a folder highlights the folder as a drop target
- [ ] Virtual scrolling (react-window for >50 tabs) does not break drag behavior — items remain draggable in virtualized lists
- [ ] Drag handle grip icon is visible on hover for each tab item

#### US-012: Cross-Section Drag Interactions
**Description:** As a user, I want to drag items between sections (e.g., tab into folder, folder item to pinned apps) where it makes logical sense.

**Acceptance Criteria:**
- [ ] Tab → Folder: Dragging an open tab onto a folder adds it as a folder item
- [ ] Folder Item → Another Folder: Moving items between folders via drag
- [ ] Invalid cross-section drags (e.g., folder onto pinned apps row) show `not-allowed` cursor
- [ ] All cross-section drops call the correct storage functions (`addItemToFolder`, `moveItemToFolder`, etc.)
- [ ] No duplicate items created during cross-section moves

---

### Feature 4: Fix Double-Click Rename Across All Sections

#### US-013: Fix Folder Double-Click Rename
**Description:** As a user, I want to double-click a folder name to rename it inline, and pressing Enter should save the new name.

**Acceptance Criteria:**
- [ ] Double-clicking folder name enters inline edit mode (input appears with current name)
- [ ] Input is auto-focused and text is fully selected
- [ ] Pressing Enter saves the new name via `renameFolder()` → `renameFolderInWorkspace()`
- [ ] Pressing Escape cancels without saving
- [ ] Clicking outside (blur) saves the new name
- [ ] Empty or whitespace-only names are rejected (reverts to original)
- [ ] `committedRef` guard prevents double-commit on simultaneous blur + Enter
- [ ] Renamed folder name appears immediately in the UI (no reload needed)
- [ ] The `onKeyDown` handler properly calls `commitRename()` on Enter (verify event not swallowed by parent)

#### US-014: Enable Folder Item Double-Click Rename
**Description:** As a user, I want to double-click items inside folders to rename them inline, matching the folder rename experience.

**Acceptance Criteria:**
- [ ] Double-clicking a folder item's title enters inline edit mode
- [ ] Input shows current title, auto-focused with text selected
- [ ] Enter saves via `renameItemInFolder()` → `renameItemInFolderInWorkspace()`
- [ ] Escape cancels
- [ ] Blur saves
- [ ] Empty names rejected
- [ ] Double-click does not also trigger navigation to the item's URL
- [ ] Renamed title appears immediately in the UI

#### US-015: Enable Pinned App Double-Click Rename
**Description:** As a user, I want to double-click a pinned app's label area to rename it inline.

**Acceptance Criteria:**
- [ ] Double-clicking the pinned app icon area (or tooltip label) enters inline edit mode
- [ ] Inline input appears below/above the icon with current title
- [ ] Enter saves via `updatePinnedApp(id, { title: newName })`
- [ ] Escape cancels
- [ ] Blur saves
- [ ] Empty names rejected
- [ ] Double-click does not also open the pinned app's URL
- [ ] Renamed title updates the tooltip and any visible labels

#### US-016: Enable Open Tab Double-Click Rename
**Description:** As a user, I want to double-click an open tab's title to give it a custom display name in the sidebar.

**Acceptance Criteria:**
- [ ] Double-clicking a tab title in the sidebar enters inline edit mode
- [ ] Input shows current tab title, auto-focused with text selected
- [ ] Enter saves a custom display name (stored in workspace data or local override map)
- [ ] Escape cancels
- [ ] Blur saves
- [ ] Custom name persists across sidebar re-opens
- [ ] Custom name is visually distinguished (e.g., italic or small icon) so user knows it's renamed
- [ ] Double-click does not also switch to/activate the tab
- [ ] Original tab title accessible via tooltip on hover

---

## Functional Requirements

### Swipe Navigation
- FR-1: Register horizontal swipe gesture listeners on the sidebar panel main content area
- FR-2: Calculate swipe direction and distance; require minimum 50px horizontal movement with < 30deg angle from horizontal
- FR-3: On valid left swipe, call `setActiveWorkspace(nextWorkspaceId)` based on `sortOrder`
- FR-4: On valid right swipe, call `setActiveWorkspace(prevWorkspaceId)` based on `sortOrder`
- FR-5: At boundaries (first/last workspace), play a CSS rubber-band animation instead of switching
- FR-6: Render dot indicators in footer synced with workspace count and active index
- FR-7: Render arrow buttons that call the same switching logic, disabled at boundaries

### Panel Color
- FR-8: Add `panelColor` field to `Settings` interface in `settingsStorage.ts`
- FR-9: Add `panelColor?: string` optional field to `Workspace` interface in `types.ts`
- FR-10: Create `applyPanelColor(color: string)` in `useTheme.ts` that sets `--color-arc-panel-bg` and auto-computes secondary variant
- FR-11: Add color picker UI in SettingsPanel under "Panel Color" section with same 12 presets + hex input
- FR-12: On workspace switch, apply workspace-specific `panelColor` if set, else fall back to global
- FR-13: Implement luminance check — if panel color luminance > 0.5, add `light-panel` class for text contrast

### Drag and Drop
- FR-14: Implement `DragOverlay` components for all three sections showing styled preview (favicon + title)
- FR-15: Add CSS drop indicator line using `::before`/`::after` pseudo-elements on sortable items when `isOver`
- FR-16: Increase folder drop zone hit area to full folder header row width
- FR-17: Add `SortableContext` with `verticalListSortingStrategy` to Open Tabs section
- FR-18: Ensure `customCollisionDetection` correctly prioritizes folder-drop targets over sortable siblings
- FR-19: Add tab reorder persistence — store custom tab order per workspace in `chrome.storage.local`
- FR-20: Handle react-window virtualized list drag by temporarily switching to non-virtualized mode during drag
- FR-21: Apply consistent 30% opacity to source items across all sections during drag

### Rename
- FR-22: In `FolderHeader.onKeyDown`, verify `commitRename()` is called on Enter and the event is not stopped by parent handlers (check `e.stopPropagation()`)
- FR-23: Add inline edit state (`editing`, `editName`, `inputRef`, `committedRef`) to `FolderItem` component in `FolderTree.tsx`
- FR-24: Add `onDoubleClick` handler to `FolderItem` title that sets edit mode and prevents URL navigation via `e.preventDefault()`
- FR-25: Add inline edit state to `DraggableTabItem` in `App.tsx` with `onDoubleClick` handler that prevents tab activation
- FR-26: Extend `PinnedAppsRow` to support `onDoubleClick` on pinned app icons that triggers existing `setEditingApp()` flow
- FR-27: All inline rename inputs must: auto-focus, select all text, commit on Enter, cancel on Escape, commit on blur, reject empty strings
- FR-28: Use `committedRef` guard pattern consistently across all rename implementations to prevent double-commit

---

## Non-Goals (Out of Scope)

- **Swipe to delete** tabs or folders (only swipe to navigate between workspaces)
- **Drag tabs between windows** — only within the ArcFlow sidebar panel
- **Drag to create new folders** — folders are still created via the + button
- **Panel color gradients or images** — only solid colors for panel background
- **Renaming Chrome's actual tab title** — only the display name within ArcFlow sidebar
- **Multi-select drag** — dragging multiple items at once is out of scope
- **Animation/transition overhaul** beyond what's specified for swipe and drag
- **Mobile/responsive layout** — ArcFlow runs in Chrome's fixed-width side panel

---

## Design Considerations

- **Swipe gesture area:** Should cover the main scrollable area but NOT the footer workspace switcher (to avoid conflict with emoji clicks)
- **Panel color picker:** Reuse the same `COLOR_PALETTE` grid and hex input pattern from the accent color section in SettingsPanel
- **Drag overlay styling:** Match the existing `TabDragOverlay` component style (dark card with favicon + truncated title) but extend to all item types
- **Drop indicator:** A 2px horizontal line in `arc-accent` color, positioned between items via CSS transforms
- **Inline rename input:** Match existing `FolderHeader` input styling — same height as the item, transparent background, subtle bottom border, `text-sm` size
- **Workspace dots:** Small (6px) circles, spaced 8px apart, positioned in footer between arrow buttons

### Existing Components to Reuse
- `COLOR_PALETTE` array from `SettingsPanel.tsx` / `WorkspaceSwitcher.tsx`
- `lightenColor()` from `useTheme.ts` for generating secondary panel color
- `TabDragOverlay` component pattern from `App.tsx` lines 293-306
- `FolderHeader` inline edit pattern from `FolderTree.tsx` lines 38-154
- `editingApp` state pattern from `PinnedAppsRow.tsx` lines 165-259

---

## Technical Considerations

- **Swipe detection:** Use `touchstart`/`touchmove`/`touchend` for touch + `wheel` event with `deltaX` for trackpad. Consider a lightweight gesture library or custom hook `useSwipeGesture()` to handle threshold, angle, and velocity calculations
- **Swipe vs scroll conflict:** Only trigger workspace switch when horizontal swipe distance > vertical distance (angle < 30deg from horizontal)
- **Panel color performance:** CSS variable changes trigger repaint but not reflow — performance impact is minimal
- **Panel color storage migration:** Add schema version bump if adding `panelColor` to `Workspace` interface; provide default in migration
- **Drag-and-drop library:** Continue using `@dnd-kit/core` and `@dnd-kit/sortable` — no library change needed
- **React-window + DnD conflict:** `react-window` virtualizes items, making off-screen items un-droppable. During active drag, temporarily render all items (disable virtualization) or use `@dnd-kit`'s scroll detection
- **Rename event bubbling:** The Enter key rename bug in folders is likely caused by the `onKeyDown` event bubbling to a parent handler (e.g., folder expand/collapse or DnD keyboard sensor). Fix with `e.stopPropagation()` in the rename input's `onKeyDown`
- **Double-click vs single-click:** Ensure double-click rename doesn't fire two single-click events (use a click timer pattern or `detail === 2` check on the click event)

---

## Success Metrics

- **Swipe navigation:** Users can switch workspaces in < 0.5s via swipe, with zero accidental triggers during vertical scroll
- **Panel color:** Color change applies in < 100ms with no FOUC (flash of unstyled content)
- **Drag and drop:** Zero "item stuck" or "item duplicated" bugs; drop accuracy > 95% (item lands where indicator shows)
- **Rename:** Double-click rename works on first attempt across all 4 item types (folders, folder items, pinned apps, tabs) with Enter key saving correctly 100% of the time

---

## Open Questions

1. **Swipe sensitivity:** Should swipe sensitivity be configurable in settings, or is a fixed 50px threshold sufficient?
2. **Tab rename persistence:** Where should custom tab display names be stored? Options: (a) in workspace data as a `tabNameOverrides: Record<tabId, string>` map, or (b) in a separate storage key
3. **Panel color + accent color interaction:** Should changing the panel color auto-suggest a complementary accent color, or keep them fully independent?
4. **Drag between workspaces:** Should dragging a tab to the workspace dot indicators move it to that workspace? (Currently out of scope but natural extension)
5. **Rename all items or selective:** Should open tabs really be renamable? Chrome doesn't support renaming tabs — this would be an ArcFlow-only display override. Confirm this is desired.
