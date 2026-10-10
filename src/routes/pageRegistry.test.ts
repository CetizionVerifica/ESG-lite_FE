import { describe, expect, it } from "vitest";
import { SHELL_ROUTES, type ShellRouteId } from "../features/shell/routeMap";
import { legacyPages } from "./legacyPages";
import { type ModuleRoutesFile, collectModulePages } from "./pageRegistry";

const fallback = Object.fromEntries(SHELL_ROUTES.map((r) => [r.id, `fallback:${r.id}`])) as Record<ShellRouteId, string>;

describe("collectModulePages", () => {
  it("lets a module override the fallback and keeps the rest", () => {
    const pages = collectModulePages({ "a/routes.tsx": { pages: { team: "team page" } } }, fallback);
    expect(pages.team).toBe("team page");
    expect(pages.sites).toBe("fallback:sites");
  });

  it("rejects a route claimed by two modules", () => {
    const files = { "a/routes.tsx": { pages: { team: "a" } }, "b/routes.tsx": { pages: { team: "b" } } };
    expect(() => collectModulePages(files, fallback)).toThrow(/"team" is registered by both a\/routes.tsx and b\/routes.tsx/);
  });

  it("rejects a route id the route map doesn't know", () => {
    const files = { "a/routes.tsx": { pages: { nope: "x" } as never } };
    expect(() => collectModulePages(files, fallback)).toThrow(/unknown shell route "nope"/);
  });
});

describe("module route files", () => {
  const files = import.meta.glob<ModuleRoutesFile>("../features/*/routes.tsx", { eager: true });

  it("register each shell route at most once, and only known ones", () => {
    expect(() => collectModulePages(files, legacyPages)).not.toThrow();
  });

  it("cover every route the legacy table only holds a placeholder for, except the open slots", () => {
    const owned = new Set(Object.values(files).flatMap((file) => Object.keys(file.pages ?? {})));
    const placeholderOnly = SHELL_ROUTES.map((r) => r.id).filter(
      (id) => (legacyPages[id] as { type?: { name?: string } })?.type?.name === "PlaceholderPage" && !owned.has(id),
    );
    expect(placeholderOnly.sort()).toEqual(["pcf"]);
  });
});
