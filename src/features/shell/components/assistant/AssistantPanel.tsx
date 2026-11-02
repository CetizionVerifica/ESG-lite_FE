import { useEffect, useRef, useState } from "react";
import { Paperclip, Sparkles, UploadCloud } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useAssistantChat, useAssistantFeedback } from "../../../../lib/assistant/api";
import { ASSISTANT_MAX_QUESTION_CHARS } from "../../../../lib/assistant/contracts";
import { prepareFile, type PreparedFile } from "../../../../lib/assistant/files";
import { DEFAULT_FILE_QUESTION, FILE_QUESTIONS, aiNote, canRetry, errorCopy, firstName, loadThread, requestFor, saveThread, starterQuestions, type ThreadTurn } from "../../../../lib/assistant/logic";
import { AiLabel, Button, Callout, Drawer } from "../../../../ui";
import { AnswerCard } from "./AnswerCard";
import { Composer } from "./Composer";
import { Thinking } from "./Thinking";

export interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  onBusy?: (busy: boolean) => void;
  onAnswer?: () => void;
  filesOn?: boolean;
  workOn?: boolean;
}

/** Chips rise one after another, a little later each. */
const stagger = (i: number) => ({ animationDelay: `${i * 60}ms` });

/**
 * AS-1 · "Ask ESGLite": a chat drawer that answers how-to questions from
 * ESGLite's help articles (ESG-lite src/assistant). It sends the question, the
 * last turns and the page the person is on, plus a file only when they attach
 * one. The thread lasts for the browser tab (sessionStorage); a file stays in
 * memory for follow-up questions and is never stored.
 */
