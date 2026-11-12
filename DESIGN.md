---
name: Homebase
description: A calm homeowner assistant on limestone and spruce, with open lists and one deep green accent.
colors:
  spruce: "#2e5e4e"
  spruce-deep: "#234a3d"
  spruce-dark: "#8fc4ad"
  clay: "#a1452b"
  clay-dark: "#e39a7f"
  due-amber: "#835710"
  ink: "#1d2420"
  ink-secondary: "#4a544e"
  ink-tertiary: "#5d6761"
  limestone: "#f3f4ef"
  field-surface: "#fbfbf8"
  pressed-stone: "#e9ebe4"
  fill: "#e5e8e0"
  fill-strong: "#d8dcd2"
  dark-ground: "#171b19"
  dark-surface: "#1e2321"
typography:
  display:
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "'tnum' 1"
  large:
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.022em"
  title:
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.22
    letterSpacing: "-0.016em"
  headline:
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  subhead:
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  footnote:
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
  caption:
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
rounded:
  xs: "6px"
  sm: "10px"
  sm-inner: "8px"
  md: "14px"
  lg: "14px"
  xl: "20px"
  sheet: "24px"
  round: "50%"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.spruce}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "48px"
  round-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "44px"
  open-list:
    backgroundColor: "transparent"
    rounded: "0"
  form-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
  form-chip-active:
    backgroundColor: "rgba(46, 94, 78, 0.1)"
    textColor: "{colors.spruce}"
  segmented:
    backgroundColor: "{colors.fill}"
    rounded: "{rounded.sm}"
    height: "48px"
  tab-item-active:
    textColor: "{colors.spruce}"
  sheet:
    backgroundColor: "{colors.limestone}"
    rounded: "{rounded.sheet}"
  alert:
    backgroundColor: "{colors.field-surface}"
    rounded: "{rounded.xl}"
    width: "300px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.limestone}"
    rounded: "{rounded.lg}"
---

# Design System: Homebase

## Overview

**Creative North Star: "Spruce and Limestone"**

Homebase is the binder every homeowner means to keep: what needs doing, what they own, where the paperwork is, and what to do when something breaks. It reads as type and space rather than a stack of boxes:
- a plain large title
- lists that sit open on a pale stone ground, split by hairlines
- one deep spruce accent
- sheets that rise from below

Two signatures carry over from the apps it replaces:
- From Replacely: the largest-unit countdown ("3 months", "Today", "4 days over") and the day strip. On Home the most urgent job is an unboxed hero with its countdown at 48px.
- From KeyFinder: the rimmed code tag that names a key's blank, and the cut-profile chart.

Density is low and the voice is soft. Everything is the system font, sentence case, with hierarchy from size and a narrow range of weights. Three hues cover the whole app: spruce for "act here, you are here, done", clay for overdue, destructive and emergency, and amber for due soon or "check this". Dark mode is a deep green-charcoal ground with a sage accent, never black.

**Key characteristics:**
- Open lists: rows sit on the ground and bleed to the page edge for their press tint. Surfaces remain only for fields and things that float.
- System font only, with tabular figures for every number.
- One focal point per screen: the Home hero, the large title, or the single filled spruce button.
- Flat at rest. Only menus, toasts, sheets, alerts and the launcher carry a shadow.
- Quiet motion: ease-out entries under 250ms, scale on press, a drawer curve for sheets. Reduced motion swaps movement for short fades.

## Colors

The palette is defined in `src/styles/app.css` (`:root` and `[data-theme='dark']`). The front matter above lists the values in use.
- **Light:** limestone ground #f3f4ef, field surface #fbfbf8, green-black ink #1d2420.
- **Dark:** ground #171b19, surface #1e2321, ink #e8ece6.
- **Spruce** is the accent (`--accent`): #2e5e4e in light, #8fc4ad in dark. Pressed and hover (`--accent-deep`) is #234a3d in light. It is the primary button, the active tab, links, focus, the ticked check, progress and the selected chip. Done and the old dusty blue are folded into it (`--green`, `--cool` are aliases).
- **Clay** (`--red`, alias `--overdue`): #a1452b in light, #e39a7f in dark. Only for overdue, destructive and emergency.
- **Amber** (`--amber`): #835710 in light, #d9b16e in dark. Due soon or "check this".
- **Ink** (`--ink-bg`, `--ink-text`) fills Call 911 and toasts.
- **Control borders** (`--control-line`) are 3:1 or better. Hairline dividers (`--line`) are decorative.
- **Badges** are ink on the ground.

