// IN-0 · The panel registry: which component renders each page slot (05-ux §3).
// Shared file (03-lane-map): each module APPENDS one entry for its panel, with
// a `// IN-n` comment, and keeps the component in this folder. A slot without
// an entry still loads its endpoint and shows every state in its PanelShell.
import type { ComponentType } from "react";
import type { InsightsQuery, PanelDataMap, PanelId, PanelResponse } from "../../../lib/insights/contracts";
import type { SlotId } from "../logic";
import { HeroStrip } from "../components/HeroStrip";
import { DisclosureFlow } from "./DisclosureFlow";

/** What a slot's component gets: the envelope (availability 'ok', data present) and the page query. */
export interface PanelProps<P extends PanelId = PanelId> {
  response: PanelResponse<PanelDataMap[P]> & { data: PanelDataMap[P] };
  query: InsightsQuery;
}

export type PanelComponent = ComponentType<PanelProps>;

/** Typed helper for an entry: `definePanel<"decoupling">(Decoupling)`. */
export const definePanel = <P extends PanelId>(component: ComponentType<PanelProps<P>>): PanelComponent => component as unknown as PanelComponent;

export const PANELS: Partial<Record<SlotId, PanelComponent>> = {
  hero: definePanel<"summary">(HeroStrip), // IN-1
  // IN-2: decoupling, ring, wall
  // IN-3: cards
  // IN-4: pathway, completeness
  flow: definePanel<"flow">(DisclosureFlow), // IN-6
  // IN-7: materiality
  // IN-8: stripes
};
