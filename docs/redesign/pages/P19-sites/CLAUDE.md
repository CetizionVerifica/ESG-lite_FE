# P19 · Sites

> Blueprint spec. Route `/setup/sites` (alias `/sites`). Role: **Superadmin**.
> Replaces `pages/SitePage.tsx` (348; 7 inline-editable columns incl. a long comma list).
> Uses the **Setup list pattern** (shared by P19–P26): `PageHeader` + `FilterBar` + `DataTable` + right `Drawer` for create/edit + confirm modal for delete. No inline cell editing.

## Layout
```
PageHeader "Sites"  Client ▾ (required context for Superadmin) · Country ▾ · search    action: Add site
DataTable: Site | Client | Country | Categories (count chips by scope: S1 4 · S2 2 · S3 5) | Users | Managers | Config coverage "9/11" | ›
Drawer (tabs): Details (name*, address*, contact person*, client*, country*) · Categories (grouped by scope, checkbox list, search, select all) · People (users & managers on the site, link to P20) · Capture (config coverage per category → P24)
```
## Data
`siteService` CRUD, `companyService.getCompanies`, `countryService.getCountries`, `categoryService.getCategories`.
## Rules
Required markers and validation for Client and Country (today silent failure). Delete confirm lists what cascades (emissions, factors, configs, products are `onDelete: CASCADE`) and requires typing the site name.
