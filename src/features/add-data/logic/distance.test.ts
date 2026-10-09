import { describe, expect, it } from "vitest";
import { toFormModel } from "../../../lib/emissions/form";
import type { ColumnConfig, ColumnEntity } from "../../../lib/emissions/types";
import { distanceFieldFor, distanceTarget, modeDistance, withCompositeProduct } from "./distance";

const col = (pk_id: number, column_name: string, column_type = "number"): ColumnEntity => ({ pk_id, column_name, column_type });
const travel: ColumnConfig = {
  pk_id: 1,
  config_name: "Business travel",
  columns: [col(1, "mode", "select"), col(2, "Activity Data"), col(3, "notes", "text")],
  column_options: { "1": [{ id: "car", label: "Car" }] },
};
const freight: ColumnConfig = {
  pk_id: 2,
  config_name: "Freight",
  columns: [col(1, "weight"), col(2, "distance")],
  calculation: { mode: "per_method", method_column: "m", methods: { a: { multiply: ["weight", "distance"], activity_unit: "tonne.km" } } },
} as ColumnConfig;

describe("distance fields", () => {
  it("splits the first plain number column for composite units, like the legacy page", () => {
    const m = toFormModel(travel);
    expect(distanceFieldFor(m, { id: 1, activity_data_unit: "passenger.km" }, travel.columns[1])).toEqual({ kind: "composite", multiplier: "passenger", distance: "km" });
    expect(distanceFieldFor(m, { id: 1, activity_data_unit: "km" }, travel.columns[1])).toEqual({ kind: "plain" });
    expect(distanceFieldFor(m, { id: 1, activity_data_unit: "litre" }, travel.columns[1])).toBeNull();
    expect(distanceFieldFor(m, { id: 1, activity_data_unit: "km" }, travel.columns[2])).toBeNull();
  });

  it("puts it on the distance column for spec categories, without the count × distance split", () => {
    const m = toFormModel(freight);
    expect(distanceFieldFor(m, { id: 1, activity_data_unit: "tonne.km" }, freight.columns[1])).toEqual({ kind: "plain" });
    expect(distanceFieldFor(m, { id: 1, activity_data_unit: "tonne.km" }, freight.columns[0])).toBeNull();
  });

  it("keeps count × distance in the column, rounded to 2 decimals", () => {
    let row = withCompositeProduct({ id: 1, "Activity Data__multiplier": "3", "Activity Data__distance": "" }, "Activity Data__multiplier");
    expect(row["Activity Data"]).toBe("");
    row = withCompositeProduct({ ...row, "Activity Data__distance": "12.345" }, "Activity Data__distance");
    expect(row["Activity Data"]).toBe("37.04");
    expect(withCompositeProduct({ id: 1, x: "1" }, "x")).toEqual({ id: 1, x: "1" });
    expect(distanceTarget({ kind: "composite", multiplier: "p", distance: "km" }, "Activity Data")).toBe("Activity Data__distance");
  });
});

describe("drawer distances", () => {
  const base = { straightMeters: 100_000, roadMeters: null, seaMeters: null, failed: false };
  it("converts to the row's unit and labels estimates", () => {
    expect(modeDistance("air", base, "km")).toMatchObject({ value: 100, estimate: false });
    expect(modeDistance("road", { ...base, roadMeters: 123_456 }, "miles")?.value).toBe(76.71);
    expect(modeDistance("rail", { ...base, roadMeters: 123_456 }, "km")).toMatchObject({ value: 123.46, estimate: true });
    expect(modeDistance("rail", { ...base, failed: true }, "km")).toMatchObject({ value: 120, estimate: true });
    expect(modeDistance("rail", base, "km")).toBeNull();
  });

  it("falls back to the straight line at sea when the route service fails", () => {
    expect(modeDistance("sea", { ...base, seaMeters: 185_200 }, "km")).toMatchObject({ value: 185.2, estimate: false, nauticalMiles: 100 });
    expect(modeDistance("sea", { ...base, failed: true }, "km")).toMatchObject({ value: 100.01, estimate: true, nauticalMiles: 54 }) // legacy rounds to nautical miles first;
    expect(modeDistance("sea", base, "km")).toBeNull();
    expect(modeDistance("air", base, "litre")).toBeNull();
  });
});
