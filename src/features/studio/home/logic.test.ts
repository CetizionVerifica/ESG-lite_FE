import { describe, expect, it } from "vitest";
import { START_OPTIONS, editedLine, formatLine, latestClosedYear, startLink, statusLabel } from "./logic";

describe("studio home logic", () => {
  it("latestClosedYear: last calendar year; the FY that ended in March", () => {
    expect(latestClosedYear("CY", new Date(2026, 9, 20))).toBe(2025);
    expect(latestClosedYear("FY", new Date(2026, 9, 20))).toBe(2026);
    expect(latestClosedYear("FY", new Date(2026, 1, 10))).toBe(2025);
    expect(latestClosedYear("FY", new Date(2026, 3, 1))).toBe(2026);
  });

  it("start options open the new-design flow preselected", () => {
    expect(START_OPTIONS.map((o) => o.id)).toEqual(["ghg", "sustainability", "deck", "summary", "social"]);
    expect(startLink(START_OPTIONS[2])).toBe("/studio/new?kind=ghg&format=slide_16_9&purpose=deck");
  });

  it("status, format and edited lines", () => {
    expect(statusLabel({ status: "draft", finalVersion: null, buildState: "done" })).toEqual({ label: "Draft", tone: "neutral" });
    expect(statusLabel({ status: "final", finalVersion: 2, buildState: null }).label).toBe("Final v2");
    expect(statusLabel({ status: "in_review", finalVersion: null, buildState: null }).label).toBe("In review");
    expect(statusLabel({ status: "draft", finalVersion: null, buildState: "running" }).label).toBe("Building…");
    expect(statusLabel({ status: "draft", finalVersion: null, buildState: "failed" }).tone).toBe("bad");
    expect(formatLine("a4", 22)).toBe("A4 · 22 pages");
    expect(formatLine("slide_16_9", 9)).toBe("16:9 · 9 slides");
    expect(formatLine("a4", 1)).toBe("A4 · 1 page");
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(editedLine({ updatedAt: "2026-10-20T10:00:00Z", updatedBy: "Maya Manager" }, now)).toBe("Edited 2h ago by Maya Manager");
    expect(editedLine({ updatedAt: "2026-10-20T11:59:30Z", updatedBy: null }, now)).toBe("Edited just now");
  });
});
