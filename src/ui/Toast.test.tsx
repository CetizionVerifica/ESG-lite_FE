// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { Drawer } from "./Drawer";
import { ToastProvider } from "./Toast";
import { useToast } from "./toastStore";

afterEach(cleanup);

function Harness({ side = "right" as "left" | "right" }) {
  const [open, setOpen] = useState(true);
  const { toast } = useToast();
  useEffect(() => {
    toast({ title: "Entry approved", action: { label: "Undo", onClick: () => undefined } });
  }, [toast]);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        toggle
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Entry" side={side} footer={<button type="button">Reject</button>}>
        body
      </Drawer>
    </>
  );
}

const viewport = () => screen.getByRole("list", { name: "Notifications" });

describe("Toasts and an open drawer (F-19)", () => {
  it("move beside a right-side drawer, clear of its footer, and back when it closes", async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    expect(await screen.findByText("Entry approved")).toBeTruthy();
    expect(viewport().dataset.besideDrawer).toBe("true");
    expect(viewport().className).toContain("sm:items-start");
    act(() => screen.getByRole("button", { name: "toggle" }).click());
    expect(viewport().dataset.besideDrawer).toBeUndefined();
    expect(viewport().className).toContain("sm:items-end");
  });

  it("stay bottom-right beside a left navigation drawer", async () => {
    render(
      <ToastProvider>
        <Harness side="left" />
      </ToastProvider>,
    );
    expect(await screen.findByText("Entry approved")).toBeTruthy();
    expect(viewport().dataset.besideDrawer).toBeUndefined();
  });
});
