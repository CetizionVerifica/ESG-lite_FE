import { useMemo, useState, type DragEvent } from "react";
import { FolderPlus, ImageIcon, MoreHorizontal, Sparkles } from "lucide-react";
import { ASSET_MAX_BYTES, ASSET_MIMES, type FreeformPage, type StudioAsset } from "../../../lib/studio/contracts";
import { ELEMENT_DRAG_TYPE, assetRef, elementDragData, imagePayload, placeAsset } from "../../../lib/studio/libraryOps";
import { Button, EmptyState, FileDrop, Loading, Menu, Modal, Skeleton, TextField, Textarea, cn, focusRing, type FileDropItem, type MenuEntry } from "../../../ui";
import { libraryErrorMessage, useAssets, useDeleteAsset, useGenerateImage, usePatchAsset, useUploadAsset } from "./library/api";
import type { StudioPanelProps } from "./types";

const ALL = "__all";
const NONE = "__none";
let uploadSeq = 0;

/**
 * DS-4 · the Uploads drawer (05-ux rail tab "Uploads"): a drop zone, folders
 * and the company's images. Click places an image on the page in view (into
 * the selected empty frame when one is selected); drag drops it at a point.
 * "Generate image" asks the image provider for cover art (RS R13) and files
 * it under "AI images". DS-6 mounts it with `registerDrawer('uploads', UploadsPanel)`.
 */
