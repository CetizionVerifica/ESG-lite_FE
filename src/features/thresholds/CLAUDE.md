# P26 · Thresholds

> Blueprint spec. Route `/factors/thresholds` (alias `/threshold-values`); also shown inline in P17 client detail. Role: **Superadmin**.
> Replaces `pages/ThresholdValuePage.tsx`.

## What it does (explain on the page)
"When a category's emissions change by more than this % versus the previous period, the entry is flagged for the manager (P07 warn icon, P06 attention list) and in the contributor's comparison chip (P03)."

## Layout
Simple table: Client | Threshold % (2–5) | Updated | Edit. One row per client; clients without a value show "Default 5%" and an "Set" action. Drawer: slider + number 2.00–5.00 step 0.01.

## Rules
One threshold per client enforced (today duplicates possible); range validated on edit too (today inline edit skips 2–5 check).

## Built (P26 1/1)
- Rows come from `/admin/companies` joined with `/admin/thresholds`; a client with no row shows "Default 5%" and a Set action. Saving creates the row the first time (POST) and updates it after (PUT).
- "Use default 5%" in the drawer deletes the row, which puts the client back on the backend default.
- The backend already enforces one threshold per client (unique + 409) and the 2–5 range on create and update; the drawer validates the same range and two decimals before saving.
- Drawer state lives in `?open=<company id>`; the Value filter (`?value=custom|default`) and search live in the URL.
- The inline copy in P17 client detail belongs to P17.
