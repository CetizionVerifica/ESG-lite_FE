// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { ToastProvider } from "../../../../ui";
import { assistantHandlers, assistantMockRequests, resetAssistantMocks, setAssistantMockNext, setAssistantMockStatus } from "../../../../test/msw/assistant";
import AssistantButton from "./AssistantButton";

vi.mock("../../../../context/AuthContext", () => ({ useAuth: () => ({ role: "User", user: { user_id: 1 } }) }));

const server = setupServer(...assistantHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetAssistantMocks();
  sessionStorage.clear();
});
afterEach(() => cleanup());
afterAll(() => server.close());

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/my-month"]}>
          <AssistantButton />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Ask ESGLite" }));
  return screen.findByRole("dialog", { name: "Ask ESGLite" });
};

describe("Ask ESGLite", () => {
  it("isn't shown while the assistant is off or has no model key", async () => {
    setAssistantMockStatus(false);
    renderButton();
    await waitFor(() => expect(assistantMockRequests()).toEqual([]));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: "Ask ESGLite" })).toBeNull();
    cleanup();
    setAssistantMockStatus(true, false);
    renderButton();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: "Ask ESGLite" })).toBeNull();
  });

  it("a starter question gets an answer with steps, an app link and its article", async () => {
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    expect(within(dialog).getByText(/can't see your company's data/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "How do I add this month's data?" }));
    const answer = await within(dialog).findByTestId("assistant-answer");
    expect(within(answer).getByRole("link", { name: "Add data" }).getAttribute("href")).toBe("/data/new");
    expect(within(answer).getByText("site").tagName).toBe("STRONG");
    expect(within(answer).getByRole("link", { name: "Enter data by typing it in" }).getAttribute("href")).toBe("/data/new");
    expect(assistantMockRequests()).toEqual([{ messages: [{ role: "user", content: "How do I add this month's data?" }], page: { path: "/my-month" } }]);
  });

  it("a follow-up typed with Enter sends the earlier turns; New conversation clears them", async () => {
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    await user.click(within(dialog).getByRole("button", { name: "What does Pending mean?" }));
    await within(dialog).findByTestId("assistant-answer");
    await user.type(within(dialog).getByTestId("assistant-input"), "And after that?{Enter}");
    await waitFor(() => expect(within(dialog).getAllByTestId("assistant-answer")).toHaveLength(2));
    expect(assistantMockRequests()[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(assistantMockRequests()[1].messages[2].content).toBe("And after that?");
    await user.click(within(dialog).getByRole("button", { name: "New conversation" }));
    expect(within(dialog).queryByTestId("assistant-answer")).toBeNull();
    expect(sessionStorage.getItem("esglite.assistant.thread.1")).toBeNull();
  });

  it("a refused question says why, keeps the question and Try again resends it", async () => {
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    setAssistantMockNext(429, { code: "AS_BUDGET", message: "x", details: { limit: "company_month_usd" } });
    await user.type(within(dialog).getByTestId("assistant-input"), "How do I approve?{Enter}");
    expect(await within(dialog).findByText(/this month's limit for your company/)).toBeTruthy();
    expect((within(dialog).getByTestId("assistant-input") as HTMLTextAreaElement).value).toBe("How do I approve?");
    expect(within(dialog).queryByTestId("assistant-question")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    await within(dialog).findByTestId("assistant-answer");
    expect(assistantMockRequests()).toHaveLength(2);
  });
});
