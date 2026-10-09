import { describe, expect, it } from "vitest";
import { actionTone, fieldLabel, formatAuditValue, visibleChanges } from "./auditFormat";

describe("audit formatting", () => {
  it("labels fields and actions in sentence case", () => {
    expect(fieldLabel("total_emission")).toBe("Total emission");
    expect(fieldLabel("manager_edit")).toBe("Manager edit");
  });

  it("maps actions to fixed tones", () => {
    expect(actionTone("approved")).toBe("good");
    expect(actionTone("REJECTED")).toBe("bad");
    expect(actionTone("manager_edit")).toBe("info");
    expect(actionTone("updated")).toBe("neutral");
  });

  it("formats values and hides bookkeeping keys", () => {
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue(48200.5)).toBe("48,200.5");
    expect(formatAuditValue("2025-09-14")).toBe("14 Sep 2025");
    expect(formatAuditValue({ quantity: 10, category_name: "x", unit: "kWh" })).toBe("Quantity: 10\nUnit: kWh");
    expect(visibleChanges({ status: { old: "pending", new: "approved" }, fera_linked_id: { old: 1, new: 2 } })).toEqual([
      { field: "status", old: "pending", new: "approved" },
    ]);
  });
});
