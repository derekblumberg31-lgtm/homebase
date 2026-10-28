# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Anchor: someone who owns a 1990s house, keeps forgetting the furnace filter and gutters, and can never find the water heater warranty when something breaks. They open Homebase for a few seconds, usually standing in front of the thing that needs attention.

Homeowners (and renters) who want one calm place for their home: what needs doing, what they own, where the paperwork is, and what to do when something breaks. Mostly on an iPhone installed to the Home Screen, sometimes on a laptop or tablet when entering details.

## Product Purpose
Homebase is "Your intelligent homeowner assistant". It brings together two earlier apps: Replacely (recurring maintenance countdowns) and KeyFinder (identifying house keys from photos). It adds a property profile, Home Inventory, Warranty Vault, Service History and offline guided help. Success means the homeowner trusts Home to tell them what needs attention, and finds any record in seconds.

## Positioning
A local-first home manager: no account, no server, everything on the device, with one backup file covering all of it. It is proactive (alerts, seasonal recommendations, a Home Health Check) without turning into a dashboard.

## Operating Context
- Opened briefly and often: checking Home, marking a job done, photographing a key, filing a receipt.
- Runs as a standalone PWA, often offline.
- Desktop and tablet are used for longer entry sessions.

## Capabilities and Constraints
- Areas:
  - Home: dashboard
  - Property: details, rooms, systems, Home Inventory, Keys and locks, Identify a key
  - Tasks: Maintenance Planner, Schedule, Costs
  - Assistant: offline guides
  - Records: Warranty Vault, documents, Service History
  - Settings
- Data is in IndexedDB (`homebase`, versioned migrations). Files are kept as blobs. JSON backup and restore of a Homebase backup.
- The key engine (OpenCV + Tesseract, about 21 MB) loads only on Identify a key and is cached after first use.
- Stack: React 19, TypeScript, Vite 7, react-router 7, vite-plugin-pwa. Deployed to Netlify via `deploy.sh`.

## Brand Commitments
- Name: Homebase. Tagline: "Your intelligent homeowner assistant".
- An iPhone-native feel: grouped lists, sheets with drag to dismiss, native-style alerts, a bottom tab bar on phones and a sidebar from 768px up. No Apple logos or assets.

## Evidence on Hand
There are no testimonials, user counts or reviews, and the app ships with no sample data. Don't fabricate any.

## Product Principles
1. Home shows what needs attention first; everything else is a tap away.
2. Logging something done or filing a record takes one gesture or one sheet.
3. Everything works offline, and the data belongs to the user.
4. The app only shows what the user entered or what follows from it.
