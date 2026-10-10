import type { ReactNode } from "react";
import { Button, Callout, Modal } from "../../../ui";

/** What every tab gets from the page: the tab strip and the ids that make its list a tab panel. */
export type TabShell = { nav: ReactNode; panel: { id: string; labelledBy: string } };

/** Server error from the last save; focused so it is read while Save is busy. */
export function SaveError({ error, title }: { error: string | null; title: string }) {
  if (!error) return null;
  return (
    <div key={error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
      <Callout tone="warn" title={title}>
        {error}
      </Callout>
    </div>
  );
}

/** Footer shared by the three drawers: Delete on the left, Cancel and Save on the right. */
export function DrawerFooter(props: {
  deleteLabel?: string;
  onDelete?: () => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  saving: boolean;
  canSave: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {props.onDelete && (
        <Button variant="danger" onClick={props.onDelete} disabled={props.saving}>
          {props.deleteLabel}
        </Button>
      )}
      {props.extra}
      <div className="ml-auto flex gap-2">
        <Button onClick={props.onCancel} disabled={props.saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={props.onSave} loading={props.saving} disabled={props.saving || !props.canSave}>
          {props.saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function DiscardModal({ open, noun, onKeep, onDiscard }: { open: boolean; noun: string; onKeep: () => void; onDiscard: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onKeep}
      title="Discard your changes?"
      description={`Your edits to this ${noun} haven't been saved.`}
      cancelLabel="Keep editing"
      primaryAction={{ label: "Discard", onClick: onDiscard }}
    />
  );
}

/**
 * Delete confirm. With `blocked` it only explains why the record can't go
 * and offers no delete button.
 */
export function DeleteModal(props: {
  noun: string;
  name: string;
  blocked: string | null;
  consequence?: string;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (props.blocked)
    return <Modal open onClose={props.onClose} title={`Can't delete ${props.name}`} description={props.blocked} cancelLabel="OK" />;
  return (
    <Modal
      open
      tone="destructive"
      onClose={props.onClose}
      title={`Delete ${props.noun} "${props.name}"?`}
      description={props.consequence ?? "This can't be undone."}
      error={props.error}
      primaryAction={{ label: `Delete ${props.noun}`, onClick: props.onConfirm, loading: props.deleting, disabled: props.deleting }}
    />
  );
}
