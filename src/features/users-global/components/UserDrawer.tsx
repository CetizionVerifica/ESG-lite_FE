import { useMemo, useState } from "react";
import { Button, Callout, Combobox, Drawer, Field, Modal, Select, TextField, cn, focusRing } from "../../../ui";
import {
  type Company,
  type DraftField,
  ROLES,
  type Role,
  type Site,
  type UserDraft,
  type UserRow,
  availableCategories,
  draftFrom,
  emptyDraft,
  isDirty,
  isRole,
  lostPermissions,
  multiSite,
  retargetCategories,
  sitesForClient,
  timezoneOptions,
  validate,
  withClient,
  withRole,
} from "../logic";

type Props = {
  /** The person being edited; null with `creating` for a new one. */
  row: UserRow | null;
  creating: boolean;
  /** A linked person (?open=id) whose data is still loading. */
  loading?: boolean;
  /** Client for a new person (from the filter or the header switcher). */
  defaultCompanyId: number | null;
  companies: { data: Company[]; loading: boolean };
  sites: { data: Site[]; loading: boolean };
  saving: boolean;
  /** Server error from the last save. */
  error: string | null;
  onClose: () => void;
  onSave: (draft: UserDraft) => void;
  onRemove: () => void;
  onReset: () => void;
};

const ROLE_HELP: Record<Role, string> = {
  Superadmin: "Runs ESGLite for every client. No client or sites.",
  Admin: "Manages one client. A home site is optional.",
  Manager: "Reviews and approves data for the sites picked below.",
  User: "Enters data for the sites and categories picked below.",
};

/**
 * Create / edit drawer for one person. Mount with `key` per person so each
 * one starts from their saved values.
 */
