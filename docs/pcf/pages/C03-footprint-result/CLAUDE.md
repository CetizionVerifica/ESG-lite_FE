# C03 · Footprint result

> Blueprint spec. Route `/products/:productId` (latest) and `/products/:productId/footprints/:studyId`. Role: **Manager**; read-only for verifier role (phase 2).
> Depends on: F3 (`PageHeader`, `KpiStrip`, `ChartFrame`, `DataTable`, `StatusPill`, `AuditTimeline`, `Tabs`, `Callout`), E1 result + versions.

## Job to be done
"What is this product's footprint, where does it come from, how good is the data, and what would reduce it?"

## Layout
```
PageHeader: title "{product}"  status pill  version chip "v3 · CY 2025"
            actions: primary "Export declaration" (C05), secondary "New version", "Submit/Approve/Publish" by status
┌ KpiStrip ────────────────────────────────────────────────────────────────────────────┐
│ 7.52 kgCO₂e per kg (wide) │ ▼ 4.1% vs v2 │ Primary data 38% │ DQR 1.8 (good) │ Recycled input 20% │
└──────────────────────────────────────────────────────────────────────────────────────┘
Left 60%: Stage waterfall (A1 → A2 → A3 energy → packaging → total)  |  Right 40%: Hotspots list (top inputs, share %)
Tabs: Inputs · Plant energy allocation · Data quality · Versions · Audit
```

## Sections
1. **KpiStrip**: total per declared unit (unit text exactly as declared, e.g. `kgCO₂e / kg`, `tCO₂e / km`), change vs previous version, primary data share, DQR, recycled content.
2. **Stage waterfall** `ChartFrame` with stage tokens; "view as table".
3. **Hotspots**: top 8 inputs by share, each with a one-line lever written by rules (e.g. "Primary aluminium is 91%. Each +10 pts of MiRecAL recycled input lowers the footprint by about 0.8 kgCO₂e per kg."). Lever text is computed by swapping the recycled factor, not by AI.
4. **Scenario slider** (phase 2): recycled share and grid factor sliders show the what-if total without saving.
5. **Tabs**: Inputs (all PcfInput rows with factor, source, DQR); Plant energy allocation (PcfAllocation rows, link to the approved emissions and production used); Data quality (DQR matrix, primary vs secondary split); Versions (table + compare two versions side by side); Audit (`AuditTimeline`).
6. **Out of date banner** when stale: "New approved data since this was calculated. Recalculate as v4."

## Acceptance
- Every figure links to the inputs or emissions that produced it.
- Matches screen "Result" in the previews artifact in all three themes.
