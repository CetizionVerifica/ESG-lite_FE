// DS-7 · the chip's React node view for TipTap.
import { ReactNodeViewRenderer } from "@tiptap/react";
import { DataChipView } from "./DataChip";

export const dataChipView = () => ReactNodeViewRenderer(DataChipView, { as: "span", className: "ds-chip-host" });
