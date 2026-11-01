import { describe, expect, it } from "vitest";
import { entryCategories, feraCategoryIdOf, sitesOf } from "./sites";

const travel = { category_id: 9, category_name: "Business Travel", scope: "Scope 3" };
const fera = { category_id: 5, category_name: "FERA", scope: "Scope 3" };

describe("the site's FERA category (D6a)", () => {
  it("is one of the site's categories, never offered for entry", () => {
    const [site] = sitesOf({ sites: [{ site_id: 3, name: "Pune", categories: [travel, fera] }] });
    expect(feraCategoryIdOf(site)).toBe(5);
    expect(entryCategories(site)).toEqual([travel]);
  });

  it("comes from the server's fera_category_id when the user's grants leave FERA out", () => {
    const [site] = sitesOf({ sites: [{ site_id: 3, name: "Pune", categories: [travel], fera_category_id: 5 }] });
    expect(feraCategoryIdOf(site)).toBe(5);
    expect(entryCategories(site)).toEqual([travel]);
  });

  it("is null for a site without one", () => {
    const [site] = sitesOf({ site: { site_id: 4, name: "Leeds", categories: [travel] } });
    expect(feraCategoryIdOf(site)).toBeNull();
    expect(feraCategoryIdOf(undefined)).toBeNull();
  });
});
