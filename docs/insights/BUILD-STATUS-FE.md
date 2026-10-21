# Insights frontend: build status

Written 2026-10-21. Branch `in/local` in ESG-lite_FE, built on `origin/production` `9009375`. No pull requests have been opened, and `production` has not been changed.

All frontend modules, IN-1 to IN-10, are merged into `in/local`. They were built and tested against the MSW mocks (`src/test/msw/insights.ts`) and the Playwright in-memory API (`e2e/insightsMockApi.ts`). They have not yet been run against the real backend, which a separate session is building.

## Branches (all pushed)

| Branch | Head | What it holds |
|---|---|---|
| `in/local` | see `git log` | IN-0 and every module below merged, plus `origin/production` |
| `in-1-hero` | `be89d74` | IN-1 hero strip and pending banner, plus the shared FE kit (on `in/local` just before it) |
| `in-2-story-panels` | `ce0ef8d` | IN-2 ESG ring, decoupling, target wall |
| `in-3-insight-cards` | `12ceb18` | IN-3 card copy, insight cards, rule-sentence slot |
| `in-4-pathway-completeness` | `a1bfb40` | IN-4 pathway, events drawer, completeness calendar |
| `in-5-bridge` | `2e1f746` | IN-5 bridge waterfall and "How this is calculated" drawer |
| `in-5-toggle` | `dc1dc50` | IN-5 Pathway ⇄ What moved toggle with the morph; IN-3 sentences and IN-4 events wired into the story panels |
| `in-6-flow` | `2d2a423` | IN-6 data-flow Sankey |
| `in-7-materiality` | `1679688` | IN-7 materiality matrix; the KPI setup scores block also shows when Insights is on |
| `in-8-polish` | `fef523b` | IN-8 motion, stripes, present mode, print route, Export menu |
| `in-8-present-checks` | `c94e8be` | IN-8 Vitest and Playwright checks |
| `in-9-ai-wording` | `5ba33b0` | IN-9 pieces: token filling and guard, preference, `CardWording`, toggle, `?ai=1` mock |
| `in-9-integrate` | `38da1be` | IN-9 wired into the cards |
| `in-10-checks` | `7784347` | IN-10 main path, four packs × light/dark, widths; the fixes those checks found |

IN-2, IN-3, IN-4, IN-5, IN-6, IN-7 and IN-9 were built in parallel worktrees, each on its own branch from `in/local` after IN-1. They were merged into `in/local` one at a time, with checks after each merge. Order: IN-6, IN-3, IN-7, IN-4, IN-2, IN-5 (then its toggle), IN-8, IN-9 (then its integration), IN-10.

