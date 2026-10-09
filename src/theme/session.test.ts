import { describe, expect, it } from "vitest";
import { PLANETPULSE } from "./packs";
import {
  companyIdFromUser,
  readStoredAppearance,
  reconcileAppearance,
  resolveAppearance,
  selectPack,
  shouldLoadBrand,
  subscribeMediaQuery,
} from "./session";

const store = (values: Record<string, string>) => ({ getItem: (k: string) => values[k] ?? null });

describe("companyIdFromUser", () => {
  it("reads the company from the user's site, then from their first site", () => {
    expect(companyIdFromUser({ site: { company: { company_id: 1 } } })).toBe(1);
    expect(companyIdFromUser({ site: null, sites: [{ company: { company_id: 6 } }] })).toBe(6);
    expect(companyIdFromUser({ site: { company: null }, sites: [] })).toBeNull();
    expect(companyIdFromUser(null)).toBeNull();
  });
});

describe("selectPack", () => {
  const brand = { companyId: 1, name: "Midal Cables", primary: "#0b2e5c", accent: "#2f6fb0" };

  it("uses PlanetPulse for Superadmin, even with a brand", () => {
    expect(selectPack("Superadmin", brand)).toBe(PLANETPULSE);
    expect(shouldLoadBrand("Superadmin", true)).toBe(false);
  });

  it("uses PlanetPulse when signed out or the brand didn't load", () => {
    expect(selectPack("Manager", null)).toBe(PLANETPULSE);
    expect(shouldLoadBrand(null, false)).toBe(false);
    expect(shouldLoadBrand("Manager", false)).toBe(false);
  });

  it("uses the company's brand for client users", () => {
    expect(shouldLoadBrand("Manager", true)).toBe(true);
    const pack = selectPack("Manager", brand);
    expect(pack.id).toBe("company-1");
    expect(pack.primary).toBe("#0b2e5c");
  });
});

describe("appearance", () => {
  it("reads the stored appearance and migrates the legacy theme key", () => {
    expect(readStoredAppearance(store({ appearance: "dark" }))).toBe("dark");
    expect(readStoredAppearance(store({ theme: "dark" }))).toBe("dark");
    expect(readStoredAppearance(store({ appearance: "system", theme: "dark" }))).toBe("system");
    expect(readStoredAppearance(store({ appearance: "neon" }))).toBe("system");
    expect(readStoredAppearance(null)).toBe("system");
  });

  it("survives storage that throws", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); } };
    expect(readStoredAppearance(throwing)).toBe("system");
  });

  it("resolves system against the OS setting", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
  });
});

describe("subscribeMediaQuery", () => {
  it("uses addEventListener when the browser has it", () => {
    const calls: string[] = [];
    const mq = {
      addEventListener: (type: string) => calls.push(`add:${type}`),
      removeEventListener: (type: string) => calls.push(`remove:${type}`),
      addListener: () => calls.push("legacy-add"),
      removeListener: () => calls.push("legacy-remove"),
    };
    const unsubscribe = subscribeMediaQuery(mq, () => {});
    unsubscribe();
    expect(calls).toEqual(["add:change", "remove:change"]);
  });

  it("falls back to addListener/removeListener on Safari < 14", () => {
    const listeners = new Set<() => void>();
    const mq = {
      addListener: (l: () => void) => listeners.add(l),
      removeListener: (l: () => void) => listeners.delete(l),
    };
    let changes = 0;
    const unsubscribe = subscribeMediaQuery(mq, () => changes++);
    listeners.forEach((l) => l());
    expect(changes).toBe(1);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it("does nothing when neither API exists", () => {
    expect(() => subscribeMediaQuery({}, () => {})()).not.toThrow();
  });
});

describe("reconcileAppearance", () => {
  it("applies the account's saved choice", () => {
    expect(reconcileAppearance("dark", "light")).toEqual({ apply: "dark" });
    expect(reconcileAppearance("light", "system")).toEqual({ apply: "light" });
    expect(reconcileAppearance("dark", "dark")).toBeNull();
  });

  it("saves this device's choice to an account still on the default", () => {
    expect(reconcileAppearance("system", "dark")).toEqual({ push: "dark" });
    expect(reconcileAppearance("system", "system")).toBeNull();
  });

  it("ignores a missing or unknown server value", () => {
    expect(reconcileAppearance(undefined, "dark")).toBeNull();
    expect(reconcileAppearance("neon", "dark")).toBeNull();
  });
});
