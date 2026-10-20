// DS-2 (RS-2 build 7, R9) · "Scores (for the report's materiality chart)": an
// optional block under the materiality step, shown only when Design Studio is
// on. Two sliders per saved topic (impact and financial, 0–10); the
// sustainability report offers its materiality matrix once every material
// topic has both. Saved on its own (PUT /studio/materiality), since the topic
// rows are the setup's.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "../../../../context/AuthContext";
import { useClientContext } from "../../../../lib/clientContext";
import { useDesignStudio } from "../../../../lib/studio/switch";
import type { MaterialTopic } from "../../../../lib/studio/contracts";
import { getMateriality, putMateriality } from "../../../../services/studioService";
import { Button, Callout, cn, panel, useToast } from "../../../../ui";

type Scores = Record<string, { impact: number | null; financial: number | null }>;

const toScores = (topics: MaterialTopic[]): Scores => Object.fromEntries(topics.map((t) => [t.esrs_topic, { impact: t.impact_score, financial: t.financial_score }]));

export function MaterialityScores() {
  const studio = useDesignStudio();
  const { role } = useAuth();
  const { clientId } = useClientContext();
  const companyId = role === "Superadmin" ? clientId : null;
  const qc = useQueryClient();
  const { toast } = useToast();
  const on = studio.enabled && studio.kinds.sustainability;
  const query = useQuery({ queryKey: ["studio", "materiality", companyId], queryFn: () => getMateriality(companyId), enabled: on });
  const [scores, setScores] = useState<Scores>({});
  useEffect(() => {
    if (query.data) setScores(toScores(query.data.topics));
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => putMateriality(Object.entries(scores).map(([esrs_topic, s]) => ({ esrs_topic, impact_score: s.impact, financial_score: s.financial })), companyId),
    onSuccess: (data) => {
      qc.setQueryData(["studio", "materiality", companyId], data);
      toast({ tone: "good", title: "Scores saved" });
    },
    onError: () => toast({ tone: "bad", title: "Scores weren't saved." }),
  });

  if (!on || !query.data) return null;
  const material = query.data.topics.filter((t) => t.material);
  if (!material.length) return null;
  const unscored = material.filter((t) => scores[t.esrs_topic]?.impact == null || scores[t.esrs_topic]?.financial == null).length;
  const set = (topic: string, key: "impact" | "financial", v: number) => setScores((s) => ({ ...s, [topic]: { ...s[topic], [key]: v } }));

  return (
    <section aria-labelledby="materiality-scores" className={cn(panel, "mt-4 space-y-3 p-4")} data-testid="materiality-scores">
      <div>
        <h3 id="materiality-scores" className="font-medium text-ink">
          Scores (for the report's materiality chart)
        </h3>
        <p className="text-sm text-muted">Optional. Score each material topic 0–10 for its impact and its financial effect. The sustainability report shows the matrix once every material topic has both.</p>
      </div>
      {unscored > 0 && <Callout tone="info">{unscored} material topic{unscored === 1 ? " still needs" : "s still need"} scores.</Callout>}
      <ul className="space-y-3">
        {material.map((t) => (
          <li key={t.esrs_topic} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr] sm:items-center">
            <span className="text-sm font-medium text-ink">{t.name}</span>
            {(["impact", "financial"] as const).map((k) => {
              const v = scores[t.esrs_topic]?.[k] ?? null;
              const label = `${k === "impact" ? "Impact" : "Financial"} score for ${t.name}`;
              return (
                <label key={k} className="flex items-center gap-2 text-xs text-muted">
                  <span className="w-16">{k === "impact" ? "Impact" : "Financial"}</span>
                  <input type="range" min={0} max={10} step={0.5} aria-label={label} value={v ?? 0} onChange={(e) => set(t.esrs_topic, k, Number(e.target.value))} className="flex-1 accent-current" />
                  <span className="w-8 text-right tabular-nums text-ink">{v === null ? "—" : v.toFixed(1)}</span>
                </label>
              );
            })}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save scores
        </Button>
      </div>
    </section>
  );
}
