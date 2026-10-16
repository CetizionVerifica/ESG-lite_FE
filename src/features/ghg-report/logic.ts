import { BOUNDARY_STATUS_LABEL, CONSOLIDATION_LABEL, isConsolidationApproach } from "../../lib/scope3/boundary";
import {
  NOT_RECORDED,
  NOT_TRACKED,
  RF_LABEL,
  SCOPE3_TOTAL_NOTE,
  type Scope3Report,
  datasetText,
  gwpText,
  hasScope3,
  methodMixText,
  rowLabel,
} from "../../lib/scope3/report";
import type {
  GhgDetailsRow,
  GhgReportTablesRequest,
  GhgReportTablesResponse,
  OverviewRow,
} from "../../services/ghgreportService";
import {
  DEFAULT_FY_START_MONTH,
  type ReportPeriod,
  reportPeriodLabel,
  reportYearLabel,
} from "../../ui";

// Sites, categories and the period in the URL are shared with P11 (EDE report).
export {
  type SiteOption,
  PERIOD_KEYS,
  categoryOptions,
  clientSites,
  firstReportingMonth,
  readPeriod,
  switchCalendar,
  withFrequency,
  withoutKeys,
  writePeriod,
  yearOptions,
} from "../../ui";

// ─── Request ────────────────────────────────────────────────────────────────

export type ReportQuery = {
  siteIds: number[];
  categoryIds: number[];
  period: ReportPeriod;
};

/** Body for POST /user/ghg/tables and /details. */
export function requestPayload(q: ReportQuery): GhgReportTablesRequest {
  const { period: p } = q;
  return {
    siteIds: q.siteIds,
    yearType: p.yearType,
    year: p.year,
    frequency: p.frequency,
    ...(p.frequency === "monthly" && p.month ? { month: p.month } : {}),
    ...(p.frequency === "quarterly" && p.quarter ? { quarter: p.quarter } : {}),
    ...(q.categoryIds.length ? { categoryIds: q.categoryIds } : {}),
  };
}

// ─── Figures (mirror the branded PDF's "Emissions at a glance") ─────────────

export const SCOPES = ["Scope 1", "Scope 2", "Scope 3"] as const;
export type ScopeName = (typeof SCOPES)[number];
const isCore = (scope: string): scope is ScopeName =>
  (SCOPES as readonly string[]).includes(scope);

// Same test as the backend report (src/reporting/ghg.ts).
const RENEW_RE = /renew|solar|wind|hydro|geotherm/i;

export type ScopeSplit = Record<ScopeName, number> & { total: number };

export interface ReportFigures {
  year: number;
  compareYear: number;
  selected: ScopeSplit;
  previous: ScopeSplit;
  /** % change of the total; null when last year had nothing. */
  yoy: number | null;
  /** Renewable tCO₂e this period from scope-less rows, outside the scope totals. */
  renewable: number;
  coverage: {
    percent: number;
    withData: number;
    selected: number;
    missing: string[];
  };
  largestSource: { name: string; value: number; share: number } | null;
  /** True when the selected period has no rows at all. */
  empty: boolean;
}

const split = (
  t:
    | { scope1: number; scope2: number; scope3: number; total: number }
    | undefined,
): ScopeSplit => ({
  "Scope 1": t?.scope1 ?? 0,
  "Scope 2": t?.scope2 ?? 0,
  "Scope 3": t?.scope3 ?? 0,
  total: t?.total ?? 0,
});

export const share = (part: number, whole: number) =>
  whole > 0 ? (part / whole) * 100 : 0;

/** Categories match whatever their case ("Natural Gas" = "natural gas"); the first spelling seen is shown. */
const catKey = (name: string) => name.trim().toLowerCase();

