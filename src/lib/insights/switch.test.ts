import { describe, expect, it } from "vitest";
import { insightsOn, insightsStatusKey, isInsightsOff, resolveInsightsStatus } from "./switch";

const on = { company_id: 1, insights_enabled: true };
const off = { company_id: 2, insights_enabled: false };

describe("insightsOn (I1, I2)", () => {
  it("is off with no user, no company, or the switch off (the default)", () => {
    expect(insightsOn(null)).toBe(false);
    expect(insightsOn({})).toBe(false);
    expect(insightsOn({ site: { site_id: 1, company: null } })).toBe(false);
    expect(insightsOn({ site: { site_id: 1, company: { company_id: 3 } } })).toBe(false);
    expect(insightsOn({ site: { site_id: 1, company: off } })).toBe(false);
  });

  it("is on when the user's site's company, or an Admin's own company, has it on", () => {
    expect(insightsOn({ site: { site_id: 1, company: on } })).toBe(true);
    expect(insightsOn({ sites: [{ site_id: 1, company: off }, { site_id: 2, company: on }] })).toBe(true);
    expect(insightsOn({ company: on })).toBe(true);
  });

  it("only a real true, and never for a User (contributor)", () => {
    expect(insightsOn({ company: { insights_enabled: "true" } })).toBe(false);
    expect(insightsOn({ role: "User", company: on })).toBe(false);
    expect(insightsOn({ role: "Manager", company: on })).toBe(true);
    expect(insightsOn({ role: "Admin", company: on })).toBe(true);
  });

  it("does not follow the KPI or studio switches", () => {
    expect(insightsOn({ company: { kpi_tracking_enabled: true, design_studio_enabled: true } })).toBe(false);
  });
});

describe("resolveInsightsStatus", () => {
  const session = { enabled: true, kpi_tracking: true };
  it("the server's answer wins", () => {
    expect(resolveInsightsStatus({ enabled: false, kpi_tracking: true }, session)).toEqual({ enabled: false, kpi_tracking: true });
    expect(resolveInsightsStatus({ enabled: true, kpi_tracking: false }, { enabled: false, kpi_tracking: true })).toEqual({ enabled: true, kpi_tracking: false });
    expect(resolveInsightsStatus({ enabled: true }, session)).toEqual({ enabled: true, kpi_tracking: false });
  });
  it("a body without a boolean `enabled` keeps the session's values", () => {
    expect(resolveInsightsStatus(undefined, session)).toEqual(session);
    expect(resolveInsightsStatus({}, session)).toEqual(session);
  });
});

describe("helpers", () => {
  it("keys status per company and reads IN_OFF", () => {
    expect(insightsStatusKey(null)).toEqual(["insights", "status", null]);
    expect(insightsStatusKey(4)).toEqual(["insights", "status", 4]);
    expect(isInsightsOff({ response: { status: 403, data: { code: "IN_OFF" } } })).toBe(true);
    expect(isInsightsOff({ response: { status: 403, data: { code: "IN_FORBIDDEN" } } })).toBe(false);
    expect(isInsightsOff({ response: { status: 403, data: { code: "DS_STUDIO_OFF" } } })).toBe(false);
    expect(isInsightsOff(new Error("x"))).toBe(false);
  });
});
