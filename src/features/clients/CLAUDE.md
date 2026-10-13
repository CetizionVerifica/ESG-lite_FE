# P17 · Clients and client onboarding

> Blueprint spec. Routes `/clients`, `/clients/new`, `/clients/:id` (overview tabs). Role: **Superadmin**.
> Replaces `pages/CompanyPage.tsx` (incl. dead "Add Company" modal and branding upload hidden in a cell) and `CompanyOnboardingPage.tsx`.
> Depends on: F3 `DataTable`, `Stepper`, `Field` set, `FileDrop`.

## Clients list `/clients`
Search · Status chips (Active/Inactive) · Industry ▾ · Region ▾.
Columns: logo · Client | Industry | Region | Sites | Users | Status | Theme swatch | ›. Row → client detail.

## Client detail `/clients/:id` (tabs)
Overview (company fields, edit in drawer) · Sites (P19 filtered) · People (P20 filtered) · **Brand theme** (P18) · Thresholds (P26 inline: one value per company) · Mappings (P23 filtered) · Danger zone (deactivate; delete with typed confirmation).
Fields: name, address, contact_person, email, phone_number, industry, region, employee_range, cin_number, status, esgMitraAccess, subscription_id (read-only), isEmailVerified (badge).

## Onboard client `/clients/new` (Stepper, 4 steps, replaces one long form)
1. **Company** — Name*, Industry (list), Region (list), Employee range (1-10 … 500+), CIN, Address.
2. **Admin user** — Contact name*, Email*, Phone, Password* (min 8; or "send invite").
3. **Access** — ESG-Mitra access toggle; reporting calendar (CY / FY start month) used by P10/P11.
4. **Brand** — Logo (light), Logo (dark, optional), Primary, Accent (or "Suggest from logo"), colour-guideline file; mini preview of sign-in cover. "Skip for now" keeps PlanetPulse theme.
Review → Create (`companyService.onboardCompany`, FormData). Success page with next steps: Add sites → Assign categories → Configure capture → Load factors (links into P19, P24, P22).

## Rules
Unsaved-changes guard; inline validation; success toast; errors visible.

## Copy client setup (2026-10-13, Shyam's decisions)
Backend: ESG-lite `docs/setup-copy.md` (`GET /admin/companies/:id/setup-bundle`, `POST /admin/setup-copy/preview`, `POST /admin/companies/:id/setup-copy`). Logic in `setupCopy.ts`, shared form `components/SetupCopyPanel.tsx`.
- Onboarding step 5 **Start from** (optional, before Review): Start empty · An existing client · A setup file (.json). What to copy (forms, units, factors, mappings, threshold, products on by default; material factors off), factor years (the source's newest and the current year by default; tick older ones to add them), preview table per source site. The copy runs after the company exists: its main site takes the first source site (`first_site: "main"`), the others are created. A failed copy is a warning on the success page.
- Client detail header: **Copy setup here** (drawer: same panel plus per-site target and "same name" form rule) and **Download setup** (the .json file; upload it on another environment).
- Never copied: people, entries, production, PCF studies, documents, brand, MCP. Nothing existing is overwritten.
