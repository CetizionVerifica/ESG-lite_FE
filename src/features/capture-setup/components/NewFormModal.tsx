import { useMemo, useState } from "react";
import { Modal, Select, TextField } from "../../../ui";
import { type FormConfig, type NewFormDraft, type Site, suggestedFormName, validateNewForm } from "../logic";

export type NewFormModalProps = {
  sites: Site[];
  configs: FormConfig[];
  initial: { siteId: number | null; categoryId: number | null };
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (draft: { name: string; siteId: number; categoryId: number }) => void;
};

/** Name, site and category; fields, choices and rules are set in the form builder afterwards. */
export function NewFormModal({ sites, configs, initial, saving, error, onClose, onCreate }: NewFormModalProps) {
  const siteById = useMemo(() => new Map(sites.map((s) => [s.site_id, s])), [sites]);
  const nameFor = (siteId: number | null, categoryId: number | null) => {
    const site = siteId ? siteById.get(siteId) : undefined;
    return suggestedFormName(site, site?.categories?.find((c) => c.category_id === categoryId));
  };
  const [draft, setDraft] = useState<NewFormDraft>(() => ({ ...initial, name: nameFor(initial.siteId, initial.categoryId) }));
  // The name follows site and category until someone types one.
  const [nameEdited, setNameEdited] = useState(false);
  const [tried, setTried] = useState(false);
  const errors = validateNewForm(draft, configs);
  const shown = tried ? errors : {};

  const site = draft.siteId ? siteById.get(draft.siteId) : undefined;
  const siteOptions = useMemo(
    () => [...sites].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.site_id, label: s.company ? `${s.name} (${s.company.name})` : s.name })),
    [sites],
  );
  const categoryOptions = (site?.categories ?? [])
    .map((c) => ({ value: c.category_id, label: c.category_name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const patch = (p: Partial<NewFormDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...p };
      if (!nameEdited && (p.siteId !== undefined || p.categoryId !== undefined)) next.name = nameFor(next.siteId, next.categoryId);
      return next;
    });

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length || !draft.siteId || !draft.categoryId) return;
    onCreate({ name: draft.name, siteId: draft.siteId, categoryId: draft.categoryId });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New form"
      description="Pick where the form is used. You add its fields in the form builder next."
      primaryAction={{ label: "Create form", onClick: submit, loading: saving }}
      error={error}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Select
          label="Site"
          required
          value={draft.siteId}
          onChange={(v) => patch({ siteId: v, categoryId: null })}
          options={siteOptions}
          placeholder="Choose a site"
          error={shown.siteId}
        />
        <Select
          label="Category"
          required
          value={draft.categoryId}
          onChange={(v) => patch({ categoryId: v })}
          options={categoryOptions}
          placeholder="Choose a category"
          emptyText={draft.siteId ? "This site reports no categories" : "Choose a site first"}
          error={shown.categoryId}
        />
        <TextField
          label="Form name"
          required
          value={draft.name}
          onChange={(v) => {
            setNameEdited(true);
            setDraft((d) => ({ ...d, name: v }));
          }}
          error={shown.name}
        />
      </form>
    </Modal>
  );
}
