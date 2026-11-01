// @vitest-environment jsdom
// DS-2 · the Data drawer and Report details against the MSW studio mocks.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { handlers, resetStudioMocks, setStudioMockEnabled, studioMockDoc } from "../../../test/msw";
import { ToastProvider } from "../../../ui";
import type { ReportInputs } from "../../../lib/studio/contracts";
import { DataPanel } from "./DataPanel";
import { ReportDetailsForm } from "./ReportDetailsForm";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetStudioMocks());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
};
const ghgScope = { kind: "ghg" as const, year: 2025, yearType: "FY" as const, sites: "all" as const };

describe("DataPanel · GHG", () => {
  it("lists scopes with values and approval dates, market-based Scope 2 as not reported", async () => {
    const onInsert = vi.fn();
    wrap(<DataPanel scope={ghgScope} onInsert={onInsert} />);
    const scope1 = await screen.findByTestId("data-item-scope1");
    expect(within(scope1).getByText("1,111.000")).toBeTruthy(); // #209: tCO₂e with 3 decimals
    expect(within(scope1).getByText("Approved 12 Apr 2026")).toBeTruthy();
    const market = screen.getByTestId("data-item-scope2_market");
    expect(within(market).getByText("Not reported")).toBeTruthy();
    expect(within(market).getByText("Not recorded in ESGLite")).toBeTruthy();
    expect(screen.getByTestId("data-item-scope3_category_8").textContent).toContain("Excluded: No leased assets");
    expect(screen.getByText(/approved entries only · last approval 12 Apr 2026/)).toBeTruthy();
    expect(screen.getByText("FY 2025 · all sites")).toBeTruthy();

    await userEvent.setup().click(scope1);
    expect(onInsert).toHaveBeenCalledWith({ source: "ghg", metric: "scope1", years: { last: 1 }, sites: "all" }, expect.objectContaining({ id: "scope1" }));
  });

  it("searches the list", async () => {
    wrap(<DataPanel scope={ghgScope} />);
    await screen.findByTestId("data-item-scope1");
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Search data" }), "intensity");
    await waitFor(() => expect(screen.queryByTestId("data-item-scope1")).toBeNull());
    expect(screen.getByTestId("data-item-intensity_output")).toBeTruthy();
  });

  it("says when the studio is off", async () => {
    setStudioMockEnabled(false);
    wrap(<DataPanel scope={ghgScope} />);
    expect(await screen.findByText("The data couldn't be loaded.")).toBeTruthy();
    expect(screen.getByText("Design Studio isn't turned on for this company.")).toBeTruthy();
  });
});

describe("DataPanel · sustainability", () => {
  it("searches the company's KPIs and filters by topic", async () => {
    const user = userEvent.setup();
    wrap(<DataPanel scope={{ ...ghgScope, kind: "sustainability", yearType: "CY" }} />);
    expect(await screen.findByTestId("data-item-WATER_WITHDRAWAL")).toBeTruthy();
    expect(screen.getByTestId("data-item-ENERGY_TOTAL")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Workforce" }));
    await waitFor(() => expect(screen.queryByTestId("data-item-WATER_WITHDRAWAL")).toBeNull());
    expect(screen.getByTestId("data-item-EMPLOYEES_TOTAL")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "All topics" }));
    await user.type(screen.getByRole("textbox", { name: "Search KPIs" }), "nothing");
    expect(await screen.findByText("No selected KPI matches.")).toBeTruthy();
  });
});

describe("Report details", () => {
  it("shows prefill sources and missing inputs, and saves the changed keys with the doc's rev", async () => {
    const user = userEvent.setup();
    wrap(<DataPanel scope={ghgScope} docId={1} initialTab="details" />);
    const revenue = await screen.findByTestId("input-revenue");
    expect(within(revenue).getByText("From KPI values (INR crore)")).toBeTruthy();
    expect(within(revenue).getByText("Prefilled")).toBeTruthy();
    expect(within(screen.getByTestId("input-conformance")).getByText("Typed")).toBeTruthy();
    expect(within(screen.getByTestId("input-uncertainty_statement")).getByText("Empty · we'll flag it in checks")).toBeTruthy();
    expect(screen.getByText(/We'll flag these in checks:/).textContent).toContain("Uncertainty");

    await user.type(within(screen.getByTestId("input-responsible_person")).getByRole("textbox"), "A. Shah");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(studioMockDoc(1)?.inputs.responsible_person?.value).toBe("A. Shah"));
    expect(studioMockDoc(1)?.rev).toBe(2);
    expect(studioMockDoc(1)?.inputs.responsible_person?.source).toBe("typed");
    expect(await screen.findByText("Report details saved")).toBeTruthy();
  });

  it("shows a server validation error on its field, and a conflict with a reload", async () => {
    const user = userEvent.setup();
    wrap(<DataPanel scope={ghgScope} docId={1} initialTab="details" />);
    const employees = await screen.findByTestId("input-employees");
    server.use(
      http.patch("*/studio/docs/:id/inputs", () =>
        HttpResponse.json({ code: "DS_VALIDATION", message: "The request isn't valid.", details: { issues: [{ path: "inputs.employees", message: "Number must be less than or equal to 1000000" }] } }, { status: 400 }),
      ),
    );
    await user.type(within(employees).getByRole("textbox"), "12");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await within(employees).findByText("Number must be less than or equal to 1000000")).toBeTruthy();

    server.use(http.patch("*/studio/docs/:id/inputs", () => HttpResponse.json({ code: "DS_VERSION_CONFLICT", message: "Someone else changed this design.", details: { rev: 5 } }, { status: 409 })));
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Someone else changed this design.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("works controlled before a doc exists (new-design flow), with the prefill from the server", async () => {
    const user = userEvent.setup();
    const seen: ReportInputs[] = [];
    function Host() {
      const [inputs, setInputs] = useState<ReportInputs>({});
      return (
        <DataPanel
          scope={ghgScope}
          initialTab="details"
          inputs={inputs}
          onInputsChange={(next) => {
            seen.push(next);
            setInputs(next);
          }}
        />
      );
    }
    wrap(<Host />);
    const period = await screen.findByTestId("input-reporting_period");
    expect(within(period).getByText("From company settings")).toBeTruthy();
    await user.type(within(screen.getByTestId("input-scope2_instruments")).getByRole("textbox"), "RECs");
    expect(seen[seen.length - 1]?.scope2_instruments?.value).toBe("RECs");
    expect(seen[seen.length - 1]?.scope2_instruments?.source).toBe("typed");
  });

  it("the form alone: removing a stored value falls back to the data's", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <ReportDetailsForm
        kind="ghg"
        stored={{ consolidation_approach: { value: "Equity share", source: "typed", updatedBy: 2, updatedAt: "t" } }}
        prefill={{ consolidation_approach: { value: "Operational control", source: "company" } }}
        onChange={onChange}
      />,
    );
    await user.click(within(screen.getByTestId("input-consolidation_approach")).getByRole("button", { name: "Use the value from data" }));
    expect(onChange).toHaveBeenCalledWith({});
  });
});
