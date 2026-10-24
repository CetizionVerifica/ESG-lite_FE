// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";
import { ToastProvider } from "../../../ui";
import { handlers, insightsMockEvents, resetInsightsMocks } from "../../../test/msw";
import { EventsDrawer } from "./EventsDrawer";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetInsightsMocks());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <EventsDrawer open onClose={onClose} range={{ from: "2021-01-01", to: "2031-12-31" }} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClose, invalidate };
}

const rows = () => screen.findAllByTestId("event-row");

describe("EventsDrawer (IN-4)", () => {
  it("lists the events in date order with kind and site", async () => {
    renderDrawer();
    const list = await rows();
    expect(list.map((r) => r.querySelector("p")?.textContent)).toEqual(["Rooftop solar at Pune", "Nagpur kiln upgrade", "New grid factors (CEA v20)"]);
    await waitFor(() => expect(list[0].textContent).toContain("Pune plant"));
    expect(list[0].textContent).toContain("1 Apr 2023 · Initiative");
    expect(list[2].textContent).toContain("Method change · Whole company");
  });

  it("adds an event: inline checks first, a counter, then a toast, the list and the panels refresh", async () => {
    const { invalidate } = renderDrawer();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Add event" }));
    const form = screen.getByTestId("event-form");
    await userEvent.click(within(form).getByRole("button", { name: "Add event" }));
    expect(form.textContent).toContain("Give the event a short name.");
    expect(form.textContent).toContain("Choose what kind of event this is.");
    expect(form.textContent).toContain("Choose the date it happened.");

    await userEvent.type(within(form).getByLabelText(/Name/), "Heat pumps at Chennai");
    expect(screen.getByTestId("event-label-counter").textContent).toBe("21/60 characters");
    await userEvent.selectOptions(within(form).getByLabelText(/Kind/), "initiative");
    await userEvent.type(within(form).getByLabelText(/Date/), "2026-03-01");
    await userEvent.selectOptions(within(form).getByLabelText(/Site/), "11");
    await userEvent.click(within(form).getByRole("button", { name: "Add event" }));

    expect(await screen.findByText("Event added")).toBeTruthy();
    await waitFor(async () => expect((await rows()).map((r) => r.querySelector("p")?.textContent)).toContain("Heat pumps at Chennai"));
    expect(insightsMockEvents().slice(-1)[0]).toMatchObject({ label: "Heat pumps at Chennai", kind: "initiative", date: "2026-03-01", site_id: 11 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["insights", "panel"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["insights", "events"] });
  });

  it("shows the server's IN_EVENT_INVALID in the form", async () => {
    server.use(http.post("*/insights/events", () => HttpResponse.json({ code: "IN_EVENT_INVALID", message: "The date must be within your data's years.", details: { issues: [{ path: "date", message: "Out of range" }] } }, { status: 400 })));
    renderDrawer();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Add event" }));
    const form = screen.getByTestId("event-form");
    await userEvent.type(within(form).getByLabelText(/Name/), "Old event");
    await userEvent.selectOptions(within(form).getByLabelText(/Kind/), "other");
    await userEvent.type(within(form).getByLabelText(/Date/), "1999-01-01");
    await userEvent.click(within(form).getByRole("button", { name: "Add event" }));
    expect(await within(form).findByText("The date must be within your data's years.")).toBeTruthy();
    expect(form.textContent).toContain("Choose a date within your data's years.");
    expect(screen.queryByText("Event added")).toBeNull();
  });

  it("edits an event (only what changed is sent)", async () => {
    let body: unknown = null;
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "PATCH") body = await request.clone().json();
    });
    renderDrawer();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Edit Nagpur kiln upgrade" }));
    const name = within(screen.getByTestId("event-form")).getByLabelText(/Name/);
    expect((name as HTMLInputElement).value).toBe("Nagpur kiln upgrade");
    await userEvent.clear(name);
    await userEvent.type(name, "Nagpur kiln (new burner)");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Event updated")).toBeTruthy();
    expect(body).toEqual({ label: "Nagpur kiln (new burner)" });
    expect(insightsMockEvents().find((e) => e.id === 2)?.label).toBe("Nagpur kiln (new burner)");
    server.events.removeAllListeners();
  });

  it("asks in the drawer before deleting; Keep cancels, Delete removes", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderDrawer();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Delete Rooftop solar at Pune" }));
    let ask = screen.getByTestId("event-delete-confirm");
    expect(ask.textContent).toContain("Delete “Rooftop solar at Pune”?");
    await userEvent.click(within(ask).getByRole("button", { name: "Keep" }));
    expect(screen.queryByTestId("event-delete-confirm")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete Rooftop solar at Pune" }));
    ask = screen.getByTestId("event-delete-confirm");
    await userEvent.click(within(ask).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Event deleted")).toBeTruthy();
    await waitFor(async () => expect(await rows()).toHaveLength(2));
    expect(insightsMockEvents().map((e) => e.id)).toEqual([2, 3]);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("Esc closes the drawer", async () => {
    const { onClose } = renderDrawer();
    await rows();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
