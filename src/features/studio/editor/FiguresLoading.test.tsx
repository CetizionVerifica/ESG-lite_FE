// @vitest-environment jsdom
// DS fix · while POST /studio/resolve is pending the editor never says "Not
// reported": bound values read "Loading…", the canvas shows "Loading figures…",
// the link mark says it is loading and the checks wait. A failed /resolve shows
// an error with Try again, not "Not reported". Re-resolving keeps the last figures.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { handlers, resetStudioMocks, studioMockDoc } from "../../../test/msw";
import type { Binding, Element, FreeformPage, ReportDoc } from "../../../lib/studio/contracts";
import { bindingKey, type RenderBinding } from "../../../lib/studio/render";
import { resetChecksStore } from "../checks/store";
import { Editor } from "./Editor";
import { FIGURE_ERROR_TEXT, FIGURE_LOADING_TEXT, markPendingFigures } from "./pendingFigures";
import { linkMarkText, useRenderInputs } from "./renderInputs";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

/** /resolve waits for `release()` while `hold` is on; `fail` answers 500. */
let hold = false;
let fail = false;
let waiting: (() => void)[] = [];
let resolveCalls = 0;
let checksCalls = 0;
const release = () => {
  hold = false;
  waiting.forEach((r) => r());
  waiting = [];
};

const server = setupServer(
  http.post("*/studio/resolve", async () => {
    resolveCalls++;
    if (hold) await new Promise<void>((r) => waiting.push(r));
    if (fail) return HttpResponse.json({ error: { code: "INTERNAL", message: "boom" } }, { status: 500 });
    return undefined as unknown as Response; // fall through to the studio mock
  }),
  http.post("*/studio/docs/:id/checks", () => {
    checksCalls++;
    return undefined as unknown as Response;
  }),
  ...handlers,
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
});
beforeEach(() => {
  resetStudioMocks();
  resetChecksStore();
  sessionStorage.clear();
  hold = false;
  fail = false;
  waiting = [];
  resolveCalls = 0;
  checksCalls = 0;
});
afterEach(() => {
  release();
  cleanup();
});
afterAll(() => server.close());

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const openEditor = async () => {
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <Editor docId={1} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  await screen.findByTestId("overlay-p-cover");
};

/** Everything the canvas shows: the light DOM plus every sheet's shadow root. */
const sheetRoots = () => [...document.querySelectorAll<HTMLElement>("[data-sheet-host]")].map((h) => h.shadowRoot).filter((r): r is ShadowRoot => !!r);
/**
 * Everything the editor shows: the light DOM plus every sheet's shadow root.
 * Flow tables (factor table, Scope 3 categories) are left out: the editor
 * sends them no rows, so they read "Not reported" (NO_ROWS) loaded or not.
 */
const sheetText = (r: ShadowRoot) => {
  const copy = document.createElement("div");
  copy.innerHTML = r.innerHTML;
  copy.querySelectorAll("style, .ds-flow-missing").forEach((n) => n.remove());
  return copy.textContent ?? "";
};
const allText = () => [document.body.textContent ?? "", ...sheetRoots().map(sheetText)].join("\n");
const coverFigure = () => {
  for (const r of sheetRoots()) {
    const el = r.querySelector('[data-el-id="p-cover.total"] .ds-big-fig');
    if (el) return el.textContent ?? "";
  }
  return null;
};

