import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { readUnitOptions, unitsForRow } from "../../lib/emissions/unitOptions";
import { unitHandlers } from "./units";

const server = setupServer(...unitHandlers);
const API = "http://api.test";
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

describe("#183 unit options mocks", () => {
  it("answer the response shape the forms read, for Users and the Superadmin twin", async () => {
    for (const prefix of ["/user", "/admin"]) {
      const options = readUnitOptions(await (await fetch(`${API}${prefix}/units/site/4/category/1/by-activity`)).json());
      expect(unitsForRow(options, "HSD", null)?.units).toEqual(["litre", "kl", "gallon", "SCM"]);
      expect(unitsForRow(options, "Diesel", "kWh")?.notOffered).toBe("kWh");
    }
    const fixed = readUnitOptions(await (await fetch(`${API}/user/units/site/4/category/4/by-activity`)).json());
    expect(fixed?.fixed_unit).toBe("MWh");
  });

  it("refuse a category the site doesn't report", async () => {
    expect((await fetch(`${API}/user/units/site/4/category/9/by-activity`)).status).toBe(403);
  });
});
