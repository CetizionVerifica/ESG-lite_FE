// DS-2 (RS-2 build 7, R9) · "Scores (for the report's materiality chart)": an
// optional block under the materiality step, shown when Design Studio's
// sustainability kind or Insights is on. Two sliders per saved topic (impact and
// financial, 0–10); the sustainability report and the Insights matrix place a
// topic once every material topic has both. Read and saved on its own through
// GET/PUT /kpi/setup/materiality-scores (IN-7), which sits behind KPI tracking
// only, so it works without Design Studio; the topic rows are the setup's.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "../../../../context/AuthContext";
import { useClientContext } from "../../../../lib/clientContext";
import { useDesignStudio } from "../../../../lib/studio/switch";
import { useInsights } from "../../../../lib/insights/switch"; // IN-7
import type { MaterialityScoresResponse } from "../../../../lib/insights/contracts";
import { ESRS_TOPICS, type EsrsTopic } from "../../../../lib/kpi/contracts";
import { ESRS_TOPIC_LABEL } from "../../../../lib/kpi/labels";
import { getMaterialityScores, putMaterialityScores } from "../../../../services/insightsService";
import { Button, Callout, cn, panel, useToast } from "../../../../ui";

type Scores = Record<string, { impact: number | null; financial: number | null }>;
type Topic = MaterialityScoresResponse["topics"][number];

const toScores = (topics: Topic[]): Scores => Object.fromEntries(topics.map((t) => [t.esrs_topic, { impact: t.impact_score, financial: t.financial_score }]));
const topicName = (t: Topic): string => ((ESRS_TOPICS as readonly string[]).includes(t.esrs_topic) ? ESRS_TOPIC_LABEL[t.esrs_topic as EsrsTopic] : t.label);
const QUERY_KEY = "materiality-scores";

export function MaterialityScores() {
  const studio = useDesignStudio();
  const insights = useInsights(); // IN-7: the Insights materiality matrix reads the same scores (I10)
  const { role } = useAuth();
  const { clientId } = useClientContext();
  const companyId = role === "Superadmin" ? clientId : null;
  const qc = useQueryClient();
  const { toast } = useToast();
  const on = (studio.enabled && studio.kinds.sustainability) || insights.enabled; // IN-7: also with Insights on
  const query = useQuery({ queryKey: ["kpi", QUERY_KEY, companyId], queryFn: () => getMaterialityScores(companyId), enabled: on });
  const [scores, setScores] = useState<Scores>({});
  useEffect(() => {
    if (query.data) setScores(toScores(query.data.topics));
  }, [query.data]);
  const save = useMutation({
    // Only material topics take scores (the server refuses any other topic).
    mutationFn: () =>
      putMaterialityScores(
        (query.data?.topics ?? []).filter((t) => t.material).map((t) => ({ esrs_topic: t.esrs_topic, impact_score: scores[t.esrs_topic]?.impact ?? null, financial_score: scores[t.esrs_topic]?.financial ?? null })),
        companyId,
      ),
    onSuccess: (data) => {
      qc.setQueryData(["kpi", QUERY_KEY, companyId], data);
      void qc.invalidateQueries({ queryKey: ["insights", "panel"] }); // the Insights matrix reads the same scores
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
        <p className="text-sm text-muted">
          Optional. Score each material topic 0–10 for its impact and its financial effect.{" "}
          {studio.enabled && studio.kinds.sustainability ? "The sustainability report shows the matrix once every material topic has both." : "Insights places each topic on its materiality matrix once every material topic has both."}
          {/* IN-7: Insights-only wording */}
        </p>
      </div>
      {unscored > 0 && <Callout tone="info">{unscored} material topic{unscored === 1 ? " still needs" : "s still need"} scores.</Callout>}
      <ul className="space-y-3">
        {material.map((t) => (
          <li key={t.esrs_topic} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr] sm:items-center">
            <span className="text-sm font-medium text-ink">{topicName(t)}</span>
            {(["impact", "financial"] as const).map((k) => {
              const v = scores[t.esrs_topic]?.[k] ?? null;
              const label = `${k === "impact" ? "Impact" : "Financial"} score for ${topicName(t)}`;
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
