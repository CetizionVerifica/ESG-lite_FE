// DS-7 · provides chip values (chipData.ts) to the text being edited.
import { useMemo, type ReactNode } from "react";
import type { RenderData } from "../../../../lib/studio/render";
import { ChipDataContext, makeChipData, type ChipScope } from "./chipData";

export function ChipDataProvider({ scope, data, children }: { scope: ChipScope; data: RenderData | null; children: ReactNode }) {
  const v = useMemo(() => makeChipData(scope, data), [scope, data]);
  return <ChipDataContext.Provider value={v}>{children}</ChipDataContext.Provider>;
}
