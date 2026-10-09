import { Trash2, Undo2 } from "lucide-react";
import { Button, FileDrop } from "../../../ui";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX = 5 * 1024 * 1024;

export interface LogoFieldProps {
  label: string;
  /** Label of the drop zone; unique per field. */
  dropLabel: string;
  help: string;
  /** Saved logo URL, shown until a new file is staged. */
  savedUrl: string | null;
  /** Staged file's preview URL. */
  stagedUrl: string | null;
  staged: File | null;
  onStage: (file: File | null) => void;
  /** Dark logos sit on the draft's Classic top bar colour, so a white logo shows. */
  onDark?: { background: string; color: string };
  /** Light logos sit on the draft's light panel, whatever the app's appearance. */
  onLight?: { background: string; color: string };
  /** Remove the saved logo on Save (dark logo only; the API can't clear the light one). */
  removed?: boolean;
  onToggleRemove?: () => void;
  readOnly?: boolean;
}

/** One logo: what's saved (or staged) on its intended background, and a drop zone that stages a replacement. */
export function LogoField({ label, dropLabel, help, savedUrl, stagedUrl, staged, onStage, onDark, onLight, removed, onToggleRemove, readOnly }: LogoFieldProps) {
  const shown = stagedUrl ?? (removed ? null : savedUrl);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {!readOnly && savedUrl && !staged && onToggleRemove && (
          <Button size="sm" variant="ghost" icon={removed ? <Undo2 aria-hidden className="size-3.5" /> : <Trash2 aria-hidden className="size-3.5" />} onClick={onToggleRemove}>
            {removed ? "Keep logo" : "Remove"}
          </Button>
        )}
      </div>
      <div
        style={onDark ?? onLight}
        className="flex h-16 items-center justify-center rounded-control border border-line px-3"
      >
        {shown ? (
          <img src={shown} alt={`${label} preview`} className="max-h-12 max-w-full object-contain" />
        ) : (
          <span className="text-xs">{removed ? "Removed on save" : "No logo"}</span>
        )}
      </div>
      {staged && (
        <p className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="min-w-0 truncate">New logo, saved with the theme: {staged.name}</span>
          {!readOnly && (
            <Button size="sm" variant="ghost" onClick={() => onStage(null)}>
              Undo
            </Button>
          )}
        </p>
      )}
      {!readOnly && (
        // Items stay empty so a new drop replaces the staged file.
        <FileDrop
          label={dropLabel}
          help={help}
          accept={ACCEPT}
          maxSize={MAX}
          multiple={false}
          items={[]}
          onAdd={(files) => onStage(files[0] ?? null)}
        />
      )}
    </div>
  );
}
