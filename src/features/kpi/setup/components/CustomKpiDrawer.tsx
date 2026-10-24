import { useState } from "react";
import { Sparkles } from "lucide-react";
import { KPI_FREQUENCIES, KPI_LEVELS, KPI_PILLARS, KPI_TOPICS, TOPIC_PILLAR, type KpiPillar, type CustomKpiBody, type KpiDefinition, type KpiFrequency, type KpiLevel, type KpiMappingSuggestion, type KpiTopic } from "../../../../lib/kpi/contracts";
import { AI_DOWN_MESSAGE, checkMapping } from "../../../../lib/kpi/ai";
import { FIT_LABEL, FREQUENCY_LABEL, LEVEL_LABEL, PILLAR_LABEL, TOPIC_LABEL, disclosureBadge } from "../../../../lib/kpi/labels";
import { topicPillarNote } from "../../../../lib/kpi/pillars";
import { KPI_UNITS } from "../../../../lib/kpi/units";
import { AiChip, Badge, Button, Drawer, Select, TextField, Textarea, cn, focusRing } from "../../../../ui";
import { kpiErrorMessage, useCreateCustomKpi, useSuggestMapping } from "../api";
import { unitShape } from "../logic";

type Suggestion = KpiMappingSuggestion & { disclosure_id: number };

const UNIT_HINTS = [...new Set(Object.values(KPI_UNITS).map((u) => u.label))];

/**
 * KPI-3 "Add your own KPI" (D8): name, plain question, unit, frequency and
 * level, plus optional framework mappings the AI suggests (KPI-12; the Admin
 * picks, nothing is mapped on its own).
 */
