---
created: 2026-03-14T01:20:17.821Z
title: Fix addenda input on finalized encounter
area: ui
files:
  - app/(tenant)/[tenant]/encounters/[id]/page.tsx
  - components/encounters/
---

## Problem

The addenda section at the bottom of a finalized encounter is non-functional — users cannot input text into it. The encounter is in finalized state, so the addenda field should be editable for adding post-finalization notes, but the textarea/input is not accepting user input.

## Solution

TBD — investigate whether the input is disabled, read-only, or the event handlers are blocked. Check if the finalized state guard is incorrectly marking the addenda field as read-only along with the rest of the encounter fields.
