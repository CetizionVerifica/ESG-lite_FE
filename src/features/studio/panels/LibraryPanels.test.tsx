// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { setupServer } from "msw/node";
import ghgFixture from "../../../test/fixtures/studio/ghg-doc.json";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockEnabled, setStudioMockImageGen } from "../../../test/msw/studio";
import type { FreeformPage, ReportDoc, StudioAsset } from "../../../lib/studio/contracts";
import api from "../../../api/axios";
import { ToastProvider } from "../../../ui";
import { ElementsPanel } from "./ElementsPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import { UploadsPanel } from "./UploadsPanel";
import type { StudioPanelProps } from "./types";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetStudioMocks());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
// jsdom has no object URLs; FileDrop previews the picked image with one.
URL.createObjectURL = vi.fn(() => "blob:preview");
URL.revokeObjectURL = vi.fn();

const fresh = () => JSON.parse(JSON.stringify(ghgFixture)) as ReportDoc;
const freeform = (d: ReportDoc, id: string) => d.pages.find((p) => p.id === id) as FreeformPage;

type Panel = (p: StudioPanelProps) => ReactNode;
interface Seen {
  doc: ReportDoc;
  labels: string[];
}

/** A stand-in for the DS-6 shell: the doc, the page in view, the selection and commit. */
function Harness({ Panel, pageId = "p-summary", selection = [], seen }: { Panel: Panel; pageId?: string; selection?: string[]; seen: Seen }) {
  const [doc, setDoc] = useState(fresh);
  seen.doc = doc;
  return (
    <Panel
      doc={doc}
      pageId={pageId}
      selection={selection}
      commit={(next, label) => {
        seen.labels.push(label);
        setDoc(next);
      }}
    />
  );
}

const mount = (Panel: Panel, opts: { pageId?: string; selection?: string[] } = {}) => {
  const seen: Seen = { doc: fresh(), labels: [] };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <Harness Panel={Panel} seen={seen} {...opts} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return seen;
};

