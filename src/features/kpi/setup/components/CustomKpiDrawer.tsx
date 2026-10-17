import { useState } from "react";
import { Sparkles } from "lucide-react";
import { KPI_FREQUENCIES, KPI_LEVELS, KPI_TOPICS, type CustomKpiBody, type KpiDefinition, type KpiFrequency, type KpiLevel, type KpiTopic, type SuggestMappingResult } from "../../../../lib/kpi/contracts";
import { FIT_LABEL, FREQUENCY_LABEL, LEVEL_LABEL, TOPIC_LABEL, disclosureBadge } from "../../../../lib/kpi/labels";
import { KPI_UNITS } from "../../../../lib/kpi/units";
import { Button, Drawer, Select, TextField, Textarea, cn, focusRing } from "../../../../ui";
import { kpiErrorMessage, useCreateCustomKpi, useSuggestMapping } from "../api";
import { unitShape } from "../logic";

type Suggestion = SuggestMappingResult["suggestions"][number];

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
  const [frequency, setFrequency] = useState<KpiFrequency>("monthly");
  const [level, setLevel] = useState<KpiLevel>("site");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
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
    setSuggestions(null);
    setPicked([]);
    setTried(false);
    setError(null);
  };

  const askAi = async () => {
    setError(null);
    try {
      setSuggestions(await suggest.mutateAsync({ name: name.trim(), question: question.trim(), unit: unit.trim() || null }));
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
      ...shape,
      aggregation: shape.unit_dimension === "ratio" ? "average" : "sum",
      level,
      default_frequency: frequency,
      decimals: shape.value_type === "integer" ? 0 : 2,
      mappings: (suggestions ?? []).filter((s) => picked.includes(s.disclosure_id)).map((s) => ({ disclosure_id: s.disclosure_id, fit: s.fit, note: null })),
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
          {suggestions === null ? (
            <p className="text-xs text-muted">Get suggestions for disclosures this KPI could answer. You choose which apply.</p>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-muted">No close match. It's tracked as your own KPI.</p>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <li key={s.disclosure_id}>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className={cn("size-4 accent-brand", focusRing)}
                      checked={picked.includes(s.disclosure_id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.disclosure_id] : p.filter((x) => x !== s.disclosure_id)))}
                    />
                    <span>{disclosureBadge(s.framework, s.code)}</span>
                    <span className="text-xs text-muted">
                      {FIT_LABEL[s.fit]} fit · {Math.round(s.confidence * 100)} % sure
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
