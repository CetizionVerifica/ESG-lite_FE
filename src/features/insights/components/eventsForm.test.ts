import { describe, expect, it } from "vitest";
import { draftFrom, emptyDraft, eventSaveError, labelCounter, toCreateBody, toPatchBody, validateEvent } from "./eventsForm";

const axiosError = (status: number, data: unknown) => ({ response: { status, data } });

describe("event form", () => {
  it("checks the name, kind and date in plain words", () => {
    expect(validateEvent(emptyDraft())).toEqual({ label: "Give the event a short name.", kind: "Choose what kind of event this is.", date: "Choose the date it happened." });
    expect(validateEvent({ label: "x".repeat(61), kind: "initiative", date: "2025-01-01", site_id: null })).toEqual({ label: "Keep it to 60 characters or fewer." });
    expect(validateEvent({ label: "  Solar  ", kind: "initiative", date: "2025-01-01", site_id: 13 })).toEqual({});
  });

  it("counts the trimmed label against 60", () => {
    expect(labelCounter(" Solar roof ")).toBe("10/60");
  });

  it("sends a trimmed body, and only the changed fields on edit", () => {
    expect(toCreateBody({ label: " Solar ", kind: "initiative", date: "2025-01-01", site_id: null })).toEqual({ label: "Solar", kind: "initiative", date: "2025-01-01", site_id: null });
    const before = { id: 1, date: "2023-04-01", label: "Rooftop solar at Pune", kind: "initiative" as const, site_id: 13 };
    const d = draftFrom(before);
    expect(toPatchBody(before, d)).toEqual({});
    expect(toPatchBody(before, { ...d, label: "Rooftop solar", site_id: null })).toEqual({ label: "Rooftop solar", site_id: null });
  });

  it("puts IN_EVENT_INVALID issues on their fields and the message on the form", () => {
    const e = eventSaveError(axiosError(400, { code: "IN_EVENT_INVALID", message: "The event isn't valid.", details: { issues: [{ path: "date", message: "Invalid" }, { path: ["label"], message: "Too long" }] } }));
    expect(e.form).toBe("The event isn't valid.");
    expect(Object.keys(e.fields).sort()).toEqual(["date", "label"]);
  });

  it("words other failures", () => {
    expect(eventSaveError(axiosError(404, { code: "IN_EVENT_NOT_FOUND", message: "x" })).form).toMatch(/deleted/);
    expect(eventSaveError(axiosError(403, { code: "IN_FORBIDDEN", message: "x" })).form).toMatch(/Admin/);
    expect(eventSaveError(new Error("network")).form).toBe("Couldn't save the event. Try again.");
  });
});
