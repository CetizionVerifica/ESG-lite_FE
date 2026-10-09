# P02 · My month (contributor home) — new page

> Blueprint spec. Route `/my-month` (new default for **User**). No existing page; borrows the "Guided" direction from the design-options thread.
> Depends on: F3 `PageHeader`, `KpiStrip`, `StatusPill`, `Callout`, `DataTable`.

## Job to be done
"What do I owe this month, what got sent back, and how long do I have?"

## Data
- User's site(s) and granted categories (`User.sites/site`, `User.categories`).
- Entries for the month per category: `getEmissionsPaginated({siteId, month, year})` today; **proposed B5** `GET /user/my-month?month=` returning per category `{status: todo|pending|approved|rejected, count, tCO2e, lastEntryAt}`.
- Deadlines: reminder 10th, escalation 15th (`workers/deadlineScheduler.ts`), user timezone.
- Notifications (rejections) from `NotificationContext`.

## Layout
```
PageHeader "September 2025"  crumb "{Site}"   month switcher ‹ ›   primary: Add data
Due banner: "Due in 4 days (Oct 10). 6 of 9 categories done."  progress bar
┌ Sent back to you (rejected) ─────────────────────────────┐  (only if any)
│ Diesel · "Wrong unit, should be litres"  · Manager · [Fix] │
└──────────────────────────────────────────────────────────┘
Checklist grouped by scope:
 Scope 1  ● Diesel           Approved   4.29 t     ›
          ○ LPG              To do                 [Add]
 Scope 2  ● Grid electricity Pending    312.4 t   ›
 Scope 3  ◐ Business travel  2 entries, 1 pending  ›
Right: "Your month at a glance" (tCO₂e entered, pending, approved) · Production data due ([Add production])
```

## Rules
- Each row's action deep-links to P03 with context prefilled (`/data/new?site=&category=&period=`).
- Yearly-filed categories appear only in their period's due month, labelled "Yearly · FY 2025-26".
- Status pills fixed colours; "To do" uses neutral `--t-muted`.
- If several sites: site switcher in header; checklist per site.
- After the 10th: banner turns warn; after the 15th: "Escalated to your manager".

## States
All done: success callout "All 9 categories are in. Nice work." No categories assigned: empty state "Ask your manager for access".

## Acceptance
Contributor reaches the right entry form in one click from every to-do; rejected items always on top.
