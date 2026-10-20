// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover, PopoverLayer } from "./Popover";
import { layerPosition } from "./popoverPosition";

afterEach(cleanup);

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const viewport = { width: 1280, height: 800 };

describe("layerPosition", () => {
  it("puts the panel under the trigger, aligned to its start", () => {
    expect(layerPosition(rect(100, 50, 120, 32), { width: 320, height: 300 }, viewport, "start")).toEqual({ top: 86, left: 100 });
  });

  it("aligns to the trigger's end", () => {
    expect(layerPosition(rect(900, 50, 120, 32), { width: 320, height: 300 }, viewport, "end")).toEqual({ top: 86, left: 700 });
  });

  it("keeps the panel on screen at the right edge", () => {
    expect(layerPosition(rect(1200, 50, 60, 32), { width: 320, height: 300 }, viewport, "start").left).toBe(1280 - 320 - 8);
  });

  it("opens above when there is no room below", () => {
    expect(layerPosition(rect(100, 700, 120, 32), { width: 320, height: 300 }, viewport, "start").top).toBe(700 - 4 - 300);
  });
});

function Picker({ name, children }: { name: string; children?: React.ReactNode }) {
  return (
    <Popover label={`${name} panel`} trigger={(t) => <button {...t}>{name}</button>}>
      {() => (
        <div>
          <input aria-label={`${name} search`} />
          {children}
        </div>
      )}
    </Popover>
  );
}

describe("Popover in a PopoverLayer", () => {
  it("draws the panel outside a clipping parent, in document.body", async () => {
    render(
      <PopoverLayer>
        <div data-testid="clip" style={{ overflow: "hidden", height: 44 }}>
          <Picker name="Insert data value" />
        </div>
      </PopoverLayer>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Insert data value" }));
    const panel = screen.getByRole("dialog", { name: "Insert data value panel" });
    expect(screen.getByTestId("clip").contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
    expect(panel.style.position).toBe("fixed");
    expect(document.activeElement).toBe(screen.getByLabelText("Insert data value search"));
  });

  it("stays open on a click inside, a nested popover included, and closes on a click outside", async () => {
    render(
      <PopoverLayer>
        <button>outside</button>
        <Picker name="Tools">
          <Picker name="Text colour" />
        </Picker>
      </PopoverLayer>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Tools" }));
    await userEvent.click(screen.getByLabelText("Tools search"));
    expect(screen.getByRole("dialog", { name: "Tools panel" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Text colour" }));
    await userEvent.click(screen.getByLabelText("Text colour search"));
    expect(screen.getByRole("dialog", { name: "Tools panel" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Text colour panel" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("dialog", { name: "Tools panel" })).toBeNull();
  });

  it("closes on Esc and gives focus back to the trigger", async () => {
    render(
      <PopoverLayer>
        <Picker name="Layout" />
      </PopoverLayer>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Layout" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Layout" }));
  });
});

describe("Popover without a layer", () => {
  it("keeps the panel inline, as before", async () => {
    render(<Picker name="Filter" />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = screen.getByRole("dialog", { name: "Filter panel" });
    expect(panel.parentElement?.parentElement).toBe(document.body.firstElementChild);
    expect(panel.className).toContain("absolute");
  });
});
