# P21 · Reference data: Countries, Categories, Units

> Blueprint spec. Route `/setup/reference?tab=countries|categories|units` (aliases `/countries`, `/categories`, `/units`). Role: **Superadmin**. Setup list pattern (see P19).
> Replaces `pages/CountryPage.tsx` + `components/CountryList.tsx` (no header, unstyled button, **delete doesn't call the API**), `CategoryPage.tsx`, `UnitsPage.tsx`.

## Countries tab
Columns: Country | Code (ISO-2 validated) | Sites using it. Drawer: Name*, Code*. Delete calls the API (today it only hides the row); blocked with message when sites use it.

## Categories tab
Columns: Category | Scope pill (S1/S2/S3/Saving) | Sites assigned (count) | Factors | Configs. Filter by scope.
Drawer: Name*, Scope (Scope 1/2/3 or "None – counts as saving", with explainer), **Sites assignment editable after creation** (today create-only), "Assign to all sites". Keep "add another" flow (modal stays open on success).

## Units tab
Context chips Site ▾ Category ▾ (server-side when both set; consistent behaviour). Columns: Unit | Description | Site | Category | Used by entries. Drawer: Site*, Category* (site's categories), Unit name*, Description. Allow moving site/category on edit.

## Data
`countryService`, `categoryService` (`createCategory({category_name, scope, assign_all_sites, site_ids})`), `unitService`, `siteService`.
