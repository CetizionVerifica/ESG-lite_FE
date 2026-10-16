import { describe, expect, it } from "vitest";
import { USER_MISSING_FACTOR, USER_UNIT_CANNOT_CONVERT, companyOfUserSite, plainIssue, plainProblem, showCalcDetail } from "./entryDetail";

describe("showCalcDetail (SE-1)", () => {
  const settings = { total: { entry_detail: "total" }, full: { entry_detail: "full" }, missing: {}, none: null };

  it.each([
    // role,        total,  full,  missing, no company
    ["User", false, true, false, false],
    ["Manager", true, true, true, true],
    ["Admin", true, true, true, true],
    ["Superadmin", true, true, true, true],
  ] as const)("%s: total %s · full %s · missing %s · no company %s", (role, total, full, missing, none) => {
    expect(showCalcDetail(role, settings.total)).toBe(total);
    expect(showCalcDetail(role, settings.full)).toBe(full);
    expect(showCalcDetail(role, settings.missing)).toBe(missing);
    expect(showCalcDetail(role, settings.none)).toBe(none);
  });

  it("no role (signed out, or not loaded yet) shows the total only", () => {
    expect(showCalcDetail(null, null)).toBe(false);
    expect(showCalcDetail(undefined, { entry_detail: "full" })).toBe(true);
  });
});

describe("companyOfUserSite", () => {
  const user = {
    sites: [
      { site_id: 4, company: { company_id: 1, entry_detail: "full" } },
      { site_id: 5, company: { company_id: 2, entry_detail: "total" } },
    ],
  };
  it("finds the site's company, else the first site's", () => {
    expect(companyOfUserSite(user, 5)).toEqual({ company_id: 2, entry_detail: "total" });
    expect(companyOfUserSite(user, null)).toEqual({ company_id: 1, entry_detail: "full" });
    expect(companyOfUserSite(user, 99)).toEqual({ company_id: 1, entry_detail: "full" });
  });
  it("reads the single user.site of older accounts, and copes with no sites", () => {
    expect(companyOfUserSite({ site: { site_id: 3, company: { entry_detail: "full" } } })).toEqual({ entry_detail: "full" });
    expect(companyOfUserSite({})).toBeNull();
    expect(companyOfUserSite(null)).toBeNull();
  });
});

describe("plain problems for a User", () => {
  it("factor and unit messages become something they can act on", () => {
    expect(plainProblem("No emission factor found for year 2025")).toBe(USER_MISSING_FACTOR);
    expect(plainProblem("No factor for this category")).toBe(USER_MISSING_FACTOR);
    expect(plainProblem("This emission factor has no unit - ask an admin to set it")).toBe(USER_MISSING_FACTOR);
    expect(plainProblem("Unit mismatch - this option is per tonne.km; choose the [km] option or switch the unit to tonne.km")).toBe(USER_UNIT_CANNOT_CONVERT);
    expect(plainProblem("The factor is per litre and kg can't be converted to it.")).toBe(USER_UNIT_CANNOT_CONVERT);
    expect(plainProblem("This option is per tonne.km. Choose the [km] version of it, or switch the unit to tonne.km.")).toBe(USER_UNIT_CANNOT_CONVERT);
    expect(plainProblem("This unit is not configured for this category")).toBe(USER_UNIT_CANNOT_CONVERT);
  });
  it("messages about their own input pass through", () => {
    for (const m of ["Choose a unit", "Select emission category", "Enter Quantity (a number greater than 0)", "Your share (%) cannot be more than 100"]) {
      expect(plainProblem(m)).toBe(m);
    }
  });
  it("engine codes about factors and units are said plainly", () => {
    expect(plainIssue("NO_FACTOR_FOR_YEAR", 'No emission factor found for emission category "Diesel" (year 2025)')).toBe(USER_MISSING_FACTOR);
    expect(plainIssue("UNIT_REQUIRED", 'The emission factor "Coal" has no unit')).toBe(USER_MISSING_FACTOR);
    expect(plainIssue("UNIT_NOT_CONVERTIBLE", 'Unit mismatch: Expected "litre" but received "kwh".')).toBe(USER_UNIT_CANNOT_CONVERT);
    expect(plainIssue("MISSING_VALUE", "No quantity greater than 0 was found for this row.")).toBe("No quantity greater than 0 was found for this row.");
  });
});
