// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTerm, InfoTip } from "./InfoTerm";
import { GLOSSARY, findTerm, glossaryEntry } from "./glossary";
import { LOCALE_STORAGE_KEY, infoLanguageEnabled, resetGlossaryLocaleForTests, setGlossaryLocale } from "./glossaryLocale";
import { GLOSSARY_TRANSLATIONS } from "./glossaryTranslations";
import { KpiStrip } from "./KpiStrip";
import { DataTable } from "./table";
import { TextField } from "./fields";
import { Drawer } from "./Drawer";

afterEach(cleanup);

describe("glossary", () => {
  it("matches terms and aliases exactly, ignoring case and CO2 spelling", () => {
    expect(findTerm("Scope 1")).toBe("scope1");
    expect(findTerm("scope 2")).toBe("scope2");
    expect(findTerm("tCO2e")).toBe("tco2e");
    expect(findTerm("Emission factors")).toBe("emissionFactor");
    expect(findTerm("Scope 1 emissions")).toBeNull();
    expect(findTerm(42)).toBeNull();
  });

  it("never auto-matches manual entries such as status words", () => {
    expect(findTerm("Status")).toBeNull();
    expect(findTerm("Pending")).toBeNull();
    expect(glossaryEntry("status.pending")?.term).toBe("Pending");
  });

  it("has one short, plain definition per term and no duplicate spellings", () => {
    const seen = new Set<string>();
    for (const entry of Object.values(GLOSSARY)) {
      expect(entry.definition.length).toBeLessThanOrEqual(160);
      for (const s of [entry.term, ...("aliases" in entry ? entry.aliases : [])]) {
        const k = s.toLowerCase();
        expect(seen.has(k), s).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe("InfoTip", () => {
  it("shows the definition on keyboard focus, linked by aria-describedby, and hides on Esc", async () => {
    const user = userEvent.setup();
    render(<InfoTip id="scope1" />);
    await user.tab();
    const button = screen.getByRole("button", { name: "What is Scope 1?" });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain(GLOSSARY.scope1.definition);
    expect(button.getAttribute("aria-describedby")).toBe(tip.id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on mouse hover and closes when the pointer leaves", async () => {
    const user = userEvent.setup();
    render(<InfoTip id="fera" />);
    await user.hover(screen.getByRole("button"));
    expect(screen.getByRole("tooltip").textContent).toContain("Fuel- and energy-related");
    await user.unhover(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles on tap without opening and closing at once, and closes on a tap elsewhere", () => {
    render(
      <div>
        <InfoTip id="intensity" />
        <p>outside</p>
      </div>,
    );
    const button = screen.getByRole("button");
    // A touch tap: pointerdown, focus (some browsers), then click.
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(screen.getByText("outside"), { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("doesn't trigger a clickable row around it", () => {
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <InfoTip id="tco2e" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onRow).not.toHaveBeenCalled();
  });

  it("takes a one-off definition", async () => {
    const user = userEvent.setup();
    render(<InfoTip label="Net zero" definition="Emissions cut as far as possible, the rest removed." />);
    await user.tab();
    expect(screen.getByRole("button", { name: "What is Net zero?" })).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toBe("Net zero: Emissions cut as far as possible, the rest removed.");
  });
});

describe("InfoTerm", () => {
  it("adds the icon only for known terms", () => {
    render(
      <p>
        <InfoTerm>FERA</InfoTerm> and <InfoTerm>Electricity</InfoTerm>
      </p>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "What is FERA?" })).toBeTruthy();
  });
});

describe("shared components pick up glossary terms", () => {
  it("KpiStrip labels, DataTable headers and field labels get an info button", () => {
    render(
      <>
        <KpiStrip items={[{ label: "Data coverage", value: 75, format: "percent" }, { label: "Electricity", value: 1 }]} />
        <DataTable
          label="Entries"
          rows={[{ id: 1, s: "pending", t: 2 }]}
          getRowId={(r) => r.id}
          columns={[
            { id: "t", header: "tCO₂e", numeric: true, sortable: true, value: (r) => r.t },
            { id: "s", header: "Status", info: "status", value: (r) => r.s },
          ]}
        />
        <TextField label="Emission factor" value="" onChange={() => {}} />
      </>,
    );
    expect(screen.getByRole("button", { name: "What is Data coverage?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "What is Electricity?" })).toBeNull();
    expect(screen.getByRole("button", { name: "What is tCO₂e?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "What is Status?" })).toBeTruthy();
    // The sort button keeps its own name, and the field's name stays the label alone.
    expect(screen.getByRole("button", { name: /^tCO₂e/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Emission factor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "What is Emission factor?" })).toBeTruthy();
  });
});

describe("info icon language", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_INFO_LANGUAGE", "1");
  });
  afterEach(() => {
    act(() => setGlossaryLocale("en"));
    window.localStorage.clear();
    resetGlossaryLocaleForTests();
    vi.unstubAllEnvs();
  });

  it("stays English while the switch is off, even with a saved choice", () => {
    vi.stubEnv("VITE_INFO_LANGUAGE", "");
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "ar");
    resetGlossaryLocaleForTests();
    expect(infoLanguageEnabled()).toBe(false);
    render(<InfoTip id="scope1" />);
    expect(screen.getByRole("button", { name: "What is Scope 1?" })).toBeTruthy();
  });

  it("shows Arabic right-to-left and Spanish definitions, and remembers the choice", async () => {
    const user = userEvent.setup();
    render(<InfoTip id="scope1" label="Scope 1" />);
    act(() => setGlossaryLocale("ar"));
    await user.tab();
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain(GLOSSARY_TRANSLATIONS.ar.scope1.definition);
    expect(tip.querySelector("[dir=rtl][lang=ar]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ما معنى النطاق 1؟" })).toBeTruthy();
    act(() => setGlossaryLocale("es"));
    expect(screen.getByRole("tooltip").textContent).toBe(`Alcance 1: ${GLOSSARY_TRANSLATIONS.es.scope1.definition}`);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
    resetGlossaryLocaleForTests();
    cleanup();
    render(<InfoTip id="fera" />);
    expect(screen.getByRole("button", { name: /^¿Qué es Actividades/ })).toBeTruthy();
  });

  it("keeps one-off definitions as written", async () => {
    const user = userEvent.setup();
    act(() => setGlossaryLocale("ar"));
    render(<InfoTip label="Net zero" definition="Cut, then remove the rest." />);
    await user.tab();
    expect(screen.getByRole("tooltip").textContent).toBe("Net zero: Cut, then remove the rest.");
  });

  it("has every translated definition at 160 characters or less", () => {
    for (const table of Object.values(GLOSSARY_TRANSLATIONS))
      for (const [id, t] of Object.entries(table)) expect(t.definition.length, id).toBeLessThanOrEqual(160);
  });
});

describe("InfoTip inside overlays and with a mouse", () => {
  it("Esc closes only the tip, not the Drawer around it; a second Esc closes the Drawer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Edit factor">
        <TextField label="Emission factor" value="" onChange={() => {}} />
      </Drawer>,
    );
    act(() => screen.getByRole("button", { name: "What is Emission factor?" }).focus());
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when a mouse clicks after hovering", async () => {
    const user = userEvent.setup();
    render(<InfoTip id="scope2" />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
});
