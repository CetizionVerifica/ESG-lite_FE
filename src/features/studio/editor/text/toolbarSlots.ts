// DS-7 · text toolbar words and the slot other modules add items to.
import type { ComponentType } from "react";
import type { Editor } from "@tiptap/core";
import type { TextStyleId } from "../../../../lib/studio/contracts";
import type { ToolbarProps } from "../registry";

export const TEXT_STYLE_LABELS: Record<TextStyleId, string> = {
  kicker: "Kicker",
  title: "Title",
  heading: "Heading",
  subheading: "Subheading",
  body: "Body",
  caption: "Caption",
  big_number: "Big number",
  quote: "Quote",
  footnote: "Footnote",
};

// ---------------------------------------------------------------------------
// Slots: DS-9 adds "AI ▾" (shorter, longer, formal, plain, brand voice)
// ---------------------------------------------------------------------------

export interface TextToolbarSlotProps extends ToolbarProps {
  /** The live TipTap editor while the box is edited (rewrite the selection), else null (rewrite the box). */
  textEditor: Editor | null;
}
const slots = new Map<string, ComponentType<TextToolbarSlotProps>>();
/** Adds an item to the text toolbar (DS-9: `registerTextToolbarItem("ai", AiRewriteMenu)`). */
export function registerTextToolbarItem(id: string, component: ComponentType<TextToolbarSlotProps>): void {
  slots.set(id, component);
}
export const textToolbarItems = (): [string, ComponentType<TextToolbarSlotProps>][] => [...slots];
