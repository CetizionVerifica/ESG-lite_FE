# P18 · Brand themes (client theme builder)

> Blueprint spec. Route `/clients/:id/brand` (alias `/brand-settings`). Role: **Superadmin** (edit); company **Admin** view-only (proposed).
> Replaces `pages/BrandSettings/BrandSettings.tsx`. This is the screen that makes "Client Brand Themes" real.
> Depends on: F1 theme engine (`buildTheme`, contrast gate), F3 `ColourField`, `FileDrop`, `SegmentedControl`, `Tabs`.

## Job to be done
"Turn a client's logo and two colours into a theme for the app, the sign-in page and their reports, and check it before it goes live."

## Data
`brandService.getBrand / saveBrand / uploadBrandLogo` (`/brands/:companyId`); proposed B1 fields `logoOnDarkUrl`, `defaultLook`, `scope3Colour`. Branded report preview `GET /reports/ghg/:companyId?year=` (backend `reporting/brands.ts` reads the same Brand row).

## Layout
```
PageHeader "Brand theme · {Client}"   status: "Unsaved changes" · actions: Reset · Save theme
┌ Editor (380px) ────────────────┐ ┌ Live preview (fills) ─────────────────────────────┐
│ Display name                   │ │ Look: [Classic][Light][Night]   Screen: [Overview] │
│ Logo (light bg)  FileDrop      │ │        [Sign in][Report cover][Email]               │
│ Logo (dark bg)   FileDrop      │ │  ┌ real app components rendered with this theme ┐  │
│ Primary  ColourField  ✓ AA     │ │  └──────────────────────────────────────────────┘  │
│ Accent   ColourField  ⚠ fills  │ │                                                    │
│ Cover gradient from → to       │ │ Contrast report: 14 pairs ✓, 1 adjusted (accent    │
│ Scope 3 colour (optional)      │ │ text darkened to #8A5A00)                          │
│ Default look ◉Classic ○Light ○Night │ Generated ramps (brand, accent) with hex on hover │
│ [Suggest from logo]            │ │ Fixed colours (status) shown greyed: "not editable" │
└────────────────────────────────┘ └────────────────────────────────────────────────────┘
```

## Rules
- **One save model**: logo uploads are staged and saved with colours (today logo saves instantly, colours need Save).
- "Suggest from logo": extract 2–3 dominant colours client-side (canvas) and offer them as chips.
- Contrast gate from F1 runs live; Save is allowed with warnings, blocked only if a pair can't be fixed automatically.
- Preview uses the **real** F2/F3 components in an isolated theme scope (not a hand-drawn mock like today).
- Report preview picks the latest year with data (today always current year).
- Reset to PlanetPulse defaults; unsaved-changes guard on navigation.
- Audit: show "Last saved {date} by {user}" (needs `updatedBy`, proposed).

## Acceptance
- Saving Midal's theme changes Midal users' app on next load and their branded PDF.
- All 4 stored clients pass the contrast gate.
- Status colours never change in preview.
