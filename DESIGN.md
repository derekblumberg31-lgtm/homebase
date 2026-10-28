---
name: Homebase
description: A calm homeowner assistant set in the grouped lists of an iPhone, with one muted brick accent.
colors:
  brick: "#a8503c"
  brick-pressed: "#8f4232"
  brick-wash: "#f5e8e3"
  done-green: "#3d7a55"
  due-amber: "#8a5200"
  due-amber-wash: "#f8eedd"
  ink: "#2b2926"
  ink-secondary: "#6b665f"
  ink-tertiary: "#716c65"
  crossed-ink: "#9a958d"
  grid-rule: "#dedad3"
  warm-ground: "#f4f3f0"
  page-white: "#ffffff"
  pressed-paper: "#f8f7f4"
  fill: "#ecebe7"
  fill-strong: "#e0ded8"
  separator: "rgba(22, 21, 20, 0.08)"
  separator-strong: "rgba(22, 21, 20, 0.13)"
  scrim: "rgba(18, 17, 16, 0.4)"
  toast-ink: "#2f2d2a"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  countdown-large:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.028em"
  countdown:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    letterSpacing: "-0.01em"
  section-head:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  button:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  subhead:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  footnote:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  tab-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.005em"
rounded:
  day-square: "1.5px"
  chip: "10px"
  group: "12px"
  search: "13px"
  button: "14px"
  alert: "16px"
  sheet: "28px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  header: "20px"
  section: "22px"
  half: "26px"
components:
  button-primary:
    backgroundColor: "{colors.brick}"
    textColor: "{colors.page-white}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 18px"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.brick-pressed}"
  button-secondary:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 18px"
    height: "48px"
  button-done:
    backgroundColor: "{colors.done-green}"
    textColor: "{colors.page-white}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    height: "48px"
  add-button:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.brick}"
    rounded: "{rounded.round}"
    size: "44px"
  add-button-pressed:
    backgroundColor: "{colors.fill-strong}"
  task-group:
    backgroundColor: "{colors.page-white}"
    rounded: "{rounded.group}"
  task-row:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "11px 16px"
  task-row-pressed:
    backgroundColor: "{colors.pressed-paper}"
  search-field:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.search}"
    padding: "0 12px"
    height: "44px"
  search-field-focus:
    backgroundColor: "{colors.page-white}"
  form-chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.chip}"
    padding: "0 11px"
    height: "36px"
  form-chip-active:
    backgroundColor: "{colors.brick}"
    textColor: "{colors.page-white}"
  segmented:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.group}"
    padding: "2px"
    height: "48px"
  segmented-active:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink}"
  tab-bar:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink-tertiary}"
    typography: "{typography.tab-label}"
    padding: "5px 8px"
  tab-item-active:
    textColor: "{colors.brick}"
  sheet:
    backgroundColor: "{colors.page-white}"
    rounded: "{rounded.sheet}"
  alert:
    backgroundColor: "{colors.page-white}"
    rounded: "{rounded.alert}"
    width: "298px"
  toast:
    backgroundColor: "{colors.toast-ink}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.button}"
    padding: "11px 15px"
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

