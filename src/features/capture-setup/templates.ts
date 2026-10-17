/**
 * SE-6 · Form templates and copy, as Capture setup reads them (ESG-lite
 * `src/forms/templates.ts`). Pure: which sites a template or form can go to,
 * and how each target's result reads.
 */
import type { FormCheck } from "./check";
import type { Site } from "./logic";

export interface FormTemplate {
  id: number;
  name: string;
  company_id: number | null;
  company_name: string | null;
  category_id: number;
  category_name: string;
  fields: number;
  created_by: { user_id: number; name: string } | null;
  created_at: string;
}

/** What is copied: a template, or a form as it is now. */
export interface CopySource {
  kind: "template" | "form";
  id: number;
  name: string;
  /** The client it stays with; null for a template for every client. */
  company_id: number | null;
  category_id: number;
  category_name: string;
  /** A form's own site, which it can't be copied to. */
  site_id?: number;
}

export interface TargetResult {
  site_id: number;
  site_name: string;
  action: "create" | "update" | null;
  form_id: number | null;
  saved_rows: number;
  check: FormCheck | null;
  refused?: string;
  status?: "applied" | "refused";
  version?: number;
}

export interface ApplyResponse {
  source: { kind: CopySource["kind"]; id: number; name: string };
  targets: TargetResult[];
  message?: string;
}

export type SiteChoice = { site: Site; reason: string | null };

/** The sites shown in the picker, by client: every site of the source's client (or every client), each with why it can't take the form. */
export function siteChoices(sites: Site[], src: CopySource): Array<{ client: string; choices: SiteChoice[] }> {
  const groups = new Map<string, SiteChoice[]>();
  for (const site of sites) {
    const companyId = site.company?.company_id ?? null;
    if (src.company_id !== null && companyId !== src.company_id) continue;
    const reason =
      src.kind === "form" && site.site_id === src.site_id
        ? "The form's own site"
        : !(site.categories ?? []).some((c) => c.category_id === src.category_id)
          ? `Doesn't report ${src.category_name}`
          : null;
    const client = site.company?.name ?? "No client";
    groups.set(client, [...(groups.get(client) ?? []), { site, reason }]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([client, choices]) => ({ client, choices: choices.sort((a, b) => a.site.name.localeCompare(b.site.name)) }));
}

/** One line per target in the builder's words. */
export function targetLine(t: TargetResult): { tone: "good" | "bad" | "muted"; text: string } {
  if (t.status === "applied") return { tone: "good", text: `${t.action === "create" ? "Form created" : "Form updated"}${t.version ? `, version ${t.version} live` : ""}` };
  if (t.refused) return { tone: "muted", text: t.refused };
  if (t.check && !t.check.ok) return { tone: "bad", text: `${t.check.errors.length} ${t.check.errors.length === 1 ? "problem" : "problems"}: not applied` };
  const n = t.saved_rows;
  const what =
    t.action === "create"
      ? `Creates its form${n ? `; ${n} saved ${n === 1 ? "row was" : "rows were"} entered without one and ${n === 1 ? "keeps its" : "keep their"} values` : ""}`
      : `Updates its form${t.saved_rows ? `; ${t.saved_rows} saved ${t.saved_rows === 1 ? "row keeps its" : "rows keep their"} values` : ""}`;
  return { tone: "good", text: `${what}. Passes the check.` };
}

/** The targets an apply would write: the ones that pass and the site can take. */
export const applicable = (targets: TargetResult[]) => targets.filter((t) => !t.refused && t.check?.ok);
