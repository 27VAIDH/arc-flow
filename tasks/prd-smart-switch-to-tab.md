# PRD: Smart Switch-to-Tab

## Introduction

When users type a URL or keyword in ArcFlow's search bar, they often don't realize a tab with that site is already open — leading to duplicate tabs piling up. Smart Switch-to-Tab surfaces existing open tabs as top-ranked "Switch to Tab" results in the search bar, giving users a one-click path to the already-open page. This mirrors Firefox's beloved "Switch to Tab" feature but is enhanced with workspace awareness: results from the current workspace appear first, followed by tabs from other workspaces with a badge indicating where they live.

**Problem:** Users accumulate duplicate tabs because there's no visible signal that the site they're about to open is already loaded in a tab — wasting memory, cluttering their workspace, and forcing them to hunt for the original tab later.

## Goals

- Surface already-open tabs as "Switch to Tab" results when the user types a matching domain in the search bar
- Rank current-workspace tab matches above other-workspace matches, with clear workspace attribution
- Preserve user choice — always allow opening a new tab alongside the "Switch to Tab" suggestion
- Optionally extend this to Chrome's Omnibox via the `af` keyword (configurable, can be deferred)
- Reduce duplicate tab count by making it effortless to find and switch to existing tabs

## User Stories

### US-001: Domain-Match Search Results with "Switch to Tab" Badge
**Description:** As a user, I want to see a "Switch to Tab" badge on search results that match an already-open tab's domain so that I can jump to the existing tab instead of opening a duplicate.

**Acceptance Criteria:**
- [ ] When user types a query that matches a domain of an open tab (e.g., typing "mail" matches `mail.google.com`), the matching tab appears in search results
- [ ] Matching tab results display a "Switch to Tab" badge (pill/tag) on the right side, visually distinct from the existing "Tab" / "Link" / "Folder" type badges
- [ ] "Switch to Tab" badge uses `arc-accent` color to stand out from other result types
- [ ] Domain matching is case-insensitive and matches against the hostname (e.g., "google" matches `mail.google.com`, `docs.google.com`, `calendar.google.com`)
- [ ] If the typed query looks like a URL (contains `.` or starts with `http`), match against the full URL's hostname
- [ ] Clicking a "Switch to Tab" result calls the existing `onSwitchTab(tabId)` flow to activate that tab
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Rank "Switch to Tab" Results Above Other Matches
**Description:** As a user, I want "Switch to Tab" results to appear at the top of search results so I see the most useful action first.

**Acceptance Criteria:**
- [ ] "Switch to Tab" results from the current workspace are ranked above all other result types (links, folders, fuzzy matches)
- [ ] Within "Switch to Tab" results, exact domain matches rank above partial domain matches
- [ ] If multiple open tabs match the same domain (e.g., two Gmail tabs), all are shown as "Switch to Tab" results, ordered by most recently active
- [ ] Non-"Switch to Tab" results (folder items, links) still appear below as secondary results
- [ ] The existing Fuse.js fuzzy matching continues to work for non-tab results — "Switch to Tab" matching is a separate, pre-Fuse pass
- [ ] Typecheck passes

### US-003: Cross-Workspace Tab Matching with Workspace Badge
**Description:** As a user, I want to see matching open tabs from other workspaces (below current workspace matches) so I can switch to a tab even if it's in a different workspace.

**Acceptance Criteria:**
- [ ] After current-workspace "Switch to Tab" results, show matching tabs from other workspaces
- [ ] Cross-workspace results display a workspace badge (emoji + name) indicating which workspace the tab belongs to
- [ ] Cross-workspace results are visually grouped or subtly separated from current-workspace results (e.g., a thin divider or muted section header "Other Workspaces")
- [ ] Clicking a cross-workspace "Switch to Tab" result switches to that workspace first (via `setActiveWorkspace`), then activates the tab
- [ ] Cross-workspace results are ranked: current workspace first, then other workspaces sorted by most recently used
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: "Open New Tab" Option Alongside Switch Results
**Description:** As a user, I want the option to open a new tab even when a matching tab exists, so I'm never forced to switch when I genuinely need a separate tab.