The rules:

- **The Spruce Rule.** One spruce fill per view: the primary button, with the ticked check as the only other filled spruce. Everything else spruce is text, an outline, a tint or an icon. On an emergency answer the only filled object is Call 911, in ink.
- **The Clay Rule.** Clay is only for overdue, destructive and emergency. Overdue never relies on colour: the word "over", filled day squares and the Tasks badge say it too.
- **Open by default.** A block is a surface only if you type into it or it floats. Read-only content (key and value facts, notes, empty states, Health Check steps) is open.
- **The Status Hue Rule.** Spruce means done or here, amber means due soon, clay means overdue. None is used for category colour.
- **The No Pure Extremes Rule.** Text is green-black ink, never #000. The page is limestone, never #fff.
- **`--text-3` never sits on `--fill-strong`;** `--red` is never text on `--fill-strong` in light.
- **Code tags** have a neutral `--line` rim, and an accent rim when a match is confirmed. They never get a coloured fill.
- **One dark ground.** Green-charcoal #171b19 with surfaces #1e2321. A toast in dark is a stepped fill, not a bright pill.

## Typography

One family, the system font: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. Sizes are rem, so they follow the reader's own text size. Weights are 400, 500, 600 and 700.

Page titles go through one token, `--font-title` (the system font, weight 700).

| Role | Spec | Used for |
|---|---|---|
| Display | 600, 3rem, tabular | Home hero countdown and task detail countdown |
| Large | 700, 2.125rem | Page titles, onboarding titles |
| Title | 600, 1.375rem | Empty-state titles, Assistant answer title, starter heading, detail page title |
| Headline | 600, 1.0625rem | Sheet title, answer section heads, emphasised rows |
| Body | 400, 1.0625rem | Row titles, inputs, chat |
| Subhead | 400, 0.9375rem; 600 for section heads and buttons | Row subtitles, page subtitle |
| Footnote | 400, 0.8125rem | Hints, captions, footers |
| Caption | 600, 0.6875rem | Tab labels only |
| Countdown | 600, 1.25rem, tabular | Right side of a task row |

- **The Sentence Case Rule.** Nothing is uppercased or letter-spaced into a label.
- **The One Big Line Rule.** Each screen has one large line: the page title, or the countdown on Home and task detail, where the title steps down to the title size.

## Layout

- **Phone (below 768px):**
  - The page column has a 20px gutter (32px from 768px) and `--page-max` 680px.
  - A bottom tab bar shows five areas (Home, Property, Tasks, Assistant, Records). The tab bar is solid (no blur). The active tab's icon and label are spruce, with a 4px dot under the label.
  - Count badges: overdue tasks on Tasks, warranties ending soon on Records.
  - Settings opens from the round profile button beside the title. Home's header also has a round + for quick add.
- **Header:** the back link and the actions share a 44px row above the title, which gets the full width. From 768px the actions sit beside the title.
- **Tablet (768–1099px):** an 88px icon rail with small labels, a round fill + button, and Settings below a rule. Badges become dots. Every page title starts at the same left edge.
- **Desktop (1100px and up):**
  - A 244px sidebar: brand (the name only), an Add row, the five areas, and Settings set apart at the bottom.
  - The rail and sidebar share the page ground with a 0.5px right border. The active item is spruce with a 3x20 spruce bar at its leading edge.
  - Pages are max 680px, or 1040px for `Page wide`. From 1100px Home becomes two columns: the jobs on the left, the More list at 320px on the right.
