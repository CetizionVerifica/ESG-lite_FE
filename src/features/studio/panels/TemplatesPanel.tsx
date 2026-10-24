import { useMemo, useState } from "react";
import { FilePlus2, LayoutTemplate } from "lucide-react";
import type { FreeformPage, ReportLayout, ReportTemplate } from "../../../lib/studio/contracts";
import { addLayoutPage, applyTemplate } from "../../../lib/studio/libraryOps";
import { Badge, Button, EmptyState, Loading, Modal, Skeleton, Tabs, TextField, cn, focusRing, useToast } from "../../../ui";
import { useBrandKit } from "../brand-kit/api";
import { libraryErrorMessage, useFetchTemplate, useLayouts, useTemplate, useTemplates } from "./library/api";
import { previewDoc, useRenderBrand } from "./library/preview";
import { SheetThumb } from "./library/SheetThumb";
import type { StudioPanelProps } from "./types";

const LOOK_LABEL: Record<string, string> = { classic: "Classic", light: "Light", night: "Night" };
const CARD_W = 136;

/** A template's cover, drawn by the renderer in the client's brand. */
function TemplateCover({ template, width }: { template: ReportTemplate; width: number }) {
  const detail = useTemplate(template.id);
  const brand = useRenderBrand();
  const cover = detail.data?.doc.pages.find((p): p is FreeformPage => p.kind === "freeform");
  if (template.thumbnailUrl) return <img src={template.thumbnailUrl} alt="" className="w-full rounded-chip border border-line" />;
  if (!detail.data || !cover) return <Skeleton className="w-full" style={{ height: Math.round(width * 1.2) }} />;
  return <SheetThumb doc={previewDoc(detail.data.doc, cover)} page={cover} width={width} brand={brand} className="rounded-chip border border-line" label={`${template.name} cover`} />;
}

/**
 * DS-4 · the Templates drawer (05-ux rail tab "Templates"): whole-report
 * templates of this doc's kind and format (apply to all pages, after the
 * confirm), and page layouts (add one page after the page in view). Search
 * matches names, descriptions and tags. DS-6 mounts it with
 * `registerDrawer('templates', TemplatesPanel)`.
 */
