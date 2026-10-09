// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ContextChips } from "./ContextChips";

afterEach(cleanup);

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

const sites = [
  { value: 1, label: "Hidd smelter" },
  { value: 2, label: "Sitra rod mill" },
];

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ContextChips chips={["period", "site", "scope"]} sites={sites} />
      <Search />
    </MemoryRouter>,
  );
}

const search = () => decodeURIComponent(screen.getByTestId("search").textContent ?? "");

describe("ContextChips", () => {
  it("reads the period and sites from the URL", () => {
    renderAt("/x?period=FY2025&site=2");
    expect(screen.getByRole("button", { name: /Period: FY 2025-26/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Site: Sitra rod mill/ })).toBeTruthy();
  });

  it("steps the period with the arrows", async () => {
    const user = userEvent.setup();
    renderAt("/x?period=2025-01&tab=a");
    await user.click(screen.getByRole("button", { name: "Previous period" }));
    expect(search()).toBe("?period=2024-12&tab=a");
  });

  it("switches to a quarter in the editor and applies it", async () => {
    const user = userEvent.setup();
    renderAt("/x?period=2025-08");
    await user.click(screen.getByRole("button", { name: /Period:/ }));
    await user.click(screen.getByRole("radio", { name: "Quarter" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(search()).toBe("?period=2025-Q3");
    expect(screen.getByRole("button", { name: /Period: Q3 2025/ })).toBeTruthy();
  });

  it("applies a custom range", async () => {
    const user = userEvent.setup();
    renderAt("/x?period=2025-08");
    await user.click(screen.getByRole("button", { name: /Period:/ }));
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    expect(search()).toBe("?period=2025-08");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(search()).toBe("?period=2025-08-01_2025-08-01");
  });

  it("picks sites and scope, and Esc closes the editor", async () => {
    const user = userEvent.setup();
    renderAt("/x");
    await user.click(screen.getByRole("button", { name: /Site: All sites/ }));
    await user.click(screen.getByRole("checkbox", { name: "Sitra rod mill" }));
    await user.click(screen.getByRole("checkbox", { name: "Hidd smelter" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(search()).toBe("?site=1,2");
    await user.click(screen.getByRole("button", { name: /Scope: All scopes/ }));
    await user.click(screen.getByRole("radio", { name: "Scope 2" }));
    expect(search()).toBe("?site=1,2&scope=2");
    await user.click(screen.getByRole("button", { name: /Scope:/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
