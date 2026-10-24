// DS-8 · the small UI state the charts and tables pieces share across the
// toolbar, the drawers and ChartsHost (dialogs live in ChartsHost so they
// survive the toolbar folding into its overflow popover):
//   grid      the custom-data grid dialog is open for an element;
//   table     the table editor dialog is open for an element;
//   drop      a figure was dropped on the page: ask "Big number · Tile · Chart".
// UI only: every doc change still goes through editor.commit.
import { useSyncExternalStore } from "react";
import type { GhgBinding, KpiBinding } from "../../../../lib/studio/contracts";
import type { Point } from "../../../../lib/studio/geometry";

export interface PendingDrop {
  pageId: string;
  /** Page mm; null = the page centre (a click in the drawer). */
  at: Point | null;
  client: { x: number; y: number };
  binding: GhgBinding | KpiBinding;
  label: string;
}

export interface ChartsUi {
  grid: { pageId: string; elementId: string } | null;
  table: { pageId: string; elementId: string } | null;
  drop: PendingDrop | null;
}

let state: ChartsUi = { grid: null, table: null, drop: null };
const listeners = new Set<() => void>();

export const chartsUi = (): ChartsUi => state;
export function setChartsUi(patch: Partial<ChartsUi>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const subscribeChartsUi = (l: () => void): (() => void) => {
  listeners.add(l);
  // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
  return () => listeners.delete(l);
};
export const useChartsUi = (): ChartsUi => useSyncExternalStore(subscribeChartsUi, chartsUi, chartsUi);

/** Test hook. */
export const resetChartsUi = (): void => setChartsUi({ grid: null, table: null, drop: null });

// ---------------------------------------------------------------------------
// "Suggest a title" (DS-9 registers the AI call; until then the button explains)
// ---------------------------------------------------------------------------

export type TitleSuggester = (args: { docId: number; pageId: string; elementId: string }) => void;
let suggester: TitleSuggester | null = null;
export const registerTitleSuggester = (fn: TitleSuggester | null): void => {
  suggester = fn;
  listeners.forEach((l) => l());
};
export const titleSuggester = (): TitleSuggester | null => suggester;
