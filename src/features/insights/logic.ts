// IN-0 · The Insights page layout (05-ux §3): named slots, the panel each one
// loads, the module that fills it, and its width in the 12-column grid.
// Pure data and helpers only; no figure is computed here.
import type { PanelId, PanelResponse } from "../../lib/insights/contracts";

export const SLOT_IDS = ["stripes", "hero", "decoupling", "ring", "scopes", "pathway", "wall", "cards", "flow", "materiality", "completeness", "sites"] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export interface SlotDef {
  id: SlotId;
  panel: PanelId;
  title: string;
  /** The module that renders this slot's panel (until then the shell shows its states only). */
  module: string;
  /** Where it sits: the top band, the story grid, or a lazy tab below the fold. */
  area: "band" | "story" | "tab";
  /** Tailwind column span at ≥1280 px (story grid; 6/6 at 1024, one column below). */
  span?: "xl:col-span-8" | "xl:col-span-4" | "xl:col-span-6" | "xl:col-span-12";
  /** Needs KPI tracking: hidden without it (the tab too). */
  kpi?: boolean;
  /** Shown only without KPI tracking (it stands in for a KPI slot). */
  noKpi?: boolean;
}

export const SLOTS: Record<SlotId, SlotDef> = {
  stripes: { id: "stripes", panel: "stripes", title: "Monthly emissions", module: "IN-8", area: "band" },
  hero: { id: "hero", panel: "summary", title: "Summary", module: "IN-1", area: "band" },
  decoupling: { id: "decoupling", panel: "decoupling", title: "Output and emissions", module: "IN-2", area: "story", span: "xl:col-span-8" },
  ring: { id: "ring", panel: "esg_ring", title: "ESG data readiness", module: "IN-2", area: "story", span: "xl:col-span-4", kpi: true },
  scopes: { id: "scopes", panel: "flow", title: "By scope and site", module: "IN-10", area: "story", span: "xl:col-span-4", noKpi: true },
  pathway: { id: "pathway", panel: "pathway", title: "Pathway", module: "IN-4", area: "story", span: "xl:col-span-6" },
  wall: { id: "wall", panel: "target_wall", title: "Targets", module: "IN-2", area: "story", span: "xl:col-span-6" },
  cards: { id: "cards", panel: "cards", title: "What stands out", module: "IN-3", area: "band" },
  flow: { id: "flow", panel: "flow", title: "Data flow", module: "IN-6", area: "tab" },
  materiality: { id: "materiality", panel: "materiality", title: "Materiality", module: "IN-7", area: "tab", kpi: true },
  completeness: { id: "completeness", panel: "completeness", title: "Completeness", module: "IN-4", area: "tab" },
  sites: { id: "sites", panel: "site_compare", title: "Sites", module: "IN-11", area: "tab" },
};

export const STORY_SLOTS: SlotId[] = ["decoupling", "ring", "pathway", "wall"];
/**
 * The story panels for a company (05-ux §3): without KPI tracking Story 2 is
 * "By scope and site" (a treemap of the flow panel's site → scope tonnes)
 * instead of the ESG ring.
 */
export const storySlotsFor = (kpiOn: boolean): SlotId[] => (kpiOn ? STORY_SLOTS : ["decoupling", "scopes", "pathway", "wall"]);
export const TAB_SLOTS = ["flow", "materiality", "completeness", "sites"] as const;
export type TabSlot = (typeof TAB_SLOTS)[number];

/** The tabs the company can open: Materiality needs KPI tracking (05-ux §3). */
export const tabsFor = (kpiOn: boolean): TabSlot[] => TAB_SLOTS.filter((t) => kpiOn || !SLOTS[t].kpi);

/** The slot a `?panel=` target points at (cards and links name panels; the bridge lives in the pathway slot). */
export function slotForPanel(panel: PanelId | null): SlotId | null {
  if (!panel) return null;
  if (panel === "bridge") return "pathway";
  if (panel === "flow") return "flow";
  return SLOT_IDS.find((s) => SLOTS[s].panel === panel) ?? null;
}

export type ShellState = "loading" | "error" | "hidden" | "empty" | "ok";

/** What a panel's shell shows for a query result (layer rule 2). `kpi_off` hides the panel, never an empty box. */
export function shellState(q: { isPending: boolean; isError: boolean; data?: Pick<PanelResponse<unknown>, "availability"> | undefined }): ShellState {
  if (q.data) {
    if (q.data.availability === "kpi_off") return "hidden";
    if (q.data.availability === "ok") return "ok";
    return "empty";
  }
  if (q.isError) return "error";
  return "loading";
}

/** Empty-state words when the server gave no reason (05-ux §7: say what's needed). */
export const EMPTY_FALLBACK: Record<"no_data" | "setup_incomplete", string> = {
  no_data: "There's no approved data for this period yet.",
  setup_incomplete: "Finish setup to see this panel.",
};

/** Years to pick: this year back to 2019 (the oldest data we migrate), newest first. */
export function yearOptions(thisYear: number, first = 2019): number[] {
  const out: number[] = [];
  for (let y = thisYear; y >= Math.min(first, thisYear); y -= 1) out.push(y);
  return out;
}
