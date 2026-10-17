# SE-6 · Form templates and copy

> Module spec. PR titles `[SE-6 1/2]` (ESG-lite), `[SE-6 2/2]` (FE), `Completes: SE-6`.
> Depends on: SE-4 · Owns: `form_template` table, `/admin/form-templates`

## Job to be done
A Superadmin sets up a category once and applies it to many sites or clients.

## Build
1. `form_template` (name, category name, config json, created_by/at). "Save as template" from a form; list, rename, delete (Superadmin).
2. "Apply to…" a template or a form: pick client → sites × category; preview the SE-4 check for each target; apply creates or updates those forms (each a new version). Choice ids and factor-match rules keep names; targets with no matching factor show the check error, not a silent skip.
3. Global templates (no client) seed new clients.

## Tests
API tenant isolation (a template applied to company 1 can't touch company 2 unless Superadmin), check run per target; Playwright apply to two sites.

## Done when
One form can be copied to N sites in one action with each passing the check.

## As built (2026-10-17, frontend part 2/2)
- **Builder header** (saved form only):
  - **"Save as template"**: name, and "<client> only" or "Every client" (`SaveTemplateModal`).
  - **"Copy to sites"** (`ApplyDrawer` with the form as source).
- **`ApplyDrawer`**:
  - Lists the source client's sites by client (every client's for a global template). Each site shows why it can't take the form: the form's own site, or doesn't report the category.
  - "Check N sites" shows each site's action ("Updates its form; 40 saved rows keep their values"), its check, and its problems with their messages.
  - "Apply to N sites" writes only the sites that pass, with an optional note for the new versions, and shows the result ("Form updated, version 3 live").
- **Forms list → "Templates"** (`TemplatesDrawer`):
  - Each template with its category, field count, who saved it and when, and "Every client" or the client.
  - Actions: Apply to sites, Rename, Delete (destructive confirm; forms made from it stay).
  - **"Fill a client's missing forms"**: choose a client, Check (dry run), then "Create N forms". A site with rows saved without a form is listed with the reason and isn't changed.
- **Logic** `templates.ts` (pure): `siteChoices` (which sites, by client, and why not), `targetLine` (each target in plain words), `applicable`.
- **Deviation:** templates live in a drawer opened from the forms list, not on a page of their own. A new page would need the shared shell route and nav files.