describe("TemplatesPanel", () => {
  it("lists this doc's kind and format, searches, and applies a template after the confirm", async () => {
    const user = userEvent.setup();
    const seen = mount(TemplatesPanel);
    const panel = await screen.findByTestId("studio-templates-panel");
    await within(panel).findByTestId("template-ghg-inventory-classic");
    expect(within(panel).queryByTestId("template-ghg-board-brief-light")).toBeNull();
    expect(within(panel).queryByTestId("template-sustainability-editorial")).toBeNull();
    expect(within(panel).getByTestId("template-ghg-iso14064-night").textContent).toContain("Night");

    await user.type(within(panel).getByRole("searchbox", { name: "Search templates and layouts" }), "factsheet");
    await waitFor(() => expect(within(panel).queryByTestId("template-ghg-inventory-classic")).toBeNull());
    await user.click(within(panel).getByTestId("template-ghg-one-page-classic"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Replace all pages? Your text edits on pages with the same layout are kept.");
    await user.click(within(dialog).getByRole("button", { name: "Replace all pages" }));
    await waitFor(() => expect(seen.labels).toEqual(["Apply template One-page summary · Classic"]));
    expect(seen.doc.design.templateId).toBe("4");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("adds a page from a layout after the page in view", async () => {
    const user = userEvent.setup();
    const seen = mount(TemplatesPanel, { pageId: "p-cover" });
    const panel = await screen.findByTestId("studio-templates-panel");
    await user.click(within(panel).getByRole("tab", { name: "Page layouts" }));
    await user.click(await within(panel).findByRole("button", { name: "Add page: Executive summary" }));
    expect(seen.labels).toEqual(["Add page Executive summary"]);
    expect(seen.doc.pages).toHaveLength(fresh().pages.length + 1);
    const added = seen.doc.pages[1] as FreeformPage;
    expect(added.layoutId).toBe("ghg-inventory/exec_summary");
    expect(added.elements.every((e) => e.id.startsWith(`${added.id}.`))).toBe(true);
  });

  it("says so when the studio is off", async () => {
    setStudioMockEnabled(false);
    mount(TemplatesPanel);
    expect(await screen.findByText("Templates couldn't be loaded.")).toBeTruthy();
    expect(screen.getByText("Design Studio isn't turned on for your company.")).toBeTruthy();
  });
});

describe("ElementsPanel", () => {
  it("shows the groups, searches by name and tag, and adds at the centre on click", async () => {
    const user = userEvent.setup();
    const seen = mount(ElementsPanel);
    const panel = await screen.findByTestId("studio-elements-panel");
    expect(await within(panel).findByRole("region", { name: "ESG graphics" })).toBeTruthy();
    expect(within(panel).getByRole("region", { name: "Lines and arrows" })).toBeTruthy();
    await user.type(within(panel).getByRole("searchbox", { name: "Search elements" }), "arrow");
    await waitFor(() => expect(within(panel).queryByRole("button", { name: "Add Rectangle" })).toBeNull());
    await user.click(within(panel).getByRole("button", { name: "Add Arrow" }));
    expect(seen.labels).toEqual(["Add Arrow"]);
    const added = freeform(seen.doc, "p-summary").elements.slice(-1)[0];
    expect(added.type).toBe("line");
    expect(added.frame.x + added.frame.w / 2).toBeCloseTo(105, 0);
  });

  it("filters by group and adds an ESG graphic as one group of elements", async () => {
    const user = userEvent.setup();
    const seen = mount(ElementsPanel);
    const panel = await screen.findByTestId("studio-elements-panel");
    await user.click(within(panel).getByRole("button", { name: "ESG graphics", pressed: false }));
    await user.click(await within(panel).findByRole("button", { name: "Add Scope circles" }));
    const els = freeform(seen.doc, "p-summary").elements.slice(-2);
    expect(els.map((e) => e.type)).toEqual(["shape", "shape"]);
    expect(els[0].groupId).toBeTruthy();
    expect(els[0].groupId).toBe(els[1].groupId);
  });

  it("can't add to a flow section", async () => {
    mount(ElementsPanel, { pageId: "p-categories" });
    const panel = await screen.findByTestId("studio-elements-panel");
    expect(within(panel).getByText(/Go to a free-form page/)).toBeTruthy();
    expect((await within(panel).findByRole("button", { name: "Add Rectangle" })).hasAttribute("disabled")).toBe(true);
  });
});

describe("UploadsPanel", () => {
  it("lists images by folder and places one on the page", async () => {
    const user = userEvent.setup();
    const seen = mount(UploadsPanel);
    const panel = await screen.findByTestId("studio-uploads-panel");
    await within(panel).findByTestId("asset-a-plant");
    await user.click(within(panel).getByRole("button", { name: "Photos" }));
    expect(within(panel).queryByTestId("asset-a-logo")).toBeNull();
    await user.click(within(panel).getByTestId("asset-a-plant"));
    expect(seen.labels).toEqual(["Add image The Bahrain plant at dawn"]);
    const img = freeform(seen.doc, "p-summary").elements.slice(-1)[0];
    expect(img.type === "image" && img.props.assetId).toBe("a-plant");
  });

  it("puts an image into the selected frame", async () => {
    const user = userEvent.setup();
    const seen = mount(UploadsPanel, { pageId: "p-cover", selection: ["p-cover.bg"] });
    const panel = await screen.findByTestId("studio-uploads-panel");
    await user.click(await within(panel).findByTestId("asset-a-logo"));
    const frame = freeform(seen.doc, "p-cover").elements.find((e) => e.id === "p-cover.bg");
    expect(frame?.type === "frame" && frame.props.assetId).toBe("a-logo");
  });

  it("uploads into the open folder; refuses other file types", async () => {
    const user = userEvent.setup({ applyAccept: false });
    mount(UploadsPanel);
    const panel = await screen.findByTestId("studio-uploads-panel");
    await within(panel).findByTestId("asset-a-plant");
    await user.click(within(panel).getByRole("button", { name: "Photos" }));
    // jsdom's XHR never completes a multipart request through MSW, so the upload call itself is
    // stubbed here; the list then refreshes from the mock (src/test/msw/studio.ts reads real forms).
    const uploaded: StudioAsset = { id: "up-9", kind: "image", w: 1200, h: 800, alt: "", folder: "Photos", url: "/mock/site.png", bytes: 4, mime: "image/png" };
    const post = vi.spyOn(api, "post").mockImplementationOnce(async () => ({ data: uploaded }));
    const input = panel.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array([137, 80, 78, 71])], "site.png", { type: "image/png" }));
    expect(await within(panel).findByText(/Uploaded/)).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
    const [url, form] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/studio/assets");
    expect((form.get("file") as File).name).toBe("site.png");
    expect(form.get("folder")).toBe("Photos");
    post.mockRestore();
    await user.upload(input, new File(["x"], "notes.pdf", { type: "application/pdf" }));
    expect((await within(panel).findByRole("alert")).textContent).toContain("notes.pdf");
  });

  it("generates an image when a provider is set up, and explains when it isn't", async () => {
    const user = userEvent.setup();
    mount(UploadsPanel);
    const panel = await screen.findByTestId("studio-uploads-panel");
    await user.type(within(panel).getByRole("textbox", { name: "Generate an image" }), "Green hills at dawn");
    await user.click(within(panel).getByRole("button", { name: "Generate image" }));
    expect(await within(panel).findByText("Image generation isn't available right now.")).toBeTruthy();
    setStudioMockImageGen(true);
    await user.click(within(panel).getByRole("button", { name: "Generate image" }));
    expect(await within(panel).findByTestId("asset-ai-1")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "AI images", pressed: true })).toBeTruthy();
  });

  it("deletes an image after the confirm", async () => {
    const user = userEvent.setup();
    mount(UploadsPanel);
    const panel = await screen.findByTestId("studio-uploads-panel");
    await within(panel).findByTestId("asset-a-logo");
    await user.click(within(panel).getByRole("button", { name: "More actions for ACME logo" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete image" }));
    await waitFor(() => expect(within(panel).queryByTestId("asset-a-logo")).toBeNull());
  });
});
