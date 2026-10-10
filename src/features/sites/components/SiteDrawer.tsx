import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CircleDashed, ExternalLink, Search } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Combobox,
  Drawer,
  EmptyState,
  Modal,
  TabPanel,
  Tabs,
  TextField,
  cn,
  focusRing,
  inputBase,
} from "../../../ui";
import {
  type AdminUser,
  type Category,
  type Company,
  type Country,
  type DraftField,
  SCOPE_LABEL,
  type SiteDraft,
  type SiteRow,
  draftFrom,
  emptyDraft,
  groupByScope,
  isDirty,
  matchesCategory,
  personName,
  scopeKey,
  setMany,
  validate,
} from "../logic";

export type SiteTab = "details" | "categories" | "people" | "capture";

type Props = {
  /** The site being edited; null with `creating` for a new one. */
  row: SiteRow | null;
  creating: boolean;
  /** A linked site (?open=id) whose data is still loading. */
  loading?: boolean;
  /** Client for a new site (from the filter or the header switcher). */
  defaultCompanyId: number | null;
  companies: { data: Company[]; loading: boolean };
  countries: { data: Country[]; loading: boolean };
  categories: { data: Category[]; loading: boolean; error: boolean };
  peopleReady: boolean;
  configsReady: boolean;
  saving: boolean;
  /** Server error from the last save. */
  error: string | null;
  onClose: () => void;
  onSave: (draft: SiteDraft) => void;
  onDelete: () => void;
};

/**
 * Create / edit drawer for one site: Details · Categories · People · Capture.
 * Mount with `key` per site so each one starts from its saved values.
 */
