import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { Button, Callout, DateField, Drawer, EmptyState, Select, TextField, formatDate, useToast } from "../../../ui";
import { EVENT_KINDS, type EventKind, type EventRef } from "../../../lib/insights/contracts";
import { EVENT_KIND_LABEL } from "../../../lib/insights/labels";
import type { EventsRange } from "../../../services/insightsService";
import { useCreateInsightsEvent, useDeleteInsightsEvent, useInsightsEvents, useInsightsSites, useUpdateInsightsEvent } from "../api";
import { type EventDraft, type EventErrors, draftFrom, emptyDraft, eventSaveError, labelCounter, toCreateBody, toPatchBody, validateEvent } from "./eventsForm";

export interface EventsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The events to list (`?from=&to=`); all when left out. */
  range?: EventsRange;
  /** Pre-filled date for a new event. */
  defaultDate?: string;
}

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; event: EventRef };

const KIND_OPTIONS = EVENT_KINDS.map((k) => ({ value: k, label: EVENT_KIND_LABEL[k] }));

/**
 * IN-4 · Events and annotations (05-ux §4 C): list, add, edit and delete the
 * moments that explain a jump. Opened from Pathway (and Decoupling). Every
 * Insights role (Manager, Admin, Superadmin) may add; the server decides who
 * may edit or delete and says so in the form.
 */
export function EventsDrawer({ open, onClose, range = {}, defaultDate = "" }: EventsDrawerProps) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const events = useInsightsEvents(range, { enabled: open });
  const sites = useInsightsSites();
  const siteName = (id: number | null) => (id === null ? "Whole company" : (sites.data?.sites.find((s) => s.site_id === id)?.name ?? `Site ${id}`));

  const close = () => {
    setMode({ kind: "list" });
    onClose();
  };

  // Switching between the list and the form swaps the drawer's content: keep focus inside it (so Esc still closes).
  const body = useRef<HTMLDivElement>(null);
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    if (open) body.current?.focus();
  }, [mode.kind, open]);

  const listing = mode.kind === "list";
  return (
    <Drawer
      open={open}
      onClose={close}
      size="sm"
      title={mode.kind === "add" ? "Add an event" : mode.kind === "edit" ? "Edit event" : "Events"}
      subtitle={listing ? "Moments that explain a jump: a new plant, a solar roof, a method change." : undefined}
      headerActions={
        listing ? (
          <Button size="sm" variant="primary" icon={<CalendarPlus aria-hidden className="size-4" />} onClick={() => setMode({ kind: "add" })}>
            Add event
          </Button>
        ) : undefined
      }
      loading={listing && events.isPending}
      error={listing && events.isError ? "Couldn't load the events." : null}
      onRetry={() => void events.refetch()}
    >
      <div ref={body} tabIndex={-1} className="outline-none">
        {mode.kind === "list" ? (
          <EventList events={events.data ?? []} siteName={siteName} onEdit={(event) => setMode({ kind: "edit", event })} onAdd={() => setMode({ kind: "add" })} />
        ) : (
          <EventForm
            key={mode.kind === "edit" ? mode.event.id : "new"}
            event={mode.kind === "edit" ? mode.event : null}
            defaultDate={defaultDate}
            sites={sites.data?.sites ?? []}
            sitesLoading={sites.isPending}
            onDone={() => setMode({ kind: "list" })}
          />
        )}
      </div>
    </Drawer>
  );
}

