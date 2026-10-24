import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useInsightsQuery } from "../../../lib/insights/query";
import { useInsights } from "../../../lib/insights/switch";
import { Button, ChartFrameDefaults, cn } from "../../../ui";
import { useFocusTrap } from "../../../ui/hooks/useFocusTrap";
import { PanelShell } from "../components/PanelShell";
import { InsightsSurfaceContext } from "../components/presentContext";
import { SLOTS } from "../logic";
import { clampSlide, slidesFor } from "./slides";

/**
 * IN-8 · `/insights/present` (05-ux §8): full screen, one story per slide,
 * the page's filters from the URL, ← / → (and the buttons) move, Esc goes back
 * to /insights with the same filters. Focus is trapped while it's open and
 * returns to where it was. Large type: charts draw taller, hero figures 56 px.
 */
export default function PresentPage() {
  const { query } = useInsightsQuery();
  const { kpi_tracking: kpiOn } = useInsights();
  const slides = slidesFor(kpiOn);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const i = clampSlide(index, slides.length);
  const slide = slides[i];
  const ref = useRef<HTMLDivElement>(null);

  const exit = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("slide"); // data-loss-reviewed: URL param, not a record
    const qs = next.toString();
    navigate(`/insights${qs ? `?${qs}` : ""}`);
  }, [navigate, params]);
  const trap = useFocusTrap(ref, true, exit);
  const go = useCallback((d: number) => setIndex((n) => clampSlide(n + d, slides.length)), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Present insights"
      tabIndex={-1}
      onKeyDown={trap.onKeyDown}
      data-testid="insights-present"
      className={cn("fixed inset-0 z-50 flex flex-col overflow-auto bg-page text-ink outline-none", slide.cover && "bg-gradient-to-br from-cover-from to-cover-to")}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <h1 className={cn("text-lg font-semibold sm:text-2xl", slide.cover ? "text-on-brand" : "text-ink")} data-testid="slide-title">
          {slide.title}
        </h1>
        <div className="flex items-center gap-2">
          <span className={cn("font-num text-sm tabular-nums", slide.cover ? "text-on-brand" : "text-muted")} aria-live="polite" data-testid="slide-counter">
            {i + 1} / {slides.length}
          </span>
          <Button size="sm" variant="secondary" onClick={() => go(-1)} disabled={i === 0} icon={<ChevronLeft aria-hidden className="size-4" />}>
            Previous
          </Button>
          <Button size="sm" variant="secondary" onClick={() => go(1)} disabled={i === slides.length - 1} icon={<ChevronRight aria-hidden className="size-4" />}>
            Next
          </Button>
          <Button size="sm" variant="secondary" onClick={exit} icon={<X aria-hidden className="size-4" />}>
            Exit
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 pb-8 sm:px-8" data-slide={slide.id}>
        <InsightsSurfaceContext.Provider value="present">
          <ChartFrameDefaults.Provider value={{ height: 460 }}>
            {slide.slots.map((id) => (
              <PanelShell key={`${slide.id}-${id}`} slot={SLOTS[id]} query={query} className="text-base" />
            ))}
          </ChartFrameDefaults.Provider>
        </InsightsSurfaceContext.Provider>
      </main>
    </div>
  );
}
