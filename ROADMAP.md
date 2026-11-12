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

## Shipped in this round

- First win in two taps: a starter block on an empty Home.
- Only say what you were told: no invented last-done dates; "Not sure" says so and stores a first-due date.
- A Done you can see: completing a job shows a message with the next date and an Undo.
- Log something done: Quick Add can record a job that was never on the list.
- Home tells the whole picture: one status line, the next jobs, and alert rows that can be hidden.
- Data safety at first value: Storage and install guidance, a save-a-backup option before Erase, and a plain message when a save fails.
- Accessibility floor: 44px hit areas, a "Messages" region for toasts, native-style radio keys and focus that is never lost.
- Home Health Check: eight safety steps (water, electrical and gas shut-offs, alarms, systems, an emergency contact), reached from Home, with progress that never counts "0 overdue".
- Your own shut-off in emergency guides: the location saved in the Health Check shows up in the Assistant's answer.
- Assistant answers turn into records: a repair task, a follow-up check, a note, a shopping list, a damage report or a resolved Service History entry.
- Snooze and reschedule a job, and add jobs to your calendar as a .ics file (calendar entries don't move when a job is marked done).
- A page for each home system, with its paperwork, jobs and history, and its warranty on Home.

## Next

- Onboarding that asks for nothing: get to a useful Home without a form.
- Typography and spacing tokens, so sizes and gaps stop being set one by one.
- Coming back after a long gap: what Home says when nothing was opened for months.
- Real-iPhone verification: installed-app storage, share-sheet backup, 44px targets against swipe, VoiceOver and Reduce Motion.
- A DOM test environment for component tests, so components can be tested without rendering to strings.
- Seasonal tasks saved before this release that still carry an estimated last-done date.

## Upgrade notes

- Jobs added as "Not sure" now store a first-due date. A version of the app from before this release ignores that date. If you roll back, or restore a new backup on an old version, those jobs move from about a week away to a full interval away.
- There is no data format change. Old backups restore normally.

## Data migrations

`src/data/db.ts` keeps `DB_VERSION` and a `MIGRATIONS` map. Add a new store or index by bumping the version and adding a step, never by editing an existing step. Backups carry `version` so `parseHomebaseBackup` can upgrade older files. Only Homebase backups are accepted.

## Known gaps

- Offline: on the live site the service worker installs and precaches the app shell (index.html, JS, CSS, icons). A reload with the network turned off hasn't been run yet.
- Identify a key needs a camera or a photo file; it wasn't run end to end against a real key photo in this build.
- Reminders only fire while Homebase is open (no server, no push). Settings explains this and offers a calendar (.ics) export. Exported events don't update when dates change in the app.
- Optional fields added without a schema bump: `Settings.healthSteps`, `hasGas`, `lastBackupAt`; `HomeSystem.serial`, `installDate`, `location`, `warrantyExpires`, `contractorId`, `photos`; `Item.contractorId`; `Task.systemId`, `nextDue`; `ServiceEvent.systemId`; `HomeRecord.systemId`. Older backups restore unchanged; older app versions ignore the new fields.
