import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge, Button, Callout, Drawer, EmptyState, Select, Skeleton, cn } from "../../../ui";
import { aiErrorMessage, aiUnreachable } from "../../../services/pcfAiService";
import { type FactorPick, defaultPicks, matchRequestFor } from "../ai";
import { type MaterialFactor, useFactorSuggestions } from "../api";
import type { Line } from "../logic";

type Props = {
  open: boolean;
  lines: Line[];
  factors: MaterialFactor[];
  geographyHint: string | null;
  onApply: (picks: FactorPick[]) => void;
  onClose: () => void;
};

/**
 * Suggest factors (E2): a library factor per unpriced material, with the
 * matcher's confidence and reason. The person accepts or changes each one;
 * under 60% the line stays warn-tinted in the table until confirmed.
 */
export function SuggestFactorsDrawer({ open, lines, factors, geographyHint, onApply, onClose }: Props) {
  const req = useMemo(() => (open ? matchRequestFor(lines, factors, geographyHint) : null), [open, lines, factors, geographyHint]);
  const q = useFactorSuggestions(req, open);
  const [picks, setPicks] = useState<Map<string, FactorPick | null>>(new Map());
  // Fresh suggestions start from the matcher's first choice per line.
  useEffect(() => {
    if (q.data) setPicks(new Map(defaultPicks(q.data.lines).map((p) => [p.key, p])));
  }, [q.data]);

  const byKey = new Map(lines.map((l) => [l.key, l]));
  const chosen = [...picks.values()].filter((p): p is FactorPick => p !== null);
  const apply = () => {
    onApply(chosen);
    onClose();
  };

  return (
    <Drawer
      open={open}
      size="lg"
      onClose={onClose}
      title="Suggest factors"
      subtitle="Each suggestion shows why it was picked. Nothing changes until you apply."
      footer={
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={!q.data || chosen.length === 0}>
            Apply {chosen.length} {chosen.length === 1 ? "factor" : "factors"}
          </Button>
        </div>
      }
    >
      {req === null ? (
        <EmptyState compact title="Every material already has a factor." description="Suggestions are for lines without a factor or a supplier footprint." />
      ) : q.isPending ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : q.error ? (
        <Callout
          tone="warn"
          title={aiUnreachable(q.error) ? "The AI service can't be reached right now." : "Couldn't get suggestions."}
          action={
            <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        >
          {aiUnreachable(q.error) ? "Pick the factors by hand or try again later." : aiErrorMessage(q.error, "Try again later.")}
        </Callout>
      ) : q.data ? (
        <div className="space-y-3">
          <p className="text-sm text-muted" role="status">
            {q.data.unmatched_lines
              ? `${q.data.total_lines - q.data.unmatched_lines} of ${q.data.total_lines} lines have a close match; ${q.data.unmatched_lines} ${q.data.unmatched_lines === 1 ? "needs" : "need"} picking by hand.`
              : `A match for every line${q.data.ai_used ? ", some chosen by the AI matcher" : ""}.`}
          </p>
          <ul className="divide-y divide-line rounded-control border border-line">
            {q.data.lines.map((m) => {
              const key = String(m.id);
              const line = byKey.get(key);
              const pick = picks.get(key) ?? null;
              const current = pick ? m.suggestions.find((s) => s.material_factor_id === pick.material_factor_id) : undefined;
              return (
                <li key={key} className={cn("space-y-2 p-3", m.unmatched && "bg-warn-soft")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {m.name}
                      {line?.unit ? <span className="ml-1 text-xs text-muted">per {line.unit}</span> : null}
                    </span>
                    {current ? (
                      <Badge tone={current.confidence < 60 ? "warn" : "neutral"} className="gap-1">
                        <Sparkles aria-hidden className="size-3" /> {current.by === "ai" ? "AI" : "Match"} {current.confidence}%
                      </Badge>
                    ) : (
                      <Badge tone="warn">{m.unmatched ? "No close match" : "Left for later"}</Badge>
                    )}
                  </div>
                  <Select<number>
                    label={`Factor for ${m.name}`}
                    hideLabel
                    value={pick?.material_factor_id ?? null}
                    onChange={(v) => {
                      const s = m.suggestions.find((x) => x.material_factor_id === v);
                      setPicks((p) => new Map(p).set(key, s ? { key, material_factor_id: s.material_factor_id, confidence: s.confidence } : null));
                    }}
                    options={m.suggestions.map((s) => ({ value: s.material_factor_id, label: `${s.name ?? `Factor ${s.material_factor_id}`} · ${s.confidence}%` }))}
                    placeholder="Pick by hand later"
                    emptyText="No suggestion"
                  />
                  {current && <p className="text-xs text-muted">{current.reason}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Drawer>
  );
}
