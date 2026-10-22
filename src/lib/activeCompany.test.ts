// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { activeCompanyHeader, companiesOf, saveActiveCompany, storedActiveCompany, withActiveCompany } from "./activeCompany";

const midal = { company_id: 1, name: "Midal Cables", insights_enabled: false };
const glochem = { company_id: 3, name: "Glochem Industries", insights_enabled: true };
const user = {
  user_id: 9,
  role: "User",
  site: { site_id: 16, company: midal },
  sites: [
    { site_id: 16, name: "Bahrain", company: midal },
    { site_id: 23, name: "Glochem", company: glochem },
    { site_id: 17, name: "Saudi Arabia", company: midal },
  ],
};

afterEach(() => localStorage.clear());

describe("active company (M6)", () => {
  it("lists the companies of someone with sites at several clients, by name", () => {
    expect(companiesOf(user)).toEqual([
      { company_id: 3, name: "Glochem Industries" },
      { company_id: 1, name: "Midal Cables" },
    ]);
    expect(companiesOf({ ...user, role: "Admin" })).toEqual([]);
    expect(companiesOf({ ...user, role: "Superadmin" })).toEqual([]);
    expect(companiesOf(null)).toEqual([]);
  });

  it("keeps the choice per user, only while it is one of their companies", () => {
    expect(storedActiveCompany(user)).toBeNull();
    saveActiveCompany(user, 3);
    expect(storedActiveCompany(user)).toBe(3);
    expect(storedActiveCompany({ ...user, user_id: 10 })).toBeNull();
    expect(storedActiveCompany({ ...user, sites: user.sites.filter((s) => s.company === midal) })).toBeNull();
    saveActiveCompany(user, 99);
    expect(storedActiveCompany(user)).toBeNull();
  });

  it("puts the chosen company first: its sites first and `company` set", () => {
    const shown = withActiveCompany(user, 3);
    expect(shown.company).toBe(glochem);
    expect(shown.site).toEqual(user.sites[1]);
    expect(shown.sites.map((s) => s.site_id)).toEqual([23, 16, 17]);
    expect(withActiveCompany(user, null)).toBe(user);
    expect(withActiveCompany(user, 99)).toBe(user);
  });

  it("sends X-Company-Id only for a valid choice of the stored user", () => {
    localStorage.setItem("user", JSON.stringify(user));
    expect(activeCompanyHeader()).toBeNull();
    saveActiveCompany(user, 3);
    expect(activeCompanyHeader()).toBe("3");
    localStorage.setItem("user", "not json");
    expect(activeCompanyHeader()).toBeNull();
  });
});
