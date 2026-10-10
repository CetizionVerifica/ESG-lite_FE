import { describe, expect, it } from "vitest";
import type { Brand } from "../../services/brandService";
import { type ConsoleData, brandProblem, buildClientRows, recentActivity, setupGaps } from "./logic";

const goodBrand = (companyId: number): Brand => ({
  companyId,
  name: "Midal Cables",
  primary: "#1f2a44",
  accent: "#3b82f6",
  coverFrom: "#0d1526",
  coverTo: "#1f2a44",
  logoUrl: "https://cdn.example/logo.png",
  logoPublicId: null,
  logoOnDarkUrl: "https://cdn.example/logo-dark.png",
  defaultLook: "classic",
  updatedAt: "2026-10-01T00:00:00Z",
});

function data(over: Partial<ConsoleData> = {}): ConsoleData {
  return {
    companies: [
      { company_id: 1, name: "Midal Cables", status: true },
      { company_id: 2, name: "Glochem", status: true },
    ],
    sites: [
      { site_id: 10, name: "Hidd", company: { company_id: 1 }, categories: [{ category_id: 1, category_name: "Fuel" }, { category_id: 2, category_name: "Electricity" }] },
      { site_id: 20, name: "Dammam", company: { company_id: 2 }, categories: [{ category_id: 1, category_name: "Fuel" }, { category_id: 2, category_name: "Electricity" }, { category_id: 3, category_name: "Water" }] },
    ],
    users: [
      { user_id: 1, role: "Superadmin" },
      { user_id: 2, role: "User", site: { site_id: 10 } },
      // A manager on both clients counts once for each.
      { user_id: 3, role: "Manager", sites: [{ site_id: 10 }, { site_id: 20 }] },
      { user_id: 4, role: "User", site: { site_id: 20 }, sites: [{ site_id: 20 }] },
    ],
    configs: [
      { site: { site_id: 10 }, category: { category_id: 1 } },
      { site: { site_id: 10 }, category: { category_id: 2 } },
    ],
    units: [{ site: { site_id: 10 }, category: { category_id: 1 } }],
    thresholds: [{ company: { company_id: 1 } }],
    factorYears: new Map([
      [10, 2025],
      [20, 2023],
    ]),
    brands: new Map([[1, goodBrand(1)]]),
    ...over,
  };
}

describe("buildClientRows", () => {
  it("scores a fully set-up client at 100% with no gaps", () => {
    const [midal] = buildClientRows(data(), 2026);
    expect(midal).toMatchObject({ name: "Midal Cables", sites: 1, users: 2, completeness: 1, gaps: [] });
  });

  it("lists each gap with a link to the page that fixes it", () => {
    const glochem = buildClientRows(data(), 2026)[1];
    expect(glochem.users).toBe(2);
    expect(glochem.gaps.map((g) => [g.subject, g.text, g.href])).toEqual([
      ["Dammam", "3 categories have no column config", "/capture/forms?site=20"],
      ["Dammam", "no units set up", "/setup/reference"],
      ["Dammam", "latest factors are for 2023", "/factors"],
      ["Glochem", "no threshold set", "/factors/thresholds"],
    ]);
    // Brand not known (not loaded) is left out of the score: 2 of 6 checks pass.
    expect(glochem.checks.find((c) => c.id === "brand")?.ok).toBeNull();
    expect(glochem.completeness).toBeCloseTo(2 / 6);
  });

  it("uses singular wording for one missing config", () => {
    const d = data({ configs: [...data().configs, { site: { site_id: 20 }, category: { category_id: 1 } }, { site: { site_id: 20 }, category: { category_id: 2 } }] });
    expect(buildClientRows(d, 2026)[1].gaps[0].text).toBe("1 category has no column config");
  });

  it("flags a client without sites and fails every site check", () => {
    const d = data({ companies: [{ company_id: 3, name: "Chieron" }], brands: new Map() });
    const [row] = buildClientRows(d, 2026);
    expect(row.sites).toBe(0);
    expect(row.gaps.map((g) => g.text)).toEqual(["no sites yet", "no threshold set"]);
    expect(row.checks.filter((c) => c.ok === false).map((c) => c.id)).toEqual(["sites", "categories", "configs", "factors", "units", "threshold"]);
    expect(row.completeness).toBe(0);
  });

  it("treats a site with no factors as a gap and an unloaded one as unknown", () => {
    const none = buildClientRows(data({ factorYears: new Map([[10, null]]) }), 2026)[0];
    expect(none.gaps.map((g) => g.text)).toEqual(["no emission factors"]);
    const unknown = buildClientRows(data({ factorYears: new Map() }), 2026)[0];
    expect(unknown.checks.find((c) => c.id === "factors")?.ok).toBeNull();
    expect(unknown.completeness).toBe(1);
  });

  it("flags a site with no categories", () => {
    const d = data({ sites: [{ site_id: 10, name: "Hidd", company: { company_id: 1 }, categories: [] }] });
    expect(buildClientRows(d, 2026)[0].gaps.map((g) => g.text)).toEqual(["no categories enabled"]);
  });
});

describe("brandProblem", () => {
  it("passes a saved brand with both logos and AA colours", () => {
    expect(brandProblem(goodBrand(1))).toBeNull();
  });
  it("names the first thing missing", () => {
    expect(brandProblem({ ...goodBrand(1), updatedAt: undefined })).toBe("no brand theme set");
    expect(brandProblem({ ...goodBrand(1), logoUrl: null })).toBe("no logo");
    expect(brandProblem({ ...goodBrand(1), logoOnDarkUrl: null })).toBe("no logo on dark");
  });
});

describe("setupGaps", () => {
  it("puts the least complete client first and skips inactive clients", () => {
    const rows = buildClientRows(data(), 2026);
    expect(setupGaps(rows)[0].clientName).toBe("Glochem");
    const inactive = buildClientRows(data({ companies: [{ company_id: 2, name: "Glochem", status: false }] }), 2026);
    expect(setupGaps(inactive)).toEqual([]);
  });
});

describe("recentActivity", () => {
  it("lists newest uploads first with the client name", () => {
    const items = recentActivity(
      [
        { upload_batch_id: "a", count: 1, uploaded_at: "2026-10-01T00:00:00Z", site_id: 10, site_name: "Hidd", category_id: 1, category_name: "Fuel" },
        { upload_batch_id: "b", count: 40, uploaded_at: "2026-10-05T00:00:00Z", site_id: 20, site_name: "Dammam", category_id: 2, category_name: "Electricity" },
      ],
      data().sites.map((s) => ({ ...s, company: { company_id: s.company!.company_id, name: s.site_id === 10 ? "Midal Cables" : "Glochem" } })),
    );
    expect(items.map((i) => [i.title, i.detail])).toEqual([
      ["Factor upload · 40 factors", "Glochem · Dammam · Electricity"],
      ["Factor upload · 1 factor", "Midal Cables · Hidd · Fuel"],
    ]);
  });
});
