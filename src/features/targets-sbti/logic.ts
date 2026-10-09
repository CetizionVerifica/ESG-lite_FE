import type { LongTermChartResponse, NearTermTargetResponse } from "../../services/sbtiService";

/**
 * P12 Targets (SBTi): URL setup, one model for near-term and net-zero
 * responses, the rules check and export tables. Pure, so it's unit tested.
 */

export type TargetKind = "near" | "netzero";
export type Horizon = 5 | 10;
export type Pathway = "15c" | "wb2c";
export type TabId = "pathway" | "scopes" | "actual";

/** SBTi: base year can't be earlier than 2015. */
export const MIN_BASE_YEAR = 2015;
export const NET_ZERO_YEAR = 2050;
export const MILESTONES = [2030, 2035, 2040, 2045, 2050];
/** Scope 3 at or above this share of base emissions needs its own target (backend rule). */
export const SCOPE3_THRESHOLD_PCT = 40;

export const PATHWAYS: Record<Pathway, { label: string; short: string; rate: number }> = {
  "15c": { label: "1.5°C", short: "1.5°C", rate: 0.042 },
  wb2c: { label: "Well-below 2°C", short: "WB2°C", rate: 0.025 },
};

export const URL_KEYS = { base: "base", target: "target", horizon: "horizon", pathway: "pathway", tab: "tab" } as const;

export type Setup = { baseYear: number; kind: TargetKind; horizon: Horizon; pathway: Pathway; tab: TabId };

/** Base years offered: 2015 up to this year, newest first. */
export function baseYearOptions(now: Date): number[] {
  const out: number[] = [];
  for (let y = now.getFullYear(); y >= MIN_BASE_YEAR; y--) out.push(y);
  return out;
}

export function defaultBaseYear(now: Date): number {
  return Math.max(MIN_BASE_YEAR, now.getFullYear() - 1);
}

/** Reads the setup from the URL; anything missing or out of range falls back to the defaults. */
export function readSetup(params: URLSearchParams, now: Date): Setup {
  const base = Number(params.get(URL_KEYS.base));
  const validBase = Number.isInteger(base) && base >= MIN_BASE_YEAR && base <= now.getFullYear();
  const horizon = Number(params.get(URL_KEYS.horizon));
  const pathway = params.get(URL_KEYS.pathway);
  const tab = params.get(URL_KEYS.tab);
  return {
    baseYear: validBase ? base : defaultBaseYear(now),
    kind: params.get(URL_KEYS.target) === "netzero" ? "netzero" : "near",
    horizon: horizon === 5 ? 5 : 10,
    pathway: pathway === "wb2c" ? "wb2c" : "15c",
    tab: tab === "scopes" || tab === "actual" ? tab : "pathway",
  };
}

export function writeSetup(params: URLSearchParams, patch: Partial<Setup>): URLSearchParams {
  const next = new URLSearchParams(params);
  if (patch.baseYear !== undefined) next.set(URL_KEYS.base, String(patch.baseYear));
  if (patch.kind !== undefined) next.set(URL_KEYS.target, patch.kind);
  if (patch.horizon !== undefined) next.set(URL_KEYS.horizon, String(patch.horizon));
  if (patch.pathway !== undefined) next.set(URL_KEYS.pathway, patch.pathway);
  if (patch.tab !== undefined) next.set(URL_KEYS.tab, patch.tab);
  return next;
}

export function targetYearOf(setup: Pick<Setup, "baseYear" | "kind" | "horizon">): number {
  return setup.kind === "netzero" ? NET_ZERO_YEAR : setup.baseYear + setup.horizon;
}

export type ActualStatus = "base" | "reached" | "not-reached" | "no-data";

export type PathwayRow = { year: number; n: number; target: number; reducedBy: number | null; reducedByPct: number | null; totalReductionPct: number | null };
export type ScopeRow = PathwayRow & { s1: number; s2: number; s3: number | null };
export type ActualRow = {
  year: number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  actual: number | null;
  target: number;
  variance: number | null;
  variancePct: number | null;
  status: ActualStatus;
};

