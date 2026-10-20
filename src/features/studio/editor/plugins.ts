// DS-6 · where drawers and toolbars are registered (registry.ts). Shared and
// append-only: each module adds its own block, marked `// DS-n`, and never
// edits another's. A `fallback` registration never replaces a real one, so
// order doesn't matter.
import { BrandPanel } from "../panels/BrandPanel";
import { PagesPanel } from "../panels/PagesPanel";
import { AiSoon, BasicElementsPanel, BasicUploadsPanel, ChartsSoon, DataDrawer, TemplatesSoon, TextSoon } from "./fallbacks";
import { registerDrawer, registerToolbar } from "./registry";
import { registerChartsPlugins } from "./charts/register"; // DS-8
import { DataToolbar, MediaToolbar, MultiToolbar, PageToolbar, ShapeToolbar, TextToolbar } from "./toolbars";

let done = false;

export function registerEditorPlugins(): void {
  if (done) return;
  done = true;

  // DS-6: the shell's own drawers and toolbars.
  registerShellToolbars();
  registerDrawer("pages", PagesPanel);
  registerDrawer("elements", BasicElementsPanel, { fallback: true });
  registerDrawer("uploads", BasicUploadsPanel, { fallback: true });
  registerDrawer("templates", TemplatesSoon, { fallback: true });
  registerDrawer("text", TextSoon, { fallback: true });
  registerDrawer("charts", ChartsSoon, { fallback: true });
  registerDrawer("ai", AiSoon, { fallback: true });

  // DS-2: the Data drawer.
  registerDrawer("data", DataDrawer);

  // DS-3: the Brand drawer (logos, palettes, fonts, Styles).
  registerDrawer("brand", BrandPanel);

  // DS-8: the Charts drawer, the Data drawer with binding editing and drag to page, chart and table toolbars.
  registerChartsPlugins();
}

/** Registers the shell's toolbars (fallbacks: real ones from DS-7/DS-8 win). */
function registerShellToolbars(): void {
  registerToolbar("page", PageToolbar, { fallback: true });
  for (const t of ["image", "frame", "grid"] as const) registerToolbar(t, MediaToolbar, { fallback: true });
  for (const t of ["shape", "line", "divider", "icon", "qr", "page_number"] as const) registerToolbar(t, ShapeToolbar, { fallback: true });
  for (const t of ["text", "callout"] as const) registerToolbar(t, TextToolbar, { fallback: true });
  for (const t of ["kpi_tile", "big_number", "progress", "chart", "table"] as const) registerToolbar(t, DataToolbar, { fallback: true });
  registerToolbar("multi", MultiToolbar, { fallback: true });
}
