// @vitest-environment jsdom
// DS-2 · the materiality scores block in KPI setup (Design Studio or Insights on); IN-7: read and saved through /kpi/setup/materiality-scores.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { handlers, resetStudioMocks } from "../../../../test/msw";
import { ToastProvider } from "../../../../ui";
import { MaterialityScores } from "./MaterialityScores";

const studio = { enabled: true, kinds: { ghg: true, sustainability: true }, checking: false };
vi.mock("../../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Admin", user: {} }) }));
vi.mock("../../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));
vi.mock("../../../../lib/studio/switch", () => ({ useDesignStudio: () => studio }));
const insights = { enabled: false, kpi_tracking: true, checking: false }; // IN-7
vi.mock("../../../../lib/insights/switch", () => ({ useInsights: () => insights })); // IN-7

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetStudioMocks();
  studio.enabled = true;
  insights.enabled = false; // IN-7
});
afterEach(cleanup);
afterAll(() => server.close());

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MaterialityScores />
      </ToastProvider>
    </QueryClientProvider>,
  );

describe("MaterialityScores", () => {
  it("scores each material topic and says how many still need scores", async () => {
    wrap();
    expect(await screen.findByTestId("materiality-scores")).toBeTruthy();
    expect(screen.getByText("Climate change")).toBeTruthy();
    expect(screen.queryByText("Water and marine resources")).toBeNull();
    expect(screen.getByText("1 material topic still needs scores.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Impact score for Own workforce"), { target: { value: "6.5" } });
    fireEvent.change(screen.getByLabelText("Financial score for Own workforce"), { target: { value: "4" } });
    await waitFor(() => expect(screen.queryByText(/still needs? scores/)).toBeNull());
    await userEvent.setup().click(screen.getByRole("button", { name: "Save scores" }));
    expect(await screen.findByText("Scores saved")).toBeTruthy();
  });

  it("stays hidden while Design Studio is off", () => {
    studio.enabled = false;
    wrap();
    expect(screen.queryByTestId("materiality-scores")).toBeNull();
  });

  // IN-7: the same block shows when Insights is on (its materiality matrix reads these scores, I10).
  it("shows with Insights on even while Design Studio is off", async () => {
    studio.enabled = false;
    insights.enabled = true;
    wrap();
    expect(await screen.findByTestId("materiality-scores")).toBeTruthy();
    expect(screen.getByText(/Insights places each topic on its materiality matrix/)).toBeTruthy();
    expect(screen.getByLabelText("Impact score for Own workforce")).toBeTruthy();
  });
});