export function SiteDrawer(props: Props) {
  const { row, creating } = props;
  const open = creating || !!row;
  const [draft, setDraft] = useState<SiteDraft>(() => (row ? draftFrom(row) : emptyDraft(props.defaultCompanyId)));
  const [tab, setTab] = useState<SiteTab>("details");
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const idBase = useId();

  if (props.loading) return <Drawer open loading onClose={props.onClose} title="Loading site…" />;
  if (!open) return <Drawer open={false} onClose={props.onClose} title="" />;

  const errors = validate(draft);
  const invalid = Object.keys(errors).length > 0;
  const dirty = isDirty(draft, row);
  const set = <K extends keyof SiteDraft>(k: K, v: SiteDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const fieldError = (k: DraftField) => (touched ? errors[k] : undefined);

  const close = () => (dirty && !props.saving ? setConfirmClose(true) : props.onClose());
  const save = () => {
    setTouched(true);
    if (invalid) {
      setTab("details");
      return;
    }
    props.onSave(draft);
  };

  const tabs = [
    { value: "details" as const, label: "Details" },
    { value: "categories" as const, label: "Categories", count: draft.category_ids.length },
    { value: "people" as const, label: "People", disabled: creating, count: row && props.peopleReady ? row.users.length + row.managers.length : undefined },
    { value: "capture" as const, label: "Capture", disabled: creating },
  ];

  return (
    <>
      <Drawer
        open
        size="md"
        onClose={close}
        title={creating ? "Add site" : row!.name}
        subtitle={creating ? "Name it, choose the client and country, then pick its categories." : [row!.company?.name, row!.country?.name].filter(Boolean).join(" · ")}
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {!creating && (
              <Button variant="danger" onClick={props.onDelete} disabled={props.saving}>
                Delete site
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={close} disabled={props.saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={props.saving} disabled={props.saving || (!creating && !dirty)}>
                {creating ? "Add site" : "Save"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {props.error && (
            // Focus lands here so the message is read; the Save button is busy.
            <div key={props.error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
              <Callout tone="warn" title="Couldn't save the site">
                {props.error}
              </Callout>
            </div>
          )}
          {touched && invalid && tab !== "details" && (
            <Callout tone="warn" action={<Button size="sm" variant="ghost" onClick={() => setTab("details")}>Go to details</Button>}>
              Some required details are missing.
            </Callout>
          )}
          <Tabs label="Site sections" idBase={idBase} items={tabs} value={tab} onChange={setTab} />
          <TabPanel idBase={idBase} value="details" current={tab}>
            <DetailsTab draft={draft} set={set} error={fieldError} companies={props.companies} countries={props.countries} />
          </TabPanel>
          <TabPanel idBase={idBase} value="categories" current={tab}>
            <CategoriesTab
              all={props.categories}
              selected={draft.category_ids}
              onChange={(ids) => set("category_ids", ids)}
            />
          </TabPanel>
          {row && (
            <>
              <TabPanel idBase={idBase} value="people" current={tab}>
                <PeopleTab row={row} ready={props.peopleReady} />
              </TabPanel>
              <TabPanel idBase={idBase} value="capture" current={tab}>
                <CaptureTab row={row} ready={props.configsReady} />
              </TabPanel>
            </>
          )}
        </div>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard your changes?"
        description="Your edits to this site haven't been saved."
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

function DetailsTab({ draft, set, error, companies, countries }: {
  draft: SiteDraft;
  set: <K extends keyof SiteDraft>(k: K, v: SiteDraft[K]) => void;
  error: (k: DraftField) => string | undefined;
  companies: Props["companies"];
  countries: Props["countries"];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField className="sm:col-span-2" label="Site name" required value={draft.name} onChange={(v) => set("name", v)} error={error("name")} maxLength={120} />
      <TextField className="sm:col-span-2" label="Address" required value={draft.address} onChange={(v) => set("address", v)} error={error("address")} />
      <TextField className="sm:col-span-2" label="Contact person" required value={draft.contact_person} onChange={(v) => set("contact_person", v)} error={error("contact_person")} />
      <Combobox<number>
        label="Client"
        required
        placeholder="Search clients…"
        value={draft.company_id}
        onChange={(v) => set("company_id", v)}
        options={companies.data.map((c) => ({ value: c.company_id, label: c.name }))}
        loading={companies.loading}
        error={error("company_id")}
      />
      <Combobox<number>
        label="Country"
        required
        placeholder="Search countries…"
        value={draft.country_id}
        onChange={(v) => set("country_id", v)}
        options={countries.data.map((c) => ({ value: c.country_id, label: c.name }))}
        loading={countries.loading}
        error={error("country_id")}
      />
    </div>
  );
}

function CategoriesTab({ all, selected, onChange }: { all: Props["categories"]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [q, setQ] = useState("");
  const visible = useMemo(() => all.data.filter((c) => matchesCategory(c, q)), [all.data, q]);
  const groups = useMemo(() => groupByScope(visible), [visible]);
  const chosen = new Set(selected);
  const visibleIds = visible.map((c) => c.category_id);
  const allOn = visibleIds.length > 0 && visibleIds.every((id) => chosen.has(id));

  if (all.loading) return <p className="text-sm text-muted">Loading categories…</p>;
  if (all.error) return <EmptyState compact variant="error" title="Couldn't load categories." />;
  if (!all.data.length) return <EmptyState compact title="No categories exist yet." description="Add them under Reference data first." />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        People on this site can enter data only for the categories picked here. Newly added categories are switched on for its current users.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input type="search" aria-label="Search categories" placeholder="Search categories" value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputBase, "h-8 pl-8")} />
        </div>
        <Button size="sm" variant="ghost" disabled={!visibleIds.length} onClick={() => onChange(setMany(selected, visibleIds, !allOn))}>
          {allOn ? (q ? "Clear shown" : "Clear all") : q ? "Select shown" : "Select all"}
        </Button>
      </div>
      {groups.length === 0 && <p className="text-sm text-muted">No categories match “{q}”.</p>}
      {groups.map((g) => {
        const on = g.items.filter((c) => chosen.has(c.category_id)).length;
        const headingId = `cat-group-${g.key}`;
        return (
          <section key={g.key} aria-labelledby={headingId}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 id={headingId} className="text-sm font-semibold text-ink">
                {SCOPE_LABEL[g.key]} <span className="font-num font-normal text-muted">· {on}/{g.items.length}</span>
              </h3>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`${on === g.items.length ? "Clear" : "Select"} all in ${SCOPE_LABEL[g.key]}`}
                onClick={() => onChange(setMany(selected, g.items.map((c) => c.category_id), on !== g.items.length))}
              >
                {on === g.items.length ? "Clear" : "Select all"}
              </Button>
            </div>
            <ul className="divide-y divide-line rounded-control border border-line">
              {g.items.map((c) => (
                <li key={c.category_id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-tint">
                    <input
                      type="checkbox"
                      className={cn("size-4 accent-accent", focusRing)}
                      checked={chosen.has(c.category_id)}
                      onChange={(e) => onChange(setMany(selected, [c.category_id], e.target.checked))}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.category_name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PersonList({ title, people, empty }: { title: string; people: AdminUser[]; empty: string }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">
        {title} <span className="font-num font-normal text-muted">· {people.length}</span>
      </h3>
      {people.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-control border border-line">
          {people.map((u) => (
            <li key={u.user_id} className="flex items-center gap-2.5 px-3 py-2">
              <Avatar size="sm" name={personName(u)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{personName(u)}</span>
                <span className="block truncate text-xs text-muted">{u.email}</span>
              </span>
              {u.role && u.role !== "User" && <Badge>{u.role}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PeopleTab({ row, ready }: { row: SiteRow; ready: boolean }) {
  if (!ready) return <EmptyState compact variant="error" title="Couldn't load the people on this site." />;
  return (
    <div className="space-y-5">
      <PersonList title="Users" people={row.users} empty="No one reports data for this site yet." />
      <PersonList title="Managers" people={row.managers} empty="No manager looks after this site yet." />
      <Link to={`/setup/users?site=${row.site_id}`} className={cn("inline-flex items-center gap-1 rounded-chip text-sm font-medium text-brand-text hover:underline", focusRing)}>
        Manage people in Users <ExternalLink aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

function CaptureTab({ row, ready }: { row: SiteRow; ready: boolean }) {
  if (!ready) return <EmptyState compact variant="error" title="Couldn't load column configs." />;
  const cats = [...(row.categories ?? [])].sort(
    (a, b) => scopeKey(a.scope).localeCompare(scopeKey(b.scope)) || a.category_name.localeCompare(b.category_name),
  );
  if (!cats.length) return <EmptyState compact title="This site has no categories yet." description="Pick some on the Categories tab first." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Each category needs a column config before people can enter data for it. <span className="font-num">{row.configured.size}</span> of{" "}
        <span className="font-num">{cats.length}</span> are set up.
      </p>
      <ul className="divide-y divide-line rounded-control border border-line">
        {cats.map((c) => {
          const done = row.configured.has(c.category_id);
          return (
            <li key={c.category_id} className="flex items-center gap-3 px-3 py-2 text-sm">
              {done ? <CheckCircle2 aria-hidden className="size-4 text-good" /> : <CircleDashed aria-hidden className="size-4 text-warn" />}
              <span className="min-w-0 flex-1 truncate text-ink">{c.category_name}</span>
              <span className={cn("text-xs font-medium", done ? "text-good" : "text-warn")}>{done ? "Configured" : "Missing"}</span>
            </li>
          );
        })}
      </ul>
      <Link
        to={`/capture/forms?site=${row.site_id}`}
        className={cn("inline-flex items-center gap-1 rounded-chip text-sm font-medium text-brand-text hover:underline", focusRing)}
      >
        Open column configs <ExternalLink aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}