export type TargetModel = {
  kind: TargetKind;
  baseYear: number;
  targetYear: number;
  /** Compounding annual reduction, in percent (4.2 = 4.2%/yr). */
  annualRatePct: number;
  baseTotals: { scope1: number; scope2: number; scope3: number; total: number };
  /** Base-year emissions inside the target boundary (S1+S2, plus S3 when required). */
  boundaryBase: number;
  targetEmissions: number;
  scope3SharePct: number;
  scope3Required: boolean;
  /** Scope 1+2 as a share of all base-year emissions (backend `scope1And2CoveragePct`). */
  scope12SharePct: number;
  pathway: PathwayRow[];
  scopes: ScopeRow[];
  actual: ActualRow[];
};

const STATUS: Record<string, ActualStatus> = { "Base Year": "base", Reached: "reached", "Not Reached": "not-reached", "No Data": "no-data" };

const round = (v: number, d = 3) => Number(v.toFixed(d));

/**
 * Total reduction against the base boundary. The old page divided by all
 * scopes even when Scope 3 was left out, which overstated the cut.
 */
function vsBase(base: number, value: number, n: number): number | null {
  return n > 0 && base > 0 ? round(((base - value) / base) * 100, 2) : null;
}

function share12(t: TargetModel["baseTotals"]): number {
  return t.total > 0 ? round(((t.scope1 + t.scope2) / t.total) * 100, 2) : 0;
}

export function fromNearTerm(r: NearTermTargetResponse): TargetModel {
  const base = r.targetBoundaryBase;
  const { table1, table2, table3 } = r.tables;
  const last = table1[table1.length - 1];
  return {
    kind: "near",
    baseYear: r.baseYear,
    targetYear: r.targetYear,
    annualRatePct: round(r.annualRate * 100, 2),
    baseTotals: r.baseTotals,
    boundaryBase: base,
    targetEmissions: last?.targetEmission ?? base,
    scope3SharePct: r.scope3Share,
    scope3Required: r.scope3TargetRequired,
    scope12SharePct: Number.isFinite(r.scope1And2CoveragePct) ? r.scope1And2CoveragePct : share12(r.baseTotals),
    pathway: table1.map((row) => ({
      year: row.year,
      n: row.n,
      target: row.targetEmission,
      reducedBy: row.reducedBy,
      reducedByPct: row.reducedByPct,
      totalReductionPct: vsBase(base, row.targetEmission, row.n),
    })),
    scopes: table2.map((row) => ({
      year: row.year,
      n: row.n,
      s1: row.scope1Target,
      s2: row.scope2Target,
      s3: row.scope3Target,
      target: row.totalTarget,
      reducedBy: row.reducedBy,
      reducedByPct: row.reducedByPct,
      totalReductionPct: vsBase(table2[0]?.totalTarget ?? base, row.totalTarget, row.n),
    })),
    actual: table3.map((row) => {
      const status = STATUS[row.status] ?? "no-data";
      const has = status !== "no-data";
      return {
        year: row.year,
        s1: has ? row.actualScope1 : null,
        s2: has ? row.actualScope2 : null,
        s3: has ? row.actualScope3 : null,
        actual: has ? row.actualTotal : null,
        target: row.targetTotal,
        variance: status === "reached" || status === "not-reached" ? row.variance : null,
        variancePct: status === "reached" || status === "not-reached" ? row.variancePct : null,
        status,
      };
    }),
  };
}

export function fromNetZero(r: LongTermChartResponse): TargetModel {
  const t = r.baseTotals;
  const base = r.scope3TargetRequired ? t.total : t.scope1 + t.scope2;
  return {
    kind: "netzero",
    baseYear: r.baseYear,
    targetYear: r.targetYear,
    // The net-zero endpoint already sends a percent (near-term sends a fraction).
    annualRatePct: round(r.annualRate, 2),
    baseTotals: t,
    boundaryBase: round(base),
    targetEmissions: r.targetEmissions,
    scope3SharePct: r.scope3Share,
    scope3Required: r.scope3TargetRequired,
    // The net-zero response has no coverage field; same formula as near-term.
    scope12SharePct: share12(t),
    pathway: r.rows.map((row) => ({
      year: row.year,
      n: row.n,
      target: row.targetEmission,
      reducedBy: row.reducedBy,
      reducedByPct: row.reducedByPct,
      totalReductionPct: vsBase(base, row.targetEmission, row.n),
    })),
    scopes: r.rows.map((row) => {
      const total = row.scope1Target + row.scope2Target + (row.scope3Target ?? 0);
      return {
        year: row.year,
        n: row.n,
        s1: row.scope1Target,
        s2: row.scope2Target,
        s3: row.scope3Target,
        target: round(total),
        reducedBy: row.reducedBy,
        reducedByPct: row.reducedByPct,
        totalReductionPct: vsBase(base, total, row.n),
      };
    }),
    actual: (r.actualVsTarget ?? []).map((row) => {
      const status = STATUS[row.status] ?? "no-data";
      const scored = status === "reached" || status === "not-reached";
      return {
        year: row.year,
        s1: status === "no-data" ? null : row.actualScope1,
        s2: status === "no-data" ? null : row.actualScope2,
        s3: status === "no-data" || !r.scope3TargetRequired ? null : row.actualScope3,
        actual: status === "no-data" ? null : row.actualTotal,
        target: row.targetTotal,
        variance: scored ? row.variance : null,
        variancePct: scored ? row.variancePct : null,
        status,
      };
    }),
  };
}

