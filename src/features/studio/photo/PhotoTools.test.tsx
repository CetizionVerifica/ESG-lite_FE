// @vitest-environment jsdom
// PE-1 · the photo tools on the cover frame against the MSW studio mocks:
// remove background (job polled → the frame shows the derived asset, the
// original kept, Restore original), the "not set up" state for
// DS_BG_UNAVAILABLE, Adjust sliders merge into one undo step, a filter preset,
// a brand duotone, transparency, Reset all, and the before/after view.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { handlers, resetStudioMocks, studioMockDoc } from "../../../test/msw";
import { setStudioMockBgRemover } from "../../../test/msw/studio";
import type { FreeformPage } from "../../../lib/studio/contracts";
import { PX_PER_MM } from "../../../lib/studio/geometry";
import { Editor } from "../editor/Editor";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

const server = setupServer(...handlers);

class PointerEventShim extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  (window as unknown as { PointerEvent: typeof PointerEventShim }).PointerEvent = PointerEventShim;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
});
beforeEach(() => {
  resetStudioMocks();
  sessionStorage.clear();
  // The fixture's cover photo is template-locked; these tests edit it as a free picture.
  const cover = (studioMockDoc(1)?.doc.pages.find((p) => p.id === "p-cover") as FreeformPage).elements.find((e) => e.id === "p-cover.bg");
  if (cover) delete cover.templateLocked;
});
afterEach(() => cleanup());
afterAll(() => server.close());

const at = (zoom: number, x: number, y: number) => ({ clientX: x * PX_PER_MM * zoom, clientY: y * PX_PER_MM * zoom, button: 0 });

async function selectCover() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Editor docId={1} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  const overlay = await screen.findByTestId("overlay-p-cover");
  const z = Number(screen.getByTestId("zoom-value").textContent?.replace("%", "")) / 100;
  fireEvent.pointerDown(overlay, at(z, 100, 40));
  fireEvent.pointerUp(overlay, at(z, 100, 40));
  await waitFor(() => expect(screen.getByTestId("context-toolbar").dataset.toolbar).toBe("frame"));
}

/** The cover frame's props in the editor (read from the autosaved mock doc once saved). */
const savedCover = () => (studioMockDoc(1)?.doc.pages.find((p) => p.id === "p-cover") as FreeformPage).elements.find((e) => e.id === "p-cover.bg")?.props as Record<string, unknown>;
const undoLabel = () => screen.getByRole("button", { name: /^Undo/ }).getAttribute("aria-label") ?? screen.getByRole("button", { name: /^Undo/ }).textContent;

describe("Photo tools (PE-1)", () => {
  it("removes the background with a server job, keeps the original and restores it", async () => {
    setStudioMockBgRemover(true, 1); // one "running" poll, then done
    await selectCover();
    fireEvent.click(screen.getByTestId("photo-remove-bg"));
    fireEvent.click(await screen.findByTestId("photo-remove-bg-run"));
    await waitFor(() => expect(screen.getByText(/Saved as a new image/)).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByRole("button", { name: /^Undo Remove background/ })).toBeTruthy();
    await waitFor(() => expect(savedCover()).toMatchObject({ assetId: "a-plant-nobg-1", originalAssetId: "a-plant" }), { timeout: 4000 });
    expect(screen.getByTestId("photo-original-kept")).toBeTruthy();
    fireEvent.click(screen.getByTestId("photo-restore"));
    expect(screen.getByRole("button", { name: /^Undo Restore original/ })).toBeTruthy();
    await waitFor(() => expect(savedCover().assetId).toBe("a-plant"), { timeout: 4000 });
    expect(savedCover().originalAssetId).toBeUndefined();
  }, 15_000);

  it("says the background remover isn't set up for DS_BG_UNAVAILABLE and leaves the picture", async () => {
    setStudioMockBgRemover(false);
    await selectCover();
    fireEvent.click(screen.getByTestId("photo-remove-bg"));
    fireEvent.click(await screen.findByTestId("photo-remove-bg-run"));
    expect(await screen.findByText("Background remover isn't set up on this server yet")).toBeTruthy();
    expect(screen.getByText(/Your picture is unchanged/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Undo/ }).hasAttribute("disabled")).toBe(true);
  });

  it("Adjust: a slider drag is one undo step; Reset all clears the edits", async () => {
    await selectCover();
    fireEvent.click(screen.getByTestId("photo-adjust"));
    const panel = await screen.findByTestId("photo-adjust-panel");
    const brightness = within(panel).getByLabelText("Brightness");
    for (const v of [4, 8, 12]) fireEvent.change(brightness, { target: { value: String(v) } });
    expect(within(panel).getByText("+12")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("Warmth"), { target: { value: "-5" } });
    expect(within(panel).getByText("−5")).toBeTruthy();
    expect(undoLabel()).toMatch(/Warmth/);
    fireEvent.click(screen.getByRole("button", { name: /^Undo Warmth/ }));
    expect(undoLabel()).toMatch(/Brightness/);
    await waitFor(() => expect(savedCover().adjust).toEqual({ brightness: 12 }), { timeout: 4000 });
    fireEvent.click(within(panel).getByTestId("photo-reset"));
    await waitFor(() => expect(savedCover().adjust).toBeUndefined(), { timeout: 4000 });
  });

  it("Filters and Duotone set the props the renderer draws; transparency is the element opacity", async () => {
    await selectCover();
    fireEvent.click(screen.getByTestId("photo-filters"));
    const filters = await screen.findByTestId("photo-filter-panel");
    fireEvent.click(within(filters).getByRole("button", { name: /Mono/ }));
    expect(screen.getByRole("button", { name: /^Undo Filter: Mono/ })).toBeTruthy();
    fireEvent.click(screen.getByTestId("photo-duotone"));
    const duo = await screen.findByTestId("photo-duotone-panel");
    const first = (await within(duo).findAllByRole("button", { name: /duotone$/ }))[0];
    fireEvent.click(first);
    expect(first.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Transparency/ }));
    fireEvent.change(screen.getByRole("slider", { name: "Transparency" }), { target: { value: "70" } });
    await waitFor(
      () => {
        const p = savedCover();
        expect(p.filter).toBe("mono");
        expect(p.duotone).toMatchObject({ dark: expect.stringMatching(/^#[0-9a-f]{6}$/), light: expect.stringMatching(/^#[0-9a-f]{6}$/) });
        const el = (studioMockDoc(1)?.doc.pages.find((p) => p.id === "p-cover") as FreeformPage).elements.find((e) => e.id === "p-cover.bg");
        expect(el?.opacity).toBe(0.7);
      },
      { timeout: 4000 },
    );
  });

  it("Before/after shows the original next to the edit", async () => {
    await selectCover();
    expect(screen.getByTestId("photo-compare").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("photo-filters"));
    fireEvent.click(within(await screen.findByTestId("photo-filter-panel")).getByRole("button", { name: /Vivid/ }));
    fireEvent.click(screen.getByTestId("photo-compare"));
    const panel = await screen.findByTestId("photo-compare-panel");
    expect(within(panel).getByRole("img", { name: "Before" })).toBeTruthy();
    expect(within(panel).getByRole("img", { name: "After" })).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("Before and after split"), { target: { value: "30" } });
    expect(within(panel).getByTestId("photo-compare-before").style.clipPath).toBe("inset(0 70% 0 0)");
  });
});
