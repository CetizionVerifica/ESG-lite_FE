import { useEffect, useRef } from "react";
import { FileText, LoaderCircle, Paperclip, SendHorizontal, X } from "lucide-react";
import { ASSISTANT_MAX_QUESTION_CHARS } from "../../../../lib/assistant/contracts";
import type { PreparedFile } from "../../../../lib/assistant/files";
import { Button, Textarea, cn, focusRing } from "../../../../ui";

export interface ComposerProps {
  open: boolean;
  draft: string;
  onDraft: (text: string) => void;
  onSend: () => void;
  busy: boolean;
  tooLong: boolean;
  filesOn: boolean;
  file: PreparedFile | null;
  reading: boolean;
  onPick: (file: File | undefined) => void;
  onRemove: () => void;
  /** Quick questions about the file attached. */
  questions: string[];
  onQuestion: (question: string) => void;
}

/** A phone's keyboard shouldn't jump up just because the panel opened. */
const hasMouse = () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

/** The question box: type, attach or paste a file, and send. */
export function Composer({ open, draft, onDraft, onSend, busy, tooLong, filesOn, file, reading, onPick, onRemove, questions, onQuestion }: ComposerProps) {
  const form = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !hasMouse()) return;
    const id = setTimeout(() => form.current?.querySelector("textarea")?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <form
      ref={form}
      className="w-full space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      onPaste={(e) => {
        const pasted = e.clipboardData.files[0];
        if (pasted && filesOn) {
          e.preventDefault();
          onPick(pasted);
        }
      }}
    >
      {(file || reading) && (
        <div className="space-y-1.5 motion-safe:animate-as-rise" data-testid="assistant-file">
          <div className="flex items-center gap-2 rounded-control border border-line bg-tint px-2 py-1.5">
            {reading ? (
              <LoaderCircle aria-hidden className="size-8 flex-none p-1.5 text-brand motion-safe:animate-spin" />
            ) : file?.preview ? (
              <img src={file.preview} alt="" className="size-8 flex-none rounded-sm object-cover motion-safe:animate-as-pop" />
            ) : (
              <FileText aria-hidden className="size-8 flex-none p-1 text-brand motion-safe:animate-as-pop" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{reading ? "Opening your file…" : file?.attachment.name}</p>
              {!reading && <p className="truncate text-xs text-muted">{file?.note}</p>}
            </div>
            {!reading && (
              <button type="button" aria-label="Remove file" onClick={onRemove} className={cn("rounded-control p-1 text-muted hover:bg-panel hover:text-ink", focusRing)}>
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-muted">Sent to an outside AI service to be read. Not saved, and no data is entered.</p>
          {questions.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="assistant-file-questions">
              {questions.map((q, i) => (
                <span key={q} style={{ animationDelay: `${i * 60}ms` }} className="motion-safe:animate-as-rise">
                  <Button variant="secondary" size="sm" onClick={() => onQuestion(q)}>
                    {q}
                  </Button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <Textarea
        label="Your question"
        hideLabel
        rows={2}
        value={draft}
        onChange={onDraft}
        placeholder={file ? "Ask about this file" : "Ask how to do something in ESGLite"}
        error={tooLong ? `Keep it under ${ASSISTANT_MAX_QUESTION_CHARS.toLocaleString("en")} characters.` : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
        data-testid="assistant-input"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          {filesOn && (
            <>
              <input
                ref={picker}
                type="file"
                hidden
                data-testid="assistant-file-input"
                onChange={(e) => {
                  onPick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="Attach a file"
                title="Attach a file"
                onClick={() => picker.current?.click()}
                disabled={reading}
                className={cn("flex-none rounded-control p-1.5 text-muted transition-[scale,color] hover:bg-tint hover:text-ink active:scale-90 disabled:opacity-50 motion-safe:hover:-rotate-12", focusRing)}
              >
                <Paperclip aria-hidden className="size-4" />
              </button>
            </>
          )}
          <p className="text-xs text-muted">AI answers can be wrong. Check anything important with your Manager or Admin.</p>
        </div>
        <Button type="submit" size="sm" loading={busy} disabled={(!draft.trim() && !file) || tooLong || reading} icon={<SendHorizontal aria-hidden className="size-3.5" />}>
          Send
        </Button>
      </div>
    </form>
  );
}
