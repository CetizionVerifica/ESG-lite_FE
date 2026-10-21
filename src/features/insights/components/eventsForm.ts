// IN-4 · The event form's draft, inline checks and server errors (01-contracts
// §4 POST /insights/events, §7 IN_EVENT_INVALID). The server decides; these
// checks only catch the obvious before a round trip.
import { EVENT_KINDS, EVENT_LABEL_MAX, inErrorCode, type EventCreate, type EventKind, type EventRef } from "../../../lib/insights/contracts";

export interface EventDraft {
  label: string;
  kind: EventKind | null;
  date: string;
  site_id: number | null;
}

export type EventField = "label" | "kind" | "date" | "site_id";
export type EventErrors = Partial<Record<EventField, string>>;

export const emptyDraft = (date = ""): EventDraft => ({ label: "", kind: null, date, site_id: null });
export const draftFrom = (e: EventRef): EventDraft => ({ label: e.label, kind: e.kind, date: e.date.slice(0, 10), site_id: e.site_id });

/** "12/60": the label counter. */
export const labelCounter = (label: string) => `${label.trim().length}/${EVENT_LABEL_MAX}`;

/** Inline checks (plain words, 05-ux §7). Empty object = ready to send. */
export function validateEvent(d: EventDraft): EventErrors {
  const errors: EventErrors = {};
  const label = d.label.trim();
  if (!label) errors.label = "Give the event a short name.";
  else if (label.length > EVENT_LABEL_MAX) errors.label = `Keep it to ${EVENT_LABEL_MAX} characters or fewer.`;
  if (!d.kind || !(EVENT_KINDS as readonly string[]).includes(d.kind)) errors.kind = "Choose what kind of event this is.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errors.date = "Choose the date it happened.";
  return errors;
}

/** The POST body (a site only when one is chosen). */
export function toCreateBody(d: EventDraft): EventCreate {
  return { label: d.label.trim(), kind: d.kind as EventKind, date: d.date, site_id: d.site_id };
}

/** The PATCH body: only the fields that changed. */
export function toPatchBody(before: EventRef, d: EventDraft): Partial<EventCreate> {
  const next = toCreateBody(d);
  const patch: Partial<EventCreate> = {};
  if (next.label !== before.label) patch.label = next.label;
  if (next.kind !== before.kind) patch.kind = next.kind;
  if (next.date !== before.date.slice(0, 10)) patch.date = next.date;
  if ((next.site_id ?? null) !== (before.site_id ?? null)) patch.site_id = next.site_id ?? null;
  return patch;
}

const FIELD_WORDS: Record<EventField, string> = {
  label: "Check the name: up to 60 characters.",
  kind: "Choose a kind from the list.",
  date: "Choose a date within your data's years.",
  site_id: "Choose one of your sites, or the whole company.",
};

/**
 * A failed save in words: `IN_EVENT_INVALID` issues land on their fields and
 * the server's message on the form; anything else is one form message.
 */
export function eventSaveError(error: unknown): { form: string; fields: EventErrors } {
  const data = (error as { response?: { data?: { message?: unknown; details?: unknown } } } | null)?.response?.data;
  const message = typeof data?.message === "string" && data.message ? data.message : null;
  const code = inErrorCode(error);
  if (code === "IN_EVENT_INVALID") {
    const issues = (data?.details as { issues?: { path?: unknown }[] } | undefined)?.issues ?? [];
    const fields: EventErrors = {};
    for (const i of issues) {
      const path = Array.isArray(i.path) ? String(i.path[0]) : String(i.path ?? "");
      if (path in FIELD_WORDS) fields[path as EventField] = FIELD_WORDS[path as EventField];
    }
    return { form: message ?? "The event isn't valid.", fields };
  }
  if (code === "IN_EVENT_NOT_FOUND") return { form: "That event was deleted. Close this form and try again.", fields: {} };
  if (code === "IN_FORBIDDEN") return { form: "Only the person who added this event, an Admin or a Superadmin can change it.", fields: {} };
  if (code === "IN_SITE_NOT_FOUND") return { form: "That site isn't one of yours.", fields: { site_id: FIELD_WORDS.site_id } };
  return { form: message ?? "Couldn't save the event. Try again.", fields: {} };
}
