import { describe, expect, it } from "vitest";
import snapshot from "./contracts.snapshot.json";
import * as c from "./contracts";

/**
 * IN-0: the mirror carries exactly the backend's contract values.
 * `contracts.snapshot.json` is a copy of ESG-lite `ci/insights-contracts.json`
 * (the backend's unit test keeps that file current); a contract change
 * updates both in the same IN-0 follow-up.
 */
describe("insights contracts mirror", () => {
  it("has every backend enum, with the same values in the same order", () => {
    const fe = c as unknown as Record<string, unknown>;
    for (const [name, values] of Object.entries(snapshot.enums)) expect(fe[name], name).toEqual(values);
  });

  it("has the same limits, panel paths and other paths", () => {
    const fe = c as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(snapshot.limits)) expect(fe[name], name).toBe(value);
    expect(c.PANEL_PATHS).toEqual(snapshot.panelPaths);
    expect([...c.OTHER_PATHS]).toEqual(snapshot.otherPaths);
  });

  it("has every rule with its severities and params", () => {
    expect(c.RULES).toEqual(snapshot.rules);
    expect([...c.RULE_IDS]).toEqual(Object.keys(snapshot.rules));
  });

  it("has every error code with its status, and no others", () => {
    expect(c.IN_ERROR_STATUS).toEqual(snapshot.errors);
  });

  it("reads Insights error codes and roles", () => {
    expect(c.inErrorCode({ response: { status: 403, data: { code: "IN_OFF" } } })).toBe("IN_OFF");
    expect(c.inErrorCode({ response: { status: 403, data: { code: "KPI_TRACKING_OFF" } } })).toBeNull();
    expect(c.inErrorCode(null)).toBeNull();
    expect(c.canOpenInsights("Manager")).toBe(true);
    expect(c.canOpenInsights("Admin")).toBe(true);
    expect(c.canOpenInsights("Superadmin")).toBe(true);
    expect(c.canOpenInsights("User")).toBe(false);
    expect(c.canOpenInsights(null)).toBe(false);
  });
});
