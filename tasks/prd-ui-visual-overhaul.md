# PRD: ArcFlow UI/UX Visual Overhaul — Premium Sidebar Aesthetic

## Introduction

ArcFlow's sidebar currently looks like a developer tool — flat dark backgrounds, heavy borders, ALL-CAPS section headers, cramped icon grids, and cluttered footer. Compared to premium sidebar extensions like Alcove, it lacks the visual refinement that makes users *want* to keep the sidebar open.

This overhaul redesigns the visual layer to achieve a frosted-glass, native-feeling sidebar that blends with the user's environment. We're shipping in phases — the most impactful changes first (spacing, typography, backgrounds, borders), followed by polish (glass effects, animations, footer simplification).

**Reference:** Alcove sidebar — semi-transparent frosted glass background, sentence-case headers, generous spacing, no visible dividers, subtle rounded-rect icon backgrounds, clear typographic hierarchy.

## Goals

- Transform ArcFlow from "developer tool" to "premium native macOS sidebar" aesthetic
- Implement frosted glass / backdrop-blur background that blends with the desktop
- Eliminate visual clutter: remove ALL-CAPS headers, heavy borders, and visible dividers
- Establish clear typographic hierarchy across all sections
- Reduce footer density by moving Focus + Settings into a menu
- Maintain all existing functionality — this is a visual-only overhaul
- Ship in phases: Phase 1 (high-impact), Phase 2 (polish)

## User Stories

### Phase 1: High-Impact Visual Changes

#### US-001: Replace Flat Background with Frosted Glass Effect
**Description:** As a user, I want the sidebar to have a semi-transparent frosted glass background so it feels integrated with my desktop environment rather than a disconnected dark panel.

**Acceptance Criteria:**
- [ ] Main sidebar container uses `backdrop-filter: blur(16px) saturate(180%)` with semi-transparent background `rgba(15, 15, 23, 0.78)` instead of solid `#0f0f17`
- [ ] The existing `.backdrop-frosted` class in index.css is updated to `blur(16px) saturate(180%)` and applied to the main container
- [ ] If the user has a custom `panelColor` set, apply it at 78% opacity (append `C7` hex alpha) instead of 100% opacity
- [ ] The `applyPanelColor()` function in useTheme.ts is updated to apply colors at 78% opacity by default
- [ ] Secondary surface color (`arc-surface`) also becomes semi-transparent: `rgba(26, 26, 46, 0.5)`
- [ ] The sidebar `<html>` or root element gets `background: transparent` so Chrome's side panel shows through
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-002: Remove ALL-CAPS Section Headers — Use Sentence Case
**Description:** As a user, I want section headers to use sentence case with a lighter weight so the sidebar feels calm and refined instead of loud and aggressive.

**Acceptance Criteria:**
- [ ] "PINNED APPS" → "Pinned apps" in PinnedAppsRow.tsx — remove `uppercase tracking-wider` classes
- [ ] "FOLDERS" → "Folders" in FolderTree.tsx — remove `uppercase tracking-wider` classes
- [ ] "6 TABS OPEN" → "6 tabs open" in App.tsx — remove `uppercase tracking-wider` classes
- [ ] All section headers use: `text-[11px] font-medium text-gray-500 dark:text-arc-text-secondary` (no uppercase, no tracking-wider)
- [ ] SettingsPanel.tsx section headers also updated for consistency (remove uppercase tracking-wider)
- [ ] Font weight changed from `font-semibold` to `font-medium` for all section headers
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-003: Remove Visible Dividers — Use Spacing for Separation
**Description:** As a user, I want sections to be separated by whitespace instead of heavy border lines, creating a cleaner look.

**Acceptance Criteria:**
- [ ] Remove all `border-t border-gray-200/80 dark:border-arc-border` from section separators in App.tsx (between search, pinned apps, folders, tabs, footer)
- [ ] Remove `border-b` from PinnedAppsRow.tsx container
- [ ] Remove `border-t` from FolderTree.tsx container
- [ ] Remove `border-t` from the tab list section in App.tsx
- [ ] Remove `border-t` from footer in App.tsx
- [ ] Remove `border-b` from header in App.tsx
- [ ] Replace removed borders with increased vertical padding: add `pt-3` below sections and `pb-2` above sections (approx 12px gaps between sections)
- [ ] The only remaining visible line should be a very subtle one between the scrollable content and the fixed footer: `border-t border-white/5` (barely visible)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-004: Refine Pinned App Icons — Smaller, Rounded-Rect, Lighter
**Description:** As a user, I want pinned app icons to be smaller with subtle rounded-rectangle backgrounds instead of heavy dark circles, matching Alcove's lighter feel.

