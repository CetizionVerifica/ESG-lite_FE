/**
 * SE-4 · The form check and versions, as the builder reads them (ESG-lite
 * `src/forms/check.ts` and `versions.ts`). Pure: which tab fixes a problem,
 * which problems stop a save, and what changed between two versions.
 */
import { methodLabel } from "../../lib/scope3/labels";
import type { BuilderTab } from "./builder";

/** One problem the server's check found, by the field to fix. */
export interface CheckIssue {
  code: string;
  field: string;
  message: string;
}

export interface FormCheck {
  ok: boolean;
  errors: CheckIssue[];
  warnings: CheckIssue[];
  form_id: number | null;
  /** The factor year checked (rows dated in year N use N − 1). */
  year: number;
  version: number | null;
}

export interface FormVersion {
  version: number;
  published_at: string;
  note: string | null;
  published_by: { user_id: number; name: string } | null;
  config: Record<string, unknown>;
}

export interface FormVersions {
  form_id: number;
  version: number;
  versions: FormVersion[];
}

/** One form's line on the forms list. */
export interface CheckSummary {
  form_id: number;
  site_id: number;
  category_id: number;
  version: number;
  errors: number;
  warnings: number;
  first_error: string | null;
}

export interface PublishResult {
  message?: string;
  unchanged?: boolean;
  version?: { version: number };
}

const list = (v: unknown): CheckIssue[] => (Array.isArray(v) ? v.filter((i): i is CheckIssue => !!i && typeof i === "object" && typeof (i as CheckIssue).message === "string") : []);

/** A check response, or null when the server sent none (an older server answers `{}` or 404). */
export function readCheck(raw: unknown): FormCheck | null {
  const r = raw as Partial<FormCheck> | null | undefined;
  if (!r || typeof r !== "object" || !Array.isArray(r.errors)) return null;
  const errors = list(r.errors);
  return { ok: errors.length === 0, errors, warnings: list(r.warnings), form_id: r.form_id ?? null, year: Number(r.year) || 0, version: r.version ?? null };
}

/** The tab where an issue's field is set. */
export function tabForIssue(field: string): BuilderTab {
  if (field.startsWith("emission_category_mapping")) return "match";
  if (field.startsWith("field_settings")) return "fields";
  // calculation, method_by_choice and method_options (Method section), units and currency.
  return "calculation";
}

const issueKey = (i: CheckIssue) => `${i.code}\u0000${i.field}`;

/**
 * The errors the unsaved form adds to the saved form's: these stop a save.
 * A live form's old problems don't, so it can be fixed a step at a time.
 */
export function newErrors(draft: FormCheck | null, saved: FormCheck | null | undefined): CheckIssue[] {
  if (!draft) return [];
  const before = new Set((saved?.errors ?? []).map(issueKey));
  return draft.errors.filter((e) => !before.has(issueKey(e)));
}

/** "Fix 1 thing" / "Fix 3 things". */
export const fixCount = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;

// ---------------------------------------------------------------------------
// What changed between versions
// ---------------------------------------------------------------------------

/** The settings a version stores, in the order the History drawer lists them, in the builder's words. */
const SETTINGS: Array<[string, string]> = [
  ["config_name", "Form name"],
  ["columns", "Fields"],
  ["field_settings", "What contributors see"],
  ["column_options", "Choices"],
  ["dependent_options", "Choices under another choice"],
  ["column_dependencies", "Linked choices"],
  ["emission_category_mapping", "Factor match"],
  ["extra_fields", "Extra details"],
  ["method_options", "Methods offered"],
  ["method_by_choice", "How the method is set"],
  ["calculation", "Calculation"],
  ["units", "Fixed unit"],
  ["currency", "Currency"],
];

export interface VersionChange {
  setting: string;
  detail: string;
}

