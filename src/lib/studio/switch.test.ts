import { describe, expect, it } from "vitest";
import { designStudioOn, isKindOff, isStudioOff, kindEnabled, resolveStudioStatus } from "./switch";

const on = { company_id: 1, design_studio_enabled: true };
const onKpi = { company_id: 1, design_studio_enabled: true, kpi_tracking_enabled: true };
const off = { company_id: 2, design_studio_enabled: false };

describe("designStudioOn", () => {
  it("is off with no user, no company, or the switch off (the default)", () => {
    expect(designStudioOn(null)).toBe(false);
    expect(designStudioOn({})).toBe(false);
    expect(designStudioOn({ site: { site_id: 1, company: null } })).toBe(false);
    expect(designStudioOn({ site: { site_id: 1, company: { company_id: 3 } } })).toBe(false);
    expect(designStudioOn({ site: { site_id: 1, company: off } })).toBe(false);
  });

  it("is on when the user's site's company, or an Admin's own company, has it on", () => {
    expect(designStudioOn({ site: { site_id: 1, company: on } })).toBe(true);
    expect(designStudioOn({ sites: [{ site_id: 1, company: off }, { site_id: 2, company: on }] })).toBe(true);
    expect(designStudioOn({ company: on })).toBe(true);
  });

  it("reads the given site's company, and only a real true", () => {
    const user = { sites: [{ site_id: 1, company: off }, { site_id: 2, company: on }] };
    expect(designStudioOn(user, 1)).toBe(false);
    expect(designStudioOn(user, 2)).toBe(true);
    expect(designStudioOn({ company: { design_studio_enabled: "true" } })).toBe(false);
  });
});

describe("kindEnabled (D4)", () => {
  it("GHG needs only the studio; sustainability also needs KPI tracking", () => {
    expect(kindEnabled({ company: on }, "ghg")).toBe(true);
    expect(kindEnabled({ company: on }, "sustainability")).toBe(false);
    expect(kindEnabled({ company: onKpi }, "sustainability")).toBe(true);
    expect(kindEnabled({ company: { design_studio_enabled: false, kpi_tracking_enabled: true } }, "sustainability")).toBe(false);
    expect(kindEnabled({ company: off }, "ghg")).toBe(false);
  });
});

describe("resolveStudioStatus", () => {
  const session = { enabled: true, kinds: { ghg: true, sustainability: false } };
  it("takes the server's answer when it has a boolean `enabled`", () => {
    expect(resolveStudioStatus({ enabled: false, kinds: { ghg: false, sustainability: false } }, session)).toEqual({ enabled: false, kinds: { ghg: false, sustainability: false } });
    expect(resolveStudioStatus({ enabled: true, kinds: { ghg: true, sustainability: true } }, session).kinds.sustainability).toBe(true);
  });
  it("never shows a kind while the switch is off, whatever the body says", () => {
    expect(resolveStudioStatus({ enabled: false, kinds: { ghg: true, sustainability: true } }, session).kinds).toEqual({ ghg: false, sustainability: false });
  });
  it("keeps the session for an older server or a stub", () => {
    expect(resolveStudioStatus({}, session)).toBe(session);
    expect(resolveStudioStatus(undefined, session)).toBe(session);
  });
});

describe("error helpers", () => {
  it("recognise DS_STUDIO_OFF and DS_KIND_OFF", () => {
    expect(isStudioOff({ response: { status: 403, data: { code: "DS_STUDIO_OFF" } } })).toBe(true);
    expect(isStudioOff({ response: { status: 403, data: { code: "KPI_TRACKING_OFF" } } })).toBe(false);
    expect(isKindOff({ response: { status: 403, data: { code: "DS_KIND_OFF" } } })).toBe(true);
    expect(isStudioOff(null)).toBe(false);
  });
});
