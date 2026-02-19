# ArcFlow

Arc Browser-inspired sidebar for Chrome with workspaces, pinned apps, smart tab search, and a premium frosted glass UI.

<!-- Replace with actual screenshot -->
![ArcFlow hero — sidebar open with workspaces and tabs](docs/screenshots/hero.png)

## Features

- **Workspaces** — Organize tabs into separate workspaces with emoji icons and custom colors
- **Pinned Apps** — Quick-access grid for your most-used sites
- **Smart Folders** — Drag tabs into folders, nest them, rename inline
- **Switch-to-Tab Search** — Type a domain to find already-open tabs across all workspaces
- **Chrome Omnibox** — Type `af` in the address bar to search tabs without opening the sidebar
- **Quick Notes** — Per-workspace scratchpad for context and TODOs
- **Tab Preview Cards** — Hover over tabs to see a preview
- **Focus Mode** — Block distracting sites with URL redirect rules
- **AI Grouping** — Optional AI-powered tab organization (bring your own API key)
- **Workspace Templates** — Quick-start templates for common workflows
- **Swipe Navigation** — Swipe between workspaces on trackpad
- **Keyboard Shortcuts** — `Ctrl+Shift+1-4` to switch workspaces, command palette

<!-- Replace with actual screenshot -->
![ArcFlow features overview](docs/screenshots/features-overview.png)

## Install

### Option A: Download the release (easiest)

1. Go to [Releases](https://github.com/27VAIDH/arc-flow/releases) and download `arcflow-v1.1.0.zip`
2. Extract the zip
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (toggle in the top right)

<!-- Replace with actual screenshot -->
![Step 4 — Enable Developer mode toggle](docs/screenshots/install-developer-mode.png)

5. Click **Load unpacked** and select the extracted `dist` folder

<!-- Replace with actual screenshot -->
![Step 5 — Click Load unpacked and select the dist folder](docs/screenshots/install-load-unpacked.png)

6. Click the ArcFlow icon in your toolbar to open the sidebar

<!-- Replace with actual screenshot -->
![Step 6 — ArcFlow icon in the Chrome toolbar](docs/screenshots/install-toolbar-icon.png)

### Option B: Build from source

```bash
git clone https://github.com/27VAIDH/arc-flow.git
cd arc-flow
npm install
npm run build
```

Then load the `dist/` folder as an unpacked extension (same steps 3-6 above).

## Screenshots

<!-- Replace each with actual screenshots -->

| Feature | Preview |
|---------|---------|
| Sidebar with tabs and folders | ![Sidebar](docs/screenshots/sidebar.png) |
| Switch-to-Tab search | ![Search](docs/screenshots/search.png) |
| Workspaces with emoji icons | ![Workspaces](docs/screenshots/workspaces.png) |
| Settings & customization | ![Settings](docs/screenshots/settings.png) |

## Development

```bash
npm run dev      # Start dev server with HMR
npm run build    # Production build
npm run typecheck # TypeScript check
npm run lint     # ESLint + Prettier
npm run test     # Run tests
```

## Privacy

- All data is stored locally in your browser using `chrome.storage.local`
- No telemetry, no tracking, no external requests by default
- AI grouping (optional) sends only tab titles and URLs to your chosen provider (Anthropic or OpenAI)
- API keys are stored locally on your device without encryption

## Tech Stack

- React 19 + TypeScript
- Tailwind CSS v4
- Vite (Chrome Extension MV3)
- @dnd-kit (drag and drop)
- Fuse.js (fuzzy search)

## Feedback

Found a bug or have a suggestion? [Open an issue](https://github.com/27VAIDH/arc-flow/issues) or reach out on Twitter.

## License

MIT
