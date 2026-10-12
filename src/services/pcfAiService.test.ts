import { describe, expect, it } from "vitest";
import { aiErrorMessage, aiUnreachable } from "./pcfAiService";

const err = (status?: number, data?: unknown) => (status === undefined ? new Error("Network Error") : { response: { status, data } });

describe("aiUnreachable", () => {
  it("is true when the service never answered or failed", () => {
    expect(aiUnreachable(err())).toBe(true);
    expect(aiUnreachable(err(500, { detail: "boom" }))).toBe(true);
    expect(aiUnreachable(err(503))).toBe(true);
  });
  it("is true for a service without the route or refusing the token", () => {
    for (const s of [401, 403, 404, 405]) expect(aiUnreachable(err(s, { detail: "Not Found" }))).toBe(true);
  });
  it("is true for a 4xx without the service's own detail", () => {
    expect(aiUnreachable(err(400, "<html>bad gateway</html>"))).toBe(true);
    expect(aiUnreachable(err(400, {}))).toBe(true);
  });
  it("is false when the service answered about the file", () => {
    expect(aiUnreachable(err(400, { detail: "Use an .xlsx or .csv file" }))).toBe(false);
    expect(aiUnreachable(err(422, { detail: [{ msg: "field required" }] }))).toBe(false);
  });
});

describe("aiErrorMessage", () => {
  it("prefers the service's detail string", () => {
    expect(aiErrorMessage(err(400, { detail: "Sheet not found" }), "fallback")).toBe("Sheet not found");
    expect(aiErrorMessage(err(422, { detail: [{ msg: "x" }] }), "fallback")).toBe("fallback");
    expect(aiErrorMessage(err(), "fallback")).toBe("fallback");
  });
});
