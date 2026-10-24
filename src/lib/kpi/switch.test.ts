import { describe, expect, it } from "vitest";
import { isKpiTrackingOff, kpiTrackingOn, resolveKpiTracking } from "./switch";

const on = { company_id: 1, kpi_tracking_enabled: true };
const off = { company_id: 2, kpi_tracking_enabled: false };

describe("kpiTrackingOn", () => {
  it("is off with no user, no company, or the switch off (the default)", () => {
    expect(kpiTrackingOn(null)).toBe(false);
    expect(kpiTrackingOn(undefined)).toBe(false);
    expect(kpiTrackingOn({})).toBe(false);
    expect(kpiTrackingOn({ site: { site_id: 1, company: null } })).toBe(false);
    expect(kpiTrackingOn({ site: { site_id: 1, company: { company_id: 3 } } })).toBe(false);
    expect(kpiTrackingOn({ site: { site_id: 1, company: off } })).toBe(false);
  });

  it("is on when the user's site's company has it on", () => {
    expect(kpiTrackingOn({ site: { site_id: 1, company: on } })).toBe(true);
    expect(kpiTrackingOn({ sites: [{ site_id: 1, company: off }, { site_id: 2, company: on }] })).toBe(true);
    expect(kpiTrackingOn({ company: on })).toBe(true);
  });

  it("reads the given site's company", () => {
    const user = { sites: [{ site_id: 1, company: off }, { site_id: 2, company: on }] };
    expect(kpiTrackingOn(user, 1)).toBe(false);
    expect(kpiTrackingOn(user, 2)).toBe(true);
  });

  it("doesn't let a site of another company switch it on", () => {
    const user = { sites: [{ site_id: 1, company: off }] };
    // Site 9 isn't the user's: fall back to their own companies, which are off.
    expect(kpiTrackingOn(user, 9)).toBe(false);
  });

  it("only takes a real true", () => {
    expect(kpiTrackingOn({ site: { site_id: 1, company: { kpi_tracking_enabled: "true" } } })).toBe(false);
    expect(kpiTrackingOn({ site: { site_id: 1, company: { kpi_tracking_enabled: 1 } } })).toBe(false);
  });
});

describe("resolveKpiTracking", () => {
  it("lets the server's answer win, and keeps the session's without one", () => {
    expect(resolveKpiTracking(true, false)).toBe(true);
    expect(resolveKpiTracking(false, true)).toBe(false);
    expect(resolveKpiTracking(undefined, true)).toBe(true);
    expect(resolveKpiTracking("yes", false)).toBe(false);
  });
});

describe("isKpiTrackingOff", () => {
  it("spots the switch-off refusal only", () => {
    expect(isKpiTrackingOff({ response: { status: 403, data: { code: "KPI_TRACKING_OFF" } } })).toBe(true);
    expect(isKpiTrackingOff({ response: { status: 403, data: { code: "KPI_NOT_ASSIGNED" } } })).toBe(false);
    expect(isKpiTrackingOff({ response: { status: 500 } })).toBe(false);
    expect(isKpiTrackingOff(new Error("network"))).toBe(false);
    expect(isKpiTrackingOff(null)).toBe(false);
  });
});
