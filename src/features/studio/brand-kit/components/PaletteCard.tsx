import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, TextField, cn, focusRing } from "../../../../ui";
import { contrastSummary, paletteContrast, type PaletteDraft } from "../../../../lib/studio/brandKit";
import { PALETTE_MAX_COLORS } from "../../../../lib/studio/contracts";

const HEX = /^#[0-9a-f]{6}$/i;

export interface PaletteCardProps {
  palette: PaletteDraft;
  index: number;
  count: number;
  readOnly: boolean;
  errors: Record<string, string>;
  onChange: (next: PaletteDraft) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}

/** One palette: name, swatches (native colour inputs), reorder and delete, and its contrast badge with every pair. */
export function PaletteCard({ palette, index, count, readOnly, errors, onChange, onMove, onRemove }: PaletteCardProps) {
  const [open, setOpen] = useState(false);
  const pairs = paletteContrast(palette.colors);
  const sum = contrastSummary(pairs);
  const colourError = errors[`palettes.${index}.colors`];
  const setColour = (i: number, hex: string) => onChange({ ...palette, colors: palette.colors.map((c, j) => (j === i ? hex : c)) });

  return (
    <li className="space-y-3 rounded-card border border-line bg-panel p-4" data-testid={`palette-${index}`}>
      <div className="flex flex-wrap items-end gap-2">
        {readOnly ? (
          <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink">{palette.name}</h3>
        ) : (
          <TextField label="Palette name" className="min-w-0 flex-1" value={palette.name} onChange={(name) => onChange({ ...palette, name })} error={errors[`palettes.${index}.name`]} maxLength={60} />
        )}
        {!readOnly && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" aria-label={`Move ${palette.name || "palette"} up`} disabled={index === 0} onClick={() => onMove(index - 1)} icon={<ArrowUp aria-hidden className="size-4" />} />
            <Button size="sm" variant="ghost" aria-label={`Move ${palette.name || "palette"} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)} icon={<ArrowDown aria-hidden className="size-4" />} />
            <Button size="sm" variant="ghost" aria-label={`Delete ${palette.name || "palette"}`} onClick={onRemove} icon={<Trash2 aria-hidden className="size-4" />} />
          </div>
        )}
      </div>

      <ul className="flex flex-wrap items-start gap-3" aria-label={`${palette.name || "Palette"} colours`}>
        {palette.colors.map((c, i) => (
          <li key={i} className="flex flex-col items-center gap-1">
            {readOnly ? (
              <span aria-hidden className="size-9 rounded-control border border-line" style={{ background: HEX.test(c) ? c : undefined }} />
            ) : (
              <div className="relative">
                <input
                  type="color"
                  aria-label={`Colour ${i + 1} of ${palette.name || "palette"}`}
                  value={HEX.test(c) ? c.toLowerCase() : "#000000"}
                  onChange={(e) => setColour(i, e.target.value)}
                  className={cn("size-9 cursor-pointer rounded-control border border-line bg-panel p-0.5", focusRing)}
                />
                <button
                  type="button"
                  aria-label={`Remove colour ${c}`}
                  onClick={() => onChange({ ...palette, colors: palette.colors.filter((_, j) => j !== i) })}
                  className={cn("absolute -right-1.5 -top-1.5 rounded-full border border-line bg-panel p-0.5 text-muted hover:text-ink", focusRing)}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </div>
            )}
            <span className="font-num text-[11px] uppercase text-muted">{c}</span>
          </li>
        ))}
        {!readOnly && palette.colors.length < PALETTE_MAX_COLORS && (
          <li>
            <Button size="sm" variant="secondary" icon={<Plus aria-hidden className="size-4" />} onClick={() => onChange({ ...palette, colors: [...palette.colors, palette.colors[palette.colors.length - 1] ?? "#1f2a44"] })}>
              Add colour
            </Button>
          </li>
        )}
      </ul>
      {colourError && (
        <p role="alert" className="text-xs text-bad">
          {colourError}
        </p>
      )}

      {pairs.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid={`contrast-${index}`}>
            <span className="text-muted">Contrast:</span>
            <Badge tone="good">{sum.text} for text</Badge>
            {sum.graphic > 0 && <Badge tone="info">{sum.graphic} large text and graphics only</Badge>}
            {sum.low > 0 && <Badge tone="warn">{sum.low} too low</Badge>}
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn("inline-flex items-center gap-1 rounded-chip text-muted hover:text-ink", focusRing)}>
              {open ? "Hide pairs" : "Show pairs"}
              <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </div>
          {open && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {pairs.map((p) => (
                <li key={`${p.a}-${p.b}`} className="flex items-center gap-2 text-xs">
                  <span aria-hidden className="inline-flex h-6 w-9 items-center justify-center rounded-chip border border-line text-[11px] font-semibold" style={{ background: p.b, color: p.a }}>
                    Aa
                  </span>
                  <span className="text-muted">
                    <span className="font-num uppercase">{p.a}</span> on <span className="font-num uppercase">{p.b}</span>
                  </span>
                  <span className="font-num text-ink">{p.ratio.toFixed(2)}:1</span>
                  <Badge tone={p.text ? "good" : p.graphic ? "info" : "warn"}>{p.text ? "Text" : p.graphic ? "Graphics" : "Low"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
