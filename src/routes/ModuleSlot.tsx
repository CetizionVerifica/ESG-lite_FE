import { Suspense } from "react";
import { SkeletonText } from "../ui";
import { moduleSlotComponent } from "./moduleSlots";
import type { ModuleSlotId } from "./pageRegistry";

/** Renders what a module put in the slot (nothing when no module fills it). */
export function ModuleSlot({ id }: { id: ModuleSlotId }) {
  const Component = moduleSlotComponent(id);
  if (!Component) return null;
  return (
    <Suspense fallback={<SkeletonText lines={5} />}>
      <Component />
    </Suspense>
  );
}
