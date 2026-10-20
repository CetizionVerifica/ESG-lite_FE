import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  Flag,
  FolderUp,
  LayoutGrid,
  LayoutTemplate,
  Maximize,
  MessageSquare,
  Palette,
  Play,
  Redo2,
  Shapes,
  Sparkles,
  Type,
  Undo2,
  Users,
  Database,
  Files,
  X,
} from "lucide-react";
import api from "../../../api/axios";
import { brandFromKit, docRenderData } from "../../../lib/studio/docData";
import { isKindOff, useStudioCompanyId } from "../../../lib/studio/switch";
import { formatPx } from "../../../lib/studio/render";
import { Badge, Button, Callout, EmptyState, Modal, Skeleton, cn, focusRing, formatDateTime } from "../../../ui";
import { useBrandKit } from "../brand-kit/api";
import { docErrorMessage, errorCode, useDocValues } from "../docs/api";
import { KIND_LABEL } from "../home/logic";
import { DataPanel } from "../panels/DataPanel";
import { ReadOnlyCanvas } from "./ReadOnlyCanvas";
import { useDocSession } from "./useDocSession";

/** 05-ux S3 rail tabs, in order. */
const RAIL = [
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "text", label: "Text", icon: Type },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "uploads", label: "Uploads", icon: FolderUp },
  { id: "data", label: "Data", icon: Database },
  { id: "charts", label: "Charts", icon: BarChart3 },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "pages", label: "Pages", icon: Files },
] as const;
type RailId = (typeof RAIL)[number]["id"];

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
/** The editor needs ≥ 1280 px (00-plan §2.10); below it the studio is view only. */
export const EDITOR_MIN_WIDTH = 1280;

function useWide(): boolean {
  const [wide, setWide] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= EDITOR_MIN_WIDTH));
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= EDITOR_MIN_WIDTH);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}

