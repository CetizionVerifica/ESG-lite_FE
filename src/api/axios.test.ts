import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { resetSessionExpiry } from "./axios";

let store: Record<string, string>;
let replace: ReturnType<typeof vi.fn>;

function respondWith(status: number): AxiosAdapter {
  return async (config) => {
    const response = { data: {}, status, statusText: "", headers: {}, config } as AxiosResponse;
    if (status >= 400) {
      throw new AxiosError("failed", "ERR_BAD_REQUEST", config, null, response);
    }
    return response;
  };
}

function signedInAt(path: string, role = "Manager") {
  store = { token: "abc", role, user: "{}" };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    clear: () => {
      store = {};
    },
  });
  replace = vi.fn();
  vi.stubGlobal("window", { location: { pathname: path, replace } });
}

beforeEach(() => resetSessionExpiry());
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api 401 handling", () => {
  it("clears the session and sends the person to sign-in", async () => {
    signedInAt("/overview");
    await expect(api.get("/emissions", { adapter: respondWith(401) })).rejects.toBeInstanceOf(AxiosError);
    expect(store).toEqual({});
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("sends a Superadmin to the staff sign-in", async () => {
    signedInAt("/clients", "Superadmin");
    await expect(api.get("/x", { adapter: respondWith(401) })).rejects.toBeTruthy();
    expect(replace).toHaveBeenCalledWith("/superadmin/login");
  });

  it("redirects once when many requests fail together", async () => {
    signedInAt("/overview");
    await Promise.allSettled([1, 2, 3].map(() => api.get("/x", { adapter: respondWith(401) })));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("ignores other errors, the sign-in call and sign-in pages", async () => {
    signedInAt("/overview");
    await expect(api.get("/x", { adapter: respondWith(403) })).rejects.toBeTruthy();
    await expect(api.post("/auth/login", {}, { adapter: respondWith(401) })).rejects.toBeTruthy();
    signedInAt("/login");
    await expect(api.get("/x", { adapter: respondWith(401) })).rejects.toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores a 401 on a request sent without a token", async () => {
    signedInAt("/overview");
    store = {};
    await expect(api.get("/x", { adapter: respondWith(401) })).rejects.toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
