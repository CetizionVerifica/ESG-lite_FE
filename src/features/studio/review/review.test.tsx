// @vitest-environment jsdom
// DS-13 · review in the editor against the MSW studio mocks: the Comments
// button and panel, @mention autocomplete, Assign as task, replies, resolve
// and Show resolved, My tasks, pins, the approval bar (request, approve,
// request changes), drift (banner, Mark as checked saves the hash), the
// require-review block on the final, save as template, and version history.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { http } from "msw";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { MOCK_DATA_HASH, setStudioMockDrift, setStudioMockReviewSettings, studioMockApprovals, studioMockComments } from "../../../test/msw/studio";
import type { ReportDoc } from "../../../lib/studio/contracts";
import { Editor } from "../editor/Editor";
import { resetChecksStore } from "../checks/store";
import { FinalForm } from "../checks/FinalForm";
import { openReview, resetReviewStore } from "./store";
import { VersionsPage } from "./VersionsPage";

const auth = vi.hoisted(() => ({ role: "Manager", user: { user_id: 2 } as { user_id: number } }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

const docPatches: ReportDoc[] = [];
const server = setupServer(
  http.patch("*/studio/docs/:id", async ({ request }) => {
    docPatches.push(((await request.clone().json()) as { doc: ReportDoc }).doc);
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
  resetReviewStore();
  docPatches.length = 0;
  sessionStorage.clear();
  auth.user.user_id = 2;
  auth.role = "Manager";
});
afterEach(() => cleanup());
afterAll(() => server.close());

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

async function openEditor() {
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <Editor docId={1} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
}

async function openPanel() {
  fireEvent.click(await screen.findByTestId("comments-button"));
  return screen.findByTestId("review-panel");
}

/** Types into the new-comment box and picks a person from the @ list. */
async function typeMention(box: HTMLElement, before: string, query: string, name: RegExp) {
  const text = `${before}@${query}`;
  fireEvent.change(box, { target: { value: text, selectionStart: text.length } });
  const list = await screen.findByRole("listbox", { name: "People" });
  const option = within(list).getByRole("option", { name });
  fireEvent.mouseDown(option);
}

describe("Comments, mentions and tasks (DS-13)", () => {
  it("writes a comment with an @mention and a task; the person is listed and the task is assigned", async () => {
    await openEditor();
    const panel = await openPanel();
    expect(within(panel).getByText("No comments yet.")).toBeTruthy();
    const box = within(panel).getByRole("combobox", { name: "New comment" });
    await typeMention(box, "Please check the Scope 1 sentence ", "As", /Asha Rao/);
    expect((box as HTMLTextAreaElement).value).toBe("Please check the Scope 1 sentence @Asha Rao ");
    fireEvent.change(within(panel).getByLabelText("Assign as task"), { target: { value: "4" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Comment" }));
    const thread = await within(panel).findByRole("article", { name: "Comment by Maya Manager" });
    expect(within(thread).getByText("@Asha Rao")).toBeTruthy();
    expect(within(thread).getByText(/Task · Asha Rao/)).toBeTruthy();
    const saved = studioMockComments()[0];
    expect(saved).toMatchObject({ mentions: [4], taskAssigneeId: 4, body: "Please check the Scope 1 sentence @Asha Rao" });
    expect(screen.getByTestId("comments-button").textContent).toContain("Comments 1");
  });

  it("replies, resolves (hidden) and shows resolved threads; My tasks lists mine and ticks done", async () => {
    await openEditor();
    const panel = await openPanel();
    const box = within(panel).getByRole("combobox", { name: "New comment" });
    fireEvent.change(box, { target: { value: "Can you shorten this?" } });
    fireEvent.change(within(panel).getByLabelText("Assign as task"), { target: { value: "2" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Comment" }));
    const thread = await within(panel).findByRole("article", { name: "Comment by Maya Manager" });
    fireEvent.click(within(thread).getByRole("button", { name: "Reply" }));
    fireEvent.change(within(thread).getByRole("combobox", { name: "Reply" }), { target: { value: "Done, shortened." } });
    fireEvent.click(within(thread).getByRole("button", { name: "Send reply" }));
    expect(await within(thread).findByText("Done, shortened.")).toBeTruthy();
    expect(studioMockComments().map((c) => c.parentId)).toEqual([null, 1]);

    // My tasks: the task assigned to me (Maya).
    fireEvent.click(within(panel).getByRole("radio", { name: "My tasks" }));
    const mine = await within(panel).findByRole("article", { name: "Comment by Maya Manager" });
    const tick = within(mine).getByRole("checkbox", { name: /Task for Maya Manager: done/ });
    fireEvent.click(tick);
    await waitFor(() => expect(within(panel).getByText("No open tasks for you.")).toBeTruthy());
    fireEvent.click(within(panel).getByRole("radio", { name: "All" }));

    const again = await within(panel).findByRole("article", { name: "Comment by Maya Manager" });
    fireEvent.click(within(again).getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(within(panel).getByText("No comments yet.")).toBeTruthy());
    fireEvent.click(within(panel).getByLabelText("Show resolved"));
    const resolved = await within(panel).findByRole("article", { name: "Comment by Maya Manager" });
    expect(within(resolved).getByText(/Resolved by Maya Manager/)).toBeTruthy();
    fireEvent.click(within(resolved).getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(studioMockComments()[0].resolvedAt).toBeNull());
  });

  it("deleting a comment asks first; Keep leaves it, Delete removes it", async () => {
    await openEditor();
    const panel = await openPanel();
    fireEvent.change(within(panel).getByRole("combobox", { name: "New comment" }), { target: { value: "Typo in the title" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Comment" }));
    const thread = await within(panel).findByRole("article", { name: "Comment by Maya Manager" });
    fireEvent.click(within(thread).getByRole("button", { name: "Delete comment" }));
    expect(within(thread).getByText("Delete this comment?")).toBeTruthy();
    expect(studioMockComments()).toHaveLength(1);
    fireEvent.click(within(thread).getByRole("button", { name: "Keep" }));
    expect(within(thread).queryByText("Delete this comment?")).toBeNull();
    expect(studioMockComments()).toHaveLength(1);
    fireEvent.click(within(thread).getByRole("button", { name: "Delete comment" }));
    fireEvent.click(within(thread).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(studioMockComments().filter((c) => !(c as { deleted?: boolean }).deleted)).toHaveLength(0));
  });

  it("a comment at a spot (C + click) shows as a pin that opens its thread", async () => {
    await openEditor();
    openReview(1, { pin: { pageId: "p-summary", elementId: "p-summary.body", x: 40, y: 60 } });
    const panel = await screen.findByTestId("review-panel");
    expect(within(panel).getByText(/on the element you clicked/)).toBeTruthy();
    fireEvent.change(within(panel).getByRole("combobox", { name: "New comment" }), { target: { value: "Pin here" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Comment" }));
    const pin = await screen.findByTestId("comment-pin-saved", {}, { timeout: 4000 });
    expect(studioMockComments()[0]).toMatchObject({ pageId: "p-summary", elementId: "p-summary.body", x: 40, y: 60 });
    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    await waitFor(() => expect(screen.queryByTestId("review-panel")).toBeNull());
    fireEvent.click(pin);
    expect(await screen.findByTestId("review-panel")).toBeTruthy();
  });
});

describe("Approval (DS-13, D14)", () => {
  it("requests approval from a Manager; the reviewer approves; the bar says so", async () => {
    await openEditor();
    fireEvent.click(screen.getByTestId("share-menu"));
    fireEvent.click(await screen.findByTestId("share-request-approval"));
    const dialog = await screen.findByRole("dialog", { name: "Request approval" });
    const reviewer = within(dialog).getByLabelText(/Reviewer/) as HTMLSelectElement;
    // Only Managers other than me (Maya): Asha.
    expect([...reviewer.options].map((o) => o.textContent)).toEqual(["Choose a Manager", "Asha Rao"]);
    await waitFor(() => expect(reviewer.value).toBe("4"));
    fireEvent.change(within(dialog).getByLabelText(/Note/), { target: { value: "For the board pack" } });
    // From here on the signed-in person is Asha, the reviewer.
    auth.user.user_id = 4;
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    const bar = await screen.findByTestId("approval-bar");
    expect(bar.textContent).toContain("Approval requested from Asha Rao");
    expect(studioMockApprovals()[0]).toMatchObject({ reviewerId: 4, note: "For the board pack", state: "requested" });
    fireEvent.click(within(bar).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByTestId("approval-bar").textContent).toContain("Approved by Asha Rao"));
  });

  it("Request changes needs a note", async () => {
    auth.user.user_id = 4;
    await openEditor();
    fireEvent.click(screen.getByTestId("share-menu"));
    fireEvent.click(await screen.findByTestId("share-request-approval"));
    const dialog = await screen.findByRole("dialog", { name: "Request approval" });
    // As Asha the only other Manager is Maya; the mock decides as the named reviewer.
    await waitFor(() => expect((within(dialog).getByLabelText(/Reviewer/) as HTMLSelectElement).value).toBe("2"));
    auth.user.user_id = 2;
    fireEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    const bar = await screen.findByTestId("approval-bar");
    fireEvent.click(within(bar).getByRole("button", { name: "Request changes" }));
    const modal = await screen.findByRole("dialog", { name: "Request changes" });
    expect((within(modal).getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(modal).getByLabelText(/What should change/), { target: { value: "Explain the Scope 2 drop" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByTestId("approval-bar").textContent).toContain("Maya Manager requested changes: Explain the Scope 2 drop"));
  });

  it("with review required, the final form says approval is needed", async () => {
    setStudioMockReviewSettings({ requireReview: true });
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <FinalForm docId={1} canFinal />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/needs an approval before a final/, {}, { timeout: 4000 })).toBeTruthy();
    expect((screen.getByTestId("final-go") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Data changes (drift)", () => {
  it("shows the banner and Mark as checked saves the current hash on the text", async () => {
    setStudioMockDrift(1, [
      { elementId: "p-summary.body", pageId: "p-summary", pageName: "Executive summary", text: "Scope 1 emissions were 1,200 tCO₂e", basedOnHash: "sha256:abc", before: "Scope split: 1,200.000", after: "Scope split: 1,260.000", figures: [{ elementId: "p-summary.split", label: "Scope split", before: "1,200.000", after: "1,260.000" }] },
    ]);
    await openEditor();
    const banner = await screen.findByTestId("drift-banner", {}, { timeout: 4000 });
    expect(banner.textContent).toContain("one text was written");
    fireEvent.click(within(banner).getByRole("button", { name: "Review changes" }));
    const list = await screen.findByTestId("drift-list");
    expect(within(list).getByText("1,260.000")).toBeTruthy(); // #209: the figure is the server's display, 3 decimals
    fireEvent.click(within(list).getByRole("button", { name: "Mark as checked" }));
    await waitFor(
      () => {
        const last = docPatches[docPatches.length - 1];
        const el = (last?.pages ?? []).flatMap((p) => (p.kind === "freeform" ? p.elements : [])).find((e) => e.id === "p-summary.body");
        expect(el?.basedOnHash).toBe(MOCK_DATA_HASH);
      },
      { timeout: 4000 },
    );
    await waitFor(() => expect(screen.queryByTestId("drift-banner")).toBeNull());
  });
});

describe("Save as template and version history", () => {
  it("File ▾ → Save as template saves the design as a company template", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "File ▾" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Save as template…" }));
    const dialog = await screen.findByRole("dialog", { name: "Save as template" });
    const name = within(dialog).getByLabelText(/Name/) as HTMLInputElement;
    expect(name.value).toMatch(/template$/);
    fireEvent.change(name, { target: { value: "Our GHG look" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save as template" })).toBeNull());
  });

  it("lists versions (named pinned, autosaves by day), previews one and restores it as the draft", async () => {
    const router = createMemoryRouter(
      [
        { path: "/studio/:id/versions", element: <VersionsPage /> },
        { path: "/studio/:id", element: <p>Editor opened</p> },
      ],
      { initialEntries: ["/studio/1/versions"] },
    );
    render(
      <QueryClientProvider client={client()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByTestId("studio-versions");
    expect(await screen.findByText("No versions yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Name this version" }));
    const dialog = await screen.findByRole("dialog", { name: "Name this version" });
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Sent to the board" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const pinned = await screen.findByRole("region", { name: "Named versions and finals" });
    expect(within(pinned).getByText("Sent to the board")).toBeTruthy();
    expect(await screen.findByTitle("Version 1, read-only")).toBeTruthy();
    fireEvent.click(screen.getByTestId("restore-version"));
    const confirm = await screen.findByRole("dialog", { name: "Restore version 1?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("Editor opened")).toBeTruthy();
  });
});
