# P16 · Console (Superadmin home)

> Blueprint spec. Route `/console` (aliases `/superadmin`, `/admin/dashboard`). Role: **Superadmin**. Always PlanetPulse theme.
> Replaces `pages/SuperAdminPage.tsx` (today a placeholder `<div>SuperAdminPage</div>` that is nonetheless the landing page).
> Depends on: F3 `KpiStrip`, `DataTable`, `Callout`.

## Job to be done
"Which clients are healthy, which are stuck in setup, and what needs PlanetPulse staff today?"

## Layout
```
PageHeader "Console"  action: Onboard client
KpiStrip: Clients (active) | Sites | Users | Emission factors | Entries this month
Clients table: logo · Client | Sites | Users | Setup completeness bar | This month (entries, pending) | Theme (swatch) | ›
Setup gaps (right): "Dammam · 3 categories have no column config" · "Glochem · no threshold set" · "Chieron · no logo on dark" → links to P24/P26/P18
Recent activity: factor uploads, bulk uploads, onboarding (from AI service `emission_factor_uploads`, `uploaded_documents`, batches)
```
## Setup completeness (per client) checks
Sites exist · each site has categories · each site×category has a ColumnConfig · factors exist for last year · units exist · products exist (if intensity used) · threshold set · brand theme set (logo, colours, contrast pass).

## Data
Existing list endpoints aggregated client-side first; proposed `GET /admin/console` summary.