**Acceptance Criteria:**
- [ ] When "Switch to Tab" results are shown, an "Open [query] in New Tab" action appears at the bottom of the "Switch to Tab" group
- [ ] The "Open in New Tab" option has a distinct icon (e.g., external link / plus icon) to differentiate from "Switch to Tab" results
- [ ] Clicking "Open in New Tab" opens the URL via `chrome.runtime.sendMessage({ type: "OPEN_URL", url })` as the existing flow does
- [ ] If the query is not a valid URL, the "Open in New Tab" option is hidden (only show for URL-like queries)
- [ ] Keyboard navigation: user can arrow-down past "Switch to Tab" results to select "Open in New Tab"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Chrome Omnibox Integration with "af" Keyword
**Description:** As a user, I want to type "af" in Chrome's address bar followed by a search term to see matching open tabs from ArcFlow, so I can switch to tabs without even opening the sidebar.

**Acceptance Criteria:**
- [ ] `"omnibox": { "keyword": "af" }` added to manifest.json
- [ ] Service worker registers `chrome.omnibox.onInputChanged` listener that queries open tabs matching the input text by domain
- [ ] Suggestions show tab title + URL with a "Switch to Tab" description, limited to top 5 matches
- [ ] Current-workspace matches appear before other-workspace matches in suggestions
- [ ] `chrome.omnibox.onInputEntered` handler activates the selected tab (switches workspace if needed, then `chrome.tabs.update`)
- [ ] If no matching tab is found, the default action opens the typed text as a URL or Google search
- [ ] Typecheck passes

### US-006: Add Setting to Enable/Disable Omnibox Integration
**Description:** As a user, I want to control whether ArcFlow registers the "af" omnibox keyword, since it may conflict with other extensions or workflows.

