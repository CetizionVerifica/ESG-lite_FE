import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateEmissionQueries } from "./emissionQueries";

describe("invalidateEmissionQueries", () => {
  it("marks every emission-derived query stale and leaves the rest", async () => {
    const client = new QueryClient();
    const keys = [
      ["overview", "b4", "CY2025", [], null],
      ["my-month", "current"],
      ["my-entries", {}],
      ["approvals-ledger", "counts", [1]],
      ["ghg-report", "tables", {}],
      ["add-data", "existing", 1, 2, "2025-09"],
      ["add-data", "setup", 1],
      ["notifications", "list"],
    ];
    for (const key of keys) client.setQueryData(key, 1);
    await invalidateEmissionQueries(client);
    const stale = keys.filter((key) => client.getQueryState(key)?.isInvalidated);
    expect(stale.map((k) => k[0] + (k[0] === "add-data" ? `/${k[1]}` : ""))).toEqual([
      "overview",
      "my-month",
      "my-entries",
      "approvals-ledger",
      "ghg-report",
      "add-data/existing",
    ]);
  });
});
