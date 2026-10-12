import { describe, expect, it } from "vitest";
import { categoryParams } from "./emissionService";

describe("categoryParams", () => {
  it("sends one category the old way and several as a sorted list", () => {
    expect(categoryParams(null)).toEqual({});
    expect(categoryParams([])).toEqual({});
    expect(categoryParams(7)).toEqual({ categoryId: 7 });
    expect(categoryParams([7])).toEqual({ categoryId: 7 });
    expect(categoryParams([12, 3, 12])).toEqual({ categoryIds: "3,12" });
  });
});
