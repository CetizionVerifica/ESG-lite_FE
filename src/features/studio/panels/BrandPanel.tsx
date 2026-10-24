import { Link } from "react-router-dom";
import { ImageOff } from "lucide-react";
import { EmptyState, Loading, Button, Skeleton, Tooltip, cn, focusRing } from "../../../ui";
import { DEFAULT_FONTS, FONT_NAMES, fontStack } from "../../../lib/studio/brandKit";
import { applyFonts, colourSelection, insertLogo, type LogoVariant } from "../../../lib/studio/brandOps";
import { roleOf } from "../../../lib/studio/styleOps";
import { brandKitErrorMessage, useBrandKit } from "../brand-kit/api";
import { StylesPanel } from "./StylesPanel";
import type { StudioPanelProps } from "./types";

let logoCount = 0;
const newLogoId = () => `logo-${Date.now().toString(36)}-${++logoCount}`;

/**
 * DS-3 · the Brand drawer (05-ux rail tab "Brand", mockup "Brand and styles"):
 * brand logos (click to insert), palettes (click a swatch to colour the
 * selection, or the page background when nothing that takes colour is
 * selected), the brand fonts, and Styles. DS-6 mounts it with
 * `registerDrawer('brand', BrandPanel)`.
 */
export function BrandPanel({ doc, pageId, selection, commit, preview }: StudioPanelProps) {
  const kit = useBrandKit();

  if (kit.isError) return <EmptyState variant="error" compact title="The brand kit couldn't be loaded." description={brandKitErrorMessage(kit.error, "Try again in a moment.")} action={<Button size="sm" onClick={() => void kit.refetch()}>Try again</Button>} />;
  if (kit.isPending)
    return (
      <Loading label="Loading the brand kit" className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
      </Loading>
    );

  const data = kit.data;
  const page = doc.pages.find((p) => p.id === pageId);
  const canPlace = page?.kind === "freeform";
  const fonts = { heading: data.fonts.heading ?? DEFAULT_FONTS.heading, body: data.fonts.body ?? DEFAULT_FONTS.body };
  const docFonts = doc.design.theme.fonts;
  const usingBrandFonts = docFonts?.heading === fonts.heading && docFonts?.body === fonts.body;

  const logo = (variant: LogoVariant, url: string | null, label: string, dark: boolean) => (
    <button
      type="button"
      disabled={!url || !canPlace}
      onClick={() => pageId && commit(insertLogo(doc, pageId, variant, { id: newLogoId(), alt: `${data.name} logo` }), "Insert logo")}
      className={cn("flex h-16 items-center justify-center rounded-control border border-line p-2 disabled:cursor-not-allowed disabled:opacity-60", focusRing)}
      // The tile shows the logo on the surface it was made for: brand data, not an app colour.
      style={{ background: dark ? "#16202e" : "#ffffff" }}
      aria-label={url ? `Insert ${label.toLowerCase()}` : `No ${label.toLowerCase()} yet`}
    >
      {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <ImageOff aria-hidden className="size-5 text-muted" />}
    </button>
  );

  return (
    <div className="space-y-5" data-testid="brand-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Brand kit</h2>
        {data.canEdit && (
          <Link to="/studio/brand-kit" className="text-xs text-brand-text underline-offset-2 hover:underline">
            Edit brand kit
          </Link>
        )}
      </div>

      <section aria-labelledby="bp-logos" className="space-y-2">
        <h3 id="bp-logos" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Logos
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {logo("primary", data.logos.primary, "Logo on light", false)}
          {logo("onDark", data.logos.onDark, "Logo on dark", true)}
        </div>
        {!canPlace && <p className="text-xs text-muted">Open a design page to place a logo.</p>}
      </section>

      <section aria-labelledby="bp-palettes" className="space-y-2">
        <h3 id="bp-palettes" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Palettes
        </h3>
        {data.palettes.length === 0 && <p className="text-xs text-muted">No palettes yet.{data.canEdit ? " Add them in the brand kit." : ""}</p>}
        {data.palettes.map((p) => (
          <div key={p.id} className="space-y-1">
            <p className="text-xs text-muted">{p.name}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={`${p.name} colours`}>
              {p.colors.map((c) => {
                const role = roleOf(doc, c);
                const label = `${selection.length ? "Colour the selection" : "Colour the page background"} ${c.toUpperCase()}${role ? ` (${role})` : ""}`;
                return (
                  <li key={c}>
                    <Tooltip content={label}>
                      <button
                        type="button"
                        aria-label={label}
                        disabled={!canPlace}
                        onClick={() => pageId && commit(colourSelection(doc, pageId, selection, c), "Colour")}
                        className={cn("size-7 rounded-control border border-line disabled:cursor-not-allowed disabled:opacity-60", focusRing)}
                        style={{ background: c }}
                      />
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="bp-fonts" className="space-y-2">
        <h3 id="bp-fonts" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Fonts
        </h3>
        <p className="text-base text-ink" style={{ fontFamily: fontStack(fonts.heading) }}>
          {FONT_NAMES[fonts.heading]} <span className="text-xs text-muted" style={{ fontFamily: "inherit" }}>Headings</span>
        </p>
        <p className="text-sm text-ink" style={{ fontFamily: fontStack(fonts.body) }}>
          {FONT_NAMES[fonts.body]} <span className="text-xs text-muted">Body and numbers</span>
        </p>
        <Button size="sm" disabled={usingBrandFonts} onClick={() => commit(applyFonts(doc, fonts), "Use brand fonts")}>
          {usingBrandFonts ? "Using brand fonts" : "Use brand fonts"}
        </Button>
      </section>

      <StylesPanel doc={doc} commit={commit} preview={preview} />

      {data.voice && (
        <section aria-labelledby="bp-voice" className="space-y-1">
          <h3 id="bp-voice" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Brand voice
          </h3>
          <p className="line-clamp-4 text-xs text-ink">{data.voice}</p>
        </section>
      )}
    </div>
  );
}
