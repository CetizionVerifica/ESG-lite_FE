// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AuditTimeline } from "./AuditTimeline";
import { CommandPalette } from "./CommandPalette";
import { DocumentViewer } from "./DocumentViewer";
import { FileDrop, type FileDropItem } from "./FileDrop";
import { Stepper } from "./Stepper";
import { UnitInput, type UnitInputValue } from "./UnitInput";
import type { AuditLogEntry } from "../services/auditLogService";

afterEach(cleanup);

describe("Stepper", () => {
  const steps = [
    { id: "source", label: "Source" },
    { id: "details", label: "Details" },
    { id: "review", label: "Review" },
  ];
  it("marks the current step and lets completed steps be revisited", async () => {
    const onStepChange = vi.fn();
    render(<Stepper steps={steps} current={1} completed={["source"]} onStepChange={onStepChange} />);
    expect(screen.getAllByRole("listitem")[1].getAttribute("aria-current")).toBe("step");
    await userEvent.setup().click(screen.getByRole("button", { name: /Source/ }));
    expect(onStepChange).toHaveBeenCalledWith(0);
    expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
  });
  it("respects a custom jump rule", () => {
    render(<Stepper steps={steps} current={0} onStepChange={() => {}} canJump={() => true} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

describe("UnitInput", () => {
  function Harness({ expected, initial = { value: 2, unit: "mwh" } }: { expected: string; initial?: UnitInputValue }) {
    const [v, setV] = useState<UnitInputValue>(initial);
    return (
      <>
        <UnitInput label="Electricity" value={v} onChange={setV} units={["kwh", "mwh", "litre"]} expectedUnit={expected} />
        <output data-testid="v">{JSON.stringify(v)}</output>
      </>
    );
  }
  it("offers a conversion to the expected unit and applies it", async () => {
    render(<Harness expected="kwh" />);
    expect(screen.getByText(/1 mwh = 1,000 kwh/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Convert to kwh" }));
    expect(screen.getByTestId("v").textContent).toBe('{"value":2000,"unit":"kwh"}');
    expect((screen.getByLabelText("Electricity") as HTMLInputElement).value).toBe("2000");
  });
  it("converts without float noise", async () => {
    render(<Harness expected="mwh" initial={{ value: 123.4, unit: "kwh" }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Convert to mwh" }));
    expect(screen.getByTestId("v").textContent).toBe('{"value":0.1234,"unit":"mwh"}');
  });
  it("flags a unit that can't convert", async () => {
    render(<Harness expected="kwh" />);
    await userEvent.setup().selectOptions(screen.getByLabelText("Unit"), "litre");
    expect(screen.getByLabelText("Electricity").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/This factor needs kwh/)).toBeTruthy();
  });
});

describe("FileDrop", () => {
  it("adds accepted files, reports rejected ones and removes items", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const pdf = new File(["%PDF"], "bill.pdf", { type: "application/pdf" });
    const exe = new File(["x"], "virus.exe", { type: "application/x-msdownload" });
    const items: FileDropItem[] = [{ id: "1", file: pdf, status: "uploading", progress: 40 }, { id: "2", file: pdf, status: "done" }];
    render(<FileDrop label="Upload the bill" accept={["application/pdf"]} items={items} onAdd={onAdd} onRemove={onRemove} />);
    await user.upload(screen.getByLabelText("Upload the bill"), [pdf, exe]);
    expect(onAdd).toHaveBeenCalledWith([pdf]);
    expect(screen.getByRole("alert").textContent).toContain("virus.exe: This file type isn't allowed.");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getAllByRole("button", { name: "Remove bill.pdf" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Remove bill.pdf" }));
    expect(onRemove).toHaveBeenCalledWith("2");
  });
  it("accepts dropped files", () => {
    const onAdd = vi.fn();
    render(<FileDrop label="Drop" items={[]} onAdd={onAdd} />);
    const file = new File(["a"], "a.png", { type: "image/png" });
    fireEvent.drop(screen.getByText("Drop").parentElement!, { dataTransfer: { files: [file] } });
    expect(onAdd).toHaveBeenCalledWith([file]);
  });
});

describe("DocumentViewer", () => {
  const files = [
    { name: "a.png", url: "https://x/a.png", type: "image/png", size: 2048 },
    { name: "b.csv", url: "https://x/b.csv", type: "text/csv" },
  ];
  it("navigates with arrows, offers download for unpreviewable files, closes on Esc", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<DocumentViewer open file={files[0]} files={files} onNavigate={onNavigate} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "a.png" })).toBeTruthy();
    expect(screen.getByText("2 KB · 1 of 2")).toBeTruthy();
    await user.keyboard("{ArrowRight}");
    expect(onNavigate).toHaveBeenCalledWith(files[1]);
    rerender(<DocumentViewer open file={files[1]} files={files} onNavigate={onNavigate} onClose={onClose} />);
    expect(screen.getByText("No preview for this file type.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download b.csv" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AuditTimeline", () => {
  const entry: AuditLogEntry = {
    id: 1,
    entity_type: "emission",
    entity_id: 9,
    action: "manager_edit",
    changed_fields: { quantity: { old: 100, new: 120 }, category_name: { old: "a", new: "b" } },
    reason: "Meter re-read",
    changed_by: { user_id: 2, name: "Rahul Menon", email: "r@x", role: "manager" },
    changed_at: "2025-09-14T09:05:00",
  };
  it("shows who, what changed old → new, and why", () => {
    render(<AuditTimeline entries={[entry]} />);
    expect(screen.getByText("Rahul Menon")).toBeTruthy();
    expect(screen.getByText("Manager edit")).toBeTruthy();
    expect(screen.getByText("Quantity")).toBeTruthy();
    expect(screen.queryByText("Category name")).toBeNull();
    expect(screen.getByText("Meter re-read")).toBeTruthy();
    expect(screen.getByText("14 Sep 2025, 09:05")).toBeTruthy();
  });
  it("has empty and error states", () => {
    const { rerender } = render(<AuditTimeline entries={[]} />);
    expect(screen.getByText("No changes since this was created.")).toBeTruthy();
    rerender(<AuditTimeline entries={[]} error="Couldn't load the change history." />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("CommandPalette", () => {
  const commands = [
    { id: "r:/approvals", label: "Approvals", group: "Data", keywords: "review pending" },
    { id: "r:/sites", label: "Sites", group: "Setup", keywords: "locations" },
    { id: "r:/reports", label: "GHG report", group: "Reports", keywords: "inventory" },
  ];
  it("shows recent first, filters by keywords and runs with Enter", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<CommandPalette open onClose={() => {}} commands={commands} recent={["r:/reports"]} onRun={onRun} />);
    expect(screen.getByRole("group", { name: "Recent" }).textContent).toContain("GHG report");
    await user.type(screen.getByRole("combobox", { name: "Search" }), "locat");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(onRun).toHaveBeenCalledWith(commands[1]);
  });
  it("moves with arrows, shows entity results and closes on Esc", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRun = vi.fn();
    const results = [{ id: "site:4", label: "Hidd smelter", group: "Sites", hint: "Site" }];
    render(<CommandPalette open onClose={onClose} commands={commands} onRun={onRun} results={results} />);
    await user.type(screen.getByRole("combobox"), "e");
    await user.keyboard("{ArrowUp}{Enter}");
    expect(onRun).toHaveBeenCalledWith(results[0]);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