export function UserDrawer(props: Props) {
  const { row, creating } = props;
  const open = creating || !!row;
  const [draft, setDraft] = useState<UserDraft>(() => (row ? draftFrom(row) : emptyDraft(props.defaultCompanyId)));
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const zones = useMemo(() => timezoneOptions(draft.timezone), [draft.timezone]);

  if (props.loading) return <Drawer open loading onClose={props.onClose} title="Loading person…" />;
  if (!open) return <Drawer open={false} onClose={props.onClose} title="" />;

  const errors = validate(draft);
  const invalid = Object.keys(errors).length > 0;
  const dirty = isDirty(draft, row);
  const fieldError = (k: DraftField) => (touched ? errors[k] : undefined);
  const set = <K extends keyof UserDraft>(k: K, v: UserDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const lost = row ? lostPermissions(row.role, draft.role) : [];

  const clientSites = sitesForClient(props.sites.data, draft.company_id);
  const categories = availableCategories(props.sites.data, draft.site_ids);
  const setSites = (ids: number[]) =>
    setDraft((d) => ({
      ...d,
      site_ids: ids,
      category_ids: retargetCategories(d.category_ids, availableCategories(props.sites.data, d.site_ids), availableCategories(props.sites.data, ids)),
    }));
  const setRole = (role: Role | null) =>
    setDraft((d) => {
      const next = withRole(d, role);
      // A User switched on from another role starts with every category of their sites.
      if (role === "User" && d.role !== "User") next.category_ids = availableCategories(props.sites.data, next.site_ids).map((c) => c.category_id).sort((a, b) => a - b);
      return next;
    });

  const close = () => (dirty && !props.saving ? setConfirmClose(true) : props.onClose());
  const save = () => {
    setTouched(true);
    if (!invalid) props.onSave(draft);
  };

  const title = creating ? "Add user" : row!.displayName;
  const subtitle = creating ? "They get a temporary password to sign in with, shown once after you add them." : [row!.role, row!.clients.map((c) => c.name).join(", ")].filter(Boolean).join(" · ");

  return (
    <>
      <Drawer
        open
        size="md"
        onClose={close}
        title={title}
        subtitle={subtitle}
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {!creating && (
              <>
                <Button variant="danger" onClick={props.onRemove} disabled={props.saving}>
                  Remove
                </Button>
                <Button variant="ghost" onClick={props.onReset} disabled={props.saving}>
                  Send reset link
                </Button>
              </>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={close} disabled={props.saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={props.saving} disabled={props.saving || (!creating && !dirty)}>
                {creating ? "Add user" : "Save"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {props.error && (
            // Focus lands here so the message is read; the Save button is busy.
            <div key={props.error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
              <Callout tone="warn" title="Couldn't save">
                {props.error}
              </Callout>
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2" aria-label="Contact">
            <TextField label="Name" value={draft.name} onChange={(v) => set("name", v)} maxLength={80} autoComplete="off" />
            <TextField label="Last name" value={draft.last_name} onChange={(v) => set("last_name", v)} maxLength={80} autoComplete="off" />
            <TextField
              className="sm:col-span-2"
              label="Email"
              type="email"
              required
              value={draft.email}
              onChange={(v) => set("email", v)}
              error={fieldError("email")}
              autoComplete="off"
            />
            <TextField label="Phone" type="tel" value={draft.phone_number} onChange={(v) => set("phone_number", v)} maxLength={40} autoComplete="off" />
            <Combobox<string>
              label="Timezone"
              placeholder="Search timezones…"
              help="Reminders and due dates follow it. Empty means UTC."
              value={draft.timezone}
              onChange={(v) => set("timezone", v)}
              options={zones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
            />
          </section>

          <section className="space-y-4" aria-label="Access">
            <Select<Role>
              label="Role"
              required
              placeholder="Choose a role"
              value={draft.role}
              onChange={(v) => setRole(isRole(v) ? v : null)}
              options={ROLES.map((r) => ({ value: r, label: r }))}
              help={draft.role ? ROLE_HELP[draft.role] : undefined}
              error={fieldError("role")}
            />
            {lost.length > 0 && (
              <Callout tone="warn" title={`${row!.displayName} loses ${row!.role} access`}>
                <ul className="list-disc pl-4">
                  {lost.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Callout>
            )}

            {draft.role && draft.role !== "Superadmin" && (
              <Combobox<number>
                label="Client"
                required
                placeholder="Search clients…"
                help={multiSite(draft.role) ? "Changing it clears the sites below." : undefined}
                value={draft.company_id}
                onChange={(v) => setDraft((d) => withClient(d, v))}
                options={props.companies.data.map((c) => ({ value: c.company_id, label: c.name }))}
                loading={props.companies.loading}
                error={fieldError("company_id")}
              />
            )}

            {draft.role === "Admin" && (
              <Select<number>
                label="Home site"
                placeholder="No home site"
                value={draft.site_ids[0] ?? null}
                onChange={(v) => setSites(v === null ? [] : [v])}
                options={clientSites.map((s) => ({ value: s.site_id, label: s.name }))}
                emptyText={draft.company_id === null ? "Choose a client first" : "This client has no sites"}
                loading={props.sites.loading}
              />
            )}

            {multiSite(draft.role) && (
              <CheckList
                legend="Sites"
                required
                error={fieldError("site_ids")}
                loading={props.sites.loading}
                empty={draft.company_id === null ? "Choose a client first." : "This client has no sites yet."}
                items={clientSites.map((s) => ({ id: s.site_id, label: s.name }))}
                selected={draft.site_ids}
                onChange={setSites}
              />
            )}

            {draft.role === "User" && draft.site_ids.length > 0 && (
              <CheckList
                legend="Categories"
                help="What this person can enter data for. Only categories their sites report are listed."
                required
                error={fieldError("category_ids")}
                empty="Their sites have no categories yet."
                items={categories.map((c) => ({ id: c.category_id, label: c.category_name }))}
                selected={draft.category_ids}
                onChange={(ids) => set("category_ids", ids)}
              />
            )}
          </section>
        </div>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard your changes?"
        description="Your edits to this person haven't been saved."
        cancelLabel="Keep editing"
        primaryAction={{
          label: "Discard",
          onClick: () => {
            setConfirmClose(false);
            props.onClose();
          },
        }}
      />
    </>
  );
}

function CheckList(props: {
  legend: string;
  help?: string;
  required?: boolean;
  error?: string;
  loading?: boolean;
  empty: string;
  items: { id: number; label: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const chosen = new Set(props.selected);
  const allOn = props.items.length > 0 && props.items.every((i) => chosen.has(i.id));
  const toggle = (id: number, on: boolean) => props.onChange(on ? [...props.selected.filter((x) => x !== id), id] : props.selected.filter((x) => x !== id));
  return (
    <Field label={props.legend} help={props.help} required={props.required} error={props.error} loading={props.loading} group>
      {() =>
        props.items.length === 0 ? (
          <p className="text-sm text-muted">{props.empty}</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">
                <span className="font-num">{props.items.filter((i) => chosen.has(i.id)).length}</span> of <span className="font-num">{props.items.length}</span> picked
              </span>
              <Button size="sm" variant="ghost" onClick={() => props.onChange(allOn ? [] : props.items.map((i) => i.id))}>
                {allOn ? "Clear all" : "Select all"}
              </Button>
            </div>
            <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line">
              {props.items.map((i) => (
                <li key={i.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-tint">
                    <input type="checkbox" className={cn("size-4 accent-accent", focusRing)} checked={chosen.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </Field>
  );
}
