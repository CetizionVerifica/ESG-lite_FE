import { describe, expect, it } from "vitest";
import { toMatrix } from "../../ui";
import { factorColumns, factorExportColumns } from "./components/columns";
import { EXPORT_PAGE_SIZE, type Factor, type FactorPage, type ListParams, fetchAllFactors } from "./logic";

const factor = (id: number, extra: Partial<Factor> = {}): Factor => ({
  emission_factor_id: id,
  year: 2025,
  factor_value: "2.68",
  denominator_unit: "litre",
  ...extra,
});

describe("fetchAllFactors", () => {
  it("pages through every factor with the list filters and the largest page size", async () => {
    const all = Array.from({ length: 450 }, (_, i) => factor(i + 1));
    const calls: ListParams[] = [];
    const fetchPage = async (p: ListParams): Promise<FactorPage> => {
      calls.push(p);
      const page = p.page ?? 1;
      const limit = p.limit ?? 50;
      return { data: all.slice((page - 1) * limit, page * limit), total: all.length, page, limit, totalPages: Math.ceil(all.length / limit) };
    };
    const rows = await fetchAllFactors({ page: 3, limit: 50, site_id: 7, factor_type: "wtt" }, fetchPage);
    expect(rows).toHaveLength(450);
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3]);
    expect(calls.every((c) => c.limit === EXPORT_PAGE_SIZE && c.site_id === 7 && c.factor_type === "wtt")).toBe(true);
  });

  it("stops on an empty page", async () => {
    const rows = await fetchAllFactors({ page: 1, limit: 50 }, async () => ({ data: [], total: 5, page: 1, limit: 200, totalPages: 9 }));
    expect(rows).toEqual([]);
  });
});

describe("factorExportColumns", () => {
  it("always includes Type, GWP and the other metadata, never the edit button", () => {
    const cols = factorExportColumns(factorColumns({ batches: [], onEdit: () => {} }));
    const ids = cols.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["type", "gwp", "geography", "dataset", "dataset_version", "co2_kg", "ch4_kg", "n2o_kg", "other_kgco2e", "biogenic_co2_kg", "includes_wtt"]));
    expect(ids).not.toContain("edit");
    const [head, row] = toMatrix(
      [factor(1, { factor_type: "wtt", gwp_set: "AR6", geography: "GB", co2_kg: "2.5", includes_wtt: false })],
      cols,
    );
    const at = (h: string) => row[head.indexOf(h)];
    expect(at("GWP")).toBe("AR6");
    expect(at("Type")).not.toBe("");
    expect(at("Geography")).toBe("GB");
    expect(at("CO₂ (kg)")).toBe(2.5);
    expect(at("CH₄ (kg)")).toBe("");
    expect(at("Includes WTT")).toBe("No");
  });
});