function categoryTotals(
  rows: OverviewRow[],
): Map<string, { name: string; total: number }> {
  const map = new Map<string, { name: string; total: number }>();
  for (const r of rows) {
    if (!isCore(r.scope)) continue;
    const c = map.get(catKey(r.category)) ?? { name: r.category, total: 0 };
    c.total += r.total;
    map.set(catKey(r.category), c);
  }
  return map;
}

/**
 * KPI figures for the page. `sites` are the sites asked for: coverage counts
 * how many of them have any Scope 1–3 row, as the PDF does.
 */
export function reportFigures(
  data: GhgReportTablesResponse,
  sites: { site_id: number; name: string }[],
): ReportFigures {
  const { year, compareYear } = data.filters;
  const selected = split(data.totals[String(year)]);
  const previous = split(data.totals[String(compareYear)]);
  const rows = data.tables.table_overviewByLocations_selectedYear.rows;

  const withData = new Set<number>();
  for (const r of rows)
    if (isCore(r.scope)) r.bySite.forEach((b) => withData.add(b.siteId));
  const missing = sites
    .filter((s) => !withData.has(s.site_id))
    .map((s) => s.name);
  const asked = sites.length || withData.size;

  const cats = [...categoryTotals(rows).values()].sort(
    (a, b) => b.total - a.total,
  );
  const top = cats[0];

  return {
    year,
    compareYear,
    selected,
    previous,
    yoy:
      previous.total > 0
        ? ((selected.total - previous.total) / previous.total) * 100
        : null,
    // Only scope-less rows: a renewable-sounding Scope 3 purchase is already in the totals.
    renewable: rows
      .filter((r) => !isCore(r.scope) && RENEW_RE.test(r.category))
      .reduce((a, r) => a + r.total, 0),
    coverage: {
      percent: asked
        ? Math.round((Math.min(withData.size, asked) / asked) * 100)
        : 100,
      withData: Math.min(withData.size, asked),
      selected: asked,
      missing,
    },
    largestSource: top
      ? {
          name: top.name,
          value: top.total,
          share: share(top.total, selected.total),
        }
      : null,
    empty: rows.length === 0 && selected.total === 0,
  };
}

// ─── Summary tab ────────────────────────────────────────────────────────────

/** Table 1: emissions by scope, both years, with each year's share of its total. */
export function scopeTable(f: ReportFigures) {
  return SCOPES.map((scope) => ({
    scope,
    previous: f.previous[scope],
    previousPct: share(f.previous[scope], f.previous.total),
    selected: f.selected[scope],
    selectedPct: share(f.selected[scope], f.selected.total),
    change: changePct(f.selected[scope], f.previous[scope]),
  }));
}

/** % change, null when there was nothing to compare with. */
export function changePct(now: number, before: number): number | null {
  return before > 0 ? ((now - before) / before) * 100 : null;
}

export type CategoryRow = {
  category: string;
  scope: string;
  previous: number;
  selected: number;
  change: number | null;
};

/** Scope 1–3 categories by this period's emissions, largest first. */
export function topCategories(
  data: GhgReportTablesResponse,
  limit = 10,
): CategoryRow[] {
  const key = (r: OverviewRow) => `${r.scope}||${catKey(r.category)}`;
  const map = new Map<string, CategoryRow>();
  const add = (rows: OverviewRow[], field: "previous" | "selected") => {
    for (const r of rows) {
      if (!isCore(r.scope)) continue;
      const row = map.get(key(r)) ?? {
        category: r.category,
        scope: r.scope,
        previous: 0,
        selected: 0,
        change: null,
      };
      row[field] += r.total;
      map.set(key(r), row);
    }
  };
  // This period first, so its spelling of a category is the one shown.
  add(data.tables.table_overviewByLocations_selectedYear.rows, "selected");
  add(data.tables.table_overviewByLocations_compareYear.rows, "previous");
  return [...map.values()]
    .map((r) => ({ ...r, change: changePct(r.selected, r.previous) }))
    .sort(
      (a, b) =>
        b.selected - a.selected ||
        b.previous - a.previous ||
        a.category.localeCompare(b.category),
    )
    .slice(0, limit);
}

