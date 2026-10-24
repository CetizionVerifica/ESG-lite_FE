import { useState } from "react";
import { Shuffle } from "lucide-react";
import { Button, EmptyState, Loading, Skeleton, cn, focusRing } from "../../../ui";
import { FONT_NAMES, fontStack } from "../../../lib/studio/brandKit";
import type { StylePreset } from "../../../lib/studio/contracts";
import { applyStyle, shuffleStyle } from "../../../lib/studio/styleOps";
import { brandKitErrorMessage, useStyles } from "../brand-kit/api";
import type { StudioPanelProps } from "./types";

/**
 * DS-3 · Styles (05-ux S5): 6–12 palette + font pairs from GET /studio/styles.
 * Hover (or focus) previews the current page; **Apply to all pages** writes
 * the style through `applyStyle`; **Shuffle** rotates colour roles within the
 * chosen style, a new variant each press. Both are one undo step.
 */
export function StylesPanel({ doc, commit, preview }: Pick<StudioPanelProps, "doc" | "commit" | "preview">) {
  const styles = useStyles(doc.kind);
  const [picked, setPicked] = useState<string | null>(null);
  const [seed, setSeed] = useState(0);
  const pages = doc.pages.length;

  if (styles.isError) return <EmptyState variant="error" compact title="Styles couldn't be loaded." description={brandKitErrorMessage(styles.error, "Try again in a moment.")} action={<Button size="sm" onClick={() => void styles.refetch()}>Try again</Button>} />;
  if (styles.isPending)
    return (
      <Loading label="Loading styles" className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </Loading>
    );

  const list = styles.data;
  const currentId = picked ?? doc.design.styleId ?? null;
  const current: StylePreset | undefined = list.find((s) => s.id === currentId) ?? list[0];
  const clearPreview = () => preview?.(null);

  return (
    <section aria-labelledby="styles-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 id="styles-heading" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Styles
        </h3>
        <Button
          size="sm"
          variant="ghost"
          icon={<Shuffle aria-hidden className="size-4" />}
          disabled={!current}
          onClick={() => {
            if (!current) return;
            commit(shuffleStyle(doc, current, seed), `Shuffle ${current.name}`);
            setSeed((s) => s + 1);
          }}
        >
          Shuffle
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-2" onMouseLeave={clearPreview}>
        {list.map((s) => {
          const on = s.id === current?.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={on}
                data-testid={`style-${s.id}`}
                onClick={() => {
                  setPicked(s.id);
                  setSeed(0);
                }}
                onMouseEnter={() => preview?.(applyStyle(doc, s))}
                onFocus={() => preview?.(applyStyle(doc, s))}
                onBlur={clearPreview}
                className={cn("flex w-full flex-col gap-2 rounded-card border bg-panel p-2.5 text-left hover:border-brand", on ? "border-brand ring-1 ring-brand" : "border-line", focusRing)}
              >
                <span className="flex items-center justify-between gap-2">
                  {/* The style's own colours and font: brand data, not app colours. */}
                  <span className="text-xl leading-none" style={{ fontFamily: fontStack(s.fonts.heading), color: s.palette[0] }} aria-hidden>
                    Aa
                  </span>
                  <span className="flex gap-0.5" aria-hidden>
                    {s.palette.map((c, i) => (
                      <span key={i} className="size-3 rounded-full border border-line" style={{ background: c }} />
                    ))}
                  </span>
                </span>
                <span className="truncate text-xs text-ink">{s.name}</span>
                <span className="sr-only">
                  Headings {FONT_NAMES[s.fonts.heading]}, body {FONT_NAMES[s.fonts.body]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        variant="primary"
        className="w-full"
        disabled={!current}
        onClick={() => {
          if (!current) return;
          clearPreview();
          commit(applyStyle(doc, current), `Apply style ${current.name}`);
          setSeed(0);
        }}
      >
        Apply to all {pages} {pages === 1 ? "page" : "pages"}
      </Button>
      <p className="text-xs text-muted">Hover a style to preview it on this page. You can undo.</p>
    </section>
  );
}