- **Home** is for a few seconds in front of the thing that needs doing:
  - one status line saying whether anything is overdue
  - the next three jobs: the first is an unboxed hero with its countdown at 48px and the check on the trailing edge; swipe to mark done
  - alert rows under a "Needs a look" label: a warranty ending, a system to check, a backup that is due, and the install row. Each is one row with an amber icon, a title of up to two lines, a detail line and a chevron, with its own 44px hide button at the right. Hiding one offers Undo and leaves the item in its own list.
  - on a new home with no jobs, the starter block (below) in place of the list
  - a "More" list: an Ask Homebase row, then links to Home Health Check (with the snapshot), This season, Coming up and Activity, each on its own page one tap away
- **Launcher lane:** the launcher sits 72px above the bottom edge, clear of Netlify's own corner badge on the hosted site.
- **Launcher lane:** from 768px the main column keeps a 72px lane on the right for the Ask Homebase launcher, so it never covers content.
- **Starter block** (`features/home/StarterJobs.tsx`): the first thing on an empty Home.
  - A heading, one sentence saying nothing is saved until the jobs are added, and five tick rows at least 56px tall.
  - Ticking a row opens its "last done" choices under it: radios you move through with the arrow keys, with "Not sure" chosen by default. The tick fills spruce with a white check.
  - One Add button, and quiet links to add your own or leave it. Nothing is saved before Add.
- **Sheets:**
  - Bottom-anchored on phones, with drag to dismiss.
  - Centred panels from 768px.
- **Grids:** every grid declares `minmax(0, 1fr)` columns, so a long row can never widen the page.

## Elevation and depth

| Surface | Shadow |
|---|---|
| Lists, groups and modules | none: lists are open. Form groups carry a 0.5px ring (`--field-ring`, none in dark) |
| Menus, toasts, launcher | `--shadow-float`: `0 1px 2px` and `0 12px 32px` (in dark, plus a 0.5px white hairline) |
| Sheets | `--shadow-sheet`: `0 -8px 40px` |
| Alerts | `--shadow-alert`: `0 24px 64px` |

Only menus, toasts, sheets, alerts, the launcher and the assistant panel carry a shadow.

## Components

All of these live in `src/ui/` and `src/features/*/components`.

- **Page** (`layout.tsx`): large title, optional subtitle, back link, trailing actions, and the profile button on phones.
- **Section / Group / Row:** the building blocks of every screen. A Row takes a title, sub, value, chevron, `to` or `onClick`, and is keyboard reachable.
- **EmptyState:** a title, one plain sentence and at most one action. It has inline and full variants.
- **Skeleton:** a soft pulse with an accessible label, never a spinner.
- **Notice:** an amber or neutral inline note, used for cautions such as "Do not duplicate".
- **Sheet / Confirm / Toast** (`overlays.tsx`):
  - Sheets trap focus, close on Escape and give focus back on close.
  - Confirm is the native-style alert, with Cancel focused by default and the default action in spruce text and destructive actions in clay text, never a clay fill.
  - Toasts stack, at most a few at once, from a region named "Messages" that is always in the page. Two hidden live regions (polite and assertive) carry the announcement, so a toast is not read twice. A toast with Undo, and an error, lives six seconds; a plain one about three. Hovering or focusing the stack pauses the timers. Errors are announced assertively. Each toast leaves in 150ms; under reduced motion it fades.
- **Controls** (`controls.tsx`): TextField, TextArea, SelectField, FormGroup, SearchField, Segmented, Switch, Chips.
- **TaskRow, Countdown, DayStrip** (`features/tasks/components.tsx`):
  - Task rows swipe left for Done. The round check at the left does the same with a tap, in a 50px-wide target.
  - A task title wraps to two lines, then ends in an ellipsis. The check stays at the first line and the row grows by one line.
  - The day strip appears only on the most urgent task and on task detail: up to 14 squares of 9px. Squares for days past due are clay.