**Acceptance Criteria:**
- [ ] Icon container changed from `w-9 h-9 rounded-full` to `w-10 h-10 rounded-xl` (rounded rectangle, not circle)
- [ ] Icon container background changed from `dark:bg-arc-surface` to `dark:bg-white/[0.06]` (very subtle, almost invisible)
- [ ] Favicon image size changed from `w-5 h-5` to `w-5 h-5` (keep same, but remove `rounded-full` — let favicons be their natural shape)
- [ ] Remove the active ring styling (`ring-2 ring-arc-accent/40 shadow-sm shadow-arc-accent/20`) — too heavy
- [ ] Keep the small dot indicator below active apps but make it smaller: `w-1 h-1` → `w-[3px] h-[3px]`
- [ ] Icon hover: change from `group-hover:scale-105` to `group-hover:bg-white/[0.10]` (subtle background change, no scale)
- [ ] Grid gap changed from `gap-3` to `gap-2` for tighter but uniform spacing
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-005: Establish Typographic Hierarchy for Tab List
**Description:** As a user, I want the active tab to be visually prominent and inactive tabs to be subdued, with a clear hierarchy that helps me find what I need.

**Acceptance Criteria:**
- [ ] Active tab: `font-medium text-arc-text-primary` with subtle background `dark:bg-white/[0.08]` — remove the heavy `border-l-[3px] border-l-arc-accent` left border
- [ ] Active tab gets a small `w-1 h-1 rounded-full bg-arc-accent` dot on the left (similar to pinned app active indicator) instead of the thick border
- [ ] Inactive tabs: `font-normal text-arc-text-secondary` (muted text, not primary)
- [ ] Discarded/suspended tabs: `font-normal text-arc-text-secondary opacity-40` (more faded than before)
- [ ] Tab row height stays `h-8` but padding increased to `px-3` (from `px-2`)
- [ ] Close button (X) on each tab: change from always visible to `opacity-0 group-hover:opacity-100` (only show on hover)
- [ ] Drag grip icon: keep `opacity-0 group-hover:opacity-100` (already hover-only)
- [ ] Tab hover background: change from `dark:bg-arc-surface-hover` to `dark:bg-white/[0.05]` (subtler)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-006: Refine Search Bar — Borderless, Blends In
**Description:** As a user, I want the search bar to blend into the sidebar without a heavy border, appearing as a subtle embedded field.

**Acceptance Criteria:**
- [ ] Remove `border border-transparent focus:border-arc-accent/50 focus:ring-1 focus:ring-arc-accent/30` from search input
- [ ] Remove `shadow-inner` from search input
- [ ] Change background from `dark:bg-arc-surface` to `dark:bg-white/[0.06]` (barely visible surface)
- [ ] On focus: `dark:bg-white/[0.08]` background only — no border, no ring
- [ ] Placeholder text slightly more muted: `dark:placeholder-white/20`
- [ ] Search icon color: change from gray to `dark:text-white/25` (more muted)
- [ ] Border radius: keep `rounded-lg` (no change)
- [ ] Padding: keep `pl-8 pr-8 h-8` (no change)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### Phase 2: Polish & Footer

#### US-007: Simplify Footer — Move Focus + Settings into Minimal Bar
**Description:** As a user, I want the footer to be clean with just the workspace switcher, so the sidebar doesn't feel bottom-heavy.

**Acceptance Criteria:**
- [ ] Remove the separate row containing "Focus" button and "Settings" gear from the footer
- [ ] Add a small settings gear icon (16px) to the far-right of the workspace switcher row (next to the + button)
- [ ] Clicking the gear opens SettingsPanel as before
- [ ] Move "Focus" toggle into SettingsPanel (under a new "Focus Mode" quick-access area at the top of settings, or keep it where it is in settings)
- [ ] Remove the "X tabs suspended" text line from footer — move it into the settings panel or command palette info
- [ ] Footer should now be a single row: `[workspace emojis] [+] [gear]` with dot indicators below
- [ ] Dot indicators and arrow buttons remain as-is (from the swipe navigation feature)
- [ ] Footer total height reduced from ~80px to ~48px
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-008: Soften Folder Rows — Lighter Icons, Subtler Metadata
**Description:** As a user, I want folder rows to feel lighter with muted metadata so the folder names stand out as the primary information.

