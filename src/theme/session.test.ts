import { describe, expect, it } from "vitest";
import { PLANETPULSE } from "./packs";
import {
  companyIdFromUser,
  readStoredAppearance,
  resolveAppearance,
  selectPack,
  shouldLoadBrand,
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