**Acceptance Criteria:**
- [ ] New toggle in SettingsPanel: "Enable Omnibox (type 'af' in address bar to search tabs)" — default ON
- [ ] Setting persisted in `settingsStorage.ts` as `omniboxEnabled: boolean`
- [ ] When disabled, omnibox listeners still exist but return no suggestions (can't unregister omnibox at runtime in MV3)
- [ ] Setting change takes effect immediately without extension reload
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

### Search Bar Enhancement
- FR-1: Before running Fuse.js fuzzy search, perform a domain-match pass against all open tabs using `new URL(tab.url).hostname.includes(query.toLowerCase())`
- FR-2: Domain-match results are wrapped in a `SearchItem` with a new `matchType: 'switch-to-tab'` field
- FR-3: Results are ordered: current-workspace switch-to-tab > other-workspace switch-to-tab > existing Fuse.js results (links, folders, fuzzy tab matches)
- FR-4: "Switch to Tab" results render with an accent-colored pill badge saying "Switch to Tab" on the right side of the result row
- FR-5: Cross-workspace results render with an additional workspace badge (emoji + name) below the URL subtitle
- FR-6: When query contains `.` or starts with `http`, also show an "Open in New Tab" action at the end of the switch-to-tab group
- FR-7: "Open in New Tab" normalizes the query to a URL: if no protocol, prepend `https://`

### Cross-Workspace Switching
- FR-8: `SearchBar` receives all tabs (not just current workspace) plus the `tabWorkspaceMap` to determine workspace membership
- FR-9: Clicking a cross-workspace result calls `setActiveWorkspace(targetWorkspaceId)` then `onSwitchTab(tabId)` after a short delay (100ms) to allow workspace switch to complete
- FR-10: Cross-workspace section is visually separated with a muted header: "In other workspaces"

### Omnibox Integration
- FR-11: Register `"omnibox": { "keyword": "af" }` in manifest.json
- FR-12: `chrome.omnibox.onInputChanged` queries all tabs via `chrome.tabs.query({})`, filters by hostname match, returns top 5 as suggestions
- FR-13: Suggestions format: `<match>[Tab Title]</match> — <dim>[domain.com]</dim> <url>(Switch to Tab)</url>`
- FR-14: `chrome.omnibox.onInputEntered` with disposition `currentTab`: activate the matched tab instead of navigating
- FR-15: If `omniboxEnabled` setting is false, `onInputChanged` returns an empty suggestions array
- FR-16: Default suggestion text: "Search ArcFlow tabs for: %s"

## Non-Goals (Out of Scope)

- **Auto-closing duplicate tabs** — this feature only surfaces existing tabs, never closes anything
- **Blocking new tab creation** — user can always choose to open a new tab
- **Matching by page content** — only domain/URL and tab title are matched, not page body text
- **History matching** — only currently open tabs are matched, not recently closed or browsing history
- **Pinned app deduplication** — pinned apps already have origin-matching logic in the service worker (`OPEN_PINNED_APP`); this feature focuses on the search bar and omnibox
- **Omnibox keyword customization** — the keyword is fixed as "af"

## Design Considerations

- **"Switch to Tab" badge:** Accent-colored pill (similar to existing "Tab" badge but using `bg-arc-accent text-white` instead of muted gray). Shows an arrow-right icon (→) to suggest navigation.
- **Cross-workspace badge:** Small pill below the URL line showing workspace emoji + name in muted text, similar to how TabPreviewCard shows workspace info.
- **"Open in New Tab" action:** Styled differently from results — slightly muted background, plus icon on the left, full-width. Appears at the boundary between "Switch to Tab" results and other results.
- **Result grouping:** No explicit group headers for current-workspace results. A subtle divider + "In other workspaces" label separates cross-workspace results. This keeps the UI clean for the common case (match found in current workspace).

### Existing Components to Reuse
- `SearchBar.tsx` result rendering pattern (lines 275-334) — extend with badge variants
- `buildSearchItems()` (lines 31-75) — extend to accept all tabs + workspace map
- `activateResult()` (lines 149-162) — extend to handle cross-workspace switching
- `TabDragOverlay` card style — for consistent badge/pill styling
- Omnibox suggestion XML format from Chrome docs

## Technical Considerations

- **SearchBar currently receives only current-workspace tabs** via `filteredTabs`. To support cross-workspace matching, it needs access to all tabs. Pass `allTabs` (pre-filter) as an additional prop, or move the tab-workspace filtering into SearchBar itself.
- **`tabWorkspaceMap`** is needed in SearchBar to determine which workspace a tab belongs to. Pass it as a prop from App.tsx.
- **Domain extraction performance:** `new URL(url).hostname` can throw on malformed URLs. Wrap in try-catch with a fallback to raw string matching.
- **Omnibox API limitations in MV3:** The omnibox keyword is registered in manifest.json and cannot be changed at runtime. The `onInputChanged` listener can return empty results to effectively "disable" it, but the keyword prompt still appears when user types "af ".
- **Omnibox suggestion count:** Chrome limits omnibox suggestions to 5. Prioritize current-workspace matches.
- **Race condition on cross-workspace switch:** `setActiveWorkspace()` writes to `chrome.storage.local` and triggers a React state update. The `onSwitchTab()` call should be delayed or chained after the workspace switch completes (listen for storage change or use a callback).

## Success Metrics

- **Duplicate tab reduction:** Users open 30% fewer duplicate tabs for domains they already have open
- **Switch-to-Tab click rate:** >50% of users who see a "Switch to Tab" result click it (vs. opening a new tab)
- **Search-to-switch time:** Users can find and switch to an existing tab in < 2 seconds from typing
- **Zero false negatives:** If a tab is open with a matching domain, it always appears in results (no missed matches)

## Open Questions

1. **Should "Switch to Tab" also match tab titles?** Current spec is domain-only. Matching titles (e.g., typing "inbox" matching "Gmail - Inbox") would increase recall but might clutter results. Consider as a fast-follow.
2. **What happens if the matched tab is suspended/discarded?** Should clicking "Switch to Tab" on a suspended tab reload it automatically? Currently `chrome.tabs.update({ active: true })` activates it, and Chrome auto-reloads discarded tabs.
3. **Should there be a keyboard shortcut for "Switch to Tab"?** e.g., Tab key to accept the "Switch to Tab" suggestion (like Firefox), vs Enter which opens in new tab.
4. **Omnibox fallback:** When no tabs match, should the omnibox fallback be a Google search or opening the text as a URL? Suggest: if text contains `.`, treat as URL; otherwise, Google search.
5. **Rate of domain matching:** For users with 100+ tabs, is hostname matching on every keystroke performant? Fuse.js already handles this scale, but the pre-Fuse domain pass needs to be fast too. Consider caching hostname extractions.