/** The latest year after the base year that has actuals to score. */
export function latestScored(rows: ActualRow[]): ActualRow | null {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].status === "reached" || rows[i].status === "not-reached") return rows[i];
  return null;
}

export function yearsLeft(targetYear: number, now: Date): number {
  return Math.max(0, targetYear - now.getFullYear());
}

/** Milestone years inside the pathway (net-zero shows them all; near-term only those it reaches). */
export function milestonesIn(model: Pick<TargetModel, "baseYear" | "targetYear">): number[] {
  return MILESTONES.filter((y) => y > model.baseYear && y <= model.targetYear);
}

export type RuleState = "ok" | "warn" | "info";
export type Rule = { id: string; state: RuleState; title: string; detail: string };

/**
 * The SBTi rules, evaluated against the current setup and the base-year
 * figures. Coverage: the pathway always takes all Scope 1+2 of the chosen
 * sites, so it is met when every managed site is in the target.
 */
export function rulesCheck(input: { model: TargetModel; pathway: Pathway; chosenSites: number; totalSites: number; currentYear?: number }): Rule[] {
  const { model: m, pathway, chosenSites, totalSites, currentYear } = input;
  const allSites = chosenSites >= totalSites;
  const rules: Rule[] = [
    {
      id: "base-year",
      state: m.baseYear >= MIN_BASE_YEAR ? "ok" : "warn",
      title: `Base year ${m.baseYear} is ${MIN_BASE_YEAR} or later`,
      detail: "SBTi doesn't accept base years before 2015.",
    },
    {
      id: "coverage",
      state: allSites ? "ok" : "warn",
      title: allSites ? "Covers all Scope 1+2 emissions" : `Covers Scope 1+2 of ${chosenSites} of ${totalSites} sites`,
      detail: allSites
        ? `Target must cover at least 95% of Scope 1+2. Scope 1+2 is ${formatPct(m.scope12SharePct)} of base-year emissions.`
        : "Target must cover at least 95% of company Scope 1+2. Add every site to be sure it does.",
    },
    m.scope3Required
      ? {
          id: "scope3",
          state: "warn",
          title: `Scope 3 is ${formatPct(m.scope3SharePct)}, so a Scope 3 target is required`,
          detail: `At ${SCOPE3_THRESHOLD_PCT}% or more of base emissions, Scope 3 needs its own target. It is included in this pathway.`,
        }
      : {
          id: "scope3",
          state: "ok",
          title: `Scope 3 is ${formatPct(m.scope3SharePct)}, below ${SCOPE3_THRESHOLD_PCT}%`,
          detail: "A Scope 3 target is optional, so Scope 3 is left out of this pathway.",
        },
  ];
  if (m.kind === "near") {
    const years = m.targetYear - m.baseYear;
    const past = currentYear !== undefined && m.targetYear < currentYear;
    rules.push({
      id: "horizon",
      state: years >= 5 && years <= 10 && !past ? "ok" : "warn",
      title: past ? `Target year ${m.targetYear} has already passed` : `Near-term horizon is ${years} years (${m.baseYear}–${m.targetYear})`,
      detail: past
        ? "Pick a later base year or the 10-year horizon to set a target still ahead."
        : "Near-term targets run 5 to 10 years from the base year.",
    });
    rules.push(
      pathway === "15c"
        ? { id: "ambition", state: "ok", title: "1.5°C pathway, 4.2% a year", detail: "The ambition SBTi requires for Scope 1+2 targets." }
        : {
            id: "ambition",
            state: "warn",
            title: "Well-below 2°C pathway, 2.5% a year",
            detail: "SBTi validates Scope 1+2 targets at 1.5°C; well-below 2°C is accepted for Scope 3 only.",
          },
    );
  } else {
    rules.push({
      id: "net-zero",
      state: "ok",
      title: `90% cut by ${NET_ZERO_YEAR}`,
      detail: `Net-zero needs at least a 90% reduction; this pathway falls ${formatPct(m.annualRatePct)} a year.`,
    });
  }
  return rules;
}