**Acceptance Criteria:**
- [ ] Folder icon color: change from `text-arc-accent dark:text-arc-accent-hover` to `dark:text-white/40` (muted, not accent-colored)
- [ ] Folder name text: keep `text-sm` but ensure `font-normal` (not bold)
- [ ] Folder metadata "(2 links)": change from `text-[11px] text-gray-400 dark:text-arc-text-secondary` to `text-[10px] dark:text-white/25` (much more muted)
- [ ] Chevron toggle: change from `text-gray-400 dark:text-arc-text-secondary` to `dark:text-white/25` (more muted)
- [ ] Folder row hover: change from `dark:hover:bg-arc-surface-hover` to `dark:hover:bg-white/[0.05]`
- [ ] Folder item rows: same hover treatment `dark:hover:bg-white/[0.05]`
- [ ] Folder expanded content indentation stays the same (already fine)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-009: Update Color System — Semi-Transparent Whites Instead of Named Surfaces
**Description:** As a developer, I need to update the CSS theme variables to use semi-transparent values that work with the frosted glass effect, replacing the opaque named colors.

**Acceptance Criteria:**
- [ ] Update `index.css` @theme block: `--color-arc-surface: rgba(255,255,255,0.06)` (was `#1a1a2e`)
- [ ] Update `--color-arc-surface-hover: rgba(255,255,255,0.10)` (was `#252540`)
- [ ] Update `--color-arc-border: rgba(255,255,255,0.06)` (was `#2a2a45`) — borders that remain should be very subtle
- [ ] Update `--color-arc-text-secondary: rgba(255,255,255,0.40)` (was `#8888a0`)
- [ ] Keep `--color-arc-bg: #0f0f17` as the fallback for non-glass contexts but the main container uses transparent version
- [ ] Keep `--color-arc-text-primary: #e8e8ed` unchanged
- [ ] Keep `--color-arc-accent: #6366f1` unchanged
- [ ] Update scrollbar thumb color to `rgba(255,255,255,0.10)` and hover to `rgba(255,255,255,0.15)`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill — ensure all surfaces look correct with the new semi-transparent values

#### US-010: Add Subtle Transition Animations for Polish
**Description:** As a user, I want smooth micro-animations when hovering and interacting with sidebar elements, creating a polished feel.

**Acceptance Criteria:**
- [ ] All hover state changes use `transition-colors duration-200` (slightly slower than current 150ms for smoother feel)
- [ ] Workspace switch: add `transition-opacity duration-200` on the main content area for a subtle fade during workspace transitions
- [ ] Search results dropdown: add `animate-in` with `opacity 0→1` over 150ms and `translateY(4px)→0` when appearing
- [ ] Popovers (context menu, settings, workspace picker): same entry animation as search dropdown
- [ ] Tab close button fade: `transition-opacity duration-150` (already exists but verify consistency)
- [ ] No animations on scroll or drag (performance)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

### Phase 1 — Background & Layout
- FR-1: Apply `backdrop-filter: blur(16px) saturate(180%)` and `background: rgba(15,15,23,0.78)` to the root sidebar container
- FR-2: Set the sidebar `<html>` element background to `transparent` (via index.html or index.css `:root { background: transparent }`)
- FR-3: Remove all `border-t`, `border-b` classes from section separators; replace with `py-3` or `pt-3 pb-2` spacing
- FR-4: Keep one subtle separator between scrollable content and fixed footer: `border-t border-white/5`

### Phase 1 — Typography
- FR-5: All section headers: `text-[11px] font-medium text-white/40` — no uppercase, no tracking-wider
- FR-6: Active tab: `font-medium text-white/90` with `bg-white/[0.08]` and small accent dot
- FR-7: Inactive tab: `font-normal text-white/50`
- FR-8: Close button: `opacity-0 group-hover:opacity-100 transition-opacity duration-150`

### Phase 1 — Components
- FR-9: Pinned app icons: `w-10 h-10 rounded-xl bg-white/[0.06]` with `hover:bg-white/[0.10]`
- FR-10: Search input: `bg-white/[0.06] focus:bg-white/[0.08]` — no border, no ring, no shadow
- FR-11: Remove `border-l-[3px]` active tab indicator; replace with `w-1 h-1 rounded-full bg-arc-accent` dot

### Phase 2 — Footer & Polish
- FR-12: Footer single row: workspace emojis + add button + settings gear + dot indicators below
- FR-13: Remove Focus button from footer; accessible only from SettingsPanel or command palette
- FR-14: Remove suspended tab count from footer
- FR-15: CSS theme variables updated to semi-transparent `rgba()` values
- FR-16: Hover transitions set to 200ms globally; entry animations 150ms for popovers/dropdowns

