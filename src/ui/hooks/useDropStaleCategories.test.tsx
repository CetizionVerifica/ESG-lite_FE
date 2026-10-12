// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useDropStaleCategories } from "./useDropStaleCategories";

const options = [
  { value: 2, label: "Fuel" },
  { value: 5, label: "FERA" },
];

function setup(url: string, categories: typeof options, ready: boolean) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  return renderHook(
    () => {
      useDropStaleCategories(categories, ready);
      return decodeURIComponent(useLocation().search);
    },
    { wrapper },
  );
}

describe("useDropStaleCategories", () => {
  it("drops only the ids the options don't have", () => {
    expect(setup("/x?category=2,9,5", options, true).result.current).toBe("?category=2,5");
  });

  it("clears to all when none of the ids is offered", () => {
    expect(setup("/x?category=9", options, true).result.current).toBe("?category=all");
  });

  it("leaves the URL alone until the options are ready", () => {
    expect(setup("/x?category=2,9", [], false).result.current).toBe("?category=2,9");
  });
});
