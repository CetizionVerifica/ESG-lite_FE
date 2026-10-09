import { describe, expect, it } from "vitest";
import { matchRoutes, type RouteObject } from "react-router-dom";
import { isNewUiEnabled, withNewUiRoutes } from "./featureFlags";

describe("isNewUiEnabled", () => {
  it.each(["1", "true", "TRUE", " 1 "])("is on for %j", (value) => {
    expect(isNewUiEnabled({ VITE_NEW_UI: value })).toBe(true);
  });

  it.each([undefined, "", "0", "false", "yes"])("is off for %j", (value) => {
    expect(isNewUiEnabled({ VITE_NEW_UI: value })).toBe(false);
  });
});

describe("withNewUiRoutes", () => {
  const legacy: RouteObject[] = [{ path: "/login" }, { path: "/data-entry" }];
  const next: RouteObject[] = [{ path: "/my-month" }];

  it("mounts only the legacy routes when the flag is off", () => {
    expect(withNewUiRoutes(legacy, next, false)).toEqual(legacy);
  });

  it("mounts the new routes first when the flag is on", () => {
    expect(withNewUiRoutes(legacy, next, true)).toEqual([...next, ...legacy]);
  });

  it("lets a new route take over a legacy path nested under a layout", () => {
    const nestedLegacy: RouteObject[] = [
      { path: "", id: "protected", children: [{ path: "data-entry", id: "legacy" }] },
    ];
    const takeover: RouteObject[] = [{ path: "/data-entry", id: "new" }];

    const on = matchRoutes(withNewUiRoutes(nestedLegacy, takeover, true), "/data-entry");
    const off = matchRoutes(withNewUiRoutes(nestedLegacy, takeover, false), "/data-entry");

    expect(on?.[on.length - 1].route.id).toBe("new");
    expect(off?.[off.length - 1].route.id).toBe("legacy");
  });
});