## Non-Goals (Out of Scope)

- **Light mode redesign** — this overhaul focuses on dark mode only; light mode can follow later
- **Layout restructuring** — the section order (header → search → pinned apps → folders → tabs → notes → footer) stays the same
- **New features** — no new functionality; this is purely visual
- **Custom fonts** — keep Inter; no new font loading
- **Icon redesign** — keep existing SVG icons; only change their colors/sizes
- **Settings panel redesign** — only update section headers for consistency; full settings redesign is separate
- **Mobile/touch optimizations** — Chrome Side Panel is desktop-only

## Design Considerations

### Color Philosophy
Replace named opaque dark colors (`#1a1a2e`, `#252540`) with semi-transparent whites (`white/[0.06]`, `white/[0.10]`). This makes surfaces adapt to any panel background color and enables the frosted glass effect to show through.

### Spacing System
- **Section gaps:** 12px (py-3) between major sections — no borders
- **Row height:** 32px (h-8) for tabs and folder rows
- **Icon size:** 40px (w-10 h-10) for pinned apps
- **Horizontal padding:** 12px (px-3) for most content areas
- **Footer height:** 48px total (single row + dots)

### Key Tailwind Patterns
- `bg-white/[0.06]` — barely visible surface (replaces `bg-arc-surface`)
- `bg-white/[0.08]` — active/selected state
- `bg-white/[0.10]` — hover state (replaces `bg-arc-surface-hover`)
- `text-white/40` — secondary text (replaces `text-arc-text-secondary`)
- `text-white/90` — primary text (replaces `text-arc-text-primary`)
- `border-white/5` — barely visible borders (replaces `border-arc-border`)

### Frosted Glass Limitations
Chrome's Side Panel API renders in a standard web view. `backdrop-filter: blur()` works but only blurs the *content behind the element within the sidebar*, not the desktop wallpaper. The semi-transparent background will show as a slightly transparent dark overlay. The visual improvement comes from the transparency allowing subtle color variation rather than a flat opaque block.

## Technical Considerations

- **`backdrop-filter` browser support:** Fully supported in Chrome 76+ (our only target). No polyfill needed.
- **Performance:** `backdrop-filter: blur()` is GPU-accelerated in Chrome. Performance impact is minimal for a static sidebar. Avoid applying blur to scrollable content or animating blur values.
- **Panel color interaction:** The `applyPanelColor()` function needs to set colors at 78% opacity. Modify it to append alpha channel: if hex color is `#FF5733`, set CSS variable to `#FF5733C7` (C7 = ~78% in hex).
- **Semi-transparent CSS variables:** Tailwind's `@theme` block may not support `rgba()` values in all contexts. Test that `bg-arc-surface` works correctly with the new rgba value. If not, use direct `bg-white/[0.06]` classes instead of CSS variables.
- **index.html background:** Chrome Side Panel may override the HTML background. Test with `background: transparent !important` on both `html` and `body` elements.
- **Existing panel color feature:** Users who set a custom panel color should see it applied at 78% opacity. Users with no custom color get the default frosted dark (rgba(15,15,23,0.78)).

## Success Metrics

- **Visual parity:** Side-by-side screenshot comparison with Alcove shows comparable visual quality and refinement
- **Reduced visual weight:** Total visible border pixels reduced by >90% (from ~20 border lines to ~1)
- **Footer height:** Reduced from ~80px to ~48px, freeing space for content
- **User perception:** Sidebar feels "native" and "premium" rather than "developer tool"
- **Zero regressions:** All features (DnD, rename, swipe, search, workspace switching) work exactly as before

## Open Questions

1. **Chrome Side Panel transparency:** Does `background: transparent` on the root actually show the page content behind the sidebar, or does Chrome enforce an opaque background? Need to test. If opaque is forced, the frosted glass effect is purely internal (blurring sidebar content layers).
2. **Light mode:** Should we update light mode at all in this phase, or leave it unchanged and tackle separately?
3. **Semi-transparent CSS variables vs inline classes:** Will `--color-arc-surface: rgba(255,255,255,0.06)` work correctly in all Tailwind contexts (`bg-arc-surface`, `dark:bg-arc-surface`)? May need to keep CSS variables as opaque and use `bg-white/[0.06]` directly in components instead.
4. **Settings panel depth:** Should settings panel also get the frosted glass treatment, or keep its current solid background since it's an overlay?
5. **Pinned app icon shape:** Rounded-rect (`rounded-xl`) matches Alcove. But some users may prefer circles. Should this be configurable, or just ship rounded-rect?
