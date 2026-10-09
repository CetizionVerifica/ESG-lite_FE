// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Modal } from "./Modal";
import { Drawer } from "./Drawer";
import { Popover } from "./Popover";
import { Combobox } from "./fields";

afterEach(cleanup);

function ModalHarness({ onConfirm = () => {}, loading = false }: { onConfirm?: () => void; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete entry?"
        description="This can't be undone."
        tone="destructive"
        primaryAction={{ label: "Delete", onClick: onConfirm, loading }}
      />
    </>
  );
}

describe("Modal", () => {
  it("moves focus in, traps Tab, closes on Esc and restores focus", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByText("Open");
    await user.click(opener);
    const dialog = screen.getByRole("alertdialog", { name: "Delete entry?" });
    expect(dialog).toHaveProperty("ariaModal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);

    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("runs the destructive action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ModalHarness onConfirm={onConfirm} />);
    await user.click(screen.getByText("Open"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("reads the live busy state on Esc, not the one from when it opened", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const props = { open: true, onClose, title: "Save?" };
    const { rerender } = render(<Modal {...props} primaryAction={{ label: "Save", onClick: () => {} }} />);
    rerender(<Modal {...props} primaryAction={{ label: "Save", onClick: () => {}, loading: true }} />);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    rerender(<Modal {...props} primaryAction={{ label: "Save", onClick: () => {} }} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("can't be dismissed while the action is busy", async () => {
    const user = userEvent.setup();
    render(<ModalHarness loading />);
    await user.click(screen.getByText("Open"));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("modal-backdrop"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});

describe("Drawer", () => {
  it("closes on Esc and on the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Electricity · Sep 2025">
        <input aria-label="Amount" />
      </Drawer>,
    );
    expect(screen.getByRole("dialog", { name: "Electricity · Sep 2025" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("lets an open Combobox inside take Esc without closing the drawer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const options = [{ value: 1, label: "Sitra" }, { value: 2, label: "Hidd" }];
    render(
      <Drawer open onClose={onClose} title="Entry">
        <Combobox label="Site" value={null} onChange={() => {}} options={options} />
      </Drawer>,
    );
    await user.click(screen.getByRole("combobox", { name: "Site" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("lets an open Popover inside take Esc without closing the drawer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Entry">
        <Popover label="Period" trigger={(t) => <button {...t}>Period</button>}>
          {() => <button>Sep 2025</button>}
        </Popover>
      </Drawer>,
    );
    await user.click(screen.getByRole("button", { name: "Period" }));
    expect(screen.getByRole("dialog", { name: "Period" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Period" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows loading, then error with retry, without the footer", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<Drawer open onClose={() => {}} title="Entry" loading footer={<button>Approve</button>} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("Approve")).toBeNull();

    rerender(<Drawer open onClose={() => {}} title="Entry" error="Couldn't load this entry." onRetry={onRetry} footer={<button>Approve</button>} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load this entry.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText("Approve")).toBeNull();
  });
});
