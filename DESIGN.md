---
name: Homebase
description: A calm homeowner assistant set in the grouped lists of an iPhone, with one muted brick accent.
colors:
  brick: "#9e4f34"
  brick-dark: "#d6957c"
  done-green: "#4f7353"
  due-amber: "#8a6420"
  ink: "#29271f"
  ink-secondary: "#4c4a44"
  ink-tertiary: "#5a5750"
  warm-ground: "#faf9f5"
  page-white: "#ffffff"
  pressed-paper: "#f5f4ee"
  fill: "#efede5"
  fill-strong: "#e6e3d9"
  dark-ground: "#262624"
  dark-surface: "#2f2e2b"
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
  md: "12px"
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
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.warm-ground}"
    rounded: "{rounded.lg}"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "48px"
  round-button:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.round}"
    size: "44px"
  task-group:
    backgroundColor: "{colors.page-white}"
    rounded: "{rounded.md}"
  form-chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    height: "44px"
  form-chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.warm-ground}"
  segmented:
    backgroundColor: "{colors.fill}"
    rounded: "{rounded.sm}"
    height: "48px"
  tab-item-active:
    textColor: "{colors.brick}"
  sheet:
    backgroundColor: "{colors.warm-ground}"
    rounded: "{rounded.sheet}"
  alert:
    backgroundColor: "{colors.page-white}"
    rounded: "{rounded.xl}"
    width: "300px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.warm-ground}"
    rounded: "{rounded.lg}"
---

# Design System: Homebase

## Overview

**Creative North Star: "The Calm House Binder"**

Homebase is the binder every homeowner means to keep: what needs doing, what they own, where the paperwork is, and what to do when something breaks. It is laid out the way iOS lays out Settings:
- a plain large title
- inset grouped lists of white rows on a warm grey ground
- hairline separators
- sheets that rise from below

Two signatures carry over from the apps it replaces:
- From Replacely: the largest-unit countdown ("3 months", "Today", "4 days over") and the day strip, shown on the single most urgent task.
- From KeyFinder: the rimmed code tag that names a key's blank, and the cut-profile chart.

