// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { setupServer } from "msw/node";
import ghgFixture from "../../../test/fixtures/studio/ghg-doc.json";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockBrandKit } from "../../../test/msw/studio";
import type { FreeformPage, ReportDoc } from "../../../lib/studio/contracts";
import { BrandPanel } from "./BrandPanel";
import { useBrandControls } from "./useBrandControls";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetStudioMocks());
afterEach(() => cleanup());
afterAll(() => server.close());

const fresh = () => JSON.parse(JSON.stringify(ghgFixture)) as ReportDoc;
const freeform = (d: ReportDoc, id: string) => d.pages.find((p) => p.id === id) as FreeformPage;

/** A minimal stand-in for the DS-6 shell: doc + snapshot history + preview. */
function Harness({ selection = [], onState }: { selection?: string[]; onState: (s: { doc: ReportDoc; past: ReportDoc[]; previewed: ReportDoc | null; labels: string[] }) => void }) {
  const [doc, setDoc] = useState(fresh);
  const [past, setPast] = useState<ReportDoc[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [previewed, setPreviewed] = useState<ReportDoc | null>(null);
  onState({ doc, past, previewed, labels });
  return (
    <>
      <button type="button" onClick={() => past.length && (setDoc(past[past.length - 1]), setPast(past.slice(0, -1)))}>
        Undo
      </button>
      <BrandPanel
        doc={doc}
        pageId="p-summary"
        selection={selection}
        commit={(next, label) => {
          setPast((p) => [...p, doc]);
          setDoc(next);
          setLabels((l) => [...l, label]);
        }}
        preview={setPreviewed}
      />
    </>
  );
}

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("BrandPanel + StylesPanel", () => {
  it("hover previews a style; Apply writes it to every page; shuffle twice; undo three times restores the doc", async () => {
    const user = userEvent.setup();
    let s!: { doc: ReportDoc; past: ReportDoc[]; previewed: ReportDoc | null; labels: string[] };
    wrap(<Harness onState={(x) => (s = x)} />);
    const plex = await screen.findByTestId("style-look-night");
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(6);

    fireEvent.mouseEnter(plex);
    expect(s.previewed?.design.styleId).toBe("look-night");
    expect(s.doc.design.styleId).toBe("brand-classic"); // preview only
    fireEvent.mouseLeave(plex.closest("ul") as HTMLElement);
    expect(s.previewed).toBeNull();

    await user.click(plex);
    await user.click(screen.getByRole("button", { name: `Apply to all ${fresh().pages.length} pages` }));
    expect(s.doc.design.styleId).toBe("look-night");
    expect(s.doc.design.theme.colors?.surface).toBe("#0d1526");
    expect(s.doc.design.theme.fonts).toEqual({ heading: "fraunces", body: "source-sans-3" });
    const applied = s.doc;

    await user.click(screen.getByRole("button", { name: "Shuffle" }));
    const first = s.doc;
    await user.click(screen.getByRole("button", { name: "Shuffle" }));
    const second = s.doc;
    expect(first).not.toEqual(applied);
    expect(second).not.toEqual(first);
    expect(s.labels).toEqual(["Apply style Night · Fraunces", "Shuffle Night · Fraunces", "Shuffle Night · Fraunces"]);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(s.doc).toBe(first);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(s.doc).toBe(applied);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(s.doc).toEqual(fresh());
  });

  it("a swatch colours the selection; a logo inserts an image element; brand fonts apply", async () => {
    const user = userEvent.setup();
    let s!: { doc: ReportDoc };
    wrap(<Harness selection={["p-summary.heading"]} onState={(x) => (s = x)} />);
    await user.click(await screen.findByRole("button", { name: "Colour the selection #F59E0B (accent)" }));
    const heading = freeform(s.doc, "p-summary").elements.find((e) => e.id === "p-summary.heading");
    expect((heading?.props as { color?: string }).color).toBe("#f59e0b");

    await user.click(screen.getByRole("button", { name: "Insert logo on light" }));
    const page = freeform(s.doc, "p-summary");
    const logo = page.elements[page.elements.length - 1];
    expect(logo.type).toBe("image");
    expect(logo.props).toMatchObject({ assetId: "brand:logo", fit: "contain" });
    expect(s.doc.assets.some((a) => a.id === "brand:logo" && a.kind === "logo")).toBe(true);

    // The fixture already uses Fraunces + Source Sans 3, the mock brand pair.
    expect((screen.getByRole("button", { name: "Using brand fonts" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Edit brand kit" }).getAttribute("href")).toBe("/studio/brand-kit");
  });

  it("with nothing colourable selected a swatch colours the page background", async () => {
    const user = userEvent.setup();
    let s!: { doc: ReportDoc };
    wrap(<Harness onState={(x) => (s = x)} />);
    await user.click(await screen.findByRole("button", { name: "Colour the page background #111827" }));
    expect(freeform(s.doc, "p-summary").background.color).toBe("#111827");
  });

  it("hides the edit link from Admins", async () => {
    setStudioMockBrandKit({ canEdit: false });
    wrap(<Harness onState={() => undefined} />);
    await screen.findByTestId("brand-panel");
    expect(screen.queryByRole("link", { name: "Edit brand kit" })).toBeNull();
  });
});

describe("useBrandControls", () => {
  const hookWrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
  it("off: any colour and every font; on: brand colours and the brand pair", async () => {
    const off = renderHook(() => useBrandControls(), { wrapper: hookWrap });
    await waitFor(() => expect(off.result.current.fonts).toHaveLength(8));
    expect(off.result.current.colours).toBeNull();
    off.unmount();

    act(() => setStudioMockBrandKit({ brandControls: true }));
    const on = renderHook(() => useBrandControls(), { wrapper: hookWrap });
    await waitFor(() => expect(on.result.current.on).toBe(true));
    expect(on.result.current.fonts).toEqual(["fraunces", "source-sans-3"]);
    expect(on.result.current.colours).toEqual(["#0f5132", "#f59e0b", "#111827", "#ffffff"]);
  });
});