/** Asset id → URL for image frames (GET /studio/assets, DS-4); empty until that route answers. */
function useAssetUrls(): Record<string, string> {
  const companyId = useStudioCompanyId();
  const q = useQuery({
    queryKey: ["studio", "assets", companyId],
    queryFn: async () => (await api.get<{ id: string; url?: string }[]>("/studio/assets", { params: companyId ? { company_id: companyId } : undefined })).data,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(() => Object.fromEntries((Array.isArray(q.data) ? q.data : []).filter((a) => a.url).map((a) => [a.id, a.url as string])), [q.data]);
}

function saveText(status: string, savedAt: Date | null): string {
  if (status === "pending" || status === "saving") return "Saving…";
  if (status === "error") return "Not saved";
  if (status === "conflict") return "Changed elsewhere";
  return savedAt ? `Saved ${formatDateTime(savedAt)}` : "Saved";
}

/**
 * DS-5 · `/studio/:id`, the editor shell (05-ux S3, mockup "Editor"): top bar,
 * side rail with drawers, the read-only canvas drawn by the renderer mirror
 * with the design's resolved numbers and the brand, and the status bar.
 * Renaming autosaves (PATCH with rev); presence shows who else has it open.
 * DS-6 makes the canvas editable and fills the drawers.
 */
export function EditorShellPage() {
  const params = useParams();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const session = useDocSession(valid ? id : null);
  const kit = useBrandKit();
  const brand = useMemo(() => brandFromKit(kit.data), [kit.data]);
  const assets = useAssetUrls();
  const values = useDocValues(valid ? id : null, session.doc, session.query.data?.rev ?? 0);
  const data = useMemo(() => (session.doc ? docRenderData(session.doc, values.data) : null), [session.doc, values.data]);
  const [drawer, setDrawer] = useState<RailId | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [pageIndex, setPageIndex] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const wide = useWide();
  const onPageInView = useCallback((i: number) => setPageIndex(i), []);

  if (!valid) return <EmptyState variant="error" title="This design wasn't found." action={<Link to="/studio" className="text-sm font-medium text-brand-text underline">Back to Design Studio</Link>} />;
  if (session.query.isError) {
    const off = isKindOff(session.query.error);
    return (
      <EmptyState
        variant="error"
        title={off ? "Sustainability reports need KPI tracking." : errorCode(session.query.error) === "DS_DOC_NOT_FOUND" ? "This design wasn't found." : "The design couldn't be loaded."}
        description={off ? "KPI tracking isn't turned on for your company, so this design can't be opened." : docErrorMessage(session.query.error, "Try again in a moment.")}
        action={<Link to="/studio" className={cn("text-sm font-medium text-brand-text underline", focusRing)}>Back to Design Studio</Link>}
      />
    );
  }
  const doc = session.doc;
  if (session.query.isPending || !doc) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading the design">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }

  const fitZoom = Math.min(1, (wide ? 760 : 560) / formatPx(doc.format).w);
  const z = zoom === "fit" ? fitZoom : zoom;
  const pageCount = doc.pages.length;
  const startRename = () => {
    setDraftTitle(session.title);
    setEditingTitle(true);
  };
  const commitRename = () => {
    setEditingTitle(false);
    if (draftTitle.trim() && draftTitle.trim() !== session.title) session.rename(draftTitle);
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col overflow-hidden rounded-card border border-line bg-panel" data-testid="studio-editor-shell">
      {/* Top bar (48) */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Link to="/studio" className={cn("inline-flex items-center gap-1 rounded-control px-2 py-1 text-sm text-muted hover:bg-tint hover:text-ink", focusRing)}>
          <ArrowLeft aria-hidden className="size-4" /> Designs
        </Link>
        <span className="h-5 w-px bg-line" aria-hidden />
        <TopButton label="File" disabled>
          File ▾
        </TopButton>
        <TopButton label="Resize" disabled>
          Resize
        </TopButton>
        <TopButton label="Undo" disabled>
          <Undo2 aria-hidden className="size-4" />
        </TopButton>
        <TopButton label="Redo" disabled>
          <Redo2 aria-hidden className="size-4" />
        </TopButton>
        <div className="mx-auto flex min-w-0 items-center gap-2">
          {editingTitle ? (
            <input
              autoFocus
              aria-label="Design name"
              value={draftTitle}
              maxLength={200}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className={cn("h-8 w-72 rounded-control border border-line bg-panel px-2 text-sm text-ink", focusRing)}
            />
          ) : (
            <button type="button" onClick={startRename} className={cn("truncate rounded-control px-2 py-1 text-sm font-medium text-ink hover:bg-tint", focusRing)} title="Rename" data-testid="studio-title">
              {session.title}
            </button>
          )}
          <span className="shrink-0 text-xs text-muted" data-testid="studio-save-status" aria-live="polite">
            {KIND_LABEL[doc.kind]} · {saveText(session.save.status, session.save.savedAt)}
          </span>
          {session.save.status === "error" && (
            <Button size="sm" variant="ghost" onClick={() => void session.retry()}>
              Try again
            </Button>
          )}
        </div>
        {session.others > 0 && (
          <Badge tone="info">
            <Users aria-hidden className="mr-1 inline size-3.5" />
            Also open by {session.others} {session.others === 1 ? "person" : "people"}
          </Badge>
        )}
        <TopButton label="Checks" disabled>
          <Flag aria-hidden className="size-4" /> Checks
        </TopButton>
        <TopButton label="Comments" disabled>
          <MessageSquare aria-hidden className="size-4" />
        </TopButton>
        <TopButton label="Present" disabled>
          <Play aria-hidden className="size-4" /> Present
        </TopButton>
        <TopButton label="Share" disabled>
          Share ▾
        </TopButton>
        <TopButton label="Download" disabled>
          Download ▾
        </TopButton>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Rail (72) */}
        <nav aria-label="Design tools" className="flex w-[72px] shrink-0 flex-col items-stretch gap-0.5 overflow-y-auto border-r border-line py-2">
          {RAIL.map((t) => {
            const Icon = t.icon;
            const on = drawer === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setDrawer(on ? null : t.id)}
                className={cn("mx-1 flex flex-col items-center gap-1 rounded-control py-2 text-[11px] text-muted hover:bg-tint hover:text-ink", on && "bg-tint text-ink", focusRing)}
                data-testid={`rail-${t.id}`}
              >
                <Icon aria-hidden className="size-5" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Drawer (340, collapsible) */}
        {drawer && (
          <aside aria-label={RAIL.find((t) => t.id === drawer)?.label} className="flex w-[340px] shrink-0 flex-col border-r border-line">
            <div className="flex h-10 items-center justify-between border-b border-line px-3">
              <p className="text-sm font-semibold text-ink">{RAIL.find((t) => t.id === drawer)?.label}</p>
              <button type="button" aria-label="Close the drawer" onClick={() => setDrawer(null)} className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}>
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {drawer === "data" ? (
                <DataPanel scope={{ kind: doc.kind, year: doc.meta.year, yearType: doc.meta.yearType, sites: doc.meta.sites }} docId={id} />
              ) : (
                <EmptyState compact icon={RAIL.find((t) => t.id === drawer)?.icon} title="Coming soon in the editor." description="For now you can view the pages, rename the design and check its data." />
              )}
            </div>
          </aside>
        )}

        {/* Canvas + status bar */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!wide && (
            <Callout tone="info" className="m-3">
              Editing needs a screen at least 1,280 px wide. You can view the pages here.
            </Callout>
          )}
          {values.isError && (
            <Callout tone="warn" className="m-3">
              The numbers couldn't be read right now, so figures show as “Not reported”. {docErrorMessage(values.error, "")}
            </Callout>
          )}
          <div className="min-h-0 flex-1 overflow-auto bg-tint" data-testid="studio-scroll">
            <ReadOnlyCanvas doc={doc} data={data} brand={brand} assets={assets} zoom={z} onPageInView={onPageInView} />
          </div>
          {/* Status bar (40) */}
          <footer className="flex h-10 shrink-0 items-center gap-3 border-t border-line px-3 text-xs text-muted">
            <span>Notes</span>
            <span className="h-5 w-px bg-line" aria-hidden />
            <span data-testid="studio-page-counter">
              Page {Math.min(pageIndex + 1, pageCount)} / {pageCount}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="studio-zoom">Zoom</label>
              <input
                id="studio-zoom"
                type="range"
                min={ZOOM_MIN * 100}
                max={ZOOM_MAX * 100}
                step={5}
                value={Math.round(z * 100)}
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
                className="w-32 accent-accent"
              />
              <span className="w-10 tabular-nums text-ink">{Math.round(z * 100)}%</span>
              <button type="button" onClick={() => setZoom("fit")} className={cn("rounded-chip px-1.5 py-0.5 hover:bg-tint hover:text-ink", zoom === "fit" && "text-ink", focusRing)}>
                Fit
              </button>
              <TopButton label="Grid view" disabled>
                <LayoutGrid aria-hidden className="size-4" />
              </TopButton>
              <TopButton label="Full screen" disabled>
                <Maximize aria-hidden className="size-4" />
              </TopButton>
            </div>
          </footer>
        </div>
      </div>

      <Modal
        open={session.save.status === "conflict"}
        onClose={() => undefined}
        title="Someone else changed this design"
        description="Your last change wasn't saved because the design changed elsewhere. Reload to see the latest version."
        cancelLabel={null}
        primaryAction={{ label: "Reload the design", onClick: () => void session.reload() }}
      />
    </div>
  );
}

function TopButton({ label, disabled, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={disabled ? `${label}: coming soon` : label} disabled={disabled} className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-control px-2 text-sm text-ink hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50", focusRing)}>
      {children}
    </button>
  );
}
