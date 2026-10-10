# P26 · Thresholds

> Blueprint spec. Route `/factors/thresholds` (alias `/threshold-values`); also shown inline in P17 client detail. Role: **Superadmin**.
> Replaces `pages/ThresholdValuePage.tsx`.

## What it does (explain on the page)
"When a category's emissions change by more than this % versus the previous period, the entry is flagged for the manager (P07 warn icon, P06 attention list) and in the contributor's comparison chip (P03)."

## Layout
Simple table: Client | Threshold % (2–5) | Updated | Edit. One row per client; clients without a value show "Default 5%" and an "Set" action. Drawer: slider + number 2.00–5.00 step 0.01.

## Rules
One threshold per client enforced (today duplicates possible); range validated on edit too (today inline edit skips 2–5 check).