Density is low and the voice is soft. Everything is the system font, sentence case, with hierarchy from size and a narrow range of weights. There is one accent, a muted brick (#9e4f34 light, #d6957c dark), spent on small marks and on anything overdue. Buttons are ink, not brick. Neutrals are warm. Dark mode is one warm charcoal ground with a stepped surface, never black.

**Key characteristics:**
- Grouped-list structure everywhere: 12px corners, no outline, 0.5px separators inset 16px.
- System font only, with tabular figures for every number.
- One brick accent. Green only for done, amber only for due soon or caution.
- Flat at rest. Three named shadows, only for what floats: menus, toasts and the launcher; sheets; alerts.
- Quiet motion: ease-out entries under 250ms, scale on press, a drawer curve for sheets. Reduced motion swaps movement for short fades.

## Colors

The palette is warm and quiet, defined in `src/styles/app.css` (`:root` and `[data-theme='dark']`). The front matter above lists the values in use.
- **Light:** ivory ground #faf9f5, white surfaces, soft ink #29271f.
- **Dark:** charcoal #262624, surfaces #2f2e2b, warm off-white ink #f3f1ea.
- **Primary buttons are ink** (`--button-bg`), not colour.
- **Terracotta** is the accent (`--accent`): #9e4f34 in light, #d6957c in dark. Pressed and hover (`--accent-deep`) is #86402a in light. It is muted and kept for things that need you: overdue text, the overdue squares of the day strip, small markers (the high-priority dot, the launcher dot), the active tab and the focus outline.
- **Brick is never a fill.** Primary buttons, the selected chip and the ticked starter circle are filled with ink (`--button-bg`, #29271f light, #f3f1ea dark) with `--button-text` on top.
- **Badges are neutral grey.**

The rules:

- **The One Brick Rule.** Brick marks something overdue, a small marker or a link-style action. It is never a large fill. If a screen shows brick on more than a handful of elements, something is decorating.
- **The Status Hue Rule.** Green means done, amber means due soon or "check this" (for example a restricted key), and brick means overdue. None is used for category colour.
- **The No Pure Extremes Rule.** Text is warm ink, never #000. The page is warm paper, never #fff.
- **Code tags** have a neutral `--line` rim, and an accent rim when a match is confirmed. They never get a coloured fill.
- **The Cool Information Rule.** Dusty blue (`--cool`: #3b687a light, #8fb6c5 dark) is the one cool accent. It's for information, never for actions:
  - snapshot icons
  - the health progress bar and completed steps
  - timeline markers
  - activity and menu icons
- **One dark ground.** Charcoal #262624 with surfaces #2f2e2b and warm off-white ink #f3f1ea. A toast in dark is a stepped fill, not a bright pill.

## Typography

One family, the system font: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. Sizes are rem, so they follow the reader's own text size. Weights are 400, 500, 600 and 700.

Page titles go through one token, `--font-title` (see Pending owner decisions).

| Role | Spec | Used for |
|---|---|---|
| Display | 600, 3rem, tabular | Countdown on task detail only |
| Large | 700, 2.125rem | Page titles, onboarding titles |
| Title | 600, 1.375rem | Empty-state titles, Assistant answer title, starter heading, detail page title |
| Headline | 600, 1.0625rem | Sheet title, answer section heads, emphasised rows |
| Body | 400, 1.0625rem | Row titles, inputs, chat |
| Subhead | 400, 0.9375rem; 600 for section heads and buttons | Row subtitles, page subtitle |
| Footnote | 400, 0.8125rem | Hints, captions, footers |
| Caption | 600, 0.6875rem | Tab labels only |
| Countdown | 600, 1.25rem, tabular; 1.75rem on the most urgent row | Right side of a task row |

- **The Sentence Case Rule.** Nothing is uppercased or letter-spaced into a label.
- **The One Big Line Rule.** Each screen has one large line: the page title, or the countdown on task detail, where the title steps down to the title size.

## Layout

- **Phone (below 768px):**
  - The page column has a 16px gutter.
  - A bottom tab bar shows five areas (Home, Property, Tasks, Assistant, Records). The active tab's icon and label are brick.
  - Count badges: overdue tasks on Tasks, warranties ending soon on Records.
  - Settings opens from the round profile button beside the title. Home's header also has a round + for quick add.
- **Header:** the back link and the actions share a 44px row above the title, which gets the full width. From 768px the actions sit beside the title.
- **Tablet (768–1099px):** an 88px icon rail with small labels, a round fill + button, and Settings below a rule. Badges become dots. Every page title starts at the same left edge.
- **Desktop (1100px and up):**
  - A 244px sidebar: brand (the name only), an Add row, the five areas, and Settings set apart at the bottom.
  - The active item has a stepped fill, and its icon is brick.
  - Pages are max 760px, or 1120px for `Page wide`.
- **Home** is for a few seconds in front of the thing that needs doing:
  - one status line saying whether anything is overdue
  - the next three jobs, swipe to mark done
  - alert rows for what needs a look: a warranty ending, a system to check, a backup that is due, and the install row. Each is one row with an amber icon, a title of up to two lines, a detail line and a chevron, with its own 44px hide button at the right. Hiding one offers Undo and leaves the item in its own list.
  - on a new home with no jobs, the starter block (below) in place of the list
  - an Ask Homebase row
  - a short list linking to Home Health Check (with the snapshot), This season, Coming up and Activity, each on its own page one tap away
- **Launcher lane:** the launcher sits 72px above the bottom edge, clear of Netlify's own corner badge on the hosted site.
- **Launcher lane:** from 768px the main column keeps a 72px lane on the right for the Ask Homebase launcher, so it never covers content.
- **Starter block** (`features/home/StarterJobs.tsx`): the first thing on an empty Home.
  - A heading, one sentence saying nothing is saved until the jobs are added, and five tick rows at least 56px tall.
  - Ticking a row opens its "last done" choices under it: radios you move through with the arrow keys, with "Not sure" chosen by default. The tick fills with ink, not brick.
  - One Add button, and quiet links to add your own or leave it. Nothing is saved before Add.
- **Sheets:**
  - Bottom-anchored on phones, with drag to dismiss.
  - Centred panels from 768px.
- **Grids:** every grid declares `minmax(0, 1fr)` columns, so a long row can never widen the page.

## Elevation and depth

| Surface | Shadow |
|---|---|
| Groups and modules | a 0.5px hairline and `0 1px 2px` (none in dark; the surface step carries it) |
| Menus, toasts, launcher | `--shadow-float`: `0 1px 2px` and `0 12px 32px` (in dark, plus a 0.5px white hairline) |
| Sheets | `--shadow-sheet`: `0 -8px 40px` |
| Alerts | `--shadow-alert`: `0 24px 64px` |

Only surfaces that float over the page and can be dismissed get more than the group shadow.

## Components

All of these live in `src/ui/` and `src/features/*/components`.

- **Page** (`layout.tsx`): large title, optional subtitle, back link, trailing actions, and the profile button on phones.
- **Section / Group / Row:** the building blocks of every screen. A Row takes a title, sub, value, chevron, `to` or `onClick`, and is keyboard reachable.
- **EmptyState:** a title, one plain sentence and at most one action. It has inline and full variants.
- **Skeleton:** a soft pulse with an accessible label, never a spinner.
- **Notice:** an amber or neutral inline note, used for cautions such as "Do not duplicate".
- **Sheet / Confirm / Toast** (`overlays.tsx`):
  - Sheets trap focus, close on Escape and give focus back on close.
  - Confirm is the native-style alert, with Cancel focused by default and destructive actions in brick text, never a brick fill.
  - Toasts stack, at most a few at once, from a region named "Messages" that is always in the page. Two hidden live regions (polite and assertive) carry the announcement, so a toast is not read twice. A toast with Undo, and an error, lives six seconds; a plain one about three. Hovering or focusing the stack pauses the timers. Errors are announced assertively. Each toast leaves in 150ms; under reduced motion it fades.
- **Controls** (`controls.tsx`): TextField, TextArea, SelectField, FormGroup, SearchField, Segmented, Switch, Chips.
- **TaskRow, Countdown, DayStrip** (`features/tasks/components.tsx`):
  - Task rows swipe left for Done. The round check at the left does the same with a tap, in a 50px-wide target.
  - A task title wraps to two lines, then ends in an ellipsis. The check stays at the first line and the row grows by one line.
  - The day strip appears only on the most urgent task and on task detail: up to 14 squares of 7px. Squares for days past due are brick.
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
  - A brick dot and two slow pulses only when there's a new suggestion; it never loops.
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
  - Reduced transparency makes the tab bar solid.
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
- A visible 2px accent focus outline.
- A skip link to main content.
- Reduced motion turns off sheet slides, scales and press-scales, and keeps short fades.

## Do's and Don'ts

**Do:**
- Build screens from Page → Section → Group → Row.
- Keep brick for overdue and small markers. Buttons are ink.
- Show countdowns in the largest whole unit.
- Give every new list an empty, loading and error state.

**Don't:**
- Add dashboards of metric tiles, progress rings, ticking seconds or "coming soon" panels. The snapshot is one strip inside the overview, not a row of cards.
- Add a second typeface, uppercase labels, coloured side stripes, gradients or saturated colour.
- Add decorative icon tiles beside rows or extra badges. The only badges are the overdue count on Tasks and the ending-soon count on Records.
- Use bounce or overshoot easing, or give in-page rows more than the group shadow.

## Pending owner decisions

Two choices reverse an earlier deliberate look and are shipped as separate, revertible commits at the end of the branch. Nothing else depends on them, and each changes token values only.

- **Page titles.** Today they are set in the serif `--font-title` at weight 500. The proposed change sets `--font-title` to the system font at weight 700 with tighter tracking, which is the iPhone-native large title.
- **Neutrals.** Today's neutrals (`#faf9f5` light ground, `#262624` dark ground) are close to another well-known product's. The proposed values: light `--bg #f4f3ef`, `--surface-2 #f8f7f4`, `--sidebar-bg #efeee9`, `--fill #ebe9e4`, `--fill-strong #e0ded8`, `--text #2b2926`, `--text-2 #57534d`, `--text-3 #6b665f`; dark `--bg #1b1a18`, `--surface #252321`, `--surface-2 #2c2a27`, `--sidebar-bg #161513`, `--fill #312f2c`, `--fill-strong #3b3935`, `--text #f1ece4`, `--text-2 #c9c3b9`, `--text-3 #a8a298`.
