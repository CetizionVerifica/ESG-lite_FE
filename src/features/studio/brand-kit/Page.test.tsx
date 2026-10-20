// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
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
afterEach(() => cleanup());
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

  it("shows an error state when the studio is off", async () => {
    setStudioMockEnabled(false);
    renderPage();
    expect(await screen.findByText("The brand kit couldn't be loaded.")).toBeTruthy();
    expect(screen.getByText("Design Studio isn't turned on for your company.")).toBeTruthy();
  });
});
