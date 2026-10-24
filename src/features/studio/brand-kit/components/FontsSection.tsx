import { Select } from "../../../../ui";
import { DEFAULT_FONTS, FONT_NAMES, fontStack } from "../../../../lib/studio/brandKit";
import { FONT_IDS, type FontId } from "../../../../lib/studio/contracts";

const OPTIONS = FONT_IDS.map((f) => ({ value: f, label: FONT_NAMES[f] }));

function FontPicker({ label, role, value, readOnly, onChange }: { label: string; role: "heading" | "body"; value: FontId | null; readOnly: boolean; onChange: (f: FontId | null) => void }) {
  const shown = value ?? DEFAULT_FONTS[role];
  return (
    <div className="space-y-2">
      {readOnly ? (
        <p className="text-sm text-ink">
          <span className="block text-xs text-muted">{label}</span>
          {value ? FONT_NAMES[value] : `Template default (${FONT_NAMES[DEFAULT_FONTS[role]]})`}
        </p>
      ) : (
        <Select<FontId> label={label} value={value} onChange={onChange} options={OPTIONS} placeholder={`Template default (${FONT_NAMES[DEFAULT_FONTS[role]]})`} />
      )}
      <p className="rounded-control border border-line bg-tint px-3 py-2 text-ink" style={{ fontFamily: fontStack(shown) }} data-testid={`font-sample-${role}`}>
        {role === "heading" ? <span className="text-xl">Scope 3 fell 12% from the base year</span> : <span className="text-sm">We cut total emissions 12% from our base year. 95,710 tCO₂e in FY 2025–26.</span>}
      </p>
    </div>
  );
}

/** Heading and body fonts from the curated OFL set (RS R12). */
export function FontsSection({ heading, body, readOnly, onChange }: { heading: FontId | null; body: FontId | null; readOnly: boolean; onChange: (fonts: { heading: FontId | null; body: FontId | null }) => void }) {
  return (
    <section aria-labelledby="bk-fonts" className="space-y-3 rounded-card border border-line bg-panel p-4">
      <h2 id="bk-fonts" className="text-sm font-semibold text-ink">
        Fonts
      </h2>
      <FontPicker label="Headings" role="heading" value={heading} readOnly={readOnly} onChange={(f) => onChange({ heading: f, body })} />
      <FontPicker label="Body and numbers" role="body" value={body} readOnly={readOnly} onChange={(f) => onChange({ heading, body: f })} />
    </section>
  );
}
