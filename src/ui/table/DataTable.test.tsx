// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "./DataTable";
import type { Column } from "./types";

type Row = { id: number; site: string; t: number };
const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, site: `Site ${String(i + 1).padStart(2, "0")}`, t: (i * 37) % 100 }));
const columns: Column<Row>[] = [
  { id: "site", header: "Site", value: (r) => r.site, sortable: true },
  { id: "t", header: "Emissions", value: (r) => r.t, numeric: true, sortable: true },
];

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const bodyRows = () => screen.getAllByRole("row").slice(1);

describe("DataTable", () => {
  it("paginates on the client and shows the range", async () => {
    const user = userEvent.setup();
    render(<DataTable label="Entries" rows={rows} columns={columns} getRowId={(r) => r.id} pagination={{ mode: "client", pageSize: 10 }} />);
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText("1–10 of 30")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("11–20 of 30")).toBeTruthy();
    expect(within(bodyRows()[0]).getByText("Site 11")).toBeTruthy();
  });

  it("sorts by a column header, with aria-sort and right-aligned mono numbers", async () => {
    const user = userEvent.setup();
    render(<DataTable label="Entries" rows={rows} columns={columns} getRowId={(r) => r.id} pagination={{ mode: "client", pageSize: 50 }} />);
    await user.click(screen.getByRole("button", { name: /Emissions/ }));
    await user.click(screen.getByRole("button", { name: /Emissions/ }));
    expect(screen.getByRole("columnheader", { name: /Emissions/ }).getAttribute("aria-sort")).toBe("descending");
    const firstCell = within(bodyRows()[0]).getAllByRole("cell")[1];
    expect(firstCell.textContent).toBe("99");
    expect(firstCell.className).toContain("text-right");
    expect(firstCell.className).toContain("font-num");
  });

  it("selects rows, shows the bulk bar and clears", async () => {
    const user = userEvent.setup();
    const approve = vi.fn();
    render(
      <DataTable
        label="Entries"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        pagination={{ mode: "client", pageSize: 10 }}
        bulkActions={(sel, clear) => <button onClick={() => (approve(sel.map((r) => r.id)), clear())}>Approve</button>}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Select Site 02" }));
    await user.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
    expect(screen.getByText("10 selected")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(approve).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
  });

  it("opens a row with click or Enter, but not from its checkbox", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    render(<DataTable label="Entries" rows={rows.slice(0, 3)} columns={columns} getRowId={(r) => r.id} selectable onRowClick={open} />);
    await user.click(screen.getByRole("checkbox", { name: "Select Site 01" }));
    expect(open).not.toHaveBeenCalled();
    await user.click(screen.getByText("Site 02"));
    bodyRows()[2].focus();
    await user.keyboard("{Enter}");
    expect(open.mock.calls.map(([r]) => r.id)).toEqual([2, 3]);
  });

  it("hides a column from the picker and remembers density", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DataTable label="Entries" rows={rows.slice(0, 2)} columns={columns} getRowId={(r) => r.id} storageKey="test" />);
    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "Emissions" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("columnheader", { name: /Emissions/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Comfortable" }));
    unmount();
    const { container } = render(<DataTable label="Entries" rows={rows.slice(0, 2)} columns={columns} getRowId={(r) => r.id} storageKey="test" />);
    expect(screen.queryByRole("columnheader", { name: /Emissions/ })).toBeNull();
    expect(container.querySelector("[data-density=compact]")).toBeTruthy();
  });

  it("shows loading, error with retry, and empty states", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const props = { label: "Entries", columns, getRowId: (r: Row) => r.id };
    const { rerender } = render(<DataTable {...props} rows={[]} loading />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<DataTable {...props} rows={[]} error="Couldn't load entries." onRetry={retry} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    rerender(<DataTable {...props} rows={[]} />);
    expect(screen.getByText("Nothing to show yet.")).toBeTruthy();
  });

  it("asks the server for pages and sorts in server mode", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onSortChange = vi.fn();
    render(
      <DataTable
        label="Entries"
        rows={rows.slice(0, 10)}
        columns={columns}
        getRowId={(r) => r.id}
        sort={null}
        onSortChange={onSortChange}
        pagination={{ mode: "server", page: 0, pageSize: 10, total: 95, onPageChange }}
      />,
    );
    expect(screen.getByText("1–10 of 95")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: /Site/ }));
    expect(onSortChange).toHaveBeenCalledWith({ id: "site", dir: "asc" });
  });
});
