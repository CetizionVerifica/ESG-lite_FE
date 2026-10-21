// IN-8 · Present mode slides (05-ux §8): 1 hero strip with the stripes band;
// 2 decoupling; 3 ESG ring; 4 pathway → bridge (the morph on the same slide);
// 5 target wall; 6 the top three cards. KPI-only slides drop without KPI tracking.
import type { SlotId } from "../logic";
import { SLOTS } from "../logic";

export interface Slide {
  id: string;
  title: string;
  /** Slots drawn on the slide, top to bottom. */
  slots: SlotId[];
  /** The brand cover gradient behind the slide (slide 1). */
  cover?: boolean;
}

export const SLIDES: Slide[] = [
  { id: "summary", title: "Our year in one view", slots: ["stripes", "hero"], cover: true },
  { id: "decoupling", title: "Output and emissions", slots: ["decoupling"] },
  { id: "ring", title: "ESG data readiness", slots: ["ring"] },
  { id: "pathway", title: "Pathway and what moved", slots: ["pathway"] },
  { id: "wall", title: "Targets", slots: ["wall"] },
  { id: "cards", title: "What stands out", slots: ["cards"] },
];

/** The slides for a company: the ESG ring only with KPI tracking. */
export const slidesFor = (kpiOn: boolean): Slide[] => SLIDES.filter((s) => kpiOn || s.slots.every((id) => !SLOTS[id].kpi));

/** Clamp a slide index (←/→ stop at the ends). */
export const clampSlide = (i: number, count: number) => Math.max(0, Math.min(count - 1, i));
