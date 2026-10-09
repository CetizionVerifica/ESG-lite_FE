# PCF · Product Carbon Footprint for ESG Lite: plan

> Blueprint, written 2026-10-09. No code yet. Same style as `../redesign/` (the corporate redesign).
> Page IDs here start with **C** (C01–C06) and engine modules with **E** (E1–E2) so they never clash with the redesign's P01–P27 and F1–F3.
> All figures in examples are illustrative, not client data.

## 1. What we are building
ESG Lite today measures a **company** (Scope 1/2/3 per site and month). A PCF measures **one product**: the kg CO₂e embodied in one declared unit (for example 1 t of aluminium wire rod, or 1 km of AAAC conductor) from raw material to factory gate.

Customers ask for this number (EU buyers, utilities in tenders, CBAM-adjacent supply chains) and want it in a standard format they can import. Midal Cables is the natural pilot: few high-volume products, one dominant material (aluminium, ~87% of footprint), and a recycled line (MiRecAL) whose lower footprint is a selling point.

## 2. Method choices (defaults, change in one place)
| Topic | Default | Why |
|---|---|---|
| Standard | **ISO 14067:2018**, aligned with **GHG Protocol Product Standard** | The two references buyers name |
| Exchange format | **PACT Pathfinder Framework v3** (WBCSD) JSON | Buyers' systems (SAP SFM, Siemens SiGREEN…) import it |
| Boundary | **Cradle-to-gate** (A1 raw materials, A2 inbound transport, A3 manufacturing incl. packaging) | What PACT and most B2B requests ask for; cradle-to-grave is a later extension |
| Product category rules | PEP ecopassport PCR-ed4 / EN 50693 for cables (optional tag per product) | Cable buyers in EU ask for it; affects declared unit and stages |
| Allocation of plant energy | **Mass of approved production** in the period, override per product with a different key (machine hours, metered kWh, economic) | Production data already exists per product (`ProductionData`) |
| Recycled content | **Cut-off (recycled content) approach**: recycled input carries only collection + reprocessing burden | PACT default; makes MiRecAL visible |
| Reference period | 12 months, CY or FY (respects `year_type`) | Matches corporate inventory |
| GWP | IPCC AR6 GWP100 (PACT v3 requirement); show AR5 if a factor only exists in AR5, flagged | |
| Data quality | Primary data share (PACT `primaryDataShare`) + DQR 1–3 per input (technology, geography, time) | Both are required PACT fields |

## 3. How it fits the corporate inventory we already have
The key advantage over standalone PCF tools: **the plant's Scope 1 and Scope 2 are already measured and approved in ESG Lite.** A3 (manufacturing) is not typed in again; it is allocated from approved `Emission` rows of that site for the reference period, divided across products by the allocation key.

```
Approved Emission rows (site × period, Scope 1 + Scope 2)          ─┐
Approved ProductionData (site × product × period)  → allocation key ─┼→ A3 per declared unit
Bill of materials (per declared unit) × material factors            ─┼→ A1
Inbound legs (tonne.km) × transport factors (existing DEFRA rows)   ─┼→ A2
Packaging + process waste                                          ─┘→ A3
```
A **reconciliation check** shows how much of the plant's Scope 1+2 is covered by product footprints (Σ PCF × approved production ÷ plant total). Below 90% means a product is missing a footprint or the allocation key is off.

## 4. Where it lives in the new design
- Manager nav (F2) gains one top-level item: **Products** (between Reports and Targets). Opens C01.
- Superadmin: **Factors ▾** gains **Material factors** (C04). **Setup ▾ Products** (P25) stays as the product master and gains a "Declared unit" field.
- Contributors (User role) do not see Products; they keep entering plant data as today, which feeds A3.
- Overview (P06) gets one optional KPI cell "Products footprinted: 4 of 6" and an attention item "PCF out of date: new approved data since last calculation".
- Theme: everything uses F1 tokens. Stage colours use `--t-series-1…5` in fixed order (A1 materials, A2 transport, A3 energy, A3 packaging, A3 waste). The PDF declaration (C05) uses the client cover gradient like the GHG report (P10).

## 5. Module list (team assignment units)
| ID | Module | Repo | Depends on | Size |
|---|---|---|---|---|
| E1 | Data model + calculation engine + API | ESG-lite | — | L |
| E2 | AI assist: BOM import, material→factor matching, supplier declaration reading | python_AI_service | E1 schemas | M |
| C04 | Material factors library | FE + ESG-lite | E1, F1–F3 | M |
| C01 | Product footprints (portfolio list) | FE | E1, F1–F3 | S |
| C02 | Footprint builder (stepper) | FE | E1, C04, F3 `Stepper` | L |
| C03 | Footprint result (detail, hotspots, versions) | FE | E1, F3 `ChartFrame` | M |
| C05 | Declaration export (PDF + PACT JSON + CSV) | FE (+ ESG-lite for JSON) | C03, P10 pdf theme | M |
| C06 | Supplier data requests | FE + ESG-lite + email | E1, C02 | M (phase 2) |

## 6. Phases
| Phase | Scope | Exit check |
|---|---|---|
| **0 · Method sign-off** | Confirm defaults in §2, pick pilot product(s), collect Midal BOM + one year of approved plant data | Signed method note, pilot BOM in a sheet |
| **1 · MVP (pilot)** | E1, C04 (manual + Excel import), C01, C02, C03, C05 PDF + CSV | Pilot rod footprint reproduced by hand in a spreadsheet within ±0.5% |
| **2 · Exchange** | C05 PACT JSON, E2 BOM import + factor matching, versioning compare | PACT JSON validates against the v3 schema; one buyer import test |
| **3 · Supply chain** | C06 supplier requests, primary supplier PCFs replace secondary factors, primary data share KPI | ≥1 supplier PCF received and used |
| **4 · Extensions** | Cradle-to-grave (A4 distribution, use, end of life reusing Use of Sold Products cat. 11 logic), product variants/families, PACT API endpoint (host our own `/2/footprints`) | — |

Phase 1 only needs F1–F3 from the redesign; it can start as soon as the shell exists.

## 7. Decisions open for the product owner
1. ~~Pilot products~~ **Decided 2026-10-09: Midal EC-grade aluminium wire rod 9.5 mm (Bahrain), declared unit 1 kg.** AAAC conductor follows, using the rod footprint as its input.
2. Secondary database: free sources (IAI, DEFRA, EU EF 3.1 where licence allows, supplier EPDs) vs a paid **ecoinvent** licence. The engine supports both; licence terms restrict showing ecoinvent values to clients, so C04 must hide raw values for licensed sources.
3. Whether PCF is a paid add-on per client (affects a `Company.pcfEnabled` flag).
4. Third-party verification: plan for it in phase 2 (verifier read-only role), or later.

## 8. Relation to CBAM
For aluminium exported to the EU, CBAM asks for "specific embedded emissions" of the goods, a close cousin of a cradle-to-gate PCF with different rules (direct + indirect only, precursor rules, default values). Keep it separate: the E1 engine can expose the same inputs to a future CBAM export, but the PCF result must not be reused as a CBAM figure.

## Files in this folder
- `foundation/E1-data-and-engine/CLAUDE.md`
- `foundation/E2-ai-assist/CLAUDE.md`
- `pages/C01-product-footprints/CLAUDE.md` … `pages/C06-supplier-requests/CLAUDE.md`
- Screen previews: see the "Product Footprints" artifact linked from the project thread.