describe("figures while /studio/resolve is pending", () => {
  it("shows Loading…, never Not reported, then the real figure", async () => {
    hold = true;
    await openEditor();
    await waitFor(() => expect(resolveCalls).toBeGreaterThan(0));
    expect(screen.getByTestId("figures-loading").textContent).toContain("Loading figures…");
    await waitFor(() => expect(coverFigure()).toContain(FIGURE_LOADING_TEXT));
    expect(allText()).not.toContain("Not reported");
    // The checks don't run against sheets still loading their figures.
    await new Promise((r) => setTimeout(r, 500));
    expect(checksCalls).toBe(0);
    expect(allText()).not.toContain("Not reported");

    act(() => release());
    await waitFor(() => expect(coverFigure()).toMatch(/^\d[\d,]*$/));
    expect(coverFigure()).not.toContain(FIGURE_LOADING_TEXT);
    expect(coverFigure()).not.toContain("Not reported");
    expect(screen.queryByTestId("figures-loading")).toBeNull();
    await waitFor(() => expect(checksCalls).toBeGreaterThan(0), { timeout: 3000 });
  }, 20000);

  it("a failed /resolve shows an error with Try again, not Not reported", async () => {
    fail = true;
    await openEditor();
    await screen.findByText("The figures couldn't load.");
    await waitFor(() => expect(coverFigure()).toContain(FIGURE_ERROR_TEXT));
    expect(allText()).not.toContain("Not reported");

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(coverFigure()).toMatch(/^\d[\d,]*$/));
    expect(coverFigure()).not.toContain(FIGURE_ERROR_TEXT);
    expect(screen.queryByText("The figures couldn't load.")).toBeNull();
  }, 20000);
});

describe("useRenderInputs", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>;
  const base = studioMockDoc(1)!.doc;
  const withTile = (doc: ReportDoc, binding: Binding): ReportDoc => {
    const page = doc.pages.find((p) => p.kind === "freeform") as FreeformPage;
    const tile = { id: "new-tile", type: "big_number", frame: { x: 10, y: 10, w: 40, h: 20, rotation: 0 }, z: 99, source: "user", props: { binding, label: "New" } } as unknown as Element;
    return { ...doc, pages: doc.pages.map((p) => (p === page ? { ...page, elements: [...page.elements, tile] } : p)) };
  };

  it("is loading with no data first, and keeps the last figures while new bindings resolve", async () => {
    hold = true;
    const { result, rerender } = renderHook(({ doc }) => useRenderInputs(doc, 1), { wrapper, initialProps: { doc: base } });
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();
    act(() => release());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const before = result.current.data!;
    const known = Object.keys(before.values)[0];
    expect(known).toBeTruthy();

    hold = true;
    const added: Binding = { source: "ghg", metric: "scope1", years: { last: 1 }, sites: "all" } as Binding;
    rerender({ doc: withTile(base, added) });
    expect(result.current.status).toBe("loading");
    expect(result.current.data?.values[known]).toEqual(before.values[known]);
    expect(result.current.resolved.length).toBeGreaterThan(0);

    act(() => release());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.values[bindingKey(added as RenderBinding)]).toBeTruthy();
  });
});

describe("link mark and sheet relabel", () => {
  const b = { source: "ghg", metric: "total", years: { last: 1 }, sites: "all" } as Binding;

  it("link mark says loading / couldn't load, never not reported, while there is no value", () => {
    expect(linkMarkText(b, undefined, "loading")?.text).toBe("Linked · loading the figure…");
    expect(linkMarkText(b, undefined, "error")?.text).toBe("Linked · the figure couldn't load");
    expect(linkMarkText(b, { display: "Not reported", value: null, unit: null, unavailable: { reason: "NOT_RECORDED" } }, "ready")?.text).toBe("Linked · not reported (not recorded)");
  });

  it("relabels only NOT_RESOLVED marks, keeps a real Not reported", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<div id="a" data-reason="NOT_RESOLVED"><span class="ds-nr" data-reason="NOT_RESOLVED">Not reported</span></div><span id="b" class="ds-nr" data-reason="NOT_RECORDED">Not reported</span>';
    expect(markPendingFigures(root, "ready")).toBe(0);
    markPendingFigures(root, "loading");
    expect(root.getElementById("a")?.textContent).toBe(FIGURE_LOADING_TEXT);
    expect(root.getElementById("b")?.textContent).toBe("Not reported");
  });
});
