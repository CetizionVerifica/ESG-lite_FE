import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import type { PeriodLockStatus, Scope3ErrorBody, SubmitEmissionsResult } from "../../lib/scope3/contracts";
import { readPeriodLockStatus } from "../../lib/scope3/lock";
import { resetScope3Mocks, scope3Handlers } from "./scope3";
import { addDraft, completeMonth } from "./review";

const server = setupServer(...scope3Handlers);
const API = "http://api.test";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetScope3Mocks());
afterAll(() => server.close());

const post = (path: string, body: unknown) => fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = async <T>(path: string) => (await (await fetch(`${API}${path}`)).json()) as T;
const lockStatus = async (q = "year=2026&month=9") => readPeriodLockStatus(await get<unknown>(`/periods/lock?${q}`), { year: 2026, month: 9 });

describe("S3-15 part 2 mocks: drafts and submit", () => {
  it("lists only the caller's own drafts for the month", async () => {
    const { data } = await get<{ data: { pk_id: number; status: string }[] }>("/user/emissions?status=draft&year=2026&month=9&siteIds=1");
    expect(data.map((r) => r.pk_id)).toEqual([701, 702, 703]);
    expect(data.every((r) => r.status === "draft")).toBe(true);
  });

  it("submits own drafts and refuses the rest per id with a contract code", async () => {
    const res = (await (await post("/user/emissions/submit", { ids: [701, 702, 704, 707] })).json()) as SubmitEmissionsResult;
    expect(res.submitted).toEqual([701, 702]);
    expect(res.refused).toEqual([
      { id: 704, code: "NOT_DRAFT" },
      { id: 707, code: "NOT_DRAFT" },
    ]);
    const { data } = await get<{ data: { pk_id: number }[] }>("/user/emissions?status=draft&year=2026&month=9&siteIds=1");
    expect(data.map((r) => r.pk_id)).toEqual([703]);
  });

  it("refuses a draft in a locked month with PERIOD_LOCKED", async () => {
    // August is locked on Hidd plant; a draft dated in it can't go for approval.
    addDraft(801, 1, 1, "2026-08-31");
    const res = (await (await post("/user/emissions/submit", { ids: [801, 703] })).json()) as SubmitEmissionsResult;
    expect(res).toEqual({ submitted: [703], refused: [{ id: 801, code: "PERIOD_LOCKED" }] });
  });

  it("dry-runs the checks: evidence picked on the row passes EVIDENCE_ATTACHED", async () => {
    expect(await (await post("/user/emissions/check", { pk_id: 705 })).json()).toEqual({ ready: true, held: [] });
    expect(await (await post("/user/emissions/check", { pk_id: 701 })).json()).toEqual({ ready: false, held: ["EVIDENCE_ATTACHED"] });
    expect(await (await post("/user/emissions/check", { pk_id: 701, evidence_count: 1 })).json()).toEqual({ ready: true, held: [] });
  });
});

describe("S3-15 part 2 mocks: close month", () => {
  it("returns per-site completeness, a 15-cell Scope 3 grid and what's left", async () => {
    const s = await lockStatus();
    expect(s.sites.map((x) => x.name)).toEqual(["Hidd plant", "Sitra yard"]);
    expect(s.scope3).toHaveLength(15);
    expect(s.sites[0].categories.find((c) => c.category_id === 3)?.counts).toEqual({ draft: 1, pending: 1, approved: 0, rejected: 0 });
    const reasons = s.left.map((l) => `${l.site_id}:${l.category_id ?? `S3-${l.ghg_category}`}:${l.reason}`);
    expect(reasons).toEqual(["1:1:draft", "1:2:rejected", "1:3:draft", "1:3:pending", "1:11:draft", "1:S3-1:scope3_no_data"]);
  });

  it("marks and unmarks Nothing this month, which the lock view reads", async () => {
    // Sitra yard has nothing owed left; mark Hidd LPG and see it counted.
    expect((await post("/user/my-month/nothing", { site_id: 1, category_id: 2, month: "2026-09-01" })).status).toBe(201);
    expect((await lockStatus()).sites[0].categories.find((c) => c.category_id === 2)?.nothing_this_month).toBe(true);
    await fetch(`${API}/user/my-month/nothing`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ site_id: 1, category_id: 2, month: "2026-09-01" }) });
    expect((await lockStatus()).sites[0].categories.find((c) => c.category_id === 2)?.nothing_this_month).toBe(false);
  });

  it("refuses a lock with items left (PERIOD_INCOMPLETE), then locks once complete", async () => {
    const early = await post("/periods/lock", { site_id: 1, year: 2026, month: 9 });
    expect(early.status).toBe(409);
    expect(((await early.json()) as Scope3ErrorBody).code).toBe("PERIOD_INCOMPLETE");
    completeMonth(2026, 9);
    expect((await lockStatus()).left).toEqual([]);
    expect((await post("/periods/lock", { site_id: null, year: 2026, month: 9 })).status).toBe(201);
    const s = await lockStatus();
    expect(s.sites.every((x) => x.locked)).toBe(true);
    expect(s.sites[1].lock?.site_id).toBeNull();
  });

  it("reopens only with a reason of 5 characters or more", async () => {
    const short = await post("/periods/unlock", { site_id: 1, year: 2026, month: 8, reason: "late" });
    expect(((await short.json()) as Scope3ErrorBody).code).toBe("UNLOCK_REASON_REQUIRED");
    expect((await post("/periods/unlock", { site_id: 1, year: 2026, month: 8, reason: "Late diesel invoice" })).status).toBe(200);
    const s = (await get<PeriodLockStatus>("/periods/lock?year=2026&month=8&siteIds=1")).sites[0];
    expect(s.locked).toBe(false);
  });

  it("refuses a Nothing this month mark in a locked month", async () => {
    const res = await post("/user/my-month/nothing", { site_id: 1, category_id: 2, month: "2026-08-01" });
    expect(((await res.json()) as Scope3ErrorBody).code).toBe("PERIOD_LOCKED");
  });
});
