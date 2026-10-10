import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import ocrApi, { ocrAuthHeaders } from "./ocrAxios";

function stubToken(token: string | null) {
  vi.stubGlobal("localStorage", { getItem: (key: string) => (key === "token" ? token : null) });
}

async function sentHeaders(): Promise<InternalAxiosRequestConfig["headers"]> {
  let seen: InternalAxiosRequestConfig | undefined;
  const adapter: AxiosAdapter = async (config) => {
    seen = config;
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
  await ocrApi.get("/v1/invoices", { adapter });
  if (!seen) throw new Error("request was not sent");
  return seen.headers;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ocrApi", () => {
  it("sends the sign-in token as a Bearer header", async () => {
    stubToken("abc.def.ghi");
    expect((await sentHeaders()).Authorization).toBe("Bearer abc.def.ghi");
  });

  it("sends no Authorization header when signed out", async () => {
    stubToken(null);
    expect((await sentHeaders()).Authorization).toBeUndefined();
  });
});

describe("ocrAuthHeaders", () => {
  it("builds the header for raw fetch calls", () => {
    stubToken("t0k");
    expect(ocrAuthHeaders()).toEqual({ Authorization: "Bearer t0k" });
  });

  it("is empty when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(ocrAuthHeaders()).toEqual({});
  });
});
