import { useMemo, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import {
  AGGREGATION_LABEL,
  AUTO_SOURCE_LABEL,
  FIT_DESCRIPTION,
  FIT_LABEL,
  FREQUENCY_LABEL,
  FRAMEWORK_LABEL,
  LEVEL_LABEL,
  SOURCE_DESCRIPTION,
  SOURCE_LABEL,
  TOPIC_LABEL,
  VALUE_TYPE_LABEL,
} from "../../../../lib/kpi/labels";
import { Badge, Button, Callout, Drawer, TextField, Textarea, Tooltip, cn, focusRing, useToast } from "../../../../ui";
import { FrameworkBadges } from "../../components/FrameworkBadges";
import { kpiErrorMessage, useUpdateDefinition } from "../api";
import { type LibraryRow, checkFormula, formulaCheckText } from "../logic";

/** "{site}" and "{period}" are filled in per contributor; show them as placeholders. */
const showQuestion = (q: string) => q.replace(/\{site\}/g, "‹site›").replace(/\{period\}/g, "‹period›");

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

type Draft = { question: string; help: string; formula: string };

/**
 * KPI-2 · One KPI of the library: its definition, where it's used (the
 * mappings table) and, for a calculated KPI, the formula with a live check.
 * The Superadmin can reword the question and help, or fix the formula.
 */
export function KpiDrawer({ row, knownCodes, onClose }: { row: LibraryRow | null; knownCodes: string[]; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ question: "", help: "", formula: "" });
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateDefinition();
  const { toast } = useToast();
  const def = row?.def;

  const shownFormula = editing ? draft.formula : (def?.formula ?? "");
  const check = useMemo(() => (def?.source === "formula" ? checkFormula(shownFormula, def.code, knownCodes) : null), [def, shownFormula, knownCodes]);

  const close = () => {
    setEditing(false);
    setError(null);
    onClose();
  };

  if (!row || !def) return <Drawer open={false} onClose={close} title="" />;

  const startEdit = () => {
    setDraft({ question: def.question, help: def.help ?? "", formula: def.formula ?? "" });
    setError(null);
    setEditing(true);
  };

  const questionError = editing && !draft.question.trim() ? "Write the question a contributor answers." : null;
  const canSave = editing && !questionError && (def.source !== "formula" || !!check?.ok);

  const save = () => {
    if (!canSave) return;
    setError(null);
    const patch = {
      question: draft.question.trim(),
      help: draft.help.trim() || null,
      ...(def.source === "formula" ? { formula: draft.formula.trim() } : {}),
    };
    update.mutate(
      { id: def.id, patch },
      {
        onSuccess: () => {
          setEditing(false);
          toast({ title: `${def.name} saved`, tone: "good" });
        },
        onError: (e) => setError(kpiErrorMessage(e, "The KPI wasn't saved. Try again.")),
      },
    );
  };

  return (
    <Drawer
      open
      onClose={close}
      size="lg"
      title={def.name}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{def.code}</span>
          <span aria-hidden>·</span>
          <span>{TOPIC_LABEL[def.topic]}</span>
          <Badge tone={def.source === "manual" ? "neutral" : "info"}>{SOURCE_LABEL[def.source]}</Badge>
        </span>
      }
      headerActions={
        !editing ? (
          <Button size="sm" variant="secondary" icon={<Pencil size={14} aria-hidden />} onClick={startEdit}>
            Edit
          </Button>
        ) : undefined
      }
      footer={
        editing ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={update.isPending} disabled={!canSave}>
              Save
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {error && <Callout tone="warn">{error}</Callout>}

        <section aria-labelledby="kpi-def-title" className="space-y-2">
          <h3 id="kpi-def-title" className="text-sm font-semibold text-ink">
            Definition
          </h3>
          {editing ? (
            <div className="space-y-3">
              <Textarea
                label="Question"
                help="Plain words, as a contributor reads it. {site} and {period} are filled in for them."
                value={draft.question}
                onChange={(v) => setDraft((d) => ({ ...d, question: v }))}
                error={questionError}
                rows={2}
                required
              />
              <Textarea label="Help line" help="What counts and what to leave out, shown under the question." value={draft.help} onChange={(v) => setDraft((d) => ({ ...d, help: v }))} rows={3} />
            </div>
          ) : (
            <dl className="divide-y divide-line">
              <Row term="Question">{showQuestion(def.question)}</Row>
              <Row term="Help line">{def.help ? def.help : <span className="text-muted">Not written yet</span>}</Row>
            </dl>
          )}
          <dl className="divide-y divide-line">
            <Row term="How it's filled">
              {SOURCE_LABEL[def.source]}. {SOURCE_DESCRIPTION[def.source]}
              {def.auto_source && <span className="mt-1 block text-muted">From: {AUTO_SOURCE_LABEL[def.auto_source]}</span>}
            </Row>
            <Row term="Answer">{VALUE_TYPE_LABEL[def.value_type]}</Row>
            <Row term="Unit">
              {def.canonical_unit ?? <span className="text-muted">No unit</span>}
              {def.allowed_units.length > 1 && <span className="mt-1 block text-muted">Can be entered in {def.allowed_units.join(", ")}</span>}
            </Row>
            <Row term="Entered for">
              {LEVEL_LABEL[def.level]}, {FREQUENCY_LABEL[def.default_frequency].toLowerCase()}
            </Row>
            <Row term="Combined by">{AGGREGATION_LABEL[def.aggregation]}</Row>
            {def.breakdowns && <Row term="Split by">{def.breakdowns.values.map((v) => v.replace(/_/g, " ")).join(" · ")}</Row>}
            <Row term="Decimals">{def.decimals}</Row>
          </dl>
        </section>

        {def.source === "formula" && check && (
          <section aria-labelledby="kpi-formula-title" className="space-y-2">
            <h3 id="kpi-formula-title" className="text-sm font-semibold text-ink">
              Formula
            </h3>
            {editing ? (
              <TextField label="Formula" hideLabel value={draft.formula} onChange={(v) => setDraft((d) => ({ ...d, formula: v }))} className="font-mono" />
            ) : (
              <p className="rounded-control bg-tint px-3 py-2 font-mono text-sm text-ink">{def.formula}</p>
            )}
            <p role="status" className={cn("text-sm", check.ok ? "text-good" : "text-bad")}>
              {formulaCheckText(check)}
            </p>
          </section>
        )}

        <section aria-labelledby="kpi-used-title" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="kpi-used-title" className="text-sm font-semibold text-ink">
              Used in
            </h3>
            <FrameworkBadges items={row.usedIn} tips />
          </div>
          {row.usedIn.length === 0 ? (
            <p className="text-sm text-muted">No disclosure uses this KPI yet. It can still feed a calculated KPI.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <caption className="sr-only">Disclosures this KPI answers</caption>
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-3 font-medium">Framework</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Disclosure</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Fit</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Unit</th>
                    <th scope="col" className="py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {row.usedIn.map((u) => (
                    <tr key={u.mapping_id} className="border-b border-line align-top last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {FRAMEWORK_LABEL[u.framework]}
                        <span className="block text-xs text-muted">{u.version}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-mono text-xs">{u.code}</span>
                        {u.core && (
                          <Badge tone="brand" className="ml-1">
                            Core
                          </Badge>
                        )}
                        <span className="block text-ink">{u.title}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <Tooltip content={FIT_DESCRIPTION[u.fit]}>
                          <span tabIndex={0} className={cn("rounded-chip", focusRing)}>
                            <Badge tone={u.fit === "exact" ? "good" : "warn"}>{FIT_LABEL[u.fit]}</Badge>
                          </span>
                        </Tooltip>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{u.display_unit ?? "—"}</td>
                      <td className="py-2 text-muted">{u.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
