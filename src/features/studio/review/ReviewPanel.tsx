// DS-13 · the review panel beside the canvas (05-ux S9): Comments (threads
// with @mentions, replies, "Assign as task", tick done, resolve, "My tasks",
// "Show resolved") and Data changes (drift: typed text written against
// figures that have changed, with "Mark as checked" and Go to). The top bar's
// "Comments" button and C + click open it; a rail drawer or the checks panel
// replaces it.
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CornerDownRight, MapPin, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import type { ReportComment, StudioPerson } from "../../../lib/studio/contracts";
import { Avatar, Badge, Button, EmptyState, SegmentedControl, SkeletonText, cn, focusRing } from "../../../ui";
import { timeAgo } from "../../../ui/timeAgo";
import { useEditor } from "../editor/EditorContext";
import { useSafeToast } from "../share/useSafeToast";
import { closeChecks, useChecksState } from "../checks/store";
import { dsError } from "../share/api";
import { assignTask, deleteComment, patchComment, postComment, setTaskDone, useComments, useDrift, useMyTasks, usePeople, useReviewMutation } from "./api";
import { MentionInput } from "./MentionInput";
import { markChecked, mentionParts, mentionedIds, openDrift, threadsOf, type CommentFilter, type Thread } from "./logic";
import { closeReview, setReviewState, useReviewState, type DraftPin } from "./store";

/** Shown next to the drawer while open. */
export function ReviewPanelHost() {
  const ed = useEditor();
  const { open } = useReviewState(ed.docId);
  const checks = useChecksState(ed.docId);
  const drawer = ed.ui.drawer;
  const prevDrawer = useRef(drawer);
  // A rail drawer replaces the panel.
  useEffect(() => {
    if (drawer && drawer !== prevDrawer.current && open) closeReview(ed.docId);
    prevDrawer.current = drawer;
  }, [drawer, open, ed.docId]);
  // The checks panel and this one share the spot: the newer one wins.
  const wasChecks = useRef(checks.open);
  useEffect(() => {
    if (checks.open && !wasChecks.current && open) closeReview(ed.docId);
    wasChecks.current = checks.open;
  }, [checks.open, open, ed.docId]);
  if (!open) return null;
  return <ReviewPanel />;
}

export function ReviewPanel() {
  const ed = useEditor();
  const { tab } = useReviewState(ed.docId);
  const drift = useDrift(ed.docId);
  const changes = openDrift(ed.doc, drift.data).length;
  useEffect(() => {
    closeChecks(ed.docId);
  }, [ed.docId]);
  return (
    <aside className="flex w-[380px] flex-none flex-col border-r border-line bg-panel" aria-label="Review" data-testid="review-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <SegmentedControl
          size="sm"
          label="Review"
          value={tab}
          onChange={(v) => setReviewState(ed.docId, { tab: v })}
          options={[
            { value: "comments", label: "Comments" },
            { value: "changes", label: changes ? `Data changes (${changes})` : "Data changes" },
          ]}
        />
        <div className="flex-1" />
        <button type="button" aria-label="Close review" onClick={() => closeReview(ed.docId)} className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}>
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {tab === "comments" ? <CommentsTab /> : <ChangesTab />}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function CommentsTab() {
  const ed = useEditor();
  const { focus, pin } = useReviewState(ed.docId);
  const { role } = useAuth();
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const people = usePeople(ed.docId);
  const comments = useComments(ed.docId, showResolved);
  const mine = useMyTasks(ed.docId, filter === "mine");
  const pageOrder = useMemo(() => ed.doc.pages.map((p) => p.id), [ed.doc.pages]);
  const list = filter === "mine" ? mine.data : comments.data;
  // My tasks: the open task comments assigned to me (a reply task shows on its own).
  const threads = useMemo(() => threadsOf(list ?? [], pageOrder), [list, pageOrder]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-thread="${focus}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
    el?.focus();
  }, [focus, comments.data]);

  const loading = filter === "mine" ? mine.isPending : comments.isPending;
  const failed = filter === "mine" ? mine.isError : comments.isError;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <SegmentedControl
          size="sm"
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "mine", label: "My tasks" },
          ]}
        />
        <div className="flex-1" />
        {filter === "all" && (
          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-brand" />
            Show resolved
          </label>
        )}
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3" data-testid="comment-threads">
        {loading ? (
          <SkeletonText lines={4} />
        ) : failed ? (
          <EmptyState variant="error" title="Comments couldn't load." action={<Button size="sm" onClick={() => void (filter === "mine" ? mine.refetch() : comments.refetch())}>Try again</Button>} />
        ) : threads.length === 0 ? (
          <EmptyState title={filter === "mine" ? "No open tasks for you." : "No comments yet."} description={filter === "mine" ? undefined : "Press C and click on a page to comment on a spot, or write below."} />
        ) : (
          threads.map((t) => <ThreadCard key={t.root.id} thread={t} people={people.data ?? []} focused={focus === t.root.id} canDeleteAny={role === "Manager" || role === "Superadmin"} />)
        )}
      </div>
      <NewComment pin={pin} people={people.data ?? []} />
    </div>
  );
}