export function AssistantPanel({ open, onClose, onBusy, onAnswer, filesOn = false, workOn = false }: AssistantPanelProps) {
  const { role, user } = useAuth();
  const userId = user?.user_id ?? null;
  const location = useLocation();
  const chat = useAssistantChat();
  const feedback = useAssistantFeedback();
  const [thread, setThread] = useState<ThreadTurn[]>(() => loadThread(userId));
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState<{ question: string; message: string; retry: boolean } | null>(null);
  const [file, setFile] = useState<PreparedFile | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** The quick questions go once the person has asked about the file. */
  const [fileAsked, setFileAsked] = useState(false);
  /** The answer still typing itself out, by its place in the thread. */
  const [fresh, setFresh] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollDown = () => endRef.current?.scrollIntoView?.({ block: "end" });

  useEffect(() => saveThread(userId, thread), [userId, thread]);
  useEffect(() => {
    if (open) scrollDown();
  }, [open, thread.length, chat.isPending]);

  const attach = async (picked: File | undefined) => {
    if (!picked || !filesOn) return;
    setReading(true);
    setFile(await prepareFile(picked));
    setFileAsked(false);
    setReading(false);
  };

  // A file dropped anywhere while the panel is open: without this the browser would navigate to it.
  useEffect(() => {
    if (!open || !filesOn) return;
    const carriesFile = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => {
      if (!carriesFile(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!carriesFile(e)) return;
      e.preventDefault();
      setDragging(false);
      void attach(e.dataTransfer?.files[0]);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attach reads only the props in this list
  }, [open, filesOn]);

  const ask = (question: string) => {
    const q = question.trim() || (file ? DEFAULT_FILE_QUESTION : "");
    if (!q || chat.isPending || reading) return;
    setFailed(null);
    const before = thread;
    setThread([...before, { role: "user", content: q, ...(file ? { file: { name: file.attachment.name, type: file.attachment.type } } : {}) }]);
    setDraft("");
    if (file) setFileAsked(true);
    onBusy?.(true);
    chat.mutate(requestFor(before, q, { path: location.pathname, title: document.title || undefined }, file?.attachment), {
      onSuccess: (r) => {
        setThread((t) => [...t, { role: "assistant", content: r.reply, sources: r.sources, answered: r.answered, followups: r.followups, callId: r.call_id, usedWork: r.used_work }]);
        setFresh(before.length + 1);
        onAnswer?.();
      },
      onError: (e) => {
        // The question goes back in the box, so Try again sends it unchanged.
        setThread(before);
        setDraft(q);
        setFileAsked(false);
        setFailed({ question: q, message: errorCopy(e), retry: canRetry(e) });
      },
      onSettled: () => onBusy?.(false),
    });
  };

  const clear = () => {
    setThread([]);
    setFailed(null);
    setDraft("");
    setFile(null);
    setFresh(-1);
  };

  const rate = (index: number, helpful: boolean) => {
    const callId = thread[index]?.callId;
    setThread((t) => t.map((turn, i) => (i === index ? { ...turn, helpful } : turn)));
    if (callId) feedback.mutate({ call_id: callId, helpful });
  };

  const tooLong = draft.length > ASSISTANT_MAX_QUESTION_CHARS;
  const lastAnswer = thread.length - 1;
  const name = firstName(user?.name);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="sm"
      panelClassName="motion-safe:animate-as-slide"
      title="Ask ESGLite"
      subtitle={<AiLabel text="Answers from ESGLite's help articles" ai />}
      headerActions={
        thread.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={clear} disabled={chat.isPending}>
            New conversation
          </Button>
        ) : undefined
      }
      footer={
        <Composer
          open={open}
          draft={draft}
          onDraft={setDraft}
          onSend={() => !tooLong && ask(draft)}
          busy={chat.isPending}
          tooLong={tooLong}
          filesOn={filesOn}
          file={file}
          reading={reading}
          onPick={(f) => void attach(f)}
          onRemove={() => setFile(null)}
          questions={file && !fileAsked && !draft ? FILE_QUESTIONS : []}
          onQuestion={ask}
          note={aiNote(role)}
        />
      }
    >
      <div className="relative min-h-full space-y-4" data-testid="assistant-thread">
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed border-brand bg-panel/90 text-sm font-medium text-ink motion-safe:animate-as-rise" data-testid="assistant-drop">
            <UploadCloud aria-hidden className="size-7 text-brand motion-safe:animate-as-float" />
            Drop your file to show me
          </div>
        )}
        {thread.length === 0 && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 pb-1 pt-3 text-center">
              <span aria-hidden className="inline-flex size-12 items-center justify-center rounded-full bg-tint text-brand motion-safe:animate-as-float">
                <Sparkles className="size-6 motion-safe:animate-as-twinkle" />
              </span>
              <p className="text-base font-semibold text-ink motion-safe:animate-as-rise">{name ? `Hi ${name}, what can I help with?` : "Hi, what can I help with?"}</p>
              <p className="text-sm text-muted motion-safe:animate-as-rise">
                {workOn
                  ? "Ask how to do something in ESGLite, or what's on your plate. I use ESGLite's help articles and a summary of your work."
                  : "Ask how to do something in ESGLite. I answer from ESGLite's help articles and can't see your company's data."}
                {filesOn && " You can also show me a file."}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              {starterQuestions(role, location.pathname, workOn).map((s, i) => (
                <span key={s} style={stagger(i + 1)} className="motion-safe:animate-as-rise">
                  <Button variant="secondary" size="sm" onClick={() => ask(s)}>
                    {s}
                  </Button>
                </span>
              ))}
            </div>
          </div>
        )}
        {thread.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className={`ml-8 rounded-control bg-tint px-3 py-2 text-sm text-ink ${i >= lastAnswer - 1 ? "motion-safe:animate-as-rise" : ""}`} data-testid="assistant-question">
              {t.file && (
                <p className="mb-1 flex items-center gap-1 text-xs text-muted" data-testid="assistant-question-file">
                  <Paperclip aria-hidden className="size-3 flex-none" />
                  <span className="truncate">{t.file.name}</span>
                </p>
              )}
              {t.content}
            </div>
          ) : (
            <AnswerCard
              key={i}
              turn={t}
              animate={i === fresh}
              last={i === lastAnswer && !chat.isPending}
              onDone={() => {
                setFresh(-1);
                requestAnimationFrame(scrollDown);
              }}
              onGrow={scrollDown}
              onNavigate={onClose}
              onRate={(helpful) => rate(i, helpful)}
              onFollowup={ask}
            />
          ),
        )}
        {chat.isPending && <Thinking hasFile={!!file} />}
        {failed && (
          <Callout
            tone="warn"
            action={
              failed.retry ? (
                <Button variant="ghost" size="sm" onClick={() => ask(failed.question)}>
                  Try again
                </Button>
              ) : undefined
            }
          >
            {failed.message}
          </Callout>
        )}
        <div ref={endRef} />
      </div>
    </Drawer>
  );
}
