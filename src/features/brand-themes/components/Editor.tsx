import { Sparkles } from "lucide-react";
import { Button, Callout, ColourField, SegmentedControl, TextField, Toggle, cn } from "../../../ui";
import type { Look } from "../../../theme";
import { type BrandDraft, LOOKS, LOOK_LABELS } from "../logic";
import { useLogoColours } from "../hooks/useLogoColours";
import { LogoField } from "./LogoField";

export interface EditorProps {
  draft: BrandDraft;
  onChange: (patch: Partial<BrandDraft>) => void;
  errors: Partial<Record<keyof BrandDraft, string>>;
  saved: { logoUrl: string | null; logoOnDarkUrl: string | null };
  staged: { logoUrl: string | null; logoOnDarkUrl: string | null };
  /** Primary passes as text / accent is fill-only, shown next to the fields. */
  notes: { primary?: string; accent?: string };
  /** Classic top bar colours of the draft, for the dark logo tile. */
  darkTile: { background: string; color: string };
  /** Light look panel colours, for the light logo tile. */
  lightTile: { background: string; color: string };
  readOnly?: boolean;
}

export function Editor({ draft, onChange, errors, saved, staged, notes, darkTile, lightTile, readOnly }: EditorProps) {
  const logoColours = useLogoColours();
  const suggestFrom = staged.logoUrl ?? saved.logoUrl;

  return (
    <form
      aria-label="Brand theme"
      onSubmit={(e) => e.preventDefault()}
      className="space-y-5 rounded-card border border-line bg-panel p-4"
    >
      <TextField
        label="Display name"
        help="Shown in the top bar, on sign-in and on reports"
        value={draft.name}
        onChange={(name) => onChange({ name })}
        error={errors.name}
        required
        disabled={readOnly}
      />
      <LogoField
        label="Logo (light background)"
        dropLabel="Drop a logo for light backgrounds"
        help="PNG, JPG, SVG or WebP, up to 5 MB"
        savedUrl={saved.logoUrl}
        stagedUrl={staged.logoUrl}
        staged={draft.logoFile}
        onStage={(logoFile) => onChange({ logoFile })}
        onLight={lightTile}
        readOnly={readOnly}
      />
      <LogoField
        label="Logo (dark background)"
        dropLabel="Drop a logo for dark backgrounds"
        help="White or one-colour logo for the Classic top bar and Night"
        savedUrl={saved.logoOnDarkUrl}
        stagedUrl={staged.logoOnDarkUrl}
        staged={draft.darkLogoFile}
        onStage={(darkLogoFile) => onChange({ darkLogoFile })}
        onDark={darkTile}
        removed={draft.removeDarkLogo}
        onToggleRemove={() => onChange({ removeDarkLogo: !draft.removeDarkLogo })}
        readOnly={readOnly}
      />

      {!readOnly && (
        <div className="space-y-2">
          <Button
            size="sm"
            icon={<Sparkles aria-hidden className="size-3.5" />}
            loading={logoColours.state.status === "loading"}
            disabled={!suggestFrom}
            onClick={() => void logoColours.suggest(suggestFrom)}
          >
            Suggest from logo
          </Button>
          {logoColours.state.status === "error" && <p className="text-xs text-bad">{logoColours.state.message}</p>}
          {logoColours.state.status === "done" && (
            <ul aria-label="Colours from the logo" className="space-y-1.5">
              {logoColours.state.colours.map((c) => (
                <li key={c} className="flex items-center gap-2 text-xs">
                  <span aria-hidden className="size-5 rounded-chip border border-line" style={{ background: c }} />
                  <span className="font-num uppercase text-ink">{c}</span>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onChange({ primary: c })}>
                    Use as primary
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onChange({ accent: c })}>
                    Use as accent
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ColourField label="Primary" value={draft.primary} onChange={(primary) => onChange({ primary })} error={errors.primary} help={notes.primary} disabled={readOnly} />
        <ColourField label="Accent" value={draft.accent} onChange={(accent) => onChange({ accent })} error={errors.accent} help={notes.accent} disabled={readOnly} />
        <ColourField label="Cover gradient from" value={draft.coverFrom} onChange={(coverFrom) => onChange({ coverFrom })} error={errors.coverFrom} disabled={readOnly} />
        <ColourField label="Cover gradient to" value={draft.coverTo} onChange={(coverTo) => onChange({ coverTo })} error={errors.coverTo} disabled={readOnly} />
      </div>
      <div
        aria-hidden
        className={cn("h-8 rounded-control border border-line")}
        style={{ background: `linear-gradient(90deg, ${draft.coverFrom}, ${draft.coverTo})` }}
      />

      <div className="space-y-2">
        <Toggle
          label="Scope 3 colour"
          inlineLabel="Use a custom Scope 3 colour"
          help={draft.scope3Colour ? undefined : "Off: a neutral derived from the primary"}
          checked={draft.scope3Colour !== null}
          onChange={(on) => onChange({ scope3Colour: on ? draft.accent : null })}
          disabled={readOnly}
        />
        {draft.scope3Colour !== null && (
          <ColourField
            label="Scope 3"
            hideLabel
            value={draft.scope3Colour}
            onChange={(scope3Colour) => onChange({ scope3Colour })}
            error={errors.scope3Colour}
            disabled={readOnly}
          />
        )}
      </div>

      <div className="space-y-1">
        <span id="default-look-label" className="block text-sm font-medium text-ink">
          Default look
        </span>
        {readOnly ? (
          <p className="text-sm text-ink">{LOOK_LABELS[draft.defaultLook]}</p>
        ) : (
          <SegmentedControl<Look>
            label="Default look"
            options={LOOKS.map((l) => ({ value: l, label: LOOK_LABELS[l] }))}
            value={draft.defaultLook}
            onChange={(defaultLook) => onChange({ defaultLook })}
          />
        )}
        <p className="text-xs text-muted">What the client's users see; anyone who picks dark appearance gets Night.</p>
      </div>

      {readOnly && (
        <Callout tone="info" title="View only">
          PlanetPulse manages your brand theme. Ask your PlanetPulse contact to change it.
        </Callout>
      )}
    </form>
  );
}
