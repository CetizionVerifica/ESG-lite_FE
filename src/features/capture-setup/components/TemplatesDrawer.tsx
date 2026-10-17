import { useMemo, useState } from "react";
import { Badge, Button, Drawer, EmptyState, Modal, Select, TextField, formatDate, useToast } from "../../../ui";
import { useDeleteTemplate, useFormTemplates, useRenameTemplate, useSeedTemplates, useSites } from "../api";
import { errorMessage } from "../logic";
import { type CopySource, type FormTemplate, targetLine } from "../templates";
import { ApplyDrawer } from "./ApplyDrawer";

type Seeded = Array<{ site_id: number; site_name: string; template_name: string } & Parameters<typeof targetLine>[0]>;

/** SE-6 · Every saved template: apply it to sites, rename it, delete it, or fill a client's missing forms from the every-client ones. */
export function TemplatesDrawer({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const templates = useFormTemplates();
  const rename = useRenameTemplate();
  const remove = useDeleteTemplate();
  const [applying, setApplying] = useState<CopySource | null>(null);
  const [renaming, setRenaming] = useState<FormTemplate | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<FormTemplate | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = templates.data ?? [];

  if (applying) return <ApplyDrawer source={applying} onClose={() => setApplying(null)} />;

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        size="lg"
        title="Form templates"
        subtitle="Set a category up once, then apply it to many sites."
        loading={templates.isPending}
        error={templates.isError ? errorMessage(templates.error, "Couldn't load the templates.") : null}
        onRetry={() => void templates.refetch()}
        headerActions={<Button size="sm" onClick={() => setSeeding(true)}>Fill a client's missing forms</Button>}
      >
        {templates.data && list.length === 0 && (
          <EmptyState title="No templates yet." description='Open a form and choose "Save as template" to set a category up once for many sites.' />
        )}
        <ul className="divide-y divide-line" data-testid="template-list">
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3" data-template={t.name}>
              <div className="min-w-0">
                <p className="font-medium text-ink">{t.name}</p>
                <p className="text-sm text-muted">
                  {t.category_name} · {t.fields} {t.fields === 1 ? "field" : "fields"} · {[t.created_by?.name, formatDate(t.created_at)].filter(Boolean).join(", ")}
                </p>
                <Badge tone={t.company_id === null ? "brand" : "neutral"}>{t.company_id === null ? "Every client" : (t.company_name ?? "One client")}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setApplying({ kind: "template", id: t.id, name: t.name, company_id: t.company_id, category_id: t.category_id, category_name: t.category_name })}
                >
                  Apply to sites
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setRenaming(t);
                    setNewName(t.name);
                    setErr(null);
                  }}
                >
                  Rename
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Drawer>

      {renaming && (
        <Modal
          open
          onClose={() => setRenaming(null)}
          title="Rename template"
          error={err}
          primaryAction={{
            label: "Rename",
            loading: rename.isPending,
            disabled: !newName.trim(),
            onClick: () =>
              rename.mutate(
                { id: renaming.id, name: newName },
                {
                  onSuccess: () => {
                    toast({ title: `Renamed to "${newName.trim()}"`, tone: "good" });
                    setRenaming(null);
                  },
                  onError: (e) => setErr(errorMessage(e, "Not renamed. Try again.")),
                },
              ),
          }}
        >
          <TextField label="Template name" value={newName} onChange={setNewName} maxLength={120} />
        </Modal>
      )}
      {deleting && (
        <Modal
          open
          tone="destructive"
          onClose={() => setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          description="The template goes. Forms made from it stay as they are."
          error={err}
          primaryAction={{
            label: "Delete template",
            loading: remove.isPending,
            onClick: () =>
              remove.mutate(deleting.id, {
                onSuccess: () => {
                  toast({ title: `Template "${deleting.name}" deleted`, tone: "good" });
                  setDeleting(null);
                },
                onError: (e) => setErr(errorMessage(e, "Not deleted. Try again.")),
              }),
          }}
        />
      )}
      {seeding && <SeedModal onClose={() => setSeeding(false)} />}
    </>
  );
}

/** The every-client templates, applied to a client's sites that report a category with no form yet. */
function SeedModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const sites = useSites();
  const seed = useSeedTemplates();
  const [client, setClient] = useState<number | null>(null);
  const [found, setFound] = useState<Seeded | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clients = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of sites.data ?? []) if (s.company) m.set(s.company.company_id, s.company.name);
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [sites.data]);
  const passing = (found ?? []).filter((t) => !t.refused && t.check?.ok);
  const run = (dry: boolean) => {
    if (!client) return;
    setErr(null);
    seed.mutate(
      { company_id: client, dry_run: dry },
      {
        onSuccess: (r) => {
          setFound(r.targets);
          if (!dry) {
            setDone(true);
            toast({ title: `${r.targets.filter((t) => t.status === "applied").length} ${r.targets.length === 1 ? "form" : "forms"} created`, tone: "good" });
          }
        },
        onError: (e) => setErr(errorMessage(e, "Couldn't check that client. Try again.")),
      },
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Fill a client's missing forms"
      description="Each site of the client that reports a category with no form gets the newest every-client template for it, if it passes the check there."
      error={err}
      cancelLabel={done ? "Close" : "Cancel"}
      primaryAction={
        done
          ? undefined
          : found
            ? { label: passing.length ? `Create ${passing.length} ${passing.length === 1 ? "form" : "forms"}` : "Nothing to create", onClick: () => run(false), disabled: !passing.length, loading: seed.isPending }
            : { label: "Check", onClick: () => run(true), disabled: !client, loading: seed.isPending }
      }
    >
      <div className="space-y-3">
        <Select
          label="Client"
          value={client}
          onChange={(v) => {
            setClient(v);
            setFound(null);
            setDone(false);
          }}
          options={clients}
          placeholder="Choose a client"
        />
        {found && found.length === 0 && <p className="text-sm text-muted">Every category this client reports already has a form, or there's no every-client template for it.</p>}
        {found && found.length > 0 && (
          <ul className="divide-y divide-line text-sm" data-testid="seed-targets">
            {found.map((t) => {
              const line = targetLine(t);
              return (
                <li key={`${t.site_id}-${t.template_name}`} className="py-1.5">
                  <span className="font-medium text-ink">{t.site_name}</span> · {t.template_name}
                  <span className={`block ${line.tone === "bad" ? "text-bad" : "text-muted"}`}>{line.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