function EventList({ events, siteName, onEdit, onAdd }: { events: EventRef[]; siteName: (id: number | null) => string; onEdit: (e: EventRef) => void; onAdd: () => void }) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const del = useDeleteInsightsEvent();
  const { toast } = useToast();
  const [failed, setFailed] = useState<string | null>(null);

  if (!events.length)
    return (
      <EmptyState
        title="No events yet."
        description="Add the moments that explain a jump in your figures. They show on the pathway and decoupling charts."
        action={
          <Button variant="primary" onClick={onAdd}>
            Add event
          </Button>
        }
      />
    );

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const remove = (e: EventRef) => {
    setFailed(null);
    del.mutate(e.id, {
      onSuccess: () => {
        setConfirming(null);
        toast({ title: "Event deleted", description: e.label, tone: "good" });
      },
      onError: (err) => setFailed(eventSaveError(err).form),
    });
  };

  return (
    <ul className="divide-y divide-line" data-testid="events-list">
      {sorted.map((e) => (
        <li key={e.id} className="py-3" data-testid="event-row">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium text-ink">{e.label}</p>
              <p className="mt-0.5 text-xs text-muted">
                {formatDate(e.date)} · {EVENT_KIND_LABEL[e.kind] ?? e.kind} · {siteName(e.site_id)}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Edit ${e.label}`} onClick={() => onEdit(e)} />
              <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden className="size-4" />} aria-label={`Delete ${e.label}`} onClick={() => setConfirming(e.id)} />
            </div>
          </div>
          {confirming === e.id && (
            <div role="group" aria-label={`Delete ${e.label}?`} className="mt-2 rounded-control border border-line bg-tint p-3 text-sm text-ink" data-testid="event-delete-confirm">
              <p>Delete “{e.label}”? It comes off every chart.</p>
              {failed && <p className="mt-1 text-xs text-bad">{failed}</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="danger" loading={del.isPending} onClick={() => remove(e)}>
                  Delete
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirming(null)} autoFocus>
                  Keep
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function EventForm({
  event,
  defaultDate,
  sites,
  sitesLoading,
  onDone,
}: {
  event: EventRef | null;
  defaultDate: string;
  sites: { site_id: number; name: string }[];
  sitesLoading: boolean;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() => (event ? draftFrom(event) : emptyDraft(defaultDate)));
  const [errors, setErrors] = useState<EventErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateInsightsEvent();
  const update = useUpdateInsightsEvent();
  const { toast } = useToast();
  const saving = create.isPending || update.isPending;
  const put = (patch: Partial<EventDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as keyof EventErrors];
      return next;
    });
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const found = validateEvent(draft);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const onError = (err: unknown) => {
      const e = eventSaveError(err);
      setFormError(e.form);
      setErrors(e.fields);
    };
    if (event) {
      const patch = toPatchBody(event, draft);
      if (!Object.keys(patch).length) return onDone();
      update.mutate(
        { id: event.id, patch },
        {
          onSuccess: () => {
            toast({ title: "Event updated", description: draft.label.trim(), tone: "good" });
            onDone();
          },
          onError,
        },
      );
    } else {
      create.mutate(toCreateBody(draft), {
        onSuccess: () => {
          toast({ title: "Event added", description: draft.label.trim(), tone: "good" });
          onDone();
        },
        onError,
      });
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="event-form">
      {formError && (
        <Callout tone="warn" title="Not saved">
          {formError}
        </Callout>
      )}
      <TextField
        label="Name"
        required
        value={draft.label}
        onChange={(label) => put({ label })}
        error={errors.label}
        help={<span data-testid="event-label-counter">{labelCounter(draft.label)} characters</span>}
        placeholder="Rooftop solar at Pune"
        autoFocus
      />
      <Select<EventKind> label="Kind" required value={draft.kind} onChange={(kind) => put({ kind })} options={KIND_OPTIONS} placeholder="Choose a kind" error={errors.kind} />
      <DateField label="Date" required value={draft.date} onChange={(date) => put({ date })} error={errors.date} />
      <Select<number>
        label="Site"
        value={draft.site_id}
        onChange={(site_id) => put({ site_id })}
        options={sites.map((s) => ({ value: s.site_id, label: s.name }))}
        placeholder="Whole company"
        loading={sitesLoading}
        error={errors.site_id}
        help="Leave as Whole company when it affects every site."
      />
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" variant="primary" loading={saving}>
          {event ? "Save changes" : "Add event"}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
