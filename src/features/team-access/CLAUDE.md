# P09 · Team access

> Blueprint spec. Route `/team` (alias `/manage-users`). Role: **Manager**.
> Replaces `pages/ManagerUsers/index.tsx`.
> Depends on: F3 `DataTable`, `Drawer`, `Toggle`, `Toast`.

## Job to be done
"See who reports data on my sites, and which categories each person can enter."

## Data
`managerService.getManagerUsers()`, `updateUserCategories(userId, enabledCategoryIds[])`; submission status for the "This month" column.

## Layout
```
PageHeader "Team"  search · Site ▾ filter
DataTable: Person (avatar, name, email) | Sites | Categories "8 of 10" (bar) | This month (Submitted / Missing) | Last entry | Manage
Drawer "Category access — {name}":
  per site section: "Bahrain" [Enable all] [Disable all]
     toggle rows: Category · Scope dot · Enabled/Revoked
  footer: Cancel · Save
```

## Rules
- Toggle state keyed by **site_id + category_id** (fixes today's bug where the same category on two sites toggles together; needs backend check that `user_categories` supports per-site, otherwise show a note and keep it per category).
- Save → toast "Access updated for {name}"; errors shown in drawer.
- "Send reminder" for Missing (same as P06).

## Acceptance
Search, per-site enable/disable all, visible errors, uses token colours (today mixes gray-* and slate-*).
