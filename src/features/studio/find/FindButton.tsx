// PE-2 · "Find and replace ⌘⇧F" on the text and page toolbars.
import { Search } from "lucide-react";
import type { ToolbarProps } from "../editor/registry";
import { PageToolbar, Sep, TbButton, TbLabel } from "../editor/toolbars";
import { openFindReplace } from "./store";

export function FindButton() {
  return (
    <TbButton title="Find and replace (⌘⇧F)" icon={<Search aria-hidden className="size-4" />} onClick={openFindReplace} data-testid="find-replace-button">
      <TbLabel>Find and replace</TbLabel>
    </TbButton>
  );
}

/** The shell's page toolbar plus "Find and replace" (nothing selected). */
export function PageToolbarWithFind(props: ToolbarProps) {
  return (
    <>
      <PageToolbar {...props} />
      <Sep />
      <FindButton />
    </>
  );
}
