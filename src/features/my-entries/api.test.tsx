// @vitest-environment jsdom
// D6a: the edit preview of a transport or travel entry includes the WTT the save adds, so
// the site's FERA factors are part of the form's setup: a failed fetch is an error with
// Try again, never a quiet preview without them.
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useEditSetup } from "./api";

const SITE = 3;
const TRAVEL = 9;
const FERA = 5;
let feraFails = false;

vi.mock("../../services/emissionFactorService", () => ({
  getUserEmissionFactorsBySiteAndCategory: vi.fn(async (_site: number, category: number) => {
    if (category === FERA && feraFails) throw new Error("502");
    return [{ emission_factor_id: category, emission_category_name: "Flight", factor_value: 0.2, year: 2024 }];
  }),
}));
vi.mock("../../services/columnConfigService", () => ({ getUserColumnConfigsBySiteAndCategory: vi.fn(async () => []) }));
vi.mock("../../services/unitService", () => ({ getUserUnitsBySiteAndCategory: vi.fn(async () => []), getUserUnitOptions: vi.fn(async () => null) }));

function setup(feraCategoryId: number | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useEditSetup(SITE, TRAVEL, 2024, feraCategoryId), { wrapper }).result;
}

describe("useEditSetup", () => {
  it("loads the site's FERA factors with the form", async () => {
    feraFails = false;
    const result = setup(FERA);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.feraFactors.map((f) => f.emission_factor_id)).toEqual([FERA]);
  });

  it("fails, so the form offers Try again, when the FERA factors don't load", async () => {
    feraFails = true;
    const result = setup(FERA);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("needs no FERA factors when the site has no FERA category", async () => {
    feraFails = true;
    const result = setup(null);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.feraFactors).toEqual([]);
  });
});
