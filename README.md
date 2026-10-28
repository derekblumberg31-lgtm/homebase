# Homebase

Your intelligent homeowner assistant. One local-first app for what needs doing, what you own, where the paperwork is, and help when something breaks.

Homebase replaces two earlier apps and keeps everything they did:

- **Replacely** became the **Maintenance Planner**, which lives in Tasks: countdowns, the day strip, presets, Schedule, Costs and completion history.
- **KeyFinder** became **Keys and locks** inside Property: identify a key from a photo, match it against saved keys, train it with more photos, and see the replacement blank and where to get it cut.

## Areas

| Area | What's there |
|---|---|
| Home | Greeting, Needs attention, Up next, seasonal recommendations, Home Health Check, recent activity |
| Property | Home details, rooms, systems (with typical lifespans), Home Inventory, Keys and locks, Identify a key |
| Tasks | Maintenance Planner, Schedule and Costs; maintenance, repairs and projects |
| Assistant | Offline guided help (leaks, no heat, breakers, smoke alarms, lockouts and more) with actions into the app |
| Records | Warranty Vault, receipts, manuals and other documents with attached files, Service History |
| Settings | Household members, property, appearance, notifications, integrations, data and privacy, backup and restore |

## Data

- Everything is stored on the device in IndexedDB (`homebase`). There's no account and no server.
- **Settings → Data and privacy → Save a backup** saves one JSON file, including attached files.
- **Restore from a backup** (in Settings, or on the welcome screen when moving to a new device) restores a Homebase backup.

## Development

```bash
npm install
```

```bash
npm run dev
```

The dev server runs on http://localhost:5190.

```bash
npm test
```

```bash
npm run build
```

`npm run build` type-checks, then builds to `dist/`. The key engine in `public/engine/` (OpenCV + Tesseract, about 21 MB) is left out of the precache. It loads on first use of Identify a key and is cached after that.

## Deploy

```bash
./deploy.sh
```

This runs the tests and the build, then publishes to the Netlify site `homebase-derek`. It creates the site the first time.

## Docs

- `PRODUCT.md`: who it's for and the product principles
- `DESIGN.md`: the design system
- `ROADMAP.md`: future features and where each one plugs in
