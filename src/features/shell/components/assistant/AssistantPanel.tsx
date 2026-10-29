import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useAssistantChat } from "../../../../lib/assistant/api";
import { ASSISTANT_MAX_QUESTION_CHARS } from "../../../../lib/assistant/contracts";
import { errorCopy, loadThread, requestFor, saveThread, starterQuestions, type ThreadTurn } from "../../../../lib/assistant/logic";
import { AiLabel, Button, Callout, Drawer, Textarea } from "../../../../ui";
import { AnswerText } from "./AnswerText";

/**
 * AS-1 · "Ask ESGLite": a chat drawer that answers how-to questions from
 * ESGLite's help articles (ESG-lite src/assistant). It sends the question, the
 * last turns and the page the person is on; it never sends or sees their data.
 * The thread lasts for the browser tab (sessionStorage).
 */
export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role, user } = useAuth();
  const userId = user?.user_id ?? null;
  const location = useLocation();
  const chat = useAssistantChat();
  const [thread, setThread] = useState<ThreadTurn[]>(() => loadThread(userId));
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState<{ question: string; message: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveThread(userId, thread), [userId, thread]);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView?.({ block: "end" });
  }, [open, thread.length, chat.isPending]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || chat.isPending) return;
    setFailed(null);
    const before = thread;
    setThread([...before, { role: "user", content: q }]);
    setDraft("");
    chat.mutate(requestFor(before, q, { path: location.pathname, title: document.title || undefined }), {
      onSuccess: (r) => setThread((t) => [...t, { role: "assistant", content: r.reply, sources: r.sources, answered: r.answered }]),
      onError: (e) => {
        // The question goes back in the box, so Try again sends it unchanged.
        setThread(before);
        setDraft(q);
        setFailed({ question: q, message: errorCopy(e) });
      },
    });
  };

  const clear = () => {
    setThread([]);
    setFailed(null);
    setDraft("");
  };

  const tooLong = draft.length > ASSISTANT_MAX_QUESTION_CHARS;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="sm"
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
        <form
          className="w-full space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tooLong) ask(draft);
          }}
        >
          <Textarea
            label="Your question"
            hideLabel
            rows={2}
            value={draft}
            onChange={setDraft}
            placeholder="Ask how to do something in ESGLite"
            error={tooLong ? `Keep it under ${ASSISTANT_MAX_QUESTION_CHARS.toLocaleString("en")} characters.` : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!tooLong) ask(draft);
              }
            }}
            data-testid="assistant-input"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">AI answers can be wrong. Check anything important with your Manager or Admin.</p>
            <Button type="submit" size="sm" loading={chat.isPending} disabled={!draft.trim() || tooLong}>
              Send
            </Button>
          </div>
        </form>
      }
    >
      <div className="space-y-4" data-testid="assistant-thread">
        {thread.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink">Ask how to do something in ESGLite. I answer from ESGLite's help articles. I can't see your company's data.</p>
            <div className="flex flex-col items-start gap-2">
              {starterQuestions(role).map((s) => (
                <Button key={s} variant="secondary" size="sm" onClick={() => ask(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {thread.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-8 rounded-control bg-tint px-3 py-2 text-sm text-ink" data-testid="assistant-question">
              {t.content}
            </div>
          ) : (
            <div key={i} className="space-y-2" data-testid="assistant-answer">
              <AnswerText text={t.content} onNavigate={onClose} />
              {!!t.sources?.length && (
                <p className="text-xs text-muted">
                  From:{" "}
                  {t.sources.map((s, j) => (
                    <span key={s.id}>
                      {j > 0 && " · "}
                      {s.path ? (
                        <Link to={s.path} onClick={onClose} className="text-accent underline underline-offset-2 hover:opacity-80">
                          {s.title}
                        </Link>
                      ) : (
                        s.title
                      )}
                    </span>
                  ))}
                </p>
              )}
            </div>
          ),
        )}
        {chat.isPending && (
          <p className="text-sm text-muted" role="status">
            Looking that up…
          </p>
        )}
        {failed && (
          <Callout
            tone="warn"
            action={
              <Button variant="ghost" size="sm" onClick={() => ask(failed.question)}>
                Try again
              </Button>
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