function Body({ c }: { c: ReportComment }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-ink">
      {mentionParts(c.body, c.mentionNames).map((p, i) =>
        p.mention ? (
          <span key={i} className="rounded-chip bg-brand-50 px-0.5 font-medium text-brand-text">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

function placeOf(pages: { id: string; name: string }[], c: ReportComment): string {
  const i = pages.findIndex((p) => p.id === c.pageId);
  return i < 0 ? "A page that was removed" : `Page ${i + 1}${pages[i].name ? ` · ${pages[i].name}` : ""}`;
}

function ThreadCard({ thread, people, focused, canDeleteAny }: { thread: Thread; people: StudioPerson[]; focused: boolean; canDeleteAny: boolean }) {
  const ed = useEditor();
  const { user } = useAuth();
  const me = typeof user?.user_id === "number" ? (user.user_id as number) : null;
  const toast = useSafeToast();
  const [reply, setReply] = useState("");
  const [picked, setPicked] = useState<StudioPerson[]>([]);
  const [replying, setReplying] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const { root, replies } = thread;
  const fail = (err: unknown) => toast({ title: dsError(err).message ?? "That didn't work. Try again.", tone: "bad" });
  const resolve = useReviewMutation(ed.docId, (resolved: boolean, cid) => patchComment(root.id, { resolved }, cid));
  const send = useReviewMutation(ed.docId, (body: string, cid) => postComment(ed.docId, { pageId: root.pageId, parentId: root.id, body, mentions: mentionedIds(body, picked) }, cid));
  const task = useReviewMutation(ed.docId, (a: { id: number; assigneeId: number | null }, cid) => assignTask(a.id, a.assigneeId, cid));
  const done = useReviewMutation(ed.docId, (a: { id: number; done: boolean }, cid) => setTaskDone(a.id, a.done, cid));
  const remove = useReviewMutation(ed.docId, (id: number, cid) => deleteComment(id, cid));

  const goTo = () => {
    const page = ed.doc.pages.find((p) => p.id === root.pageId);
    if (!page) return;
    ed.setPage(page.id);
    if (root.elementId && page.kind === "freeform" && page.elements.some((e) => e.id === root.elementId)) ed.select([root.elementId], page.id);
  };

  const row = (c: ReportComment, isRoot: boolean) => (
    <div key={c.id} className={cn("flex gap-2", !isRoot && "pl-6")}>
      {!isRoot && <CornerDownRight aria-hidden className="mt-1 size-3.5 flex-none text-muted" />}
      <Avatar name={c.authorName} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-xs font-semibold text-ink">{c.authorName}</span>
          <span className="text-[11px] text-muted">{timeAgo(c.createdAt)}</span>
          <div className="flex-1" />
          {(c.authorId === me || canDeleteAny) && (
            <button type="button" aria-label="Delete comment" onClick={() => remove.mutate(c.id, { onError: fail })} className={cn("rounded-chip p-0.5 text-muted hover:text-bad", focusRing)}>
              <Trash2 aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
        <Body c={c} />
        {c.taskAssigneeId !== null && (
          <label className={cn("mt-1 inline-flex items-center gap-1.5 rounded-chip border border-line px-1.5 py-0.5 text-xs", c.taskDoneAt ? "text-muted line-through" : "text-ink")} data-testid={`task-${c.id}`}>
            <input type="checkbox" className="accent-brand" checked={!!c.taskDoneAt} onChange={(e) => done.mutate({ id: c.id, done: e.target.checked }, { onError: fail })} aria-label={`Task for ${c.taskAssigneeName}: done`} />
            Task · {c.taskAssigneeName}
          </label>
        )}
      </div>
    </div>
  );

  return (
    <article
      tabIndex={-1}
      data-thread={root.id}
      aria-label={`Comment by ${root.authorName}`}
      className={cn("flex flex-col gap-2 rounded-card border bg-panel p-3", focused ? "border-brand ring-1 ring-brand" : "border-line", root.resolvedAt && "opacity-70")}
    >
      <button type="button" onClick={goTo} className={cn("flex items-center gap-1 self-start text-[11px] text-muted hover:text-ink", focusRing)}>
        <MapPin aria-hidden className="size-3" />
        {placeOf(ed.doc.pages, root)}
        {root.elementId ? " · on an element" : ""}
      </button>
      {row(root, true)}
      {replies.map((r) => row(r, false))}
      {root.resolvedAt && <p className="text-[11px] text-muted">Resolved{root.resolvedByName ? ` by ${root.resolvedByName}` : ""}</p>}
      {replying && (
        <div className="flex flex-col gap-1.5">
          <MentionInput label="Reply" placeholder="Reply… @ to mention" value={reply} onChange={setReply} onPick={(p) => setPicked((x) => [...x, p])} people={people} rows={2} autoFocus onSubmit={() => submitReply()} />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!reply.trim()} loading={send.isPending} onClick={() => submitReply()}>
              Send reply
            </Button>
          </div>
        </div>
      )}
      {assigning && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Assign to">
          {people.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={root.taskAssigneeId === p.id ? "primary" : "secondary"}
              onClick={() =>
                task.mutate(
                  { id: root.id, assigneeId: p.id },
                  {
                    onSuccess: () => {
                      setAssigning(false);
                      toast({ title: `Task assigned to ${p.name}`, tone: "good" });
                    },
                    onError: fail,
                  },
                )
              }
            >
              {p.name}
            </Button>
          ))}
          {root.taskAssigneeId !== null && (
            <Button size="sm" variant="ghost" onClick={() => task.mutate({ id: root.id, assigneeId: null }, { onSuccess: () => setAssigning(false), onError: fail })}>
              Not a task
            </Button>
          )}
        </div>
      )}
      {!root.resolvedAt ? (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
            Reply
          </Button>
          <Button size="sm" variant="ghost" icon={<UserPlus aria-hidden className="size-3.5" />} onClick={() => setAssigning((a) => !a)}>
            {root.taskAssigneeId ? "Reassign" : "Assign as task"}
          </Button>
          <Button size="sm" variant="ghost" icon={<CheckCircle2 aria-hidden className="size-3.5" />} onClick={() => resolve.mutate(true, { onError: fail })}>
            Resolve
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden className="size-3.5" />} className="self-start" onClick={() => resolve.mutate(false, { onError: fail })}>
          Reopen
        </Button>
      )}
    </article>
  );

  function submitReply() {
    if (!reply.trim()) return;
    send.mutate(reply.trim(), {
      onSuccess: () => {
        setReply("");
        setPicked([]);
        setReplying(false);
      },
      onError: fail,
    });
  }
}

function NewComment({ pin, people }: { pin: DraftPin | null; people: StudioPerson[] }) {
  const ed = useEditor();
  const toast = useSafeToast();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<StudioPerson[]>([]);
  const [assignee, setAssignee] = useState<number | null>(null);
  const pageId = pin?.pageId ?? ed.page?.id ?? ed.ui.pageId ?? ed.doc.pages[0]?.id;
  const pageIndex = ed.doc.pages.findIndex((p) => p.id === pageId);
  const send = useReviewMutation(ed.docId, (body: string, cid) =>
    postComment(ed.docId, { pageId: pageId as string, elementId: pin?.elementId ?? null, x: pin?.x ?? null, y: pin?.y ?? null, body, mentions: mentionedIds(body, picked), taskAssigneeId: assignee }, cid),
  );
  const submit = () => {
    if (!text.trim() || !pageId) return;
    send.mutate(text.trim(), {
      onSuccess: (c) => {
        setText("");
        setPicked([]);
        setAssignee(null);
        setReviewState(ed.docId, { pin: null, focus: c.id });
      },
      onError: (err) => toast({ title: dsError(err).message ?? "The comment couldn't be saved. Try again.", tone: "bad" }),
    });
  };
  return (
    <div className="flex flex-col gap-1.5 border-t border-line p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <MapPin aria-hidden className="size-3" />
        <span className="flex-1 truncate">{pageIndex < 0 ? "No page" : `Page ${pageIndex + 1}${pin ? (pin.elementId ? " · on the element you clicked" : " · at the spot you clicked") : ""}`}</span>
        {pin ? (
          <button type="button" className={cn("text-[11px] underline", focusRing)} onClick={() => setReviewState(ed.docId, { pin: null })}>
            Clear spot
          </button>
        ) : (
          <button type="button" className={cn("text-[11px] underline", focusRing)} title="Press C, then click on the page" onClick={() => ed.setCommentMode(true)} data-testid="pick-spot">
            Pick a spot (C)
          </button>
        )}
      </div>
      <MentionInput label="New comment" placeholder="Add a comment… @ to mention" value={text} onChange={setText} onPick={(p) => setPicked((x) => [...x, p])} people={people} autoFocus={!!pin} onSubmit={submit} />
      <div className="flex items-center gap-1.5">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted">
          <span className="whitespace-nowrap">Assign as task</span>
          <select aria-label="Assign as task" value={assignee ?? ""} onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : null)} className={cn("h-8 min-w-0 flex-1 rounded-control border border-line bg-panel px-1.5 text-xs text-ink", focusRing)}>
            <option value="">No</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="primary" disabled={!text.trim() || !pageId} loading={send.isPending} onClick={submit}>
          Comment
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data changes (drift)
// ---------------------------------------------------------------------------

function ChangesTab() {
  const ed = useEditor();
  const drift = useDrift(ed.docId);
  const items = openDrift(ed.doc, drift.data);
  const goTo = (pageId: string, elementId: string) => {
    ed.setPage(pageId);
    ed.select([elementId], pageId);
  };
  if (drift.isPending) return <SkeletonText lines={4} className="p-4" />;
  if (drift.isError)
    return (
      <div className="p-4">
        <EmptyState variant="error" title="Data changes couldn't load." action={<Button size="sm" onClick={() => void drift.refetch()}>Try again</Button>} />
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3" data-testid="drift-list">
      <p className="text-xs text-muted">Charts, tiles and data chips update by themselves. These texts were written before the data changed: read them and mark them as checked.</p>
      {items.length === 0 ? (
        <EmptyState title="No data changes to review." description="Every text matches the approved data it was written against." />
      ) : (
        items.map((d) => (
          <article key={d.elementId} className="flex flex-col gap-1.5 rounded-card border border-line border-l-4 border-l-warn bg-panel p-3" aria-label={`Data change on ${d.pageName || "a page"}`}>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <MapPin aria-hidden className="size-3" />
              {d.pageName || "Page"}
              <Badge tone="warn">Data changed</Badge>
            </div>
            <p className="line-clamp-3 text-sm text-ink">“{d.text}”</p>
            <ul className="flex flex-col gap-0.5 text-xs">
              {d.figures.map((f) => (
                <li key={f.elementId} className="text-muted">
                  {f.label}: <span className="text-ink">{f.before ?? "earlier value not recorded"}</span> → <span className="font-semibold text-ink">{f.after}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="primary" disabled={ed.readOnly} onClick={() => ed.commit(markChecked(ed.doc, [d.elementId], drift.data!.dataHash), "Mark as checked")}>
                Mark as checked
              </Button>
              <Button size="sm" variant="ghost" onClick={() => goTo(d.pageId, d.elementId)}>
                Go to
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={ed.readOnly}
                onClick={() => {
                  goTo(d.pageId, d.elementId);
                  ed.openDrawer("ai");
                }}
              >
                Ask AI to update
              </Button>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
