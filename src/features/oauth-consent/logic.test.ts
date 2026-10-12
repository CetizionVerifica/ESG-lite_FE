import { describe, expect, it } from "vitest";
import { NEVER_SENTENCE, SUPERADMIN_ONLY_MESSAGE, canAllow, consentError, consentPath, isSafeRedirect, refusalMessage, scopeSentences, switchHint } from "./logic";

const user = (role: string) => ({ user_id: 1, name: "Sam", email: "sam@example.com", role });

describe("scopeSentences", () => {
  it("turns scopes into sentences in a fixed order and drops unknown ones", () => {
    expect(scopeSentences([{ scope: "imports:write" }, { scope: "imports:read" }, { scope: "admin:all" }])).toEqual([
      "Read your clients' sites, categories, data-entry forms and activity names.",
      "Create entries for review. It can't approve, edit or delete anything.",
    ]);
    expect(scopeSentences([])).toEqual([]);
    expect(NEVER_SENTENCE).toMatch(/can't approve, reject, edit or delete/);
  });
});

describe("who may allow", () => {
  it("only a Superadmin the server also clears", () => {
    expect(canAllow({ can_allow: true, user: user("Superadmin") })).toBe(true);
    expect(canAllow({ can_allow: true, user: user("Manager") })).toBe(false);
    expect(canAllow({ can_allow: false, user: user("Superadmin") })).toBe(false);
  });
  it("gives the refusal line for Admin, Manager and User", () => {
    for (const role of ["Admin", "Manager", "User"]) {
      expect(refusalMessage({ can_allow: false, refusal: { code: "MCP_SUPERADMIN_ONLY", message: "Only ESGLite staff (Superadmin) can connect Claude." }, user: user(role) })).toBe(SUPERADMIN_ONLY_MESSAGE);
    }
    expect(refusalMessage({ can_allow: false, refusal: null, user: user("Manager") })).toBe(SUPERADMIN_ONLY_MESSAGE);
    expect(refusalMessage({ can_allow: true, refusal: null, user: user("Superadmin") })).toBeNull();
  });
});

describe("hints and redirects", () => {
  it("hints when no client has the switch on", () => {
    expect(switchHint(0)).toMatch(/Allow Claude imports/);
    expect(switchHint(2)).toBeNull();
  });
  it("follows only http(s) URLs", () => {
    expect(isSafeRedirect("https://claude.ai/api/mcp/auth_callback?code=x")).toBe(true);
    expect(isSafeRedirect("http://localhost:6274/cb")).toBe(true);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirect("/overview")).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
  });
  it("builds the return path with the request encoded", () => {
    expect(consentPath("a.b/c")).toBe("/oauth/consent?request=a.b%2Fc");
  });
});

describe("consentError", () => {
  it("prefers the server's message, code and way back", () => {
    const e = consentError({ response: { status: 403, data: { code: "MCP_SUPERADMIN_ONLY", message: "Only staff.", redirect_to: "https://claude.ai/cb?error=access_denied" } } }, "x");
    expect(e).toEqual({ code: "MCP_SUPERADMIN_ONLY", message: "Only staff.", redirectTo: "https://claude.ai/cb?error=access_denied" });
  });
  it("falls back for a bare status, and names the network for no status", () => {
    expect(consentError({ response: { status: 500, data: {} } }, "Fallback").message).toBe("Fallback");
    expect(consentError(new Error("boom"), "Fallback").message).toMatch(/couldn't reach ESGLite/);
    expect(consentError({ response: { status: 400, data: { redirect_to: "javascript:x" } } }, "F").redirectTo).toBeNull();
  });
});