## Checks on `in/local` (last run)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint:new` | clean, 0 warnings (`src/services/insightsService.ts` also linted on its own: clean) |
| `npm test` (Vitest) | 252 files, 2,273 tests passed. Before this work: 219 files, 2,046 tests. |
| `npm run build` | built |
| Playwright, Insights specs (`e2e/in-*.spec.ts`, 12 files) | 52 passed. One run had a race on one assertion; it now polls. |
| Playwright, neighbours (`kpi-setup`, `shell`, `overview`, `smoke`, `clients`, `kpi-esg`, `theme-preview`, plus the Insights specs) | 106 passed |
| Playwright, full suite (`npx playwright test`, 494 tests) | 492 passed, 2 skipped (the repo's existing skips), 0 failed, 11.5 min |
| `npm run check:insights-contracts` | not runnable here: it reads `../ESG-lite/ci/insights-contracts.json`, and ESG-lite isn't checked out next to this repo. The snapshot test in Vitest (`contracts.test.ts`) passes. |

IN-0's checks were run first on the `in/local` it shipped (`3abea79`): typecheck, lint, 2,046 tests, the build and IN-0's Playwright spec (7/7) were all green. Nothing needed fixing.

## What each module built

**Shared kit** (on `in/local` before IN-1)
- `src/theme/chartTheme.ts` gains `status`, `heat`, `onHeat` and `ui` colours, all from tokens, so charts colour marks without hex.
- `ChartFrame` gains:
  - `ariaLabel`: a one-sentence `role="img"` label on the chart view;
  - a controlled `view` / `onViewChange`;
  - `onEvents` and `renderer`;
  - `ChartFrameDefaults` (taller charts in present mode, static SVG for print);
  - a `data-chart-export` mark on its PNG button.
- `src/lib/insights/labels.ts`: status, severity, driver, event and attention words; `changeText` ("down 19% on 2025").
- `components/kit.tsx`: StatusChip, PillarLetter, ChangeChip, Legend.
- `components/panelView.ts`: Enter on a panel header opens its table view (05-ux §5).
- `e2e/insightsMockApi.ts`, shared by every Insights spec.

**IN-1 · Hero strip and pending banner**
- Four cells, each linking to its page through `links`:
  - net tCO₂e with its change chip and pathway pill (On track / At risk / Off track / No target);
  - intensity per unit;
  - ESG readiness as a mini E/S/G tri-ring with letters (renewable share when KPI tracking is off);
  - "Needs you", which opens a menu of attention items.
- Count-up runs on first load only.
- `PendingBanner` shows "12 entries and 3 KPI values waiting for approval aren't in these figures. Review →".
- Layout: 4 across at 1280, 2 × 2 at 1024, stacked below.

**IN-2 · Story panels**
- `EsgRing`: sunburst with E/S/G letters, topic opacity by coverage, "⛁" on topics filled from data, the centre %, and a click on a pillar that sets the page `pillar`.
- `Decoupling`: three indexed lines with end labels from `headline`, a base-year marker and the combined-output note.
- `TargetWall`: bullet bars (track, progress in its status colour, ink tick for expected) in the server's order. Rows open `link`; the pillar letter sets the filter. A keyboard list sits under the canvas.

**IN-3 · Insight cards**
- `cardCopy.ts` has a template for each of the 11 rules, with a test that no number appears that isn't in `params`.
- `InsightCards` (up to 6): severity chip (icon + word), the sentence as the card's heading, Show (sets `?panel=` → scroll and pulse) and Open (`link`).
- `RuleSentence` fills the panel sentence slots: `decoupling` above Decoupling; `pathway_gap` / `pathway_on_track` above Pathway.

**IN-4 · Pathway, completeness and events**
- `Pathway`: stacked S1/S2/S3 bars, dashed pathway, renewable-share line on a right 0–100 % axis, gap band, target pin and event lines.
- `EventsDrawer`: list, add, edit and delete, with a 60-character counter, server `IN_EVENT_INVALID` shown in the form, and delete confirmed inside the drawer.
- `Completeness`: sites × months heatmap on the heat ramp with the % in each cell. Future months are blank, not 0. A cell opens a drawer with the server's counts and a link.

**IN-5 · Bridge**
- Waterfall: from/to totals in brand, increases in the bad colour, decreases in the good colour, signed labels and plain driver words. `CalcDrawer` shows the LMDI formula in words, each driver's inputs and the notes.
- `PathwayStory` draws Pathway and What moved in **one** chart, so the bars morph (`universalTransition`; shared `year:<n>` group ids).
- `?panel=bridge` opens on What moved. The bridge loads only when asked for.

**IN-6 · Data flow**
- Sankey over 4 columns:
  - tCO₂e links in a gradient;
  - count links muted, with fit shown by opacity and in words;
  - a legend that explains both.
- Adjacency focus on hover. A click goes to `links[nodeId]`, or `/kpi/reports/<framework>` for a disclosure.
- Below 640 px the panel opens on its table, with "Show diagram".

**IN-7 · Materiality**
- Scatter of impact × financial (0–10) with bubble size by weight. Each status has its own series, colour and symbol, and the label reads "Climate · at risk".
- The "Act here" corner is shaded. Topic links under the chart give keyboard access.
- Without scores: a topic list with status chips and "Add scores" (Admin and Superadmin only).
- The KPI setup scores block now also shows when Insights is on.

**IN-8 · Polish, present mode and export**
- `motion.ts` is real now:
  - entrance: 700 ms cubicOut, 80 ms stagger;
  - count-up: 600 ms;
  - morph: `universalTransition`;
  - a 2 s pulse and a 0.6→1 fade, both through the Web Animations API (no CSS keyframes).
  - Everything is static under `prefers-reduced-motion` (Playwright checks there are no running animations).
- `Stripes`: one cell per month on the heat ramp, hover and arrow-key readout, an aria-label sentence, hidden below 12 months.
- `/insights/present`:
  - 6 slides, with the hero and stripes on the brand cover;
  - ←/→ and buttons, a slide counter, Esc back with the same filters, focus trapped;
  - KPI off: slide 3 becomes "By scope and site".
- `/insights/print`: the page with no chrome, static SVG charts, the top 3 cards and the footer "Generated {date} from approved data". The backend printer renders it into the PDF.
- Export ▾ offers "PDF snapshot" (`GET /insights/snapshot.pdf`) and "PNG of each chart" (each ChartFrame's own export).

**IN-9 · AI wording**
- `aiText.ts`: fills `{{v:key}}` tokens and re-checks the AI text (≤ 180 characters, every required token, no unknown tokens, no digits outside tokens); anything else falls back to the rule text.
- The "Natural wording" toggle is remembered per user in localStorage. When on, cards come from `?ai=1`.
- AI cards show the AI chip and "Show original".

**IN-10 · Checks** (FE part; goldens, workflow and probes are backend)
- `e2e/in-10-main-path.spec.ts`:
  - the main path (hero → ring filter → What moved → card Show → present → PDF) at 1280 in PlanetPulse light and at 390 in Midal Night dark;
  - every panel in PlanetPulse, Midal Classic, Midal Light and Midal Night, each in light and dark, with no console errors;
  - the story layout (8/4 at 1280, 6/6 at 1024, one column at 768 and 390) with no sideways scroll;
  - KPI off.

## Deviations and decisions to review

1. **The hero doesn't use `KpiStrip`.** `KpiStrip` computes the delta from `previous`, which is FE arithmetic. The hero has its own cells in the same style and shows the server's `change_pct` and `good`.
2. **`Summary.renewable_share_pct?: number | null`** is added as an optional field: an FE-proposed IN-0 follow-up, as the IN-1 spec allows. The KPI-off hero cell needs it, and the backend should send it. Without it, the cell says what data is needed.
3. **The stripes sentence** gives the first and last month's tonnes, not "falling 24%". The contract has no change figure for the band, and the FE doesn't compute one.
4. **KPI-off Story 2 "By scope and site"** (05-ux §3) had no module. IN-10 built it as a treemap of the flow panel's site → scope links, which is the same request as the Data flow tab, so no contract change was needed.
5. **The layout** follows 05-ux §3 exactly (6/6 at 1024, one column at 768). IN-0's grid went 2-up from 768.
6. **Ring labels** are ink with a panel-coloured outline, not white. No token guarantees white is readable on all four packs' pillar colours.
7. **Count links in the Sankey** are drawn at a visible width derived from the widest tonnes link. The server's `value: 1` would be invisible next to thousands of tonnes. Tooltips and the table show the true count. The backend could send a drawing weight instead.
8. **Sankey fit** is shown by opacity plus words, because ECharts Sankey links can't be dashed.
9. **Event-mark labels** sit above the plot, one per year and shortened ("Rooftop solar a… +1"), and are hidden on phones. The tooltip and table have the full names.
10. **A ring click e2e** emulates reduced motion so the canvas slice is drawn before it is clicked.
11. **Edit and delete on events** show for everyone, because `EventRef` has no `created_by`. The server's refusal is shown if it refuses.

## For the backend session (please check)

1. **Send `renewable_share_pct`** in `/insights/summary` (deviation 2).
2. **Unblock the IN-7 materiality scores block.** It reads and saves through `GET`/`PUT /studio/materiality` (DS-2). If that route is gated on Design Studio, a company with Insights on and Design Studio off gets a refused read and the block renders nothing. Two ways to fix it:
   - let `/studio/materiality` through when `insights_enabled` is on; or
   - add `GET /kpi/setup/materiality-scores` next to the `PUT` in 01-contracts §4, and the FE switches to it.
3. **Flow `links` keys:** the FE looks for a node id (`site:11`), then `source->target` for a link.
4. **`/insights/snapshot.pdf`:** the FE print route is `/insights/print?<same query>` (route id `insights-print`, behind the switch, Manager/Admin/Superadmin). The FE asks with a 70 s client timeout and shows `IN_SNAPSHOT_TIMEOUT` in words.
5. **`/insights/cards?ai=1`:** the FE re-checks AI text with the same rules as the server guard and falls back to rule text per card.

## Not done or not verifiable here

- Nothing has been run against the real backend. The FE matches `01-contracts.md` and the MSW fixture.
- The IN-8 "PDF has one page" check: on mocks the PDF is a placeholder. It needs the backend printer.
- The IN-7 path "set scores in setup → bubbles appear" depends on backend item 2.
- The approved mockup artifact (claude.ai) couldn't be opened from this session, so `05-ux.md` was the spec. I checked screenshots of every panel in PlanetPulse light and Midal Night dark, and of the page at 390 px.
- The IN-10 goldens, workflow test and probes are backend work (ESG-lite `ci/golden/in`, `ci/workflow`, `audit/harness`).

## Full e2e run

`npx playwright test` on `in/local` after the last merge: 492 passed, 2 skipped, 0 failed (11.5 min).

## Follow-ups after the merge (2026-10-21, branch `claude/project-thread-r40yj9`)

With ESG-lite's follow-up PR (`GET /kpi/setup/materiality-scores`, 503 `IN_SNAPSHOT_UNAVAILABLE`):

- **Contract mirror:** `Summary.readiness.by_pillar` is `Record<Pillar, number | null>`, so a pillar with nothing counted shows "–" and its sentence says "not counted yet". `Summary.renewable_share_pct` is now required (`number | null`), and the backend sends it whether KPI tracking is on or off. `Flow.nodes[].kind` adds `"category"`, which is labelled "Category" and coloured like KPI nodes. The `IN_SNAPSHOT_UNAVAILABLE: 503` code has been added, and `contracts.snapshot.json` matches the backend.
- **KPI setup scores block:** it now reads and saves through `GET`/`PUT /kpi/setup/materiality-scores`, which only needs KPI tracking, so it works with Insights on and Design Studio off. It sends only material topics.
- **PDF snapshot:** the error body arrives as a blob and is now read as JSON. A 503 says "PDF snapshots aren't set up on this server yet. Use Print view…". Export ▾ gains **Print view**, which opens `/insights/print?<filters>` in a new tab. That page has a Print button, and a print stylesheet prints only the view at its full height, with no buttons. The server's PDF is still built from its own HTML.
- **Against the real backend** (ESG-lite `ci/fixtures/in-company`, Manager 902, CY 2025, KPI off and then on): every `/insights/*` call returned 200, with no console errors and no panel in an error state. The scores block saved with Design Studio off (checked in the database). The PDF returned 503, the toast appeared and Print view opened. The KPI flow can show a KPI with no approved figure as its own small group, as designed (no tonnes link).
- **Checks:** typecheck and `lint:new` are clean. Vitest: 265 files, 2,351 tests. Playwright: the `in-*`, `kpi-setup` and `smoke` specs, including the new "Print view" fallback test.
