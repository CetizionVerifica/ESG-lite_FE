import { describe, expect, it, vi } from "vitest";

const getEmissionsPaginated = vi.fn();
vi.mock("../../services/emissionService", () => ({ getEmissionsPaginated: (p: unknown) => getEmissionsPaginated(p) }));

const { feraCategoryIds, fetchPendingForApproval } = await import("./pendingCount");

describe("pending count for approvals", () => {
  it("finds the FERA categories on the sites", () => {
    const sites = [
      { categories: [{ category_id: 3, category_name: "Fuel" }, { category_id: 9, category_name: "FERA" }] },
      { categories: [{ category_id: 9, category_name: "FERA" }] },
      {},
    ];
    expect(feraCategoryIds(sites)).toEqual([9]);
  });

  it("leaves pending FERA twins out, as the list folds them away", async () => {
    getEmissionsPaginated.mockImplementation(async (p: { categoryId?: number }) => ({
      summary: { pending_count: p.categoryId === 9 ? 1 : 3 },
    }));
    expect(await fetchPendingForApproval([1, 2], [9])).toBe(2);
    expect(getEmissionsPaginated).toHaveBeenCalledWith({ siteIds: [1, 2], categoryId: 9, status: "pending", page: 1, limit: 1 });
  });

  it("asks once when there is no FERA category", async () => {
    getEmissionsPaginated.mockReset();
    getEmissionsPaginated.mockResolvedValue({ summary: { pending_count: 4 } });
    expect(await fetchPendingForApproval([1], [])).toBe(4);
    expect(getEmissionsPaginated).toHaveBeenCalledTimes(1);
  });
});
