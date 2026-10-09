import { useId, useState } from "react";
import { Button, Callout, Drawer, Select, TextField, Toggle, cn, focusRing } from "../../../ui";
import {
  type CompanySite,
  type CompanyUser,
  type DraftErrors,
  EMPTY_DRAFT,
  MIN_PASSWORD,
  type PersonDraft,
  ROLES,
  type Role,
  draftFromUser,
  validate,
} from "../logic";

/**
 * "Invite person" (user = null) or "Edit · {name}". Mount with a `key` per
 * person so each open starts from a fresh draft.
 */
export function PersonDrawer(props: {
  open: boolean;
  user: CompanyUser | null;
  sites: CompanySite[];
  saving: boolean;
  /** Server error from the last save. */
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: PersonDraft) => void;
  /** Clears the server error once the form changes. */
  onEdit: () => void;
}) {
  const creating = props.user === null;
  const [draft, setDraft] = useState<PersonDraft>(() => (props.user ? draftFromUser(props.user) : EMPTY_DRAFT));
  const [shown, setShown] = useState<DraftErrors>({});
  const sitesId = useId();

  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setShown((e) => ({ ...e, [key === "siteIds" ? "sites" : key]: undefined }));
    props.onEdit();
  };
  const toggleSite = (id: number) => set("siteIds", draft.siteIds.includes(id) ? draft.siteIds.filter((x) => x !== id) : [...draft.siteIds, id]);

  const submit = () => {
    const errors = validate(draft, creating);
    setShown(errors);
    if (Object.keys(errors).length === 0) props.onSubmit(draft);
  };

  return (
    <Drawer
      open={props.open}
      size="sm"
      onClose={props.onClose}
      title={creating ? "Invite person" : `Edit · ${props.user ? draftFromUser(props.user).name || props.user.email : ""}`}
      subtitle={creating ? "They can sign in once you save." : props.user?.email}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={props.saving} disabled={props.saving}>
            {creating ? "Invite" : "Save"}
          </Button>
        </div>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {props.error && (
          // Focus moves here so Esc still works after the Save button was disabled.
          <div key={props.error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
            <Callout tone="warn" title={creating ? "Couldn't invite" : "Couldn't save"}>
              {props.error}
            </Callout>
          </div>
        )}
        <TextField label="Name" value={draft.name} onChange={(v) => set("name", v)} autoComplete="off" />
        <TextField label="Email" type="email" required value={draft.email} onChange={(v) => set("email", v)} error={shown.email} autoComplete="off" />
        <Select<Role>
          label="Role"
          required
          placeholder="Choose a role"
          value={draft.role || null}
          onChange={(v) => set("role", v ?? "")}
          options={ROLES.map((r) => ({ value: r, label: r === "User" ? "User (contributor)" : r }))}
          error={shown.role}
          help="Managers approve data on their sites; Users enter it."
        />
        <fieldset aria-describedby={shown.sites ? `${sitesId}-error` : undefined} className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium text-ink">
            Sites <span className="text-bad">*</span>
          </legend>
          {props.sites.length === 0 ? (
            <p className="text-sm text-muted">Your company has no sites yet.</p>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-control border border-line p-1">
              {props.sites.map((s) => (
                <li key={s.site_id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-chip px-2 py-1.5 text-sm text-ink hover:bg-tint">
                    <input
                      type="checkbox"
                      checked={draft.siteIds.includes(s.site_id)}
                      onChange={() => toggleSite(s.site_id)}
                      className={cn("size-4 accent-brand", focusRing)}
                    />
                    {s.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {shown.sites && (
            <p id={`${sitesId}-error`} className="text-xs text-bad">
              {shown.sites}
            </p>
          )}
          {!creating && <p className="text-xs text-muted">Changing sites resets their category access to every category on the chosen sites.</p>}
        </fieldset>
        {creating && (
          <>
            <TextField
              label="Temporary password"
              type="password"
              required
              value={draft.password}
              onChange={(v) => set("password", v)}
              error={shown.password}
              help={`At least ${MIN_PASSWORD} characters. Never shown again.`}
              autoComplete="new-password"
            />
            <Toggle
              label="Send a set-password link"
              hideLabel
              checked={draft.sendLink}
              onChange={(v) => set("sendLink", v)}
              inlineLabel="Email them a link to choose their own password"
            />
          </>
        )}
        {/* Enter in a field submits. */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Drawer>
  );
}
