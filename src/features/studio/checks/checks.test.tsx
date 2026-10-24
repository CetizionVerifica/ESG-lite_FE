// @vitest-environment jsdom
// DS-12 · checks in the editor against the MSW studio mocks: the top bar's
// counter, the panel grouped Must fix / Review / For info, Go to, the fixes
// (add a per-gas chart, mark a Scope 3 category as excluded), and the final:
// blocked with the reason while an error is open, warnings ticked before
// Generate, sent as acknowledgedWarnings.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { http } from "msw";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockChecks, studioMockCheckCalls } from "../../../test/msw/studio";
import type { Check, ReportDoc } from "../../../lib/studio/contracts";
import { Editor } from "../editor/Editor";
import { resetChecksStore } from "./store";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

const docPatches: ReportDoc[] = [];
const inputPatches: Array<{ rev: number; inputs: Record<string, { value: unknown }> }> = [];
const jobs: Array<{ kind: string; acknowledgedWarnings?: string[] }> = [];
const server = setupServer(
  http.patch("*/studio/docs/:id", async ({ request }) => {
    docPatches.push(((await request.clone().json()) as { doc: ReportDoc }).doc);
    return undefined as unknown as Response;
  }),
  http.patch("*/studio/docs/:id/inputs", async ({ request }) => {
    inputPatches.push((await request.clone().json()) as (typeof inputPatches)[number]);
    return undefined as unknown as Response;
  }),
  http.post("*/studio/docs/:id/jobs", async ({ request }) => {
    jobs.push((await request.clone().json()) as (typeof jobs)[number]);
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
  docPatches.length = 0;
  inputPatches.length = 0;
  jobs.length = 0;
  sessionStorage.clear();
});
afterEach(() => cleanup());
afterAll(() => server.close());

const ERROR: Check = {
  id: "SCOPE3_CATEGORY_UNADDRESSED",
  severity: "error",
  pageId: "p-scope3",
  message: "Scope 3 Category 9: Downstream transportation and distribution isn't reported or excluded. Mark it as excluded with a reason, or add its data.",
  fix: "mark_excluded",
  details: { category: 9, name: "Downstream transportation and distribution", hasData: false },
};
const MARKET: Check = { id: "SCOPE2_MARKET_MISSING", severity: "warning", pageId: "p-summary", elementId: "p-summary.market", message: "Market-based Scope 2 isn't recorded, so it shows as Not reported.", fix: "open_inputs", details: { inputKey: "scope2_instruments" } };
const GAS: Check = { id: "GAS_BREAKDOWN_MISSING", severity: "warning", message: "Emissions aren't shown by gas (CO₂, CH₄, N₂O). Add a per-gas chart, or say why it doesn't apply.", fix: "add_gas_chart" };
const INFO: Check = { id: "UNLINKED_DATA", severity: "info", pageId: "p-scope3", elementId: "p-scope3.custom", message: "Typed data, not linked to approved data. Check the figures before the final." };

async function openEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Editor docId={1} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  await screen.findByTestId("overlay-p-scope3");
}

const counter = () => screen.getByTestId("checks-counter");