- **CodeTag, ReplacementCard, ProfileChart** (`features/property/keys`): KeyFinder's key visuals, drawn with Homebase tokens.
- **HomeOverview, StarterChecklist, MaintenanceTimeline, SeasonalSection, ActivityFeed** (`features/home/HomeSections.tsx`): each Home section has its own form, not the same card:
  - overview: key and value rows, then what needs attention
  - health: a progress line, then two lists (Safety first, Then) of steps that explain why, each with one text action
  - timeline: dated entries on a vertical rule, grouped by month
  - seasonal: Plan, plus a menu with Snooze, Already done and Hide
  - activity: a 30-day tally over a feed
- **Menu** (`ui/menu.tsx`): a popover for quick add and row actions.
  - Arrow keys, Home and End move between items; Escape closes and returns focus.
  - It opens upwards when there's no room below.
- **QuickAdd** (`app/QuickAdd.tsx`): task, maintenance reminder, record, receipt or household note. Each opens the area's own form through its `?new=` link.
- **AssistantLauncher** (`app/AssistantLauncher.tsx`):
  - A 50px docked button with an "Ask Homebase" tooltip.
  - A spruce dot and two slow pulses only when there's a new suggestion; it never loops.
  - It opens a 400px panel with the shared `AssistantChat`.
- **Chat** (`features/assistant`), a native tool rather than a chat clone:
  - An empty chat is a left-aligned "What's going on?" over a group of four common problems, each a row with a chevron.
  - Your messages sit in a quiet fill bubble. Answers are unboxed, in the app's own type, with sentence-case section heads.
  - Callouts are tinted panels with a status icon and no side stripe. What Homebase knows is a group of key and value rows.
  - Next steps are one group of rows, four at a time with a More row. Emergency answers put the Call button first.
  - The composer is a bordered field with a 44px round send button inside it.

## Motion and touch

Following Apple's *Designing Fluid Interfaces* (`ui/physics.ts`):
- **Swipe to done:**
  - The row tracks the finger 1:1 and rubber-bands past both edges.
  - On release it decides from the projected end point (velocity × deceleration), not the release point.
  - A long, fast swipe marks it done straight away, with Undo.
- **Sheets:**
  - Dragging down tracks 1:1; upward drag resists.
  - A flick dismisses on velocity alone.
  - Dismissing by drag, Escape or a tap outside slides the sheet back down from wherever it is, the way it came.
- **Menus and the Ask Homebase panel** grow from their trigger (`transform-origin` on the button side), not from their centre.
- **Preferences:**
  - Reduced motion swaps slides and scales for fades.
  - High contrast strengthens lines and secondary text.
- **Tracking follows size:** large titles at -0.02em, body at -0.01em, small text at 0.

## States

Every list has four states:
- **Empty:** EmptyState with one next step.
- **Loading:** Skeleton.
- **Error:** a plain sentence plus recovery. Storage failure shows a full-screen message with Reload.
- **Confirm:** an alert before anything that can't be undone.

## Accessibility

- 4.5:1 text contrast in both themes.
- 13px minimum text, except tab labels.
- 44px minimum hit areas for buttons, rows, the check, hide buttons and links, even where the drawn shape is smaller.
- Radio groups (the "last done" choices) work like native ones: arrows move and select, wrapping at the ends, and Tab enters on the selected choice or the first.
- A visible 2px spruce focus outline.
- A skip link to main content.
- Reduced motion turns off sheet slides, scales and press-scales, and keeps short fades.

## Do's and Don'ts

**Do:**
- Build screens from Page → Section → Group → Row.
- Keep clay for overdue, destructive and emergency. The one filled button is spruce.
- Show countdowns in the largest whole unit.
- Give every new list an empty, loading and error state.

**Don't:**
- Add dashboards of metric tiles, progress rings, ticking seconds or "coming soon" panels. The snapshot is one strip inside the overview, not a row of cards.
- Add a second typeface, uppercase labels, coloured side stripes, gradients or saturated colour.
- Add decorative icon tiles beside rows or extra badges. The only badges are the overdue count on Tasks and the ending-soon count on Records.
- Use bounce or overshoot easing, or give in-page rows more than the group shadow.
