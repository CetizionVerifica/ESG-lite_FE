# Simple data entry (SE-0 … SE-6)

Contributors (role **User**) fill in only the fields their company needs and see a total in tCO₂e. They never choose a calculation method or see factors, exchange rates, Category 3 parts or data quality. The **Superadmin** sets all of that per client in Capture setup; the server applies it in `emissionWrite`.

- Plan and evidence: [`00-plan.md`](00-plan.md). Decisions (Shyam, 2026-10-16): total only; no contributor method picker (the Superadmin maps a client-worded question to methods); open Scope 3 PRs merge as they are and SE-1 hides their detail; default currency INR.
- Owner: **Sami (samidaire)**. Tracking issue in ESG-lite_FE.
- Branch from `production`, PRs into `production`, titled `[SE-n k/m] …`; the backend PR merges before the FE PR of the same module. Last PR of a module says `Completes: SE-n`.
- Copy a module's `CLAUDE.md` into the code folder it names as the first commit (repo rule).

## Order

```
SE-0 specs ─┐
SE-1 contributor view (FE) ───────────────► (independent, start first)
SE-2 form config model (BE) ─► SE-3 builder + Add data (FE) ─► SE-5 migrate forms
                            └► SE-4 form check + versions ─► SE-6 templates
```

| Module | Repos | Needs merged | Size |
|---|---|---|---|
| [SE-0 Spec updates](modules/SE-0-spec-updates/CLAUDE.md) | ESG-lite docs | — | 0.5 d |
| [SE-1 Contributor view](modules/SE-1-contributor-view/CLAUDE.md) | FE | — | 1.5 d |
| [SE-2 Form config model](modules/SE-2-form-config/CLAUDE.md) | ESG-lite | S3-3 part 1 if merged; else SE-2 adds `method_options` | 3 d |
| [SE-3 Builder and Add data](modules/SE-3-builder/CLAUDE.md) | FE | SE-2 | 3 d |
| [SE-4 Form check and versions](modules/SE-4-check-versions/CLAUDE.md) | ESG-lite, FE | SE-2 | 2.5 d |
| [SE-5 Migrate existing forms](modules/SE-5-migrate-forms/CLAUDE.md) | ESG-lite | SE-3 | 1.5 d |
| [SE-6 Templates and copy](modules/SE-6-templates/CLAUDE.md) | ESG-lite, FE | SE-4 | 2 d |

## Rules every module keeps

1. **The form decides, the server applies.** A User's entry sends field values only. Method, currency, unit, FX, deflator, Category 3 twins and DQ come from the form config and the factor library, on the server.
2. **No method words on User screens.** Method labels (`METHOD_LABELS`), factor values, "(factor unit)", FX lines, FERA/Category 3 lines, DQ and engine warnings show only to Manager, Admin and Superadmin.
3. **Nothing calculates outside `emissionWrite`** (ESG-lite rule). The builder stores config only. Golden totals (`ci/golden`) don't move.
4. **Saved rows never change** when a form changes; rows keep their factor snapshot and (from SE-4) `form_version`.
5. New columns and data changes ship as additive, idempotent `migrate:*` scripts that run on start (`migrate-all`), so they are safe on the real prod DB; no existing emission row or stored total is rewritten. Every new endpoint gets a tenant-isolation test.
6. FE: tokens only, `src/ui` components, loading/empty/error states, keyboard, 1280/1024/768/390 px (FE CLAUDE.md definition of done).

## Scope 3 work in flight

Scope 3 lanes keep running. New Scope 3 work must not add User-facing method or factor UI; put it behind the SE-1 switch (`showCalcDetail`) and, for method choice, use the form's `method_options` / `method_by_choice` (SE-2). See `00-plan.md` §7 for what each S3 PR needs.
