# Roadmap

Homebase ships local-first with offline guided help. Each future feature below names the extension point already built for it, so it can be added without reshaping the app. None of these appear in the UI as "coming soon".

| Feature | Extension point today |
|---|---|
| Accounts, sync and household collaboration | `src/session/session.tsx` (`SessionProvider` returns `kind: 'local'`). `Household.members[]` with roles already exists. |
| AI assistant | `src/features/assistant/provider.ts`: `AssistantProvider` interface. `LocalGuideProvider` is the offline one; a Claude-backed provider can replace it without UI changes. |
| AI reminders and predictive upkeep | `Property.yearBuilt`, `HomeSystem.installYear`, `Item.purchaseDate`, and `insights.ts` (`recommendationsFor`, `healthCheckFor`). |
| Warranty alerts and notifications | `HomeRecord.expiresAt` feeds Home alerts today. `src/app/reminders.ts` sends one daily notification and can take more rules. |
| Contractors and quotes | `ServiceEvent.provider` and `cost`. Tasks of kind `project` and `repair`. |
| Home Inventory depth (photos, values, insurance export) | `Item` has `value`, `purchaseDate`, `serial` and `photos`, and records can attach files from the `files` store. |
| Energy tracking and smart home | The Settings → Integrations list (placeholders), plus a `systems` store for devices. |
| Budgeting | `annualCost` / `CostsView` in Tasks, plus `HomeRecord.amount` and `ServiceEvent.cost`. |
| Seasonal checklists | `SEASONAL` rules in `src/features/home/insights.ts`. |
| Emergency guidance | Guides in `src/features/assistant/guides.ts`; each guide can carry `safety` and actions. |
| Property value, moving, rentals | `Property.ownership` (`own` / `rent`) and room-level records. |

## Data migrations

`src/data/db.ts` keeps `DB_VERSION` and a `MIGRATIONS` map. Add a new store or index by bumping the version and adding a step, never by editing an existing step. Backups carry `version` so `parseHomebaseBackup` can upgrade older files.

## Known gaps

- Offline behaviour hasn't been checked in a real browser yet: the in-app browser pane blocks service workers. The config matches Replacely's, which works offline.
- Identify a key needs a camera or a photo file; it wasn't run end to end against a real key photo in this build.
