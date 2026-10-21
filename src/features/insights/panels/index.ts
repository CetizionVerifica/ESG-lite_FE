// IN-0 · The panel registry: which component renders each page slot (05-ux §3).
// Shared file (03-lane-map): each module APPENDS one entry for its panel, with
// a `// IN-n` comment, and keeps the component in this folder. A slot without
// an entry still loads its endpoint and shows every state in its PanelShell.
import type { ComponentType } from "react";
import type { InsightsQuery, PanelDataMap, PanelId, PanelResponse } from "../../../lib/insights/contracts";
import type { SlotId } from "../logic";
import { HeroStrip } from "../components/HeroStrip";
import { DisclosureFlow } from "./DisclosureFlow";
import { InsightCards } from "../components/InsightCards";
import { MaterialityMatrix } from "./MaterialityMatrix"; // IN-7
import { Completeness } from "./Completeness";
import { Pathway } from "./Pathway";
import { Decoupling } from "./Decoupling";
import { EsgRing } from "./EsgRing";
import { TargetWall } from "./TargetWall";

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
  decoupling: definePanel<"decoupling">(Decoupling), // IN-2
  ring: definePanel<"esg_ring">(EsgRing), // IN-2
  wall: definePanel<"target_wall">(TargetWall), // IN-2
  cards: definePanel<"cards">(InsightCards), // IN-3
  pathway: definePanel<"pathway">(Pathway), // IN-4
  completeness: definePanel<"completeness">(Completeness), // IN-4
  flow: definePanel<"flow">(DisclosureFlow), // IN-6
  materiality: definePanel<"materiality">(MaterialityMatrix), // IN-7
  // IN-8: stripes
};
