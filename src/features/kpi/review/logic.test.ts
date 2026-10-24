import { describe, expect, it } from "vitest";
import type { KpiPeriodLockStatus, KpiValue } from "../../../lib/kpi/contracts";
import { ACME_COMPANY_KPIS, KPI_DEFINITIONS, KPI_DISCLOSURES, KPI_FRAMEWORKS, KPI_MAPPINGS, KPI_SITES, KPI_VALUES_SEED } from "../../../test/msw/kpiData";
import { buildLookup } from "../components/lookup";
import {
  approveAllLabel,
  defaultMonth,
  draftOf,
  editInput,
  lastYearRange,
  leftInView,
  lockLabel,
  readChecks,
  refusalLines,
  refusalText,
  reviewRows,
  siteSummary,
  sitesInView,
  splitRows,
} from "./logic";

const lookup = buildLookup(
  { frameworks: KPI_FRAMEWORKS, disclosures: KPI_DISCLOSURES, definitions: KPI_DEFINITIONS, mappings: KPI_MAPPINGS },
  {
    settings: { company_id: 1, year_type: "CY", first_year: 2026, due_day: 15, setup_completed_at: "2026-09-02" },
    frameworks: KPI_FRAMEWORKS.map((f) => ({ company_id: 1, framework_id: f.id, enabled_at: "", enabled_by: 13 })),
    material_topics: [],
    kpis: ACME_COMPANY_KPIS,
    assignments: [],
    sites: KPI_SITES.map((s) => ({ ...s })),
    people: [{ user_id: 14, name: "Sara Ali", role: "User", site_ids: [2] }],
  },
);
const pending = KPI_VALUES_SEED.filter((v) => v.status === "pending");
const approved = KPI_VALUES_SEED.filter((v) => v.status === "approved");

describe("readChecks", () => {
  it("reads the list shape and the {ready, held} shape, with plain words", () => {
    expect(readChecks([{ id: "KPI_CHANGE_LIMIT", detail: "3× last September" }]).held).toEqual([{ id: "KPI_CHANGE_LIMIT", label: "3× last September", info: false }]);
    expect(readChecks({ ready: false, held: ["KPI_EVIDENCE"] })).toEqual({ ready: false, held: [{ id: "KPI_EVIDENCE", label: "No evidence attached", info: true }] });
    expect(readChecks({ ready: true, held: [{ id: "KPI_UNIT_CONVERTED" }] }).held[0]).toMatchObject({ label: "Unit converted", info: true });
    expect(readChecks(null)).toEqual({ ready: null, held: [] });
    expect(readChecks([{ id: "SOMETHING_NEW" }]).held[0].label).toBe("Needs a look");
  });
});

describe("reviewRows", () => {
  const rows = reviewRows(pending, lookup, approved);

  it("names, fills the question and compares with last year", () => {
    const water = rows.find((r) => r.id === 10)!;
    expect(water).toMatchObject({ kpiName: "Water withdrawn", siteName: "Dammam", periodLabel: "September 2026", valueText: "3,600 m³", change: "+213 %", enteredBy: "Sara Ali", ready: false });
    expect(water.question).toBe("How much water did Dammam take in during September 2026?");
    expect(water.usedIn.map((u) => `${u.framework} ${u.code}`)).toContain("GRI 303-3");
    expect(rows.find((r) => r.id === 11)!.change).toBe("−6 %");
  });

  it("splits Ready and Needs attention; informational checks don't hold a value", () => {
    const { ready, attention } = splitRows(rows);
    // 12 has only "No evidence attached": a note, not a hold (D15 revised).
    expect(ready.map((r) => r.id)).toEqual([9, 7, 11, 13, 12]);
    expect(attention.map((r) => r.id)).toEqual([10]);
    const converted = reviewRows([{ ...pending[0], checks: [{ id: "KPI_UNIT_CONVERTED" }] } as KpiValue], lookup);
    expect(converted[0].ready).toBe(true);
  });

  it("prefers the server's change and names", () => {
    const [r] = reviewRows([{ ...pending[0], change_pct: 12.4, kpi_name: "Server name", site_name: "Server site" }], lookup);
    expect(r).toMatchObject({ change: "+12 %", kpiName: "Server name", siteName: "Server site" });
  });

  it("asks for last year's values in one range", () => {
    expect(lastYearRange(pending)).toEqual({ from: "2025-07-01", to: "2025-09-01" });
    expect(lastYearRange([])).toBeNull();
  });
});

