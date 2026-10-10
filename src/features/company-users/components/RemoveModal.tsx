import { Modal } from "../../../ui";
import { type CompanyUser, displayName } from "../logic";

/** Remove confirmation naming the person and what happens to their data. */
export function RemoveModal(props: { user: CompanyUser | null; busy: boolean; error: string | null; onClose: () => void; onConfirm: (u: CompanyUser) => void }) {
  const u = props.user;
  return (
    <Modal
      open={u !== null}
      tone="destructive"
      title={u ? `Remove ${displayName(u)}?` : ""}
      description={
        u ? (
          <>
            {u.email} won't be able to sign in. The entries they submitted are not deleted. If they have entries, the server may refuse the removal; nothing changes then.
          </>
        ) : undefined
      }
      error={props.error}
      onClose={props.onClose}
      primaryAction={u ? { label: "Remove", loading: props.busy, onClick: () => props.onConfirm(u) } : undefined}
    />
  );
}
