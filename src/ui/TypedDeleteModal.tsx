import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { TextField } from "./fields";
import { typedNameMatches } from "./setupList";

export type TypedDeleteModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** What is deleted, lower case: "site", "user". */
  noun: string;
  /** The record's name; the user types it to confirm. */
  name: string;
  /** What goes with it (cascades), one line each. */
  cascades?: ReactNode[];
  deleting?: boolean;
  error?: ReactNode;
};

/**
 * Setup list delete confirm (P19–P26): says what cascades and asks for the
 * record's name before the Delete button turns on. Mount with a `key` per record.
 */
export function TypedDeleteModal({ open, onClose, onConfirm, noun, name, cascades = [], deleting, error }: TypedDeleteModalProps) {
  const [typed, setTyped] = useState("");
  const ok = typedNameMatches(typed, name);
  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="destructive"
      size="md"
      title={`Delete ${noun} "${name}"?`}
      description="This can't be undone."
      error={error}
      primaryAction={{ label: `Delete ${noun}`, onClick: onConfirm, disabled: !ok, loading: deleting }}
    >
      <div className="space-y-4">
        {cascades.length > 0 && (
          <div className="text-sm text-ink">
            <p className="font-medium">This also deletes:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="delete-cascades">
              {cascades.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        <TextField
          label={
            <>
              Type <span className="font-semibold">{name}</span> to confirm
            </>
          }
          value={typed}
          onChange={setTyped}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ok && !deleting) onConfirm();
          }}
        />
      </div>
    </Modal>
  );
}