describe("copy and refusals", () => {
  it("words Approve all and refusals plainly", () => {
    expect(approveAllLabel(3)).toBe("Approve all 3 ready");
    expect(approveAllLabel(1)).toBe("Approve the ready value");
    expect(refusalText("KPI_PERIOD_LOCKED")).toBe("This period is closed. Ask your manager to reopen it.");
    expect(refusalText("NOT_READY")).toBe("It needs attention first.");
    expect(refusalText("WHATEVER")).toBe("It isn't waiting for review any more.");
    expect(refusalLines([{ id: 10, code: "NOT_READY" }], reviewRows(pending, lookup))).toEqual(["Water withdrawn at Dammam: It needs attention first."]);
  });
});

describe("edit in the drawer", () => {
  it("starts from the value and sends the id with the reason", () => {
    const v = pending.find((x) => x.id === 10)!;
    const def = lookup.definition(v.kpi_definition_id);
    const draft = draftOf(v, def);
    expect(draft).toMatchObject({ value: 3600, unit: "m³", breakdown: { groundwater: null, surface: null, third_party: null } });
    expect(editInput(v, def, { ...draft, value: 1200, breakdown: { groundwater: 700, surface: null, third_party: 500 } }, "  quarter, not month ")).toMatchObject({
      id: 10,
      kpi_definition_id: 13,
      site_id: 2,
      value_numeric: 1200,
      unit: "m³",
      breakdown: { groundwater: 700, third_party: 500 },
      reason: "quarter, not month",
    });
  });
});

describe("close period", () => {
  const site = (id: number, name: string, locked: boolean, kpis: KpiPeriodLockStatus["sites"][number]["kpis"]) => ({ site_id: id, name, locked, lock: null, kpis });
  const counts = (c: Partial<Record<"draft" | "pending" | "approved" | "rejected", number>>) => ({ draft: 0, pending: 0, approved: 0, rejected: 0, ...c });
  const status: KpiPeriodLockStatus = {
    year: 2026,
    period: 9,
    sites: [
      site(1, "Bahrain plant", false, [
        { kpi_definition_id: 13, name: "Water withdrawn", counts: counts({ approved: 1 }), missing: false },
        { kpi_definition_id: 14, name: "Water discharged", counts: counts({ draft: 1 }), missing: false },
        { kpi_definition_id: 15, name: "Waste generated", counts: counts({}), missing: true },
      ]),
      site(2, "Dammam", true, [{ kpi_definition_id: 13, name: "Water withdrawn", counts: counts({ approved: 1 }), missing: false }]),
    ],
    left: [
      { site_id: 1, site_name: "Bahrain plant", kpi_definition_id: 14, kpi_name: "Water discharged", reason: "draft" },
      { site_id: 2, site_name: "Dammam", kpi_definition_id: 13, kpi_name: "Water withdrawn", reason: "pending" },
    ],
  };

  it("summarises a site and lists what's left in open sites", () => {
    expect(siteSummary(status.sites[0])).toEqual({ approved: 1, draft: 1, pending: 0, rejected: 0, missing: 1, owed: 3 });
    expect(leftInView(status, status.sites).map((l) => l.kpi_name)).toEqual(["Water discharged"]);
    expect(sitesInView(status, [2]).map((s) => s.name)).toEqual(["Dammam"]);
  });

  it("labels the lock button and picks last month", () => {
    expect(lockLabel("September 2026", status.sites)).toBe("Lock September 2026 for Bahrain plant");
    expect(lockLabel("September 2026", [status.sites[0]])).toBe("Lock September 2026");
    expect(defaultMonth(new Date(2026, 9, 17))).toEqual({ year: 2026, month: 9 });
    expect(defaultMonth(new Date(2026, 0, 5))).toEqual({ year: 2025, month: 12 });
  });
});
