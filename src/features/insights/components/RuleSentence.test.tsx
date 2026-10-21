// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import type { InsightsQuery } from "../../../lib/insights/contracts";
import { handlers, resetInsightsMocks, setInsightsMockPanel } from "../../../test/msw";
import { RuleSentence } from "./RuleSentence";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));

const server = setupServer(...handlers);
const cardRequests: string[] = [];
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    if (new URL(request.url).pathname.endsWith("/insights/cards")) cardRequests.push(request.url);
  });
});
beforeEach(() => {
  resetInsightsMocks();
  cardRequests.length = 0;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };

function renderSlots(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("RuleSentence (IN-3 panel sentence slot)", () => {
  it("shows the first matching card's sentence, sharing one cards request", async () => {
    renderSlots(
      <>
        <div data-testid="decoupling-slot">
          <RuleSentence query={query} rules={["decoupling"]} />
        </div>
        <div data-testid="pathway-slot">
          <RuleSentence query={query} rules={["pathway_gap", "pathway_on_track"]} />
        </div>
      </>,
    );
    await waitFor(() => expect(screen.getAllByTestId("rule-sentence")).toHaveLength(2));
    expect(screen.getByTestId("decoupling-slot").textContent).toBe("Output is up 42% since 2021 while emissions fell 19%.");
    expect(screen.getByTestId("pathway-slot").textContent).toBe("Emissions are 3.4% above the 2030 pathway.");
    expect(cardRequests).toHaveLength(1);
  });

  it("renders nothing when no matching rule fired", async () => {
    const client = renderSlots(<RuleSentence query={query} rules={["coverage_gap"]} />);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByTestId("rule-sentence")).toBeNull();
  });

  it("renders nothing when the cards panel is empty or fails", async () => {
    setInsightsMockPanel("cards", { error: 500 });
    const client = renderSlots(<RuleSentence query={query} rules={["decoupling"]} />);
    await waitFor(() => expect(client.isFetching()).toBe(0), { timeout: 8000 });
    expect(screen.queryByTestId("rule-sentence")).toBeNull();
  }, 10000);
});
