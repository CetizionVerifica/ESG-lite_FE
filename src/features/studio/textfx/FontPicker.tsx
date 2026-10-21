// PE-2 · the font of a text box (text toolbar slot): the style's font, a
// bundled face, or a brand font a Manager uploaded ("Midal Sans (uploaded)").
// A native select, so the list never clips inside the toolbar.
import { Select } from "../../../ui";
import { useBrandFonts } from "../brand-kit/fontsApi";
import type { TextToolbarSlotProps } from "../editor/text/toolbarSlots";
import { fontOptions, fontRefOf, setTextFont } from "./logic";

export function FontPicker({ pageId, elements, editor: ed }: TextToolbarSlotProps) {
  const fonts = useBrandFonts();
  const el = elements[0];
  if (!el || el.type !== "text") return null;
  const ids = elements.filter((e) => e.type === "text").map((e) => e.id);
  const current = el.props.font ?? "";
  return (
    <Select
      label="Font"
      hideLabel
      className="w-32 flex-none"
      value={current}
      disabled={ed.readOnly || !!el.locked || !!el.templateLocked}
      onChange={(v) => ed.commit(setTextFont(ed.doc, pageId, ids, fontRefOf(v)), "Font")}
      options={fontOptions(fonts.data?.fonts ?? [], el.props.font)}
    />
  );
}
