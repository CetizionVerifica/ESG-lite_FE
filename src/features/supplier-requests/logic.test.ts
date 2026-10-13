import { describe, expect, it } from "vitest";
import type { DeclarationResponse } from "../../services/pcfAiService";
import {
  type SupplierRequest,
  acceptProblem,
  askParams,
  askProblem,
  chipText,
  dueText,
  formFromDeclaration,
  formFromReply,
  isBoundaryRefusal,
  studyLabel,
  validityText,
  valueText,
} from "./logic";

const base: SupplierRequest = {
  supplier_request_id: 5,
  company_id: 1,
  study: { pcf_study_id: 21, version: 2, status: "draft", boundary: "cradle_to_gate", product: { product_id: 3, name: "Wire rod" }, site: { site_id: 2, name: "Bahrain" } },
  input: { pcf_input_id: 9, name: "Aluminium ingot", stage: "A1", unit: "kg" },
  material: "Aluminium ingot",
  unit: "kg",
  supplier_name: "Alba",
  supplier_email: "pcf@alba.example",
  due_date: "2025-06-30",
  subject: "s",
  message: "m",
  status: "received",
  link_expires_at: "2025-07-30T00:00:00.000Z",
  sent_at: "2025-05-01T10:00:00.000Z",
  opened_at: null,
  received_at: "2025-05-03T10:00:00.000Z",
  decided_at: null,
  requested_by: { user_id: 2, name: "Maya" },
  decided_by: null,
  decision_comment: null,
  reply: {
    value_kgco2e: 7.9,
    unit: "kg",
    boundary: "cradle_to_grave",
    standard: "ISO 14067",
    gwp_set: "AR5",
    reference_start: "2024-01-01",
    reference_end: "2024-12-31",
    valid_from: null,
    valid_to: "2027-12-31",
    verifier: "Verifier Ltd",
    product_name: null,
    note: null,
    file: { name: "epd.pdf", type: "application/pdf", size: 1200 },
    boundary_mismatch: true,
  },
  accepted: null,
  created_at: "2025-05-01T10:00:00.000Z",
  updated_at: "2025-05-03T10:00:00.000Z",
};

describe("table text", () => {
  it("names the footprint and shows the pending or accepted value", () => {
    expect(studyLabel(base)).toBe("Wire rod · v2");
    expect(valueText(base)).toEqual({ text: "7.9 kgCO₂e/kg", pending: true });
    expect(valueText({ ...base, status: "accepted", accepted: { material_factor_id: 1, value_kgco2e: 7.85, boundary: "cradle_to_gate" } })).toEqual({ text: "7.85 kgCO₂e/kg", pending: false });
    expect(valueText({ ...base, reply: { ...base.reply!, value_kgco2e: null } })).toEqual({ text: "File: epd.pdf", pending: true });
    expect(valueText({ ...base, reply: null, status: "sent" })).toEqual({ text: "—", pending: false });
  });

  it("reads validity and due dates against today", () => {
    const today = new Date("2026-01-15T00:00:00Z");
    expect(validityText(base, today)).toEqual({ text: "To 31 Dec 2027", expired: false });
    expect(validityText({ ...base, reply: { ...base.reply!, valid_to: "2025-12-31" } }, today)).toEqual({ text: "Expired 31 Dec 2025", expired: true });
    expect(validityText({ ...base, reply: null }, today)).toEqual({ text: "—", expired: false });
    expect(dueText({ ...base, status: "sent" }, today)).toEqual({ text: "30 Jun 2025", overdue: true });
    expect(dueText(base, today).overdue).toBe(false); // received: no longer overdue
    expect(dueText({ ...base, due_date: null }, today)).toEqual({ text: "—", overdue: false });
  });
});

