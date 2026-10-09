// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { FilterBar, type FilterDef } from "./FilterBar";
import { EMPTY_FILTERS, type FilterValues } from "./filterLogic";
import { useFilterParams } from "./hooks/useFilterParams";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const FILTERS: FilterDef[] = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" },
    ],
  },
  { key: "source", label: "Source", multiple: false, options: [{ value: "manual", label: "Manual" }, { value: "bill", label: "From a bill" }] },
];

function Harness({ onChange, storageKey }: { onChange?: (v: FilterValues) => void; storageKey?: string }) {
  const [value, setValue] = useState<FilterValues>(EMPTY_FILTERS);
  return (
    <FilterBar
      filters={FILTERS}
      value={value}
      storageKey={storageKey}
      searchDelay={0}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe("FilterBar", () => {
  it("selects options from a chip and summarises them", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Status:/ }));
    await user.click(screen.getByLabelText("Pending"));
    await user.click(screen.getByLabelText("Approved"));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /Status:/ }).textContent).toContain("Pending +1");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Status:/ }));
  });

  it("keeps one value for a single-choice filter and closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Source:/ }));
    await user.click(screen.getByLabelText("Manual"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Source:/ }));
    await user.click(screen.getByLabelText("From a bill"));
    expect(screen.getByRole("button", { name: /Source:/ }).textContent).toContain("From a bill");
  });

  it("debounces search and clears everything", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter>
        <FilterBar filters={FILTERS} value={{ q: "", filters: { status: ["pending"] } }} onChange={onChange} />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole("searchbox"), "coal");
    expect(onChange).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenLastCalledWith({ q: "coal", filters: { status: ["pending"] } });
    await user.click(screen.getByRole("button", { name: /Clear all/ }));
    expect(onChange).toHaveBeenLastCalledWith({ q: "", filters: {} });
    vi.useRealTimers();
  });

  it("saves, applies and deletes a view in this browser", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness storageKey="t" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /Views/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Status:/ }));
    await user.click(screen.getByLabelText("Pending"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /Views/ }));
    await user.click(screen.getByRole("menuitem", { name: "Save current view…" }));
    await user.type(screen.getByLabelText("Name"), "Pending only");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(JSON.parse(localStorage.getItem("fb:t")!)[0].name).toBe("Pending only");
    expect(screen.getByRole("button", { name: /Pending only/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Clear all/ }));
    await user.click(screen.getByRole("button", { name: /Views/ }));
    await user.click(screen.getByRole("menuitem", { name: "Pending only" }));
    expect(onChange).toHaveBeenLastCalledWith({ q: "", filters: { status: ["pending"] } });

    await user.click(screen.getByRole("button", { name: /Pending only/ }));
    await user.click(screen.getByRole("menuitem", { name: 'Delete "Pending only"' }));
    expect(JSON.parse(localStorage.getItem("fb:t")!)).toEqual([]);
  });
});

describe("useFilterParams", () => {
  function UrlHarness() {
    const [value, setValue] = useFilterParams(["status"]);
    const location = useLocation();
    return (
      <>
        <FilterBar filters={FILTERS.slice(0, 1)} value={value} onChange={setValue} searchDelay={0} />
        <output>{location.search}</output>
      </>
    );
  }

  it("reads and writes the URL, keeping the page context", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/x?period=2025-09&status=approved"]}>
        <UrlHarness />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /Status:/ }).textContent).toContain("Approved");
    await user.click(screen.getByRole("button", { name: /Status:/ }));
    await user.click(screen.getByLabelText("Pending"));
    expect(document.querySelector("output")!.textContent).toBe("?period=2025-09&status=approved%2Cpending");
  });
});