export function TemplatesPanel({ doc, pageId, commit }: Pick<StudioPanelProps, "doc" | "pageId" | "commit">) {
  const [tab, setTab] = useState<"templates" | "layouts">("templates");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<ReportTemplate | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const { toast } = useToast();
  const fetchTemplate = useFetchTemplate();
  const kit = useBrandKit();
  const vars = kit.data ? { company: kit.data.name } : {};
  const query = q.trim();
  const templates = useTemplates({ kind: doc.kind, format: doc.format, q: query || undefined });
  const layouts = useLayouts({ kind: doc.kind, format: doc.format });
  const brand = useRenderBrand();
  const currentFamily = useMemo(() => templates.data?.find((t) => t.slug === doc.design.templateId)?.family ?? null, [templates.data, doc.design.templateId]);

  const layoutGroups = useMemo(() => {
    const list = (layouts.data ?? []).filter((l) => !query || `${l.name} ${l.role ?? ""} ${l.pageKind}`.toLowerCase().includes(query.toLowerCase()));
    const byFamily = new Map<string, ReportLayout[]>();
    for (const l of list) byFamily.set(l.family ?? "", [...(byFamily.get(l.family ?? "") ?? []), l]);
    return [...byFamily.entries()].sort(([a], [b]) => (a === currentFamily ? -1 : b === currentFamily ? 1 : a.localeCompare(b)));
  }, [layouts.data, query, currentFamily]);

  const apply = async (t: ReportTemplate) => {
    setApplying(true);
    setApplyError(null);
    try {
      const detail = await fetchTemplate(t.id);
      const r = applyTemplate(doc, detail, { vars });
      commit(r.doc, `Apply template ${t.name}`);
      setConfirm(null);
      toast({ tone: "good", title: `Applied ${t.name}`, description: r.matched ? `Kept your text on ${r.matched} ${r.matched === 1 ? "page" : "pages"}.` : undefined });
    } catch (e) {
      setApplyError(e instanceof Error && !("response" in e) ? e.message : libraryErrorMessage(e, "The template couldn't be applied. Try again."));
    } finally {
      setApplying(false);
    }
  };

  const addPage = (l: ReportLayout) => {
    const r = addLayoutPage(doc, l, { afterPageId: pageId, vars });
    commit(r.doc, `Add page ${l.name}`);
  };

  return (
    <section aria-label="Templates" className="flex h-full min-h-0 flex-col gap-3" data-testid="studio-templates-panel">
      <TextField label="Search templates and layouts" hideLabel placeholder="Search templates and layouts" value={q} onChange={setQ} type="search" />
      <Tabs
        label="Templates panel"
        idBase="studio-templates"
        value={tab}
        onChange={setTab}
        items={[
          { value: "templates", label: "Templates" },
          { value: "layouts", label: "Page layouts" },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel" id={`studio-templates-panel-${tab}`} aria-labelledby={`studio-templates-tab-${tab}`}>
        {tab === "templates" ? (
          templates.isError ? (
            <EmptyState variant="error" compact title="Templates couldn't be loaded." description={libraryErrorMessage(templates.error)} action={<Button size="sm" onClick={() => void templates.refetch()}>Try again</Button>} />
          ) : templates.isPending ? (
            <Loading label="Loading templates" className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44" />
              ))}
            </Loading>
          ) : !templates.data.length ? (
            <EmptyState compact icon={LayoutTemplate} title={query ? "No templates match." : "No templates for this format yet."} description={query ? "Try another word, such as scope, board or summary." : undefined} />
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {templates.data.map((t) => {
                const current = t.slug === doc.design.templateId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setConfirm(t)}
                      data-testid={`template-${t.slug ?? t.id}`}
                      className={cn("flex w-full flex-col gap-1.5 rounded-card border bg-panel p-2 text-left hover:border-brand", current ? "border-brand ring-1 ring-brand" : "border-line", focusRing)}
                      aria-label={`${t.name}${current ? " (in use)" : ""}: ${t.pageCount} ${t.pageCount === 1 ? "page" : "pages"}. Apply to all pages`}
                    >
                      <TemplateCover template={t} width={CARD_W} />
                      <span className="line-clamp-2 text-xs font-medium text-ink">{t.name}</span>
                      <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
                        {t.pageCount} {t.pageCount === 1 ? "page" : "pages"}
                        {t.look && <Badge tone="neutral">{LOOK_LABEL[t.look] ?? t.look}</Badge>}
                        {current && <Badge tone="info">In use</Badge>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : layouts.isError ? (
          <EmptyState variant="error" compact title="Layouts couldn't be loaded." description={libraryErrorMessage(layouts.error)} action={<Button size="sm" onClick={() => void layouts.refetch()}>Try again</Button>} />
        ) : layouts.isPending ? (
          <Loading label="Loading layouts" className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </Loading>
        ) : !layoutGroups.length ? (
          <EmptyState compact icon={FilePlus2} title={query ? "No layouts match." : "No page layouts for this format yet."} />
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted">Click a layout to add it as a new page after the page you're on.</p>
            {layoutGroups.map(([family, list]) => (
              <section key={family} aria-label={`${familyName(family, templates.data)} layouts`} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {familyName(family, templates.data)}
                  {family === currentFamily && <span className="ml-1 normal-case tracking-normal">· this design</span>}
                </h3>
                <ul className="grid grid-cols-2 gap-3">
                  {list.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => addPage(l)}
                        data-testid={`layout-${l.slug ?? l.id}`}
                        aria-label={`Add page: ${l.name}`}
                        className={cn("flex w-full flex-col gap-1.5 rounded-card border border-line bg-panel p-2 text-left hover:border-brand", focusRing)}
                      >
                        {l.thumbnailUrl ? (
                          <img src={l.thumbnailUrl} alt="" className="w-full rounded-chip border border-line" />
                        ) : (
                          <SheetThumb doc={previewDoc(doc, l.page)} page={l.page} width={CARD_W} brand={brand} className="rounded-chip border border-line" label={l.name} />
                        )}
                        <span className="text-xs text-ink">{l.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={!!confirm}
        onClose={() => {
          setConfirm(null);
          setApplyError(null);
        }}
        title={confirm ? `Apply ${confirm.name}?` : "Apply template?"}
        description="Replace all pages? Your text edits on pages with the same layout are kept."
        primaryAction={confirm ? { label: "Replace all pages", onClick: () => void apply(confirm), loading: applying } : undefined}
        error={applyError}
      >
        {confirm?.description && <p className="text-sm text-muted">{confirm.description}</p>}
        <p className="mt-2 text-xs text-muted">Elements you added stay. You can undo this.</p>
      </Modal>
    </section>
  );
}

/** "ghg-inventory" → the template's name without its look; falls back to the slug. */
function familyName(family: string, templates: ReportTemplate[] | undefined): string {
  const t = templates?.find((x) => x.family === family);
  return t ? t.name.replace(/ · (Classic|Light|Night)$/, "") : family.replace(/[-_]/g, " ");
}