Density is low and the voice is soft. Everything is the system font, sentence case, with hierarchy from size and a narrow range of weights. There is one accent, a muted brick (#a8503c light, #df8f7b dark), spent on the next thing to tap and on anything overdue. Neutrals are warm. Dark mode is warm charcoal (#171716), never black.

**Key characteristics:**
- Grouped-list structure everywhere: 12px corners, 0.5px separators inset 16px.
- System font only, with tabular figures for every number.
- One brick accent. Green only for done, amber only for due soon or caution.
- Flat at rest. Real depth only for sheets, alerts and toasts.
- Quiet motion: short eased fades and scale-on-press, switched off under reduced motion.

## Colors

The palette is Replacely's, listed in the front matter and in `src/styles/app.css` (`:root` and `[data-theme='dark']`). The rules:

- **The One Brick Rule.** Brick marks either the next action or something overdue. If a screen shows brick on more than a handful of elements, something is decorating.
- **The Status Hue Rule.** Green means done, amber means due soon or "check this" (for example a restricted key), and brick means overdue. None is used for category colour.
- **The No Pure Extremes Rule.** Text is #2b2926, never #000. The page is #f4f3f0, never #fff.
- **Code tags** have a neutral `--line` rim, and an accent rim when a match is confirmed. They never get a coloured fill.

## Typography

One family: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`.

| Role | Spec | Used for |
|---|---|---|
| Large title | 700, 28px, -0.02em | Page titles: "Good evening, Derek", "Tasks", "Records" |
| Countdown large | 600, 40px, tabular | Countdown in task detail |
| Title | 700, 21px | Onboarding and empty-state headings |
| Countdown | 600, 20px, tabular; unit 15px/500 | Right side of every task row |
| Body | 400, 17px | Row titles, inputs, chat |
| Section head | 600, 15px, secondary ink | Group headings ("Up next", "Warranty Vault") |
| Subhead | 400, 13px | Row subtitles, field labels |
| Footnote | 400, 12px | Hints and captions; nothing smaller except tab labels |
| Tab label | 600, 10px | Mobile tab bar only |

- **The Sentence Case Rule.** Nothing is uppercased or letter-spaced into a label.
- **The One Big Line Rule.** Each screen has one large line: the page title, or the countdown on task detail.

## Layout

- **Phone (below 768px):**
  - The page column has a 16px gutter.
  - A bottom tab bar shows five areas (Home, Property, Tasks, Assistant, Records); the Tasks tab carries the overdue count.
  - Settings opens from the round profile button beside the title. A sixth tab would crowd the bar.
- **Tablet and desktop (768px and up):**
  - A sticky left sidebar holds all six areas in the same order, with Settings pinned at the bottom.
  - Pages are max 760px, or 1080px for `Page wide`.
- **Wide (1100px and up):** Home splits into two columns: Needs attention, Up next and For this season on the left; Home Health Check, Recent activity and Ask Assistant on the right.
- **Sheets:**
  - Bottom-anchored on phones, with drag to dismiss.
  - Centred panels from 768px.
- **Grids:** every grid declares `minmax(0, 1fr)` columns, so a long row can never widen the page.

## Elevation and depth

| Surface | Shadow |
|---|---|
| Groups | `0 1px 2px rgba(22,21,20,0.04)` |
| Sheets | `0 -18px 60px rgba(22,21,20,0.22)` |
| Alerts | `0 24px 70px rgba(0,0,0,0.32)` |
| Toast | `0 12px 30px rgba(0,0,0,0.24)` |

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
  - Confirm is the native-style alert, with Cancel focused by default and destructive actions in brick.
  - Toasts can carry an Undo action; deletes offer Undo where they can.
- **Controls** (`controls.tsx`): TextField, TextArea, SelectField, FormGroup, SearchField, Segmented, Switch, Chips.
- **TaskRow, Countdown, DayStrip** (`features/tasks/components.tsx`):
  - Task rows swipe left for Done.
  - The day strip appears only on the most urgent task and on task detail: up to 25 squares of 9px.
- **CodeTag, ReplacementCard, ProfileChart** (`features/property/keys`): KeyFinder's key visuals, drawn with Homebase tokens.
- **Chat** (`features/assistant`):
  - User bubbles are brick with white text.
  - Answers are white groups with the guide name, numbered steps, an amber safety note and up to two text actions.

## States

Every list has four states:
- **Empty:** EmptyState with one next step.
- **Loading:** Skeleton.
- **Error:** a plain sentence plus recovery. Storage failure shows a full-screen message with Reload.
- **Confirm:** an alert before anything that can't be undone.

## Accessibility

- 4.5:1 text contrast in both themes.
- 12px minimum text, except tab labels.
- 44px minimum targets.
- A visible 2px brick focus outline.
- A skip link to main content.
- Reduced motion turns off page fades, sheet slides and press-scales.

## Do's and Don'ts

**Do:**
- Build screens from Page → Section → Group → Row.
- Keep brick for the next action and for overdue.
- Show countdowns in the largest whole unit.
- Give every new list an empty, loading and error state.

**Don't:**
- Add dashboards of metric tiles, progress rings, ticking seconds or "coming soon" panels.
- Add a second typeface, uppercase labels, gradients or saturated colour.
- Add decorative icon tiles beside rows or extra badges. The Tasks overdue count is the only badge.
- Use bounce or overshoot easing, or give in-page rows more than the group shadow.
