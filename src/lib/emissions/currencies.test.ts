import { describe, expect, it } from "vitest";
import { CONVERTIBLE_CURRENCIES, extraFieldOptions } from "./currencies";

describe("currency options (S3-4)", () => {
  const field = { key: "currency", options: ["INR", "USD", "EUR", "GBP", "BHD", "SAR", "AED"] };

  it("offers only the currencies the engine converts, in the form's order", () => {
    expect(extraFieldOptions(field)).toEqual(["INR", "USD", "EUR"]);
    expect([...CONVERTIBLE_CURRENCIES]).toEqual(["INR", "USD", "EUR"]);
  });

  it("keeps a row's current value when it is an older, unconvertible one", () => {
    expect(extraFieldOptions(field, "GBP")).toEqual(["INR", "USD", "EUR", "GBP"]);
    expect(extraFieldOptions(field, "USD")).toEqual(["INR", "USD", "EUR"]);
  });

  it("leaves other fields' options alone", () => {
    expect(extraFieldOptions({ key: "vehicle", options: ["Car", "Bus"] })).toEqual(["Car", "Bus"]);
    expect(extraFieldOptions({ key: "currency" })).toEqual([]);
  });
});