describe("Checks in the editor (DS-12)", () => {
  it("counts errors and warnings in the top bar and opens the panel grouped Must fix / Review / For info", async () => {
    setStudioMockChecks([ERROR, MARKET, INFO]);
    await openEditor();
    await waitFor(() => expect(counter().textContent).toContain("2 checks"), { timeout: 4000 });
    expect(studioMockCheckCalls()).toBeGreaterThan(0);
    fireEvent.click(counter());
    const panel = await screen.findByTestId("checks-panel");
    expect(within(panel).getByText("Checks before the final")).toBeTruthy();
    expect(within(panel).getByTestId("checks-counts").textContent).toContain("1 must fix · 1 to review · 1 for info");
    for (const h of ["Must fix", "Review", "For info"]) expect(within(panel).getByRole("heading", { name: h })).toBeTruthy();
    expect(within(panel).getByText(/Scope 3 Category 9: Downstream transportation/)).toBeTruthy();
    // The final is blocked, with the reason.
    expect((within(panel).getByTestId("checks-final") as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).getByTestId("checks-final-reason").textContent).toBe("Fix 1 check to generate the final.");
    // Go to the market-based tile: it is selected.
    const row = panel.querySelector('[data-check-id="SCOPE2_MARKET_MISSING"]') as HTMLElement;
    fireEvent.click(within(row).getByTestId("check-goto"));
    await waitFor(() => expect(screen.getByTestId("context-toolbar").dataset.toolbar).toBe("kpi_tile"));
    // A rail drawer replaces the panel.
    fireEvent.click(screen.getByRole("tab", { name: /Pages/ }));
    await waitFor(() => expect(screen.queryByTestId("checks-panel")).toBeNull());
  });

  it("Add per-gas chart inserts a gas_split chart bound to total by gas (saved)", async () => {
    setStudioMockChecks([GAS]);
    await openEditor();
    await waitFor(() => expect(counter().textContent).toContain("1 check"), { timeout: 4000 });
    fireEvent.click(counter());
    const panel = await screen.findByTestId("checks-panel");
    fireEvent.click(within(panel).getByTestId("fix-add_gas_chart"));
    await waitFor(
      () => {
        const last = docPatches[docPatches.length - 1];
        const charts = (last?.pages ?? []).flatMap((p) => (p.kind === "freeform" ? p.elements : [])).filter((e) => e.type === "chart" && e.props.kind === "gas_split");
        expect(charts.length).toBeGreaterThan(0);
        expect(charts[charts.length - 1].props).toMatchObject({ binding: { source: "ghg", metric: "total", breakdown: "gas" } });
      },
      { timeout: 4000 },
    );
  });

  it("Mark as excluded… saves a reason for the category in the report details", async () => {
    setStudioMockChecks([ERROR]);
    await openEditor();
    await waitFor(() => expect(counter().textContent).toContain("1 check"), { timeout: 4000 });
    fireEvent.click(counter());
    const panel = await screen.findByTestId("checks-panel");
    fireEvent.click(within(panel).getByTestId("fix-mark_excluded"));
    const dialog = await screen.findByRole("dialog", { name: "Mark as excluded" });
    // A reason is required.
    await waitFor(() => expect((within(dialog).getByRole("button", { name: "Save exclusion" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save exclusion" }));
    expect(await within(dialog).findByText("Say why it's left out.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "We don't ship sold goods ourselves." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save exclusion" }));
    await waitFor(() => expect(inputPatches).toHaveLength(1));
    const list = inputPatches[0].inputs.exclusions.value as Array<{ what: string; reason: string }>;
    expect(list.find((e) => /^Category 9\b/.test(e.what))?.reason).toBe("We don't ship sold goods ourselves.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mark as excluded" })).toBeNull());
  });

  it("the final: warnings are ticked before Generate and sent as acknowledgedWarnings", async () => {
    setStudioMockChecks([MARKET, GAS, INFO]);
    await openEditor();
    await waitFor(() => expect(counter().textContent).toContain("2 checks"), { timeout: 4000 });
    fireEvent.click(counter());
    const panel = await screen.findByTestId("checks-panel");
    expect(within(panel).getByTestId("checks-final-reason").textContent).toBe("You'll confirm the warnings first.");
    fireEvent.click(within(panel).getByTestId("checks-final"));
    const dialog = await screen.findByRole("dialog", { name: "Generate the final PDF" });
    const go = (await within(dialog).findByTestId("final-go")) as HTMLButtonElement;
    await waitFor(() => expect(within(dialog).getByTestId("final-warnings")).toBeTruthy());
    expect(go.disabled).toBe(true);
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => fireEvent.click(b));
    await waitFor(() => expect(go.disabled).toBe(false));
    expect(within(dialog).getByTestId("final-version").textContent).toMatch(/^This will be Final v\d+\.$/);
    fireEvent.click(go);
    await waitFor(() => expect(jobs.some((j) => j.kind === "final")).toBe(true));
    expect(jobs.find((j) => j.kind === "final")?.acknowledgedWarnings?.sort()).toEqual(["GAS_BREAKDOWN_MISSING", "SCOPE2_MARKET_MISSING"]);
  });
});
