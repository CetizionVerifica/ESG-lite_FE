import { afterEach, describe, expect, it } from "vitest";
import { getCommentHandler, getDrawer, getToolbar, isFallbackDrawer, registerCommentHandler, registerDrawer, registerToolbar, registryVersion, resetRegistry, subscribeRegistry, toolbarKeyFor } from "./registry";

const A = () => null;
const B = () => null;

describe("editor registry", () => {
  afterEach(() => resetRegistry());

  it("registers drawers; a fallback never replaces a real drawer, a real one replaces a fallback", () => {
    registerDrawer("elements", A, { fallback: true });
    expect(getDrawer("elements")).toBe(A);
    expect(isFallbackDrawer("elements")).toBe(true);
    registerDrawer("elements", B);
    expect(getDrawer("elements")).toBe(B);
    registerDrawer("elements", A, { fallback: true });
    expect(getDrawer("elements")).toBe(B);
    expect(getDrawer("ai")).toBeNull();
  });

  it("toolbar registry: per type, page and multi; fallbacks lose", () => {
    registerToolbar("chart", A, { fallback: true });
    registerToolbar("chart", B);
    registerToolbar("chart", A, { fallback: true });
    expect(getToolbar("chart")).toBe(B);
    registerToolbar("page", A);
    expect(getToolbar("page")).toBe(A);
    expect(getToolbar("table")).toBeNull();
  });

  it("picks the toolbar key from the selection", () => {
    expect(toolbarKeyFor([])).toBe("page");
    expect(toolbarKeyFor([{ type: "chart" }, { type: "chart" }])).toBe("chart");
    expect(toolbarKeyFor([{ type: "chart" }, { type: "text" }])).toBe("multi");
  });

  it("notifies subscribers and keeps the DS-13 comment handler over the stub", () => {
    let calls = 0;
    const off = subscribeRegistry(() => (calls += 1));
    const v = registryVersion();
    registerDrawer("pages", A);
    expect(calls).toBe(1);
    expect(registryVersion()).toBe(v + 1);
    off();
    const real = () => undefined;
    const stub = () => undefined;
    registerCommentHandler(real);
    registerCommentHandler(stub, { fallback: true });
    expect(getCommentHandler()).toBe(real);
  });
});
