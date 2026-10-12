import { describe, expect, it } from "vitest";
import { NOTIFICATION_KIND_LABEL, notificationKind } from "./notificationKind";

describe("notificationKind", () => {
  it("maps backend types to kinds, including IM4's UPLOAD_PENDING", () => {
    expect(notificationKind("BULK_APPROVED")).toBe("approved");
    expect(notificationKind("REJECTED")).toBe("rejected");
    expect(notificationKind("DEADLINE_REMINDER")).toBe("reminder");
    expect(notificationKind("ESCALATION")).toBe("escalation");
    expect(notificationKind("UPLOAD_PENDING")).toBe("upload");
    expect(notificationKind("SYSTEM")).toBe("other");
  });

  it("has a short label for every kind", () => {
    expect(NOTIFICATION_KIND_LABEL[notificationKind("UPLOAD_PENDING")]).toBe("Waiting for review");
    for (const label of Object.values(NOTIFICATION_KIND_LABEL)) expect(label).toMatch(/^[A-Z][a-z]/);
  });
});