/** JSON with keys in a fixed order, so equal settings compare equal however they were stored. */
export const stableJson = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stableJson).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as object)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(v ?? null);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const plainPath = (key: string) => key.split("|").join(" › ");
const names = (xs: string[], max = 4) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more` : xs.join(", "));

/** Added, removed and changed entries of two lists or maps, by a name. */
function entryDiff(a: Map<string, unknown>, b: Map<string, unknown>, label: (k: string) => string = (k) => k): string {
  const added = [...b.keys()].filter((k) => !a.has(k)).map(label);
  const removed = [...a.keys()].filter((k) => !b.has(k)).map(label);
  const changed = [...b.keys()].filter((k) => a.has(k) && stableJson(a.get(k)) !== stableJson(b.get(k))).map(label);
  return [added.length ? `added ${names(added)}` : "", removed.length ? `removed ${names(removed)}` : "", changed.length ? `changed ${names(changed)}` : ""].filter(Boolean).join("; ") || "changed";
}

const byKey = (v: unknown, id: (x: Record<string, unknown>) => unknown): Map<string, unknown> =>
  new Map((Array.isArray(v) ? v : []).filter(isRecord).map((x) => [String(id(x)), x]));

function describe(key: string, a: unknown, b: unknown): string {
  switch (key) {
    case "config_name":
      return `"${String(a ?? "")}" → "${String(b ?? "")}"`;
    case "columns": {
      const before = byKey(a, (c) => c.pk_id);
      const after = byKey(b, (c) => c.pk_id);
      const nameOf = (m: Map<string, unknown>) => (k: string) => String((m.get(k) as Record<string, unknown>)?.column_name ?? k);
      const added = [...after.keys()].filter((k) => !before.has(k)).map(nameOf(after));
      const removed = [...before.keys()].filter((k) => !after.has(k)).map(nameOf(before));
      const renamed = [...after.keys()].filter((k) => before.has(k) && nameOf(before)(k) !== nameOf(after)(k)).map((k) => `${nameOf(before)(k)} → ${nameOf(after)(k)}`);
      return [added.length ? `added ${names(added)}` : "", removed.length ? `removed ${names(removed)}` : "", renamed.length ? `renamed ${names(renamed)}` : ""].filter(Boolean).join("; ") || "changed";
    }
    case "extra_fields":
      return entryDiff(byKey(a, (x) => x.key), byKey(b, (x) => x.key), (k) => {
        const x = (byKey(b, (y) => y.key).get(k) ?? byKey(a, (y) => y.key).get(k)) as Record<string, unknown> | undefined;
        return String(x?.label ?? k);
      });
    case "method_options":
      return entryDiff(byKey(a, (x) => x.method), byKey(b, (x) => x.method), (k) => methodLabel(k));
    case "units":
    case "currency": {
      const fixed = (v: unknown) => (isRecord(v) && v.fixed ? String(v.fixed) : "none");
      return `${fixed(a)} → ${fixed(b)}`;
    }
    case "method_by_choice": {
      const mbc = (v: unknown) => (isRecord(v) ? v : {});
      if (mbc(a).column !== mbc(b).column) return b ? `the question is now "${String(mbc(b).column ?? "")}"` : "no question any more";
      return entryDiff(new Map(Object.entries(isRecord(mbc(a).map) ? (mbc(a).map as object) : {})), new Map(Object.entries(isRecord(mbc(b).map) ? (mbc(b).map as object) : {})), (k) => `answer ${k}`);
    }
    case "calculation": {
      const methods = (v: unknown) => new Map(Object.entries(isRecord(v) && isRecord(v.methods) ? v.methods : {}));
      if (isRecord(a) && isRecord(b) && a.mode === b.mode && a.method_column === b.method_column) return entryDiff(methods(a), methods(b), (k) => `formula for ${k}`);
      return b ? "a new calculation" : "calculation removed";
    }
    default:
      if (isRecord(a) || isRecord(b)) return entryDiff(new Map(Object.entries(isRecord(a) ? a : {})), new Map(Object.entries(isRecord(b) ? b : {})), plainPath);
      return "changed";
  }
}

/** What a version changed from the one before it, setting by setting. */
export function versionChanges(prev: Record<string, unknown> | null, next: Record<string, unknown>): VersionChange[] {
  if (!prev) return [];
  const out: VersionChange[] = [];
  for (const [key, setting] of SETTINGS) {
    const a = prev[key] ?? null;
    const b = next[key] ?? null;
    if (stableJson(a) === stableJson(b)) continue;
    out.push({ setting, detail: describe(key, a, b) });
  }
  return out;
}