describe("review form", () => {
  it("starts from what the supplier typed", () => {
    const f = formFromReply(base);
    expect(f).toMatchObject({ value_kgco2e: 7.9, boundary: "cradle_to_grave", standard: "ISO 14067", gwp_set: "AR5", valid_from: "", valid_to: "2027-12-31", verifier: "Verifier Ltd", comment: "" });
    expect(formFromReply({ ...base, reply: null }).value_kgco2e).toBeNull();
  });

  it("takes the AI-read fields over the typed ones only where the file says something", () => {
    const read = {
      file_name: "epd.pdf",
      kind: "pdf",
      fields: {
        value_kgco2e: { value: 7.85, confidence: 80, reason: "r", by: "ai" },
        boundary: { value: "cradle_to_gate", confidence: 85, reason: "r", by: "ai" },
        standard: { value: null, confidence: 0, reason: "Not found", by: "rule" },
        gwp_set: { value: "AR6", confidence: 70, reason: "r", by: "ai" },
        valid_from: { value: "2024-03-15", confidence: 70, reason: "r", by: "ai" },
        valid_to: { value: null, confidence: 0, reason: "Not found", by: "rule" },
        verifier: { value: "EPD Hub", confidence: 60, reason: "r", by: "ai" },
      },
      boundary_mismatch: false,
      unit_mismatch: false,
      low_confidence_fields: [],
      warnings: [],
      problems: [],
      ai_used: true,
      evidence: null,
    } as unknown as DeclarationResponse;
    const f = formFromDeclaration(formFromReply(base), read);
    expect(f).toMatchObject({ value_kgco2e: 7.85, boundary: "cradle_to_gate", standard: "ISO 14067", gwp_set: "AR6", valid_from: "2024-03-15", valid_to: "2027-12-31", verifier: "EPD Hub" });
    expect(chipText("boundary", read.fields.boundary)).toBe("Cradle-to-gate (A1–A3)");
    expect(chipText("value_kgco2e", read.fields.value_kgco2e)).toBe("7.85");
    expect(chipText("standard", read.fields.standard)).toBe("—");
  });

  it("blocks accept on a missing value or an unconfirmed boundary", () => {
    const f = formFromReply(base);
    expect(acceptProblem(base, { ...f, value_kgco2e: null }, false)).toMatch(/Enter the value/);
    expect(acceptProblem(base, f, false)).toMatch(/cradle-to-grave.*cradle-to-gate.*Confirm/);
    expect(acceptProblem(base, f, true)).toBeNull();
    expect(acceptProblem(base, { ...f, boundary: "cradle_to_gate" }, false)).toBeNull();
    expect(acceptProblem(base, { ...f, boundary: null, valid_from: "2025-01-01", valid_to: "2024-01-01" }, false)).toMatch(/Valid to/);
    expect(isBoundaryRefusal({ response: { status: 409, data: { boundary_mismatch: true } } })).toBe(true);
    expect(isBoundaryRefusal({ response: { status: 409, data: { message: "closed" } } })).toBe(false);
  });
});

describe("ask form", () => {
  const ok = { study_id: 21, input_id: 9, material: "Ingot", unit: "kg", supplier_name: "", supplier_email: "a@b.co", due_date: "", note: "" };
  it("needs a footprint, material, unit and a valid email; the due date can't be past", () => {
    expect(askProblem(ok, "2026-01-01")).toBeNull();
    expect(askProblem({ ...ok, study_id: null }, "2026-01-01")).toMatch(/footprint/);
    expect(askProblem({ ...ok, material: " " }, "2026-01-01")).toMatch(/material/);
    expect(askProblem({ ...ok, unit: "pcs" }, "2026-01-01")).toMatch(/unit/);
    expect(askProblem({ ...ok, supplier_email: "nope" }, "2026-01-01")).toMatch(/email/);
    expect(askProblem({ ...ok, due_date: "2025-12-31" }, "2026-01-01")).toMatch(/past/);
  });
  it("reads ?new=1&study=&input=", () => {
    expect(askParams(new URLSearchParams("new=1&study=21&input=9"))).toEqual({ open: true, study_id: 21, input_id: 9 });
    expect(askParams(new URLSearchParams("study=x"))).toEqual({ open: false, study_id: null, input_id: null });
  });
});
