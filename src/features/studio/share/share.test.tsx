// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { ToastProvider } from "../../../ui";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockEnabled, setStudioMockFinalBlocked, setStudioMockJobPolls, studioMockShares } from "../../../test/msw/studio";
import { DownloadMenu } from "./DownloadMenu";
import { ShareMenu } from "./ShareMenu";
import PublicViewerPage from "./PublicViewerPage";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));

const server = setupServer(...handlers);
const created: Blob[] = [];
const clicks: string[] = [];
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  URL.createObjectURL = vi.fn((b: Blob) => {
    created.push(b);
    return `blob:mock/${created.length}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    clicks.push(this.download);
  };
});
beforeEach(() => {
  resetStudioMocks();
  setStudioMockJobPolls(1);
  created.length = 0;
  clicks.length = 0;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderAt(element: React.ReactNode, path = "/studio/1", route = "/studio/:id") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: route, element }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe("DownloadMenu", () => {
  it("makes a PDF for screens through a render job and saves the file", async () => {
    const user = userEvent.setup();
    renderAt(<DownloadMenu docId={1} canFinal pageCount={5} />);
    await user.click(screen.getByTestId("download-menu"));
    const menu = screen.getByRole("menu", { name: "Download" });
    expect(within(menu).getByText("Proof · tagged, with bookmarks")).toBeTruthy();
    await user.click(within(menu).getByTestId("dl-proof"));
    await waitFor(() => expect(clicks).toEqual(["ACME-GHG-Report-2025-proof.pdf"]), { timeout: 4000 });
    expect(created[0].size).toBeGreaterThan(0);
    expect(await screen.findAllByText("PDF for screens is ready.")).not.toHaveLength(0);
  });

  it("print PDF with crop marks and PNG pages with a checked range", async () => {
    const user = userEvent.setup();
    renderAt(<DownloadMenu docId={1} canFinal pageCount={5} />);
    await user.click(screen.getByTestId("download-menu"));
    await user.click(screen.getByTestId("dl-print"));
    expect(screen.getByRole("switch", { name: "Crop marks" }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByTestId("dl-print-go"));
    await waitFor(() => expect(clicks).toContain("ACME-GHG-Report-2025-print.pdf"), { timeout: 4000 });
    await user.click(screen.getByTestId("dl-png"));
    await user.click(screen.getByRole("radio", { name: "A range" }));
    const to = screen.getByLabelText("To page");
    await user.clear(to);
    await user.type(to, "9");
    expect(await screen.findByText("This design has 5 pages.")).toBeTruthy();
    expect((screen.getByTestId("dl-png-go") as HTMLButtonElement).disabled).toBe(true);
    await user.clear(to);
    await user.type(to, "3");
    await user.click(screen.getByRole("radio", { name: "300 dpi (print)" }));
    await user.click(screen.getByTestId("dl-png-go"));
    await waitFor(() => expect(clicks).toContain("ACME-GHG-Report-2025-pages.zip"), { timeout: 4000 });
  });

  it("final PDF: refused with the reasons while checks block; needs a note once a final exists", async () => {
    const user = userEvent.setup();
    setStudioMockFinalBlocked(true);
    renderAt(<DownloadMenu docId={1} canFinal pageCount={5} />);
    await user.click(screen.getByTestId("download-menu"));
    await user.click(screen.getByTestId("dl-final"));
    // DS-12: the final form runs the checks; the mock's market-based warning is ticked first.
    const go = await screen.findByTestId("final-go");
    await screen.findByTestId("final-warnings", undefined, { timeout: 4000 });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    await user.click(go);
    expect(await screen.findByText("Pending entries: 4. Approve them in Review before the final.")).toBeTruthy();
    setStudioMockFinalBlocked(false);
    await user.click(go);
    await waitFor(() => expect(clicks).toContain("ACME-GHG-Report-2025-v1.pdf"), { timeout: 4000 });
    // A second final asks what changed.
    await waitFor(() => expect(screen.getByLabelText(/What changed since the last final/)).toBeTruthy());
    expect((screen.getByTestId("final-go") as HTMLButtonElement).disabled).toBe(true);
  });

  it("an Admin can't make the final", async () => {
    const user = userEvent.setup();
    renderAt(<DownloadMenu docId={1} canFinal={false} />);
    await user.click(screen.getByTestId("download-menu"));
    const final = screen.getByTestId("dl-final");
    expect(final.getAttribute("aria-disabled")).toBe("true");
    expect(final.textContent).toContain("Only a Manager can make the final.");
  });
});

describe("ShareMenu and the view link dialog", () => {
  it("creates a link to a proof, shows it once with Copy, lists it with views, and revokes it", async () => {
    const user = userEvent.setup();
    renderAt(<ShareMenu docId={1} canShare />);
    await user.click(screen.getByTestId("share-menu"));
    const menu = screen.getByRole("menu", { name: "Share" });
    expect(within(menu).getByText("Comment, @mention people with studio access, assign tasks.")).toBeTruthy(); // DS-13
    await user.click(within(menu).getByTestId("share-view-link"));
    const dialog = await screen.findByRole("dialog", { name: "View link" });
    // Nothing stored yet: make a proof first.
    await user.click(await within(dialog).findByRole("button", { name: "Make a PDF proof" }));
    const what = await within(dialog).findByLabelText("What to share", undefined, { timeout: 4000 });
    expect((what as HTMLSelectElement).selectedOptions[0].textContent).toMatch(/^PDF proof · /);
    expect((within(dialog).getByLabelText("Link expires after") as HTMLSelectElement).value).toBe("14");
    await user.selectOptions(within(dialog).getByLabelText("Link expires after"), "30");
    await user.click(within(dialog).getByRole("button", { name: "Create link" }));
    const link = (await within(dialog).findByLabelText("Link to share")) as HTMLInputElement;
    expect(link.value).toMatch(/^https:\/\/app\.example\/s\/mock-token-1/);
    expect(within(dialog).getByText(/shown only once/)).toBeTruthy();
    const list = await within(dialog).findByTestId("view-link-list");
    expect(list.textContent).toContain("Active");
    expect(list.textContent).toMatch(/expires .* · 0 views/);
    await user.click(within(list).getByRole("button", { name: /^Revoke / }));
    await user.click(within(list).getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(within(dialog).getByTestId("view-link-list").textContent).toContain("Turned off"));
    expect(studioMockShares()[0].state).toBe("revoked");
  });

  it("only a Manager creates view links", async () => {
    const user = userEvent.setup();
    renderAt(<ShareMenu docId={1} canShare={false} />);
    await user.click(screen.getByTestId("share-menu"));
    const item = screen.getByTestId("share-view-link");
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.textContent).toContain("Only a Manager can create a view link.");
  });
});

describe("PublicViewerPage (/s/:token)", () => {
  async function makeLink(): Promise<string> {
    const user = userEvent.setup();
    renderAt(<ShareMenu docId={1} canShare />);
    await user.click(screen.getByTestId("share-menu"));
    await user.click(screen.getByTestId("share-view-link"));
    const dialog = await screen.findByRole("dialog", { name: "View link" });
    await user.click(await within(dialog).findByRole("button", { name: "Make a PDF proof" }));
    await within(dialog).findByLabelText("What to share", undefined, { timeout: 4000 });
    await user.click(within(dialog).getByRole("button", { name: "Create link" }));
    await within(dialog).findByLabelText("Link to share");
    cleanup();
    return studioMockShares()[0].token;
  }

  it("shows the stored PDF, read only, with its expiry and a download", async () => {
    const token = await makeLink();
    renderAt(<PublicViewerPage />, `/s/${token}`, "/s/:token");
    const page = await screen.findByTestId("public-viewer");
    expect(within(page).getByRole("heading", { level: 1 }).textContent).toBeTruthy();
    expect(page.textContent).toMatch(/Proof · .* · Read only · Link expires/);
    // The API's file URL (VITE_API_URL + /s/:token/file): the stored PDF, never the app.
    expect(page.querySelector("iframe")?.getAttribute("src")).toMatch(new RegExp(`/s/${token}/file$`));
    expect(within(page).getByRole("link", { name: /Download PDF/ }).getAttribute("href")).toMatch(new RegExp(`/s/${token}/file\\?download=1$`));
    expect(studioMockShares()[0].views).toBe(1);
  });

  it("an expired or turned-off link says so; an unknown one is not found", async () => {
    const token = await makeLink();
    setStudioMockEnabled(false);
    renderAt(<PublicViewerPage />, `/s/${token}`, "/s/:token");
    expect(await screen.findByText("This link has expired.")).toBeTruthy();
    cleanup();
    renderAt(<PublicViewerPage />, "/s/nope", "/s/:token");
    expect(await screen.findByText("Link not found.")).toBeTruthy();
  });
});
