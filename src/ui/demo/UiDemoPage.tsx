import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "../cn";
import { focusRing } from "../styles";
import { ButtonsDemo, EmptyStateDemo, FieldsDemo, FormatDemo, OverlaysDemo, SkeletonDemo, StatusPillDemo } from "./CoreDemos";
import { DataTableDemo, PageHeaderDemo } from "./TableDemos";
import { DEMO_THEMES, DEMO_THEME_LABEL, applyDemoTheme, type DemoTheme } from "./demoTheme";

/**
 * Dev-only gallery of src/ui components (route /__ui, VITE_NEW_UI=1, `npm run dev`).
 * `?theme=light|dark|classic` picks the theme; Playwright snapshots each section.
 */
export default function UiDemoPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("theme");
  const theme: DemoTheme = (DEMO_THEMES as readonly string[]).includes(raw ?? "") ? (raw as DemoTheme) : "light";

  useEffect(() => applyDemoTheme(theme), [theme]);

  return (
    <div className="min-h-screen bg-page font-ui text-ink">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-panel px-6 py-3">
        <h1 className="text-base font-semibold">src/ui components</h1>
        <div role="radiogroup" aria-label="Theme" className="ml-auto flex gap-1 rounded-control bg-tint p-1">
          {DEMO_THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={t === theme}
              onClick={() => setParams((p) => (p.set("theme", t), p), { replace: true })}
              className={cn(
                "rounded-chip px-2.5 py-1 text-xs font-medium",
                t === theme ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
                focusRing,
              )}
            >
              {DEMO_THEME_LABEL[t]}
            </button>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <PageHeaderDemo />
        <DataTableDemo />
        <FormatDemo />
        <ButtonsDemo />
        <StatusPillDemo />
        <FieldsDemo />
        <EmptyStateDemo />
        <SkeletonDemo />
        <OverlaysDemo />
      </main>
    </div>
  );
}