export function CustomKpiDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (def: KpiDefinition) => void }) {
  const create = useCreateCustomKpi();
  const suggest = useSuggestMapping();
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [help, setHelp] = useState("");
  const [unit, setUnit] = useState("");
  const [topic, setTopic] = useState<KpiTopic>("governance");
  /** D19: null follows the topic's pillar. */
  const [pillarPick, setPillarPick] = useState<KpiPillar | null>(null);
  const pillar = pillarPick ?? TOPIC_PILLAR[topic];
  const [frequency, setFrequency] = useState<KpiFrequency>("monthly");
  const [level, setLevel] = useState<KpiLevel>("site");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [aiDown, setAiDown] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = tried && !name.trim() ? "Give it a short name." : undefined;
  const questionError = tried && !question.trim() ? "Write the question your people answer." : undefined;

  const reset = () => {
    setName("");
    setQuestion("");
    setHelp("");
    setUnit("");
    setPillarPick(null);
    setSuggestions(null);
    setAiDown(null);
    setPicked([]);
    setTried(false);
    setError(null);
  };

  const askAi = async () => {
    setError(null);
    setAiDown(null);
    try {
      const r = await suggest.mutateAsync({ name: name.trim(), question: question.trim(), unit: unit.trim() || null, topic });
      if (!r.available) {
        setAiDown(r.message || AI_DOWN_MESSAGE);
        setSuggestions(null);
      } else setSuggestions(r.suggestions.filter((x): x is Suggestion => typeof x.disclosure_id === "number"));
    } catch (e) {
      setError(kpiErrorMessage(e, "Couldn't get suggestions. You can add the KPI without them."));
    }
  };

  const save = async () => {
    setTried(true);
    if (!name.trim() || !question.trim()) return;
    const shape = unitShape(unit);
    const body: CustomKpiBody = {
      name: name.trim(),
      question: question.trim(),
      help: help.trim() || null,
      topic,
      // D19: sent only when it differs from the topic's; the server defaults it otherwise.
      ...(pillar !== TOPIC_PILLAR[topic] ? { pillar } : {}),
      ...shape,
      aggregation: shape.unit_dimension === "ratio" ? "average" : "sum",
      level,
      default_frequency: frequency,
      decimals: shape.value_type === "integer" ? 0 : 2,
      mappings: (suggestions ?? []).filter((s) => picked.includes(s.disclosure_id)).map((s) => ({ disclosure_id: s.disclosure_id, fit: s.fit ?? "partial", note: null })),
    };
    try {
      const def = await create.mutateAsync(body);
      onCreated(def);
      reset();
    } catch (e) {
      setError(kpiErrorMessage(e, "Couldn't add the KPI."));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add your own KPI"
      subtitle="For anything the library doesn't have. Only your company sees it."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={create.isPending}>
            Add KPI
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={setName} placeholder="Rainwater harvested" required error={nameError} />
        <Textarea
          label="Question your people answer"
          value={question}
          onChange={setQuestion}
          placeholder="How much rainwater did {site} collect in {period}?"
          help="Write {site} and {period}; they're filled in for each person."
          required
          error={questionError}
          rows={2}
        />
        <Textarea label="What counts (optional)" value={help} onChange={setHelp} placeholder="What to include and what to leave out" rows={2} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <TextField label="Unit" value={unit} onChange={setUnit} placeholder="m³" help="Leave empty for a count." list="kpi-unit-hints" />
            <datalist id="kpi-unit-hints">
              {UNIT_HINTS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <Select<KpiTopic> label="Topic" value={topic} onChange={(v) => v && setTopic(v)} options={KPI_TOPICS.map((t) => ({ value: t, label: TOPIC_LABEL[t] }))} />
          <div className="space-y-1">
            <Select<KpiPillar>
              label="Pillar"
              value={pillar}
              onChange={(v) => v && setPillarPick(v === TOPIC_PILLAR[topic] ? null : v)}
              options={KPI_PILLARS.map((p) => ({ value: p, label: PILLAR_LABEL[p] }))}
              help="Follows the topic unless you change it."
            />
            {pillar !== TOPIC_PILLAR[topic] && (
              <p className="text-xs text-warn" data-testid="pillar-override-note">
                {topicPillarNote(topic)}
              </p>
            )}
          </div>
          <Select<KpiFrequency> label="How often" value={frequency} onChange={(v) => v && setFrequency(v)} options={KPI_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} />
          <Select<KpiLevel> label="Entered for" value={level} onChange={(v) => v && setLevel(v)} options={KPI_LEVELS.map((l) => ({ value: l, label: l === "site" ? "Each site" : LEVEL_LABEL[l] }))} />
        </div>

        <section aria-labelledby="custom-kpi-map" className="space-y-2 rounded-control border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="custom-kpi-map" className="text-sm font-medium text-ink">
              Used in a framework? (optional)
            </h3>
            <Button size="sm" variant="ghost" onClick={() => void askAi()} loading={suggest.isPending} disabled={!name.trim()}>
              <Sparkles aria-hidden className="size-4" />
              Suggest
            </Button>
          </div>
          {aiDown ? (
            <p role="status" className="text-sm text-muted" data-testid="ai-unavailable">
              {aiDown}
            </p>
          ) : suggestions === null ? (
            <p className="text-xs text-muted">Get suggestions for disclosures this KPI could answer. You choose which apply.</p>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-muted">No close match. It's tracked as your own KPI.</p>
          ) : (
            <ul className="space-y-2" aria-label="Suggested disclosures">
              {suggestions.map((s) => (
                <li key={s.disclosure_id}>
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className={cn("mt-0.5 size-4 shrink-0 accent-brand", focusRing)}
                      checked={picked.includes(s.disclosure_id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.disclosure_id] : p.filter((x) => x !== s.disclosure_id)))}
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{disclosureBadge(s.framework, s.code)}</span>
                        {s.title && <span>{s.title}</span>}
                        {checkMapping(s) ? <Badge tone="warn">Check this</Badge> : <AiChip />}
                      </span>
                      {s.why && <span className="block text-xs text-muted">{s.why}</span>}
                      {s.fit && <span className="block text-xs text-muted">{FIT_LABEL[s.fit]} fit</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </Drawer>
  );
}
