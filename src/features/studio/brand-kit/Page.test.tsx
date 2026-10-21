// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";
import api from "../../../api/axios";
import type { BrandFont, BrandFontsResponse } from "../../../lib/studio/contracts";
import { ToastProvider } from "../../../ui";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockBrandKit, setStudioMockEnabled, studioMockBrandKit } from "../../../test/msw/studio";
import { BrandKitPage } from "./Page";

const auth = vi.hoisted(() => ({ role: "Manager" as string }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: auth.role, user: {} }) }));

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetStudioMocks();
  auth.role = "Manager";
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

const MIDAL: BrandFont = {
  id: 1,
  ref: "custom:1",
  family: "Midal Sans",
  weights: [400],
  styles: ["normal"],
  assetIds: ["font-1"],
  files: [{ assetId: "font-1", weight: 400, style: "normal", format: "woff2", bytes: 8, url: "/studio/brand-kit/fonts/1/files/font-1" }],
  licenceConfirmedBy: 2,
  licenceConfirmedAt: "2026-10-20T00:00:00.000Z",
  createdAt: "2026-10-20T00:00:00.000Z",
};
afterAll(() => server.close());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/studio/brand-kit", element: <BrandKitPage /> }], { initialEntries: ["/studio/brand-kit"] });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("BrandKitPage", () => {
  it("shows logos, fonts, voice and palettes with a contrast badge; Managers save changes", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "Brand kit · ACME" })).toBeTruthy();
    expect(screen.getByAltText("Logo on light")).toBeTruthy();
    expect(screen.getByTestId("logo-support").textContent).toBe("Ask ESGLite support to change logos.");
    const palette = screen.getByTestId("palette-0");
    expect(within(palette).getByDisplayValue("Primary")).toBeTruthy();
    expect(screen.getByTestId("contrast-0").textContent).toContain("for text");

    const save = screen.getByRole("button", { name: "Save brand kit" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    await user.type(screen.getByLabelText("How your reports should sound"), "Plain and specific.");
    await user.selectOptions(screen.getByLabelText("Headings"), "dm-serif-display");
    await user.click(screen.getByRole("button", { name: "Add palette" }));
    expect(screen.getByTestId("palette-1")).toBeTruthy();
    expect(screen.getByTestId("bk-status").textContent).toBe("Unsaved changes");

    await user.click(save);
    await waitFor(() => expect(studioMockBrandKit().voice).toBe("Plain and specific."));
    const kit = studioMockBrandKit();
    expect(kit.fonts).toEqual({ heading: "dm-serif-display", body: "source-sans-3" });
    expect(kit.palettes.map((p) => p.name)).toEqual(["Primary", "Palette 2"]);
    expect(kit.palettes[0].id).toBe(1);
    await waitFor(() => expect(screen.getByTestId("bk-status").textContent).toMatch(/^Last saved/));
  });

  it("reorders and removes palettes, and blocks Save while a palette has no name", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("palette-0");
    await user.click(screen.getByRole("button", { name: "Add palette" }));
    const name = within(screen.getByTestId("palette-1")).getByLabelText("Palette name");
    await user.clear(name);
    expect(screen.getByText("Name the palette.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save brand kit" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(name, "Charts");
    await user.click(screen.getByRole("button", { name: "Move Charts up" }));
    expect(within(screen.getByTestId("palette-0")).getByDisplayValue("Charts")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete Primary" }));
    await user.click(screen.getByRole("button", { name: "Save brand kit" }));
    await waitFor(() => expect(studioMockBrandKit().palettes.map((p) => p.name)).toEqual(["Charts"]));
  });

  it("is read-only for Admins", async () => {
    setStudioMockBrandKit({ canEdit: false });
    auth.role = "Admin";
    renderPage();
    expect(await screen.findByText("Only Managers can change the brand kit. You can use it in every design.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save brand kit" })).toBeNull();
    expect(screen.queryByLabelText("Palette name")).toBeNull();
    expect(screen.getByText("Primary")).toBeTruthy();
  });

  // PE-2 · brand fonts. jsdom's XHR never completes a multipart request through MSW, so the upload
  // call itself is stubbed; src/test/msw/studioPro.test.ts covers the mock's real form checks.
  it("Managers upload a font: fields guessed from the file name, the licence tick is required, then it is listed", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    const section = (await screen.findByRole("heading", { name: "Brand fonts" })).closest("section") as HTMLElement;
    expect(await within(section).findByText(/No uploaded fonts yet/)).toBeTruthy();
    const input = section.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array([0x77, 0x4f, 0x46, 0x32])], "MidalSans-Bold.woff2"));
    expect((within(section).getByLabelText("Font family") as HTMLInputElement).value).toBe("Midal Sans");
    expect((within(section).getByLabelText("Weight") as HTMLSelectElement).value).toBe("700");
    const post = vi.spyOn(api, "post");
    await user.click(within(section).getByRole("button", { name: "Upload font" }));
    expect(within(section).getByText("Confirm that your company holds a licence to embed this font in PDFs.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    const font: BrandFont = { ...MIDAL, files: [{ ...MIDAL.files[0], weight: 700 }], weights: [700] };
    post.mockImplementationOnce(async () => {
      server.use(http.get("*/studio/brand-kit/fonts", () => HttpResponse.json<BrandFontsResponse>({ fonts: [font], canEdit: true })));
      return { data: font };
    });
    await user.click(within(section).getByLabelText("We hold a licence that allows embedding this font in PDFs."));
    await user.click(within(section).getByRole("button", { name: "Upload font" }));
    expect(await within(section).findByTestId("brand-font-1")).toBeTruthy();
    const [url, form] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/studio/brand-kit/fonts");
    expect([form.get("family"), form.get("weight"), form.get("style"), form.get("licenceConfirmed"), (form.get("file") as File).name]).toEqual(["Midal Sans", "700", "normal", "true", "MidalSans-Bold.woff2"]);
    expect(within(section).getByText("· Bold")).toBeTruthy();
    expect(within(section).getByText("Embedded in PDF")).toBeTruthy();
    post.mockRestore();
  });

  it("shows the server's reason when an upload is refused (wrong type, too large, exists)", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    const section = (await screen.findByRole("heading", { name: "Brand fonts" })).closest("section") as HTMLElement;
    await within(section).findByText(/No uploaded fonts yet/);
    await user.upload(section.querySelector('input[type="file"]') as HTMLInputElement, new File(["not a font"], "Fake.ttf"));
    await user.click(within(section).getByLabelText("We hold a licence that allows embedding this font in PDFs."));
    const post = vi.spyOn(api, "post");
    for (const [code, text] of [
      ["DS_FONT_TYPE", "Upload a WOFF2, TTF or OTF font."],
      ["DS_FONT_TOO_LARGE", "Fonts can be up to 5 MB."],
      ["DS_FONT_EXISTS", "This font family already has that weight and style."],
    ]) {
      post.mockImplementationOnce(async () => Promise.reject({ response: { status: 400, data: { code } } }));
      await user.click(within(section).getByRole("button", { name: "Upload font" }));
      expect(await within(section).findByText(text)).toBeTruthy();
    }
    post.mockRestore();
  });

  it("deleting a font asks inline first", async () => {
    server.use(http.get("*/studio/brand-kit/fonts", () => HttpResponse.json<BrandFontsResponse>({ fonts: [MIDAL], canEdit: true })));
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId("brand-font-1");
    const del = vi.spyOn(api, "delete").mockImplementationOnce(async () => ({ data: null }));
    await user.click(within(row).getByRole("button", { name: "Delete Midal Sans" }));
    expect(within(row).getByText(/Text using it switches to its style's font/)).toBeTruthy();
    await user.click(within(row).getByRole("button", { name: "Keep it" }));
    expect(del).not.toHaveBeenCalled();
    await user.click(within(row).getByRole("button", { name: "Delete Midal Sans" }));
    await user.click(within(row).getByRole("button", { name: "Delete font" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/studio/brand-kit/fonts/1", expect.anything()));
    del.mockRestore();
  });

  it("brand fonts are read-only for Admins", async () => {
    setStudioMockBrandKit({ canEdit: false });
    server.use(http.get("*/studio/brand-kit/fonts", () => HttpResponse.json<BrandFontsResponse>({ fonts: [MIDAL], canEdit: false })));
    auth.role = "Admin";
    renderPage();
    const row = await screen.findByTestId("brand-font-1");
    expect(within(row).queryByRole("button", { name: "Delete Midal Sans" })).toBeNull();
    expect(screen.getByText("Only Managers can upload or delete brand fonts.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Upload font" })).toBeNull();
  });

  it("shows an error state when the studio is off", async () => {
    setStudioMockEnabled(false);
    renderPage();
    expect(await screen.findByText("The brand kit couldn't be loaded.")).toBeTruthy();
    expect(screen.getByText("Design Studio isn't turned on for your company.")).toBeTruthy();
  });
});
