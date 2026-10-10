import { type ReactNode, useState } from "react";
import type { DropdownOptionValue } from "../builder";
import { type ChoiceDraft, choiceId, savedChoice } from "../logic";
import { ChoicesEditor } from "./ChoicesEditor";

export type OptionListProps = {
  value: DropdownOptionValue[];
  onChange: (value: DropdownOptionValue[]) => void;
  title?: ReactNode;
  help?: ReactNode | null;
};

const toOptions = (drafts: ChoiceDraft[]): DropdownOptionValue[] => drafts.map((c) => ({ id: choiceId(c), label: c.label }));

function rowErrors(drafts: ChoiceDraft[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const c of drafts) {
    // A brand-new empty row isn't an error yet.
    if (!c.label.trim() && !c.value.trim()) continue;
    if (!c.label.trim()) out[c.key] = "Enter a label.";
    else if (!c.value.trim()) out[c.key] = "Enter a stored value.";
    else if (seen.has(c.value.trim())) out[c.key] = `Same stored value as "${seen.get(c.value.trim())}".`;
    else seen.set(c.value.trim(), c.label.trim());
  }
  return out;
}

/**
 * Choices stored as `{ id, label }`, edited with the library's choices editor.
 * Keeps its own row keys, so mount it with a `key` per field / branch.
 */
export function OptionList({ value, onChange, title, help = null }: OptionListProps) {
  const [drafts, setDrafts] = useState<ChoiceDraft[]>(() => value.map(savedChoice));
  return (
    <ChoicesEditor
      choices={drafts}
      title={title}
      help={help}
      errors={rowErrors(drafts)}
      onChange={(next) => {
        setDrafts(next);
        // Rows still blank stay on screen but aren't saved.
        onChange(toOptions(next.filter((c) => c.label.trim() || c.value.trim())));
      }}
    />
  );
}