function formatPct(v: number): string {
  return `${Number(v.toFixed(1)).toLocaleString("en-US")}%`;
}

const STATUS_WORD: Record<ActualStatus, string> = { base: "Base year", reached: "Reached", "not-reached": "Not reached", "no-data": "No data" };

export function statusWord(s: ActualStatus): string {
  return STATUS_WORD[s];
}

type Cell = string | number;
const cell = (v: number | null | undefined): Cell => (v === null || v === undefined ? "" : v);

/** Sheets for the XLSX export: header row first, figures unformatted. */
export function exportSheets(m: TargetModel, siteNames: string[], pathway: Pathway): Array<{ name: string; rows: Cell[][] }> {
  const s3 = m.scope3Required;
  const latest = latestScored(m.actual);
  return [
    {
      name: "Summary",
      rows: [
        ["Field", "Value"],
        ["Target", m.kind === "near" ? "Near-term" : "Net-zero 2050"],
        ["Sites", siteNames.join(", ")],
        ["Base year", m.baseYear],
        ["Target year", m.targetYear],
        ...(m.kind === "near" ? [["Pathway", PATHWAYS[pathway].label] as Cell[]] : []),
        ["Annual reduction %", m.annualRatePct],
        ["Base emissions in boundary (tCO₂e)", m.boundaryBase],
        ["Target emissions (tCO₂e)", m.targetEmissions],
        ["Scope 3 share of base %", m.scope3SharePct],
        ["Scope 3 target required", s3 ? "Yes" : "No"],
        ["Scope 1+2 share of base %", m.scope12SharePct],
        ["Latest actual year", latest ? latest.year : ""],
        ["Latest actual (tCO₂e)", cell(latest?.actual)],
        ["Latest status", latest ? statusWord(latest.status) : "No data"],
      ],
    },
    {
      name: "Pathway",
      rows: [
        ["Year", "N", "Target (tCO₂e)", "Reduction (tCO₂e)", "YoY %", "Total reduction %"],
        ...m.pathway.map((r) => [r.year, r.n, r.target, cell(r.reducedBy), cell(r.reducedByPct), cell(r.totalReductionPct)]),
      ],
    },
    {
      name: "Scope-wise",
      rows: [
        ["Year", "N", "Scope 1 (tCO₂e)", "Scope 2 (tCO₂e)", ...(s3 ? ["Scope 3 (tCO₂e)"] : []), "Target (tCO₂e)", "Reduction (tCO₂e)", "YoY %", "Total reduction %"],
        ...m.scopes.map((r) => [
          r.year,
          r.n,
          r.s1,
          r.s2,
          ...(s3 ? [cell(r.s3)] : []),
          r.target,
          cell(r.reducedBy),
          cell(r.reducedByPct),
          cell(r.totalReductionPct),
        ]),
      ],
    },
    {
      name: "Actual vs target",
      rows: [
        ["Year", "Actual scope 1", "Actual scope 2", ...(s3 ? ["Actual scope 3"] : []), "Actual total (tCO₂e)", "Target (tCO₂e)", "Variance (tCO₂e)", "Variance %", "Status"],
        ...m.actual.map((r) => [
          r.year,
          cell(r.s1),
          cell(r.s2),
          ...(s3 ? [cell(r.s3)] : []),
          cell(r.actual),
          r.target,
          cell(r.variance),
          cell(r.variancePct),
          statusWord(r.status),
        ]),
      ],
    },
  ];
}

export function exportBaseName(m: Pick<TargetModel, "kind" | "baseYear" | "targetYear">): string {
  return `Targets_${m.kind === "near" ? "near-term" : "net-zero"}_${m.baseYear}-${m.targetYear}`;
}

/** True when the backend said the base year has no approved emissions. */
export function isNoBaseData(error: unknown): boolean {
  const res = (error as { response?: { status?: number; data?: { message?: unknown } } } | null)?.response;
  return res?.status === 400 && typeof res.data?.message === "string" && res.data.message.startsWith("No approved emissions");
}