export function UploadsPanel({ doc, pageId, selection, commit, onInserted }: Pick<StudioPanelProps, "doc" | "pageId" | "selection" | "commit"> & { onInserted?: (ids: string[]) => void }) {
  const assets = useAssets();
  const upload = useUploadAsset();
  const patch = usePatchAsset();
  const remove = useDeleteAsset();
  const generate = useGenerateImage();
  const [folder, setFolder] = useState<string>(ALL);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [deleting, setDeleting] = useState<StudioAsset | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const page = doc.pages.find((p): p is FreeformPage => p.id === pageId && p.kind === "freeform");

  const folders = useMemo(() => [...new Set([...(assets.data ?? []).flatMap((a) => (a.folder ? [a.folder] : [])), ...extraFolders])].sort((a, b) => a.localeCompare(b)), [assets.data, extraFolders]);
  const shown = useMemo(() => (assets.data ?? []).filter((a) => folder === ALL || (folder === NONE ? !a.folder : a.folder === folder)), [assets.data, folder]);
  const uploadFolder = folder === ALL || folder === NONE ? null : folder;

  const setItem = (id: string, patchItem: Partial<FileDropItem>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patchItem } : it)));
  const onAdd = (files: File[]) => {
    const added = files.map((file) => ({ id: `up-${++uploadSeq}`, file, status: "uploading" as const, progress: 50 }));
    setItems((list) => [...list, ...added]);
    void Promise.all(
      added.map((it) =>
        upload
          .mutateAsync({ file: it.file, folder: uploadFolder })
          .then(() => setItem(it.id, { status: "done", progress: 100 }))
          .catch((e: unknown) => setItem(it.id, { status: "error", error: libraryErrorMessage(e, "The upload failed. Try again.") })),
      ),
    );
  };

  const place = (a: StudioAsset) => {
    if (!page) return;
    const r = placeAsset(doc, page.id, a, { selection });
    commit(r.doc, `Add image ${a.alt || "upload"}`);
    onInserted?.(r.ids);
  };
  const onDragStart = (e: DragEvent<HTMLButtonElement>, a: StudioAsset) => {
    e.dataTransfer.setData(ELEMENT_DRAG_TYPE, elementDragData({ payload: imagePayload(doc, a), asset: assetRef(a) }));
    e.dataTransfer.effectAllowed = "copy";
  };
  const move = (a: StudioAsset, to: string | null) => {
    setActionError(null);
    patch.mutate({ id: a.id, folder: to }, { onError: (e) => setActionError(libraryErrorMessage(e, "The image couldn't be moved.")) });
  };
  const menu = (a: StudioAsset): MenuEntry[] => [
    ...folders.filter((f) => f !== a.folder).map((f) => ({ label: `Move to ${f}`, onSelect: () => move(a, f) })),
    ...(a.folder ? [{ label: "Move out of the folder", onSelect: () => move(a, null) }] : []),
    { label: "Delete", danger: true, onSelect: () => setDeleting(a) },
  ];
  const createFolder = () => {
    const name = (newFolder ?? "").trim().slice(0, 60);
    if (name && !/[/\\<>]/.test(name)) {
      setExtraFolders((f) => [...f, name]);
      setFolder(name);
    }
    setNewFolder(null);
  };

  return (
    <section aria-label="Uploads" className="flex h-full min-h-0 flex-col gap-3" data-testid="studio-uploads-panel">
      <FileDrop
        label="Upload images"
        help={`JPG, PNG, WebP or SVG, up to 10 MB${uploadFolder ? `. Goes into ${uploadFolder}` : ""}`}
        accept={[...ASSET_MIMES]}
        maxSize={ASSET_MAX_BYTES}
        items={items}
        onAdd={onAdd}
        onRemove={(id) => setItems((list) => list.filter((it) => it.id !== id))}
      />
      <div role="group" aria-label="Folders" className="flex flex-wrap items-center gap-1.5">
        {[ALL, NONE, ...folders].map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={folder === f}
            onClick={() => setFolder(f)}
            className={cn("rounded-full border px-2.5 py-1 text-xs", folder === f ? "border-brand bg-tint text-brand-text" : "border-line text-muted hover:text-ink", focusRing)}
          >
            {f === ALL ? "All" : f === NONE ? "No folder" : f}
          </button>
        ))}
        {newFolder === null ? (
          <Button size="sm" variant="ghost" icon={<FolderPlus aria-hidden className="size-4" />} onClick={() => setNewFolder("")}>
            New folder
          </Button>
        ) : (
          <form
            className="flex w-full items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createFolder();
            }}
          >
            <TextField label="Folder name" value={newFolder} onChange={setNewFolder} maxLength={60} className="flex-1" autoFocus />
            <Button size="sm" type="submit">
              Create
            </Button>
          </form>
        )}
      </div>
      {actionError && (
        <p role="alert" className="text-xs text-bad">
          {actionError}
        </p>
      )}
      {!page && <p className="text-xs text-muted">Go to a free-form page to place images.</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {assets.isError ? (
          <EmptyState variant="error" compact title="Your images couldn't be loaded." description={libraryErrorMessage(assets.error)} action={<Button size="sm" onClick={() => void assets.refetch()}>Try again</Button>} />
        ) : assets.isPending ? (
          <Loading label="Loading images" className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </Loading>
        ) : !shown.length ? (
          <EmptyState compact icon={ImageIcon} title={assets.data.length ? "No images in this folder." : "No images yet."} description="Upload photos of your sites, people and products, or your certificates." />
        ) : (
          <ul className="grid grid-cols-2 gap-2" aria-label="Images">
            {shown.map((a) => (
              <li key={a.id} className="group relative">
                <button
                  type="button"
                  draggable={!!page}
                  onDragStart={(e) => onDragStart(e, a)}
                  onClick={() => place(a)}
                  disabled={!page}
                  aria-label={`Place ${a.alt || "image"}${a.folder ? ` (${a.folder})` : ""}`}
                  data-testid={`asset-${a.id}`}
                  className={cn("block w-full overflow-hidden rounded-control border border-line bg-tint hover:border-brand disabled:cursor-not-allowed", focusRing)}
                >
                  <img src={a.url} alt={a.alt} loading="lazy" className="h-24 w-full object-cover" />
                </button>
                <div className="absolute right-1 top-1">
                  <Menu
                    label={`Actions for ${a.alt || "image"}`}
                    items={menu(a)}
                    trigger={(props) => (
                      <button {...props} type="button" aria-label={`More actions for ${a.alt || "image"}`} className={cn("rounded-chip bg-panel/90 p-1 text-muted hover:text-ink", focusRing)}>
                        <MoreHorizontal aria-hidden className="size-4" />
                      </button>
                    )}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="space-y-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim().length < 3) return;
          generate.mutate({ prompt: prompt.trim(), folder: uploadFolder }, { onSuccess: (a) => (setPrompt(""), setFolder(a.folder ?? ALL)) });
        }}
      >
        <Textarea label="Generate an image" help="Describe a cover or background. It's added to your images; nothing is placed until you click it." value={prompt} onChange={setPrompt} rows={2} maxLength={1000} />
        {generate.isError && (
          <p role="alert" className="text-xs text-bad">
            {libraryErrorMessage(generate.error, "The image couldn't be generated. Try again.")}
          </p>
        )}
        <Button type="submit" size="sm" icon={<Sparkles aria-hidden className="size-4" />} loading={generate.isPending} disabled={prompt.trim().length < 3}>
          Generate image
        </Button>
      </form>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="destructive"
        title="Delete this image?"
        description="It's removed from your images. An image used in a draft design can't be deleted."
        primaryAction={
          deleting
            ? {
                label: "Delete image",
                loading: remove.isPending,
                onClick: () => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) }),
              }
            : undefined
        }
        error={remove.isError ? libraryErrorMessage(remove.error, "The image couldn't be deleted.") : undefined}
      />
    </section>
  );
}
