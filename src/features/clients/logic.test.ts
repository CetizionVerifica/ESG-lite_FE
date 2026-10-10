import { describe, expect, it } from "vitest";
import { type AdminUser, type Company, type Site, buildRows, cascadeItems, deleteBlocker, distinctValues, draftFrom, isDirty, matchesFilters, parseThreshold, toPayload, validate } from "./logic";

const midal: Company = { company_id: 1, name: "Midal Cables", contact_person: "Omar", address: "Hidd", industry: "Metals", region: "GCC", status: true };
const gulf: Company = { company_id: 2, name: "Gulf Foods", contact_person: "Asha", address: "Pune", industry: "Food", region: "India", status: false };
const sites: Site[] = [
  { site_id: 10, name: "Hidd", company: { company_id: 1 } },
  { site_id: 11, name: "Askar", company: { company_id: 1 } },
  { site_id: 20, name: "Pune", company: { company_id: 2 } },
  { site_id: 30, name: "Orphan", company: null },
];
const users: AdminUser[] = [
  { user_id: 1, email: "a@x.com", role: "User", site: { site_id: 10 } },
  { user_id: 2, email: "b@x.com", role: "Manager", site: null, sites: [{ site_id: 10 }, { site_id: 11 }, { site_id: 20 }] },
  { user_id: 3, email: "c@x.com", role: "User", site: { site_id: 30 } },
];

describe("buildRows", () => {
  const [m, g] = buildRows([midal, gulf], sites, users);
  it("counts each client's sites", () => {
    expect(m.sites.map((s) => s.name)).toEqual(["Hidd", "Askar"]);
    expect(g.sites).toHaveLength(1);
  });
  it("counts a manager once per client, across all the sites they look after", () => {
    expect(m.users.map((u) => u.user_id)).toEqual([1, 2]);
    expect(g.users.map((u) => u.user_id)).toEqual([2]);
  });
  it("treats a missing status as active", () => {
    expect(m.active).toBe(true);
    expect(g.active).toBe(false);
    expect(buildRows([{ company_id: 3, name: "New" }])[0].active).toBe(true);
  });
});

describe("matchesFilters", () => {
  const [m, g] = buildRows([midal, gulf], sites, users);
  const none = { q: "", status: [], industries: [], regions: [] };
  it("searches name, contact and industry", () => {
    expect(matchesFilters(m, { ...none, q: "omar" })).toBe(true);
    expect(matchesFilters(m, { ...none, q: "metal" })).toBe(true);
    expect(matchesFilters(g, { ...none, q: "metal" })).toBe(false);
  });
  it("filters by status, industry and region (case-insensitive)", () => {
    expect(matchesFilters(g, { ...none, status: ["inactive"] })).toBe(true);
    expect(matchesFilters(m, { ...none, status: ["inactive"] })).toBe(false);
    expect(matchesFilters(m, { ...none, industries: ["metals"] })).toBe(true);
    expect(matchesFilters(m, { ...none, regions: ["India"] })).toBe(false);
  });
});

it("distinctValues drops blanks and duplicates that differ only in case", () => {
  expect(distinctValues(["GCC", " gcc ", "", null, "India"])).toEqual(["GCC", "India"]);
});

describe("edit draft", () => {
  it("requires name, address and contact; checks the email shape", () => {
    const d = { ...draftFrom(midal), name: " ", email: "nope" };
    expect(Object.keys(validate(d)).sort()).toEqual(["email", "name"]);
    expect(validate(draftFrom(midal))).toEqual({});
  });
  it("is not dirty after trimming back to the saved value", () => {
    expect(isDirty({ ...draftFrom(midal), name: "Midal Cables " }, midal)).toBe(false);
    expect(isDirty({ ...draftFrom(midal), esgMitraAccess: true }, midal)).toBe(true);
  });
  it("sends empty optional fields as null", () => {
    const p = toPayload({ ...draftFrom(midal), email: "  ", cin_number: " U123 " });
    expect(p.email).toBeNull();
    expect(p.cin_number).toBe("U123");
    expect(p.name).toBe("Midal Cables");
  });
});

describe("delete", () => {
  it("is blocked while the client still has sites", () => {
    expect(deleteBlocker({ sites: [sites[0]] })).toMatch(/1 site first/);
    expect(deleteBlocker({ sites: [] })).toBeNull();
  });
  it("lists the threshold as a cascade only when one is set", () => {
    expect(cascadeItems(true)).toHaveLength(1);
    expect(cascadeItems(false)).toEqual([]);
  });
});

it("parseThreshold accepts 2–5 with up to 2 decimals", () => {
  expect(parseThreshold("3.25")).toEqual({ value: 3.25 });
  expect(parseThreshold("5")).toEqual({ value: 5 });
  expect(parseThreshold("6")).toHaveProperty("error");
  expect(parseThreshold("1.5")).toHaveProperty("error");
  expect(parseThreshold("3.125")).toHaveProperty("error");
  expect(parseThreshold("")).toHaveProperty("error");
});
