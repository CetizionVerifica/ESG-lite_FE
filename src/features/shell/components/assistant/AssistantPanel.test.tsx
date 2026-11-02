// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { ToastProvider } from "../../../../ui";
import { assistantHandlers, assistantMockFeedback, assistantMockRequests, resetAssistantMocks, setAssistantMockDelay, setAssistantMockNext, setAssistantMockStatus } from "../../../../test/msw/assistant";
import "../../../../test/fileShim";
import AssistantBubble from "./AssistantBubble";

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
          <AssistantBubble />
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

  it("offers what to ask next, and a follow-up chip asks it", async () => {
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    await user.click(within(dialog).getByRole("button", { name: "What does Pending mean?" }));
    await within(dialog).findByTestId("assistant-answer");
    await user.click(within(dialog).getByRole("button", { name: "How do I fix a rejected entry?" }));
    await waitFor(() => expect(assistantMockRequests()).toHaveLength(2));
    expect(assistantMockRequests()[1].messages.slice(-1)[0].content).toBe("How do I fix a rejected entry?");
  });

  it("a thumb reaches the server once and says thanks; copying gives plain text", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderButton();
    const dialog = await openPanel(user);
    await user.click(within(dialog).getByRole("button", { name: "What does Pending mean?" }));
    await within(dialog).findByTestId("assistant-answer");
    await user.click(within(dialog).getByRole("button", { name: "This helped" }));
    expect(await within(dialog).findByText("Thanks for telling me")).toBeTruthy();
    await waitFor(() => expect(assistantMockFeedback()).toEqual([{ call_id: 41, helpful: true }]));
    await user.click(within(dialog).getByRole("button", { name: "Copy answer" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("Open Add data.");
    expect(writeText.mock.calls[0][0]).not.toContain("**");
  });

  it("closing while it's thinking keeps the answer: the bubble shows a dot and the answer is there", async () => {
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    setAssistantMockDelay(150);
    await user.type(within(dialog).getByTestId("assistant-input"), "How do I approve?{Enter}");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("assistant-bubble-busy")).toBeTruthy();
    expect(await screen.findByTestId("assistant-bubble-dot")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ask ESGLite, new answer" }));
    const again = await screen.findByRole("dialog", { name: "Ask ESGLite" });
    expect(await within(again).findByTestId("assistant-answer")).toBeTruthy();
    expect(screen.queryByTestId("assistant-bubble-dot")).toBeNull();
  });

  it("with the work summary on it says so, and an answer that used it is marked", async () => {
    setAssistantMockStatus(true, true, false, true);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    expect(within(dialog).getByText(/a summary of your work/)).toBeTruthy();
    setAssistantMockNext(200, { reply: "You have 2 to do.", answered: true, sources: [], used_work: true, call_id: 9 });
    await user.click(within(dialog).getByRole("button", { name: "What do I still need to do this month?" }));
    const answer = await within(dialog).findByTestId("assistant-answer");
    expect(within(answer).getByTestId("assistant-used-work").textContent).toContain("From your ESGLite data");
  });

  it("an ordinary answer isn't marked as using their data", async () => {
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    expect(within(dialog).getByText(/can't see your company's data/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "What does Pending mean?" }));
    const answer = await within(dialog).findByTestId("assistant-answer");
    expect(within(answer).queryByTestId("assistant-used-work")).toBeNull();
  });

  it("no paperclip while files are off for the client", async () => {
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    expect(within(dialog).queryByRole("button", { name: "Attach a file" })).toBeNull();
    expect(within(dialog).queryByText(/show me a file/)).toBeNull();
  });

  it("a file: read in the browser, quick questions offered, sent with the question and kept for the next one", async () => {
    setAssistantMockStatus(true, true, true);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    expect(within(dialog).getByText(/show me a file/)).toBeTruthy();
    await user.upload(within(dialog).getByTestId("assistant-file-input"), new File(["month,litres\nSep,1200"], "fuel.csv", { type: "text/csv" }));
    const chip = await within(dialog).findByTestId("assistant-file");
    expect(await within(chip).findByText("fuel.csv")).toBeTruthy();
    expect(within(chip).getByText(/outside AI service/)).toBeTruthy();
    await user.click(await within(dialog).findByRole("button", { name: "Where should I upload this?" }));
    await within(dialog).findByTestId("assistant-answer");
    expect(assistantMockRequests()[0].attachment).toEqual({ name: "fuel.csv", type: "csv", text: "month,litres\nSep,1200", truncated: false });
    expect(within(dialog).getByTestId("assistant-question-file").textContent).toContain("fuel.csv");
    expect(sessionStorage.getItem("esglite.assistant.thread.1")).not.toContain("1200");

    await user.type(within(dialog).getByTestId("assistant-input"), "And the month?{Enter}");
    await waitFor(() => expect(assistantMockRequests()).toHaveLength(2));
    expect(assistantMockRequests()[1].attachment?.name).toBe("fuel.csv");

    await user.click(within(dialog).getByRole("button", { name: "Remove file" }));
    await user.type(within(dialog).getByTestId("assistant-input"), "Thanks{Enter}");
    await waitFor(() => expect(assistantMockRequests()).toHaveLength(3));
    expect(assistantMockRequests()[2].attachment).toBeUndefined();
  });

  it("a file with no question asks what it is and where it goes", async () => {
    setAssistantMockStatus(true, true, true);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openPanel(user);
    await user.upload(within(dialog).getByTestId("assistant-file-input"), new File(["x"], "drawing.dwg"));
    await within(dialog).findByText(/going by its name/);
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(assistantMockRequests()).toHaveLength(1));
    expect(assistantMockRequests()[0].messages[0].content).toBe("What is this file, and where should I upload it?");
    expect(assistantMockRequests()[0].attachment).toEqual({ name: "drawing.dwg", type: "other" });
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
