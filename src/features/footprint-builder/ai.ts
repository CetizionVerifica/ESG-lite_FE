// E2 AI assist in the builder: BOM lines and factor suggestions from the AI
// service become editor lines the person confirms. The service's confidence
// is 0–100; PcfInput.ai_confidence is 0–1 (under 0.6 blocks Calculate until
// confirmed, see `needsConfirm`).
import type { BomLine, FactorCandidate, MatchLine, MatchRequest, MatchedLine } from "../../services/pcfAiService";
import type { MaterialFactor } from "./api";
import { type InputStage, type Line, blankLine, newKey } from "./logic";

const INPUT_STAGES: InputStage[] = ["A1", "A2", "A3_packaging", "A3_waste"];

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).trim() || null);

/** AI confidence (0–100) as PcfInput.ai_confidence (0–1). */
export const toAiConfidence = (confidence: number) => Math.max(0, Math.min(1, confidence / 100));

/** A BOM line from parse-bom as an editor line: AI-suggested, with the line's stage (A1 when the reader didn't say). */
export function lineFromBom(b: BomLine): Line {
  const v = b.values;
  const stage = INPUT_STAGES.includes(v.stage as InputStage) ? (v.stage as InputStage) : "A1";
  const base = blankLine(stage);
  return {
    ...base,
    key: newKey(),
    name: text(v.name) ?? "",
    quantity: num(v.quantity),
    unit: text(v.unit) ?? base.unit,
    recycled_share_pct: num(v.recycled_share_pct) ?? 0,
    origin_country: text(v.origin_country),
    supplier_name: text(v.supplier_name),
    data_type: v.data_type === "primary" ? "primary" : "secondary",
    ai_suggested: true,
    ai_confidence: toAiConfidence(b.confidence),
  };
}

export const linesFromBom = (lines: BomLine[]): Line[] => lines.map(lineFromBom);

/** Material lines that still need a factor: no library factor and no supplier footprint (transport legs use freight factors). */
export const needsFactor = (l: Line) => l.stage !== "A2" && l.material_factor_id == null && l.supplier_pcf_kgco2e == null && !!l.name.trim();

const toMatchLine = (l: Line): MatchLine => ({
  id: l.key,
  name: l.name,
  unit: l.unit || null,
  stage: l.stage,
  origin_country: l.origin_country,
  supplier_name: l.supplier_name,
  recycled_share_pct: l.recycled_share_pct,
});

const toCandidate = (f: MaterialFactor): FactorCandidate => ({
  material_factor_id: f.material_factor_id,
  name: f.name,
  material_group: f.material_group,
  unit: f.unit,
  geography: f.geography,
  source: f.source,
  source_year: f.source_year,
  licence: f.licence,
  recycled_variant: f.recycled_variant,
});

/** The match-factors request for the lines that need a factor; null when there is nothing to match. */
export function matchRequestFor(lines: Line[], factors: MaterialFactor[], geographyHint: string | null): MatchRequest | null {
  const todo = lines.filter(needsFactor);
  if (!todo.length || !factors.length) return null;
  return { lines: todo.map(toMatchLine), factors: factors.filter((f) => !f.recycled_variant).map(toCandidate), geography_hint: geographyHint };
}

/** What the person accepted for one line: which suggestion, with its confidence. */
export type FactorPick = { key: string; material_factor_id: number; confidence: number };

/** The default picks: each matched line's first suggestion; unmatched lines are left for the person. */
export function defaultPicks(matched: MatchedLine[]): FactorPick[] {
  return matched.flatMap((m) => {
    const s = m.suggestions[0];
    return m.unmatched || !s || m.id == null ? [] : [{ key: String(m.id), material_factor_id: s.material_factor_id, confidence: s.confidence }];
  });
}

/** Lines with the accepted suggestions applied: factor set, marked AI-suggested with the suggestion's confidence. */
export function applyPicks(lines: Line[], picks: FactorPick[]): Line[] {
  const byKey = new Map(picks.map((p) => [p.key, p]));
  return lines.map((l) => {
    const p = byKey.get(l.key);
    return p ? { ...l, material_factor_id: p.material_factor_id, ai_suggested: true, ai_confidence: toAiConfidence(p.confidence) } : l;
  });
}
