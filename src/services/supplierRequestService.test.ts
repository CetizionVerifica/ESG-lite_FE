// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import api from "../api/axios";
import { openPublicRequest, publicApi, submitPublicRequest } from "./supplierRequestService";

const ok = vi.fn(async (config) => ({ data: { status: "sent" }, status: 200, statusText: "OK", headers: {}, config }));

// The supplier's public page has no account: a manager's stored session token
// must never ride along to the public endpoints.
describe("public supplier request calls", () => {
  afterEach(() => {
    localStorage.removeItem("token");
    ok.mockClear();
  });

  it("send no Authorization header even when a session token is stored", async () => {
    localStorage.setItem("token", "manager-jwt");
    publicApi.defaults.adapter = ok;
    await openPublicRequest("tok-1");
    await submitPublicRequest("tok-1", { value_kgco2e: 1, boundary: "cradle_to_gate" });
    expect(ok).toHaveBeenCalledTimes(2);
    for (const [config] of ok.mock.calls) {
      expect(config.headers.Authorization ?? config.headers.authorization).toBeUndefined();
    }
    expect(ok.mock.calls[0][0].url).toContain("/public/supplier-requests/tok-1");
    expect(ok.mock.calls[1][0].url).toContain("/public/supplier-requests/tok-1/submit");
  });

  it("differ from the signed-in client, which does attach the token", async () => {
    localStorage.setItem("token", "manager-jwt");
    api.defaults.adapter = ok;
    await api.get("/pcf/supplier-requests");
    expect(ok.mock.calls[0][0].headers.Authorization).toBe("Bearer manager-jwt");
  });
});
