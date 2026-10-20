// DS-7 · what the Text drawer adds: a heading, a subheading or body text, and
// four text presets (kicker + title, big number + caption, quote +
// attribution, section opener). Presets carry text styles only; colours and
// fonts come from the report's theme when the renderer draws them, so they
// match any template or Style. Frames are mm at the group's origin; A4 sizes,
// scaled by libraryOps.insertElement to the format.
import type { DataItem, DataToken, Element, ElementGroupPayload, TextDoc, TextNode, TextStyleId } from "../../../../lib/studio/contracts";
import { chipFor } from "./picker";

const text = (id: string, style: TextStyleId, x: number, y: number, w: number, h: number, doc: TextDoc, align: "left" | "center" = "left"): Element => ({
  id,
  type: "text",
  frame: { x, y, w, h, rotation: 0 },
  z: 0,
  source: "user",
  props: { style, align, doc },
});
const para = (...content: (TextNode | DataToken)[]): TextNode => ({ type: "paragraph", content });
const t = (s: string): TextNode => ({ type: "text", text: s });
const doc = (...content: TextNode[]): TextDoc => ({ type: "doc", content });

export interface AddText {
  id: "heading" | "subheading" | "body";
  label: string;
  element: Element;
}

/** "Add a heading", "Add a subheading", "Add body text". */
export const ADD_TEXT: AddText[] = [
  { id: "heading", label: "Add a heading", element: text("heading", "heading", 0, 0, 140, 14, doc(para(t("Add a heading")))) },
  { id: "subheading", label: "Add a subheading", element: text("subheading", "subheading", 0, 0, 120, 9, doc(para(t("Add a subheading")))) },
  { id: "body", label: "Add body text", element: text("body", "body", 0, 0, 100, 24, doc(para(t("Add body text. Type {{ to insert a data value.")))) },
];

export interface TextPreset {
  id: "kicker_title" | "big_number" | "quote" | "section_opener";
  name: string;
  payload: ElementGroupPayload;
}

const group = (w: number, h: number, elements: Element[]): ElementGroupPayload => ({ type: "group", w, h, elements: elements.map((e, i) => ({ ...e, z: i })) });

/**
 * The four presets. `figure` is the data value the big number shows: the
 * report's total emissions for a GHG report, or the first KPI for a
 * sustainability report; without one the big number asks for a value.
 */
export function textPresets(figure: DataItem | null): TextPreset[] {
  const big = figure ? doc(para({ type: "data", attrs: chipFor(figure) })) : doc(para(t("Insert a data value")));
  return [
    {
      id: "kicker_title",
      name: "Kicker and title",
      payload: group(150, 32, [text("kicker", "kicker", 0, 0, 150, 6, doc(para(t("Climate performance")))), text("title", "title", 0, 8, 150, 24, doc(para(t("Our emissions this year"))))]),
    },
    {
      id: "big_number",
      name: "Big number and caption",
      payload: group(90, 30, [text("number", "big_number", 0, 0, 90, 18, big), text("caption", "caption", 0, 20, 90, 10, doc(para(t(figure ? `${figure.label}, ${figure.resolved.unit ?? ""}`.replace(/, $/, "") : "What the number shows"))))]),
    },
    {
      id: "quote",
      name: "Quote and attribution",
      payload: group(120, 40, [text("quote", "quote", 0, 0, 120, 28, doc(para(t("“Every tonne we report is a tonne we can manage.”")))), text("attribution", "caption", 0, 31, 120, 9, doc(para(t("Name, role"))))]),
    },
    {
      id: "section_opener",
      name: "Section opener",
      payload: group(170, 62, [
        text("kicker", "kicker", 0, 0, 170, 6, doc(para(t("Section 3")))),
        text("title", "title", 0, 8, 170, 22, doc(para(t("Scope 3 emissions")))),
        { id: "rule", type: "divider", frame: { x: 0, y: 33, w: 40, h: 2, rotation: 0 }, z: 0, source: "user", props: { strokeWidth: 0.8 } },
        text("intro", "body", 0, 38, 150, 24, doc(para(t("A short introduction to what this section covers and why it matters.")))),
      ]),
    },
  ];
}

/** The figure a big number preset shows: Total emissions (GHG) or the first KPI (sustainability). */
export function presetFigure(items: DataItem[]): DataItem | null {
  return items.find((i) => i.id === "total" && !i.resolved.unavailable) ?? items.find((i) => !i.resolved.unavailable && !(i.binding as { breakdown?: string }).breakdown) ?? null;
}
