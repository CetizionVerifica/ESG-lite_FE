# C05 · Product declaration export (PDF, PACT JSON, CSV)

> Blueprint spec. Triggered from C03 "Export declaration" and C01 bulk actions. Role: **Manager**. Only **approved** or **published** versions export without a "DRAFT" watermark.
> Depends on: P10's `pdfTheme(brand)` and `@react-pdf` setup, F1 cover tokens, E1 `/pcf/studies/:id/export`.

## Outputs
1. **PDF declaration** (2–4 pages, client-branded like the GHG report cover):
   cover (client gradient, product name, declared unit, total, "Powered by PlanetPulse ESGLite") → summary (total, stage chart, boundary diagram, reference period, standard, PCR) → inputs and data quality (primary share, DQR, cut-offs, allocation method) → method notes and verification status.
2. **PACT JSON** (Pathfinder v3 `ProductFootprint`): id, specVersion, companyName, companyIds (URN), productDescription, productIds, productCategoryCpc, productNameCompany, pcf { declaredUnit, unitaryProductAmount, pCfExcludingBiogenic, pCfIncludingBiogenic, fossilGhgEmissions, biogenicCarbonContent, characterizationFactors "AR6", crossSectoralStandardsUsed, productOrSectorSpecificRules, boundaryProcessesDescription, referencePeriodStart/End, geographyCountry, primaryDataShare, dqi, exemptedEmissionsPercent }. Validated against the published schema before download.
3. **CSV** of inputs and results for the buyer's own checks.

## Acceptance
- PACT JSON passes schema validation in CI with the pilot study.
- PDF matches screen "Declaration" in the previews artifact for PlanetPulse and Midal.

## Build notes (C05, 2026-10-10)
- Route `declaration-export` at `/products/:studyId/export` (Manager), registered in this folder's `routes.tsx`; more specific than the `pcf` slot `/products/*`, so it wins. C03's "Export declaration" button and C01's bulk action should link here.
- Data: `GET /pcf/studies/:id/export?format=pdf-data` (ESG-lite #81) feeds the page and the PDF; `format=pact` and `format=csv` are downloaded as files from the backend. The backend validates PACT v3.0.3 before sending.
- The PDF is built client-side with `@react-pdf` and `pdfTheme(pack)` in the signed-in company's brand (cover gradient, logo when it loads). Unapproved footprints carry a DRAFT watermark on every page and a `-DRAFT` file name.
- PACT JSON is disabled until the footprint is approved (backend returns 409 otherwise). Superseded footprints export as PACT status `Deprecated`.
- Licensed (ecoinvent) line values, their stage totals, primary share and DQR are withheld from every export for every role, superadmins included. The product total always shows.
- The spec's PACT field list uses v2 names (`pCfExcludingBiogenic`, `unitaryProductAmount`, `crossSectoralStandardsUsed`); the export follows v3.0.3 names (`pcfExcludingBiogenicUptake`, `declaredUnitAmount`, `crossSectoralStandards`). `productCategoryCpc` was removed in v3 and isn't sent.
