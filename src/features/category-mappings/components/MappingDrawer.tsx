import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Callout, Combobox, Drawer, Modal, Select, TextField } from "../../../ui";
import { useFactorIndex } from "../api";
import {
  type Category,
  type Company,
  type DraftField,
  type Mapping,
  type MappingDraft,
  type MappingRow,
  type Site,
  clientSiteIds,
  createFactorHref,
  draftFrom,
  emptyDraft,
  factorNames,
  findFactor,
  formatFactor,
  isDirty,
  validate,
} from "../logic";

type Props = {
  /** The mapping being edited; null with `creating` for a new one. */
  row: MappingRow | null;
  creating: boolean;
  /** A linked mapping (?open=id) whose data is still loading. */
  loading?: boolean;
  /** Client, category and site for a new mapping (from the filters). */
  defaults: Partial<MappingDraft>;
  all: Mapping[];
  companies: Company[];
  categories: Category[];
  sites: Site[];
  saving: boolean;
  /** Server error from the last save. */
  error: string | null;
  onClose: () => void;
  onSave: (draft: MappingDraft) => void;
  onRemove: () => void;
};

/** Create / edit drawer for one mapping. Mount with `key` per mapping so each starts from its saved values. */
export function MappingDrawer(props: Props) {
  const { row, creating } = props;
  const base = useMemo(() => (row ? draftFrom(row) : emptyDraft(props.defaults)), [row, props.defaults]);
  const [draft, setDraft] = useState<MappingDraft>(base);
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [query, setQuery] = useState("");
  const factors = useFactorIndex(draft.category_id === null ? [] : [draft.category_id]);

  if (props.loading) return <Drawer open loading onClose={props.onClose} title="Loading mapping…" />;
  if (!creating && !row) return <Drawer open={false} onClose={props.onClose} title="" />;

  const selfId = row?.id ?? null;
  const errors = validate(draft, props.all, selfId);
  const invalid = Object.keys(errors).length > 0;
  const dirty = isDirty(draft, row, base);
  const fieldError = (k: DraftField) => (touched ? errors[k] : undefined);
  const set = <K extends keyof MappingDraft>(k: K, v: MappingDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const clientSites = draft.company_id === null ? [] : props.sites.filter((s) => s.company?.company_id === draft.company_id).sort((a, b) => a.name.localeCompare(b.name));
  // Names the picker offers: factors at the chosen site, or at any of the client's sites.
  const scope = draft.site_id !== null ? new Set([draft.site_id]) : draft.company_id !== null ? clientSiteIds(props.sites, draft.company_id) : null;
  const names = factorNames(factors.index, draft.category_id, scope);
  const typed = query.trim();
  const current = draft.global_category_name.trim();
  const extra = [current, typed].filter((n, i, a) => n && !names.includes(n) && a.indexOf(n) === i);
  const nameOptions = [...names.map((n) => ({ value: n, label: n })), ...extra.map((n) => ({ value: n, label: `${n} (no factor yet)` }))];

  const match =
    draft.company_id !== null && draft.category_id !== null && current
      ? findFactor(factors.index, { company_id: draft.company_id, category_id: draft.category_id, site_id: draft.site_id, global_category_name: current, company_category_name: draft.company_category_name.trim() }, props.sites)
      : null;

  const close = () => (dirty && !props.saving ? setConfirmClose(true) : props.onClose());
  const save = () => {
    setTouched(true);
    if (!invalid) props.onSave(draft);
  };

  const title = creating ? "Add mapping" : `${row!.company_category_name} → ${row!.global_category_name}`;
  const subtitle = creating ? "A client's own name for something, and the factor name it means." : [row!.clientName, row!.categoryName, row!.siteName].join(" · ");

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
              <Button variant="danger" onClick={props.onRemove} disabled={props.saving}>
                Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={close} disabled={props.saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={props.saving} disabled={props.saving || (!creating && !dirty)}>
                {creating ? "Add mapping" : "Save"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {props.error && (
            // Focus lands here so the message is read; the Save button is busy.
            <div key={props.error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
              <Callout tone="warn" title="Couldn't save">
                {props.error}
              </Callout>
            </div>
          )}

          <Combobox<number>
            label="Client"
            required
            placeholder="Search clients…"
            value={draft.company_id}
            // A new client clears the site: sites belong to one client.
            onChange={(v) => setDraft((d) => (v === d.company_id ? d : { ...d, company_id: v, site_id: null }))}
            options={props.companies.map((c) => ({ value: c.company_id, label: c.name }))}
            disabled={!creating}
            help={creating ? undefined : "A mapping stays with its client. Add a new one for another client."}
            error={fieldError("company_id")}
          />
          <Select<number>
            label="Category"
            required
            placeholder="Choose a category"
            value={draft.category_id}
            onChange={(v) => set("category_id", v)}
            options={props.categories.map((c) => ({ value: c.category_id, label: c.category_name }))}
            disabled={!creating}
            error={fieldError("category_id")}
          />
          <Select<number>
            label="Site"
            placeholder="All sites"
            help="Leave on All sites to use it at every site of the client. A site's own mapping wins over it."
            value={draft.site_id}
            onChange={(v) => set("site_id", v)}
            options={clientSites.map((s) => ({ value: s.site_id, label: s.name }))}
          />
          <TextField
            label="Client's name"
            required
            help="Exactly as it appears in their bills and sheets, e.g. “HSD fuel”."
            value={draft.company_category_name}
            onChange={(v) => set("company_category_name", v)}
            maxLength={200}
            autoComplete="off"
            error={fieldError("company_category_name")}
          />
          <Combobox<string>
            label="Global factor name"
            required
            placeholder={draft.category_id === null ? "Choose a category first" : "Search factor names…"}
            value={current || null}
            onChange={(v) => set("global_category_name", v ?? "")}
            onSearch={setQuery}
            options={nameOptions}
            emptyText={factors.loading ? "Loading factor names…" : "Type the factor name"}
            disabled={draft.category_id === null}
            error={fieldError("global_category_name")}
          />
          {match?.state === "matched" && (
            <p className="text-sm text-muted" data-testid="factor-preview">
              Factor: <span className="font-num text-ink">{formatFactor(match.factor)}</span>
            </p>
          )}
          {match?.state === "missing" && (
            <Callout tone="warn" title="No factor with this name yet">
              Entries mapped to it can't be calculated until one exists{draft.site_id !== null ? " for this site" : " at one of the client's sites"}.{" "}
              <Link className="font-medium underline" to={createFactorHref({ ...draft, company_id: draft.company_id!, category_id: draft.category_id!, global_category_name: current })}>
                Create factor
              </Link>
            </Callout>
          )}
          {factors.failed && <Callout tone="warn">Couldn't load this category's factors, so matches aren't checked.</Callout>}
        </div>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard your changes?"
        description="Your edits to this mapping haven't been saved."
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
