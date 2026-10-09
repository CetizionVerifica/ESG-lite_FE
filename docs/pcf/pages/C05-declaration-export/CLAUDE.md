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
