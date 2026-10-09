import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Eye, FileText, Image as ImageIcon, UploadCloud, X } from "lucide-react";
import { Button } from "./Button";
import { cn } from "./cn";
import { checkFiles, formatBytes, isPreviewable, type FileRules, type Rejected } from "./fileRules";
import { focusRing } from "./styles";

export type FileDropItem = {
  id: string;
  file: File;
  /** 0–100 while uploading. */
  progress?: number;
  status?: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export type FileDropProps = FileRules & {
  label: string;
  /** Short line under the label, e.g. "PDF or photo of the bill, up to 10 MB". */
  help?: string;
  items: FileDropItem[];
  /** Accepted files only; rejected ones are shown in the drop zone. */
  onAdd: (files: File[]) => void;
  onRemove?: (id: string) => void;
  /** Opens a preview (e.g. DocumentViewer) for PDF and image items. */
  onPreview?: (item: FileDropItem) => void;
  disabled?: boolean;
};

function Thumb({ file }: { file: File }) {
  const kind = isPreviewable(file.type);
  const [broken, setBroken] = useState(false);
  const url = useMemo(() => (kind === "image" ? URL.createObjectURL(file) : null), [file, kind]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  if (url && !broken) return <img src={url} alt="" onError={() => setBroken(true)} className="size-10 shrink-0 rounded-chip object-cover" />;
  const Icon = kind === "image" ? ImageIcon : FileText;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-tint text-muted">
      <Icon aria-hidden className="size-5" />
    </span>
  );
}

/** Drag-and-drop or browse. Keyboard: the "Choose files" button opens the picker. */
export function FileDrop({ label, help, items, onAdd, onRemove, onPreview, disabled, accept, maxSize, multiple = true, maxFiles }: FileDropProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<Rejected[]>([]);

  const take = (list: FileList | null) => {
    if (!list || disabled) return;
    const { ok, rejected: bad } = checkFiles(Array.from(list), { accept, maxSize, multiple, maxFiles }, items.length);
    setRejected(bad);
    if (ok.length) onAdd(ok);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-card border-2 border-dashed px-4 py-6 text-center",
          over ? "border-accent bg-accent/10" : "border-line bg-panel",
          disabled && "opacity-60",
        )}
      >
        <UploadCloud aria-hidden className="size-6 text-muted" />
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
        <p className="text-xs text-muted">{help ?? "Drag files here or choose them."}</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          tabIndex={-1}
          multiple={multiple}
          accept={accept?.join(",")}
          disabled={disabled}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
        <Button size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          Choose {multiple ? "files" : "a file"}
        </Button>
        {rejected.length > 0 && (
          <ul role="alert" className="w-full space-y-0.5 text-left text-xs text-bad">
            {rejected.map((r) => (
              <li key={r.file.name}>
                {r.file.name}: {r.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
      {items.length > 0 && (
        <ul aria-label="Files" className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 rounded-control border border-line bg-panel p-2">
              <Thumb file={it.file} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{it.file.name}</p>
                <p className={cn("text-xs", it.status === "error" ? "text-bad" : "text-muted")}>
                  {it.status === "error" ? it.error ?? "Upload failed." : it.status === "done" ? `${formatBytes(it.file.size)} · Uploaded` : formatBytes(it.file.size)}
                </p>
                {it.status === "uploading" && (
                  <div
                    role="progressbar"
                    aria-label={`Uploading ${it.file.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(it.progress ?? 0)}
                    className="mt-1 h-1 overflow-hidden rounded-full bg-tint"
                  >
                    <span className="block h-full bg-accent transition-[width]" style={{ width: `${it.progress ?? 0}%` }} />
                  </div>
                )}
              </div>
              {onPreview && isPreviewable(it.file.type) && (
                <button type="button" aria-label={`Preview ${it.file.name}`} onClick={() => onPreview(it)} className={cn("rounded-chip p-1 text-muted hover:text-ink", focusRing)}>
                  <Eye aria-hidden className="size-4" />
                </button>
              )}
              {onRemove && it.status !== "uploading" && (
                <button type="button" aria-label={`Remove ${it.file.name}`} onClick={() => onRemove(it.id)} className={cn("rounded-chip p-1 text-muted hover:text-ink", focusRing)}>
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
