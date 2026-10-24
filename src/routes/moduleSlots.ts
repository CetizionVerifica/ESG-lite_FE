import type { ComponentType } from "react";
import { type ModuleRoutesFile, type ModuleSlotId, collectModuleSlots } from "./pageRegistry";

// Every module's `slots` (src/features/<module>/routes.tsx), picked up by glob like the pages.
const files = import.meta.glob<ModuleRoutesFile>("../features/*/routes.tsx", { eager: true });
const slots = collectModuleSlots(files);

/** True when a module fills the slot. */
export const hasModuleSlot = (id: ModuleSlotId): boolean => !!slots[id];

/** The component a module put in the slot, if any. Render it with `<ModuleSlot id>`. */
export const moduleSlotComponent = (id: ModuleSlotId): ComponentType | undefined => slots[id];
