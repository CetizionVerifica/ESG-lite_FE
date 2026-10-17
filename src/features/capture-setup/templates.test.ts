import { describe, expect, it } from "vitest";
import { type CopySource, type TargetResult, applicable, siteChoices, targetLine } from "./templates";

const midal = { company_id: 1, name: "Midal Cables" };
const acme = { company_id: 2, name: "Acme" };
const fuel = { category_id: 10, category_name: "Stationary combustion" };
const power = { category_id: 20, category_name: "Purchased electricity" };
const SITES = [
  { site_id: 1, name: "Hidd", company: midal, categories: [fuel, power] },
  { site_id: 4, name: "Muharraq", company: midal, categories: [fuel] },
  { site_id: 2, name: "Sitra", company: midal, categories: [power] },
  { site_id: 3, name: "Dallas", company: acme, categories: [fuel] },
];
const form: CopySource = { kind: "form", id: 7, name: "Hidd fuel", company_id: 1, category_id: 10, category_name: "Stationary combustion", site_id: 1 };
const check = (errors = 0) => ({ ok: errors === 0, errors: Array.from({ length: errors }, (_, i) => ({ code: "NO_FACTOR_FOR_YEAR", field: `f${i}`, message: "m" })), warnings: [], form_id: null, year: 2025, version: null });
const target = (over: Partial<TargetResult>): TargetResult => ({ site_id: 2, site_name: "Sitra", action: "create", form_id: null, saved_rows: 0, check: check(), ...over });

describe("siteChoices", () => {
  it("a form or a client's template offers that client's sites, each with why it can't take it", () => {
    expect(siteChoices(SITES, form)).toEqual([
      {
        client: "Midal Cables",
        choices: [
          { site: SITES[0], reason: "The form's own site" },
          { site: SITES[1], reason: null },
          { site: SITES[2], reason: "Doesn't report Stationary combustion" },
        ],
      },
    ]);
  });

  it("a template for every client offers every client's sites, by client", () => {
    const groups = siteChoices(SITES, { ...form, kind: "template", company_id: null, site_id: undefined });
    expect(groups.map((g) => [g.client, g.choices.map((c) => [c.site.name, c.reason])])).toEqual([
      ["Acme", [["Dallas", null]]],
      ["Midal Cables", [["Hidd", null], ["Muharraq", null], ["Sitra", "Doesn't report Stationary combustion"]]],
    ]);
  });
});

describe("targetLine and applicable", () => {
  it("reads each target in plain words", () => {
    expect(targetLine(target({}))).toEqual({ tone: "good", text: "Creates its form. Passes the check." });
    expect(targetLine(target({ action: "update", saved_rows: 12 })).text).toBe("Updates its form; 12 saved rows keep their values. Passes the check.");
    expect(targetLine(target({ action: "update", saved_rows: 1 })).text).toBe("Updates its form; 1 saved row keeps its values. Passes the check.");
    expect(targetLine(target({ action: "create", saved_rows: 22 })).text).toBe("Creates its form; 22 saved rows were entered without one and keep their values. Passes the check.");
    expect(targetLine(target({ action: "create", saved_rows: 1 })).text).toBe("Creates its form; 1 saved row was entered without one and keeps its values. Passes the check.");
    expect(targetLine(target({ check: check(2) }))).toEqual({ tone: "bad", text: "2 problems: not applied" });
    expect(targetLine(target({ refused: "This site belongs to another client.", action: null, check: null }))).toEqual({ tone: "muted", text: "This site belongs to another client." });
    expect(targetLine(target({ status: "applied", version: 3 }))).toEqual({ tone: "good", text: "Form created, version 3 live" });
    expect(targetLine(target({ status: "applied", action: "update" })).text).toBe("Form updated");
  });

  it("only the targets that pass and the site can take are applied", () => {
    const ts = [target({ site_id: 2 }), target({ site_id: 4, check: check(1) }), target({ site_id: 3, refused: "x", check: null })];
    expect(applicable(ts).map((t) => t.site_id)).toEqual([2]);
  });
});