// ─── By location tab ────────────────────────────────────────────────────────

export type LocationRow = {
  siteId: number;
  site: string;
  previous: ScopeSplit;
  selected: ScopeSplit;
};

const zero = (): ScopeSplit => ({
  "Scope 1": 0,
  "Scope 2": 0,
  "Scope 3": 0,
  total: 0,
});

/** Site × scope for both years. Sites asked for but without data still get a row of zeros. */
export function locationRows(
  data: GhgReportTablesResponse,
  sites: { site_id: number; name: string }[],
): LocationRow[] {
  const map = new Map<number, LocationRow>();
  for (const s of sites)
    map.set(s.site_id, {
      siteId: s.site_id,
      site: s.name,
      previous: zero(),
      selected: zero(),
    });
  const add = (rows: OverviewRow[], field: "previous" | "selected") => {
    for (const r of rows) {
      if (!isCore(r.scope)) continue;
      for (const b of r.bySite) {
        const row = map.get(b.siteId) ?? {
          siteId: b.siteId,
          site: b.siteName,
          previous: zero(),
          selected: zero(),
        };
        row[field][r.scope] += b.value;
        row[field].total += b.value;
        map.set(b.siteId, row);
      }
    }
  };
  add(data.tables.table_overviewByLocations_compareYear.rows, "previous");
  add(data.tables.table_overviewByLocations_selectedYear.rows, "selected");
  return [...map.values()].sort(
    (a, b) =>
      b.selected.total - a.selected.total || a.site.localeCompare(b.site),
  );
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** The server's message when it sent one, else `fallback`. */
/** The server's own message for a 4xx; a 5xx (or no message) gets `fallback`, so internals never reach the page. */
export function serverMessage(e: unknown, fallback: string): string {
  const res = (
    e as { response?: { status?: number; data?: { message?: unknown } } }
  )?.response;
  if (res?.status !== undefined && res.status >= 500) return fallback;
  const msg = res?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** A blob request's error body is JSON inside a Blob; read it so serverMessage can show it. */
export async function readBlobError(e: unknown): Promise<unknown> {
  const res = (e as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (!res || !(res.data instanceof Blob)) return e;
  try {
    const body = JSON.parse(await res.data.text()) as {
      message?: string;
      error?: string;
    };
    return {
      response: {
        status: res.status,
        data: { message: body.message ?? body.error },
      },
    };
  } catch {
    return { response: { status: res.status, data: {} } };
  }
}

// ─── Labels ─────────────────────────────────────────────────────────────────

/** Column-sized label: "CY 2025", "June 2024", "Q2 FY 2024-25". */
export function shortPeriodLabel(
  p: ReportPeriod,
  fyStartMonth = DEFAULT_FY_START_MONTH,
): string {
  if (p.frequency === "quarterly" && p.quarter)
    return `Q${p.quarter} ${reportYearLabel(p.yearType, p.year, fyStartMonth)}`;
  return reportPeriodLabel(p, fyStartMonth);
}

// ─── Scope tabs (details) ───────────────────────────────────────────────────

export type DetailRow = GhgDetailsRow & { key: string };

/** One scope's detail rows (category × site × fuel), largest this period first. */
export function scopeDetails(
  rows: GhgDetailsRow[],
  scope: ScopeName,
): DetailRow[] {
  return rows
    .filter((r) => r.scope === scope)
    .map((r) => ({ ...r, key: `${r.categoryId}|${r.siteId}|${r.fuelType}` }))
    .sort(
      (a, b) =>
        b.selected.emissions - a.selected.emissions ||
        b.compare.emissions - a.compare.emissions ||
        a.categoryName.localeCompare(b.categoryName),
    );
}

export type Distribution = {
  category: string;
  previous: number;
  selected: number;
  previousPct: number;
  selectedPct: number;
};

/** Each category's share of the scope, both periods. */
export function scopeDistribution(
  rows: GhgDetailsRow[],
  scope: ScopeName,
): Distribution[] {
  // Case-insensitive like categoryTotals; this period's spelling wins.
  const map = new Map<
    string,
    { category: string; named: boolean; previous: number; selected: number }
  >();
  for (const r of rows) {
    if (r.scope !== scope) continue;
    const key = catKey(r.categoryName);
    const d = map.get(key) ?? {
      category: r.categoryName,
      named: false,
      previous: 0,
      selected: 0,
    };
    if (!d.named && r.selected.emissions > 0)
      Object.assign(d, { category: r.categoryName, named: true });
    d.previous += r.compare.emissions;
    d.selected += r.selected.emissions;
    map.set(key, d);
  }
  const prevTotal = [...map.values()].reduce((a, d) => a + d.previous, 0);
  const selTotal = [...map.values()].reduce((a, d) => a + d.selected, 0);
  return [...map.values()]
    .map(({ category, previous, selected }) => ({
      category,
      previous,
      selected,
      previousPct: share(previous, prevTotal),
      selectedPct: share(selected, selTotal),
    }))
    .sort((a, b) => b.selected - a.selected || b.previous - a.previous);
}

// ─── Findings (same rules as the branded PDF, backend src/reporting/ghg.ts) ─

const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const fmt1 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const pctText = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";

const SCOPE_WHAT = {
  "Scope 1": "Scope 1 (direct)",
  "Scope 2": "Scope 2 (purchased energy)",
  "Scope 3": "Scope 3 (value chain)",
} as const;

/**
 * The scope with the largest total, as the PDF picks it from all three
 * (S3-4). Ties keep the old order: Scope 2 over Scope 1, and Scope 3 only
 * when it is strictly the largest.
 */
export function dominantScope(f: ReportFigures): { scope: keyof typeof SCOPE_WHAT; value: number } {
  const s1 = f.selected["Scope 1"];
  const s2 = f.selected["Scope 2"];
  const s3 = f.selected["Scope 3"];
  if (s3 > s1 && s3 > s2) return { scope: "Scope 3", value: s3 };
  return s2 >= s1 ? { scope: "Scope 2", value: s2 } : { scope: "Scope 1", value: s1 };
}

export function findings(
  f: ReportFigures,
  locations: LocationRow[],
  selLabel: string,
  prevLabel: string,
): string[] {
  const total = f.selected.total;
  const dominant = dominantScope(f);
  const topSite = locations
    .filter((l) => l.selected.total > 0)
    .sort((a, b) => b.selected.total - a.selected.total)[0];
  const top = f.largestSource;
  return [
    `Total ${selLabel} emissions were ${fmt1(total)} tCO₂e${f.yoy !== null ? ` (${f.yoy >= 0 ? "up" : "down"} ${Math.abs(f.yoy).toFixed(1)}% vs ${prevLabel})` : ""}.`,
    topSite
      ? `${topSite.site} is the largest contributing site at ${fmt0(topSite.selected.total)} tCO₂e (${pctText(topSite.selected.total, total)} of total).`
      : "",
    `${SCOPE_WHAT[dominant.scope]} dominates the footprint at ${pctText(dominant.value, total)}, indicating the highest-leverage reduction pathway.`,
    top
      ? `${top.name} is the single largest emission source (${pctText(top.value, total)}).`
      : "",
  ].filter(Boolean);
}

/**
 * The PDF's default recommended actions, minus the ones the data already
 * meets (full coverage, renewables recorded).
 */
export function recommendedActions(f: ReportFigures): string[] {
  return [
    f.coverage.missing.length > 0
      ? "Close data gaps at non-reporting sites to reach full coverage before the next cycle."
      : "",
    "Prioritise Scope 2 reduction through renewable electricity procurement or on-site generation.",
    "Set a validated, science-based reduction target aligned to a 1.5 °C pathway.",
    f.renewable > 0
      ? ""
      : "Begin capturing renewable-energy consumption to quantify avoided emissions.",
  ].filter(Boolean);
}

// ─── Downloads ──────────────────────────────────────────────────────────────

/**
 * Query for GET /reports/ghg. The token goes in the Authorization header
 * (the api client adds it), never in the URL.
 */
export function pdfParams(q: ReportQuery): Record<string, string> {
  const b = requestPayload(q);
  return {
    siteIds: b.siteIds.join(","),
    ...(b.categoryIds ? { categoryIds: b.categoryIds.join(",") } : {}),
    yearType: b.yearType,
    year: String(b.year),
    frequency: b.frequency ?? "yearly",
    ...(b.month ? { month: String(b.month) } : {}),
    ...(b.quarter ? { quarter: String(b.quarter) } : {}),
    download: "1",
  };
}

/** Query for GET /reports/ghg/scope3 (S3-13): the PDF's filters, as JSON. */
export function scope3Params(q: ReportQuery): Record<string, string> {
  const params = pdfParams(q);
  delete params.download;
  return params;
}

/** "ghg-report-q2-fy-2024-25" from a period label. */
export function fileStem(label: string): string {
  return `ghg-report-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

type Cell = string | number;

/** Rounds tCO₂e, consumption and percentages for the sheet (3 dp). */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The on-screen tables as XLSX sheets, both periods side by side. */
export function exportSheets(args: {
  figures: ReportFigures;
  categories: CategoryRow[];
  locations: LocationRow[];
  details: GhgDetailsRow[] | null;
  findings: string[];
  actions: string[];
  prevLabel: string;
  selLabel: string;
  /** S3-13: adds "Scope 3 by category" and "Scope 3 methodology". */
  scope3?: Scope3Report | null;
}): { name: string; rows: Cell[][] }[] {
  const {
    figures: f,
    categories,
    locations,
    details,
    prevLabel: p,
    selLabel: s,
  } = args;
  const sheets: { name: string; rows: Cell[][] }[] = [
    {
      name: "Table 1 by scope",
      rows: [
        ["Scope", `${p} tCO2e`, `${p} %`, `${s} tCO2e`, `${s} %`],
        ...scopeTable(f).map((r) => [
          r.scope,
          r3(r.previous),
          r3(r.previousPct),
          r3(r.selected),
          r3(r.selectedPct),
        ]),
        [
          "Total",
          r3(f.previous.total),
          f.previous.total > 0 ? 100 : 0,
          r3(f.selected.total),
          f.selected.total > 0 ? 100 : 0,
        ],
        ["Saved from renewables (not in totals)", "", "", r3(f.renewable), ""],
      ],
    },
    {
      name: "Categories",
      rows: [
        ["Category", "Scope", `${p} tCO2e`, `${s} tCO2e`],
        ...categories.map((r) => [
          r.category,
          r.scope,
          r3(r.previous),
          r3(r.selected),
        ]),
      ],
    },
    {
      name: "By location",
      rows: [
        [
          "Site",
          ...SCOPES.flatMap((sc) => [`${sc} ${p}`, `${sc} ${s}`]),
          `Total ${p}`,
          `Total ${s}`,
        ],
        ...locations.map((r) => [
          r.site,
          ...SCOPES.flatMap((sc) => [r3(r.previous[sc]), r3(r.selected[sc])]),
          r3(r.previous.total),
          r3(r.selected.total),
        ]),
      ],
    },
  ];
  if (details)
    for (const sc of SCOPES)
      sheets.push({
        name: sc,
        rows: [
          [
            "Category",
            "Location",
            "Emission category",
            `${p} consumption`,
            `${p} unit`,
            `${p} tCO2e`,
            `${s} consumption`,
            `${s} unit`,
            `${s} tCO2e`,
          ],
          ...scopeDetails(details, sc).map((r) => [
            r.categoryName,
            r.siteName,
            r.fuelType || "—",
            r3(r.compare.consumption),
            r.compare.unit || r.selected.unit || "—",
            r3(r.compare.emissions),
            r3(r.selected.consumption),
            r.selected.unit || r.compare.unit || "—",
            r3(r.selected.emissions),
          ]),
        ],
      });
  if (args.scope3 && hasScope3(args.scope3)) sheets.push(...scope3Sheets(args.scope3));
  sheets.push({
    name: "Findings",
    rows: [
      ["Key findings"],
      ...args.findings.map((x) => [x]),
      [],
      ["Recommended actions"],
      ...args.actions.map((x) => [x]),
    ],
  });
  return sheets;
}

/** The Scope 3 sheets (S3-13): one row per GHG category plus Unmapped, then the methodology. */
export function scope3Sheets(r: Scope3Report): { name: string; rows: Cell[][] }[] {
  const shown = r.rows.filter((x) => x.n !== null || x.tco2e > 0 || x.mapped_categories.length > 0);
  const t = r.tracked;
  const approach = isConsolidationApproach(r.consolidation_approach)
    ? CONSOLIDATION_LABEL[r.consolidation_approach]
    : CONSOLIDATION_LABEL.operational_control;
  return [
    {
      name: "Scope 3 by category",
      rows: [
        [
          "Category",
          "Status",
          "Reason",
          "tCO2e",
          "Share %",
          "Method mix",
          "Value-chain data %",
          "Primary data %",
          "Data quality (1 good - 3 poor)",
          "Biogenic CO2 tCO2e",
          "Included activities",
        ],
        ...shown.map((x) => [
          rowLabel(x),
          x.status ? BOUNDARY_STATUS_LABEL[x.status] : "Needs a category",
          x.reason ?? "",
          r3(x.tco2e),
          r3(x.share_pct),
          t.method ? methodMixText(x) : NOT_RECORDED,
          t.method ? r3(x.value_chain_pct) : NOT_RECORDED,
          t.data_type ? r3(x.primary_pct) : NOT_RECORDED,
          x.dq.overall ?? (t.dq ? "Not scored" : NOT_RECORDED),
          x.biogenic_tco2e ?? NOT_TRACKED,
          x.mapped_categories.map((m) => m.name).join(", "),
        ]),
        ["Total Scope 3", "", "", r3(r.total_tco2e), r.total_tco2e > 0 ? 100 : 0, "", "", "", "", "", ""],
        [],
        [SCOPE3_TOTAL_NOTE],
      ],
    },
    {
      name: "Scope 3 methodology",
      rows: [
        ["Organisational boundary", `${approach} approach`],
        ["GWP values", gwpText(r.gwp_sets) ? `IPCC ${gwpText(r.gwp_sets)}, 100-year` : "Not recorded on the factors used"],
        ["Biogenic CO2 and gases", t.biogenic ? "Reported separately per category" : NOT_TRACKED],
        ["Base year", "No Scope 3 base year set"],
        [],
        ["Category", "Methods", "Data and factors", "Proxy data %", "Proxy basis", "Radiative forcing", "EEIO boundary", "GWP", "Allocation and assumptions"],
        ...r.rows
          .filter((x) => x.tco2e > 0 || !!x.method_note)
          .map((x) => [
            rowLabel(x),
            t.method ? methodMixText(x) : NOT_RECORDED,
            datasetText(x),
            r3(x.proxy_pct),
            (x.proxy_basis ?? []).join("; "),
            x.rf ? RF_LABEL[x.rf] : "",
            x.n === 15 && x.tco2e > 0 ? NOT_RECORDED : "",
            x.gwp_sets.join(", ") || NOT_RECORDED,
            x.method_note ?? "",
          ]),
      ],
    },
  ];
}
