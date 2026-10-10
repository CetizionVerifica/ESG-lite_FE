import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { Brand } from "../../../services/brandService";
import { Avatar, Badge, Button, Callout, EmptyState, FileDrop, Modal, TextField, cn, focusRing, useToast } from "../../../ui";
import { errorMessage, useMappingCount, useSaveGuideline, useSaveThreshold, useSendInvite, useThreshold } from "../api";
import { type ClientRow, parseThreshold, personName } from "../logic";
import { GUIDELINE_MAX, GUIDELINE_TYPES } from "../onboarding";
import { ClientLogo, StatusBadge, ThemeSwatch } from "./bits";

export function GoLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-1 rounded-chip text-sm font-medium text-brand-text hover:underline", focusRing)}>
      {children} <ExternalLink aria-hidden className="size-3.5" />
    </Link>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children || <span className="text-muted">Not set</span>}</dd>
    </div>
  );
}

export function OverviewTab({ row }: { row: ClientRow }) {
  return (
    <section className="space-y-4" aria-label="Company details">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Company name">{row.name}</Fact>
        <Fact label="Contact person">{row.contact_person}</Fact>
        <Fact label="Email">
          {row.email && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {row.email}
              {row.isEmailVerified ? <Badge tone="good">Verified</Badge> : <Badge>Not verified</Badge>}
            </span>
          )}
        </Fact>
        <Fact label="Phone">{row.phone_number}</Fact>
        <Fact label="Address">{row.address}</Fact>
        <Fact label="Industry">{row.industry}</Fact>
        <Fact label="Region">{row.region}</Fact>
        <Fact label="Employee range">{row.employee_range}</Fact>
        <Fact label="CIN">{row.cin_number}</Fact>
        <Fact label="Status">
          <StatusBadge active={row.active} />
        </Fact>
        <Fact label="ESG-Mitra access">{row.esgMitraAccess ? "On" : "Off"}</Fact>
        <Fact label="Subscription">{row.subscription_id}</Fact>
      </dl>
    </section>
  );
}

/** Where a tab's list query stands; tabs show a loading line, or an error with a retry, until it's loaded. */
export type ListLoad = { loading: boolean; failed: boolean; retry: () => void };

function LoadGate({ load, what }: { load: ListLoad; what: string }) {
  if (load.failed) return <EmptyState compact variant="error" title={`Couldn't load ${what}.`} action={<Button onClick={load.retry}>Try again</Button>} />;
  return (
    <p role="status" className="text-sm text-muted">
      Loading {what}…
    </p>
  );
}

export function SitesTab({ row, load }: { row: ClientRow; load: ListLoad }) {
  if (load.loading || load.failed) return <LoadGate load={load} what="this client's sites" />;
  return (
    <section className="space-y-3" aria-label="Sites">
      {row.sites.length === 0 ? (
        <EmptyState compact title="No sites yet." description="Add the first site so people can start entering data." />
      ) : (
        <ul className="divide-y divide-line rounded-control border border-line">
          {[...row.sites]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <li key={s.site_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Link to={`/setup/sites?client=${row.company_id}&open=${s.site_id}`} className={cn("min-w-0 flex-1 truncate font-medium text-ink hover:underline", focusRing)}>
                  {s.name}
                </Link>
                <span className="truncate text-xs text-muted">{s.country?.name ?? ""}</span>
              </li>
            ))}
        </ul>
      )}
      <GoLink to={`/setup/sites?client=${row.company_id}`}>Manage sites</GoLink>
    </section>
  );
}

export function PeopleTab({ row, load }: { row: ClientRow; load: ListLoad }) {
  const invite = useSendInvite();
  const { toast } = useToast();
  const sendInvite = (userId: number, email: string) =>
    invite.mutate(userId, {
      onSuccess: () => toast({ title: `Invite sent to ${email}`, tone: "good" }),
      onError: (e) => toast({ title: "Invite not sent", description: errorMessage(e, "Try again."), tone: "bad" }),
    });
  if (load.loading || load.failed) return <LoadGate load={load} what="the people at this client" />;
  return (
    <section className="space-y-3" aria-label="People">
      {row.users.length === 0 ? (
        <EmptyState compact title="No people yet." description="Add users and managers to this client's sites." />
      ) : (
        <ul className="divide-y divide-line rounded-control border border-line">
          {[...row.users]
            .sort((a, b) => personName(a).localeCompare(personName(b)))
            .map((u) => (
              <li key={u.user_id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar size="sm" name={personName(u)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{personName(u)}</span>
                  <span className="block truncate text-xs text-muted">{u.email}</span>
                </span>
                {u.role && u.role !== "User" && <Badge>{u.role === "Admin" ? "Company admin" : u.role}</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Send ${personName(u)} an invite`}
                  loading={invite.isPending && invite.variables === u.user_id}
                  disabled={invite.isPending}
                  onClick={() => sendInvite(u.user_id, u.email)}
                >
                  Send invite
                </Button>
              </li>
            ))}
        </ul>
      )}
      <p className="text-xs text-muted">An invite emails a link to choose a password. It works for 7 days, and their current password keeps working until they choose a new one.</p>
      <GoLink to={`/setup/users?client=${row.company_id}`}>Manage people in Users</GoLink>
    </section>
  );
}

export function BrandTab({ row, brand, raw, loading }: { row: ClientRow; brand: Brand | undefined; raw: Brand | undefined; loading: boolean }) {
  return (
    <section className="space-y-4" aria-label="Brand theme">
      {loading ? (
        <p className="text-sm text-muted">Loading brand…</p>
      ) : brand ? (
        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact label="Logo">
            <ClientLogo name={row.name} url={brand.logoUrl} size="lg" />
          </Fact>
          <Fact label="Colours">
            <ThemeSwatch brand={brand} />
          </Fact>
          <Fact label="Default look">{brand.defaultLook ? brand.defaultLook[0].toUpperCase() + brand.defaultLook.slice(1) : "Classic"}</Fact>
        </dl>
      ) : (
        <p className="text-sm text-muted">This client uses the PlanetPulse theme. Set its logo and colours to give its people their own look.</p>
      )}
      <GoLink to={`/clients/${row.company_id}/brand`}>{brand ? "Open brand theme" : "Set up brand theme"}</GoLink>
      {raw && <GuidelineSection companyId={row.company_id} url={raw.guidelineUrl ?? null} name={raw.guidelineName ?? null} />}
    </section>
  );
}

/** The client's colour-guideline file: open it, replace it or remove it. */
function GuidelineSection({ companyId, url, name }: { companyId: number; url: string | null; name: string | null }) {
  const save = useSaveGuideline(companyId);
  const { toast } = useToast();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const run = (file: File | null) =>
    save.mutate(file, {
      onSuccess: () => {
        setConfirmRemove(false);
        toast({ title: file ? "Colour guideline saved" : "Colour guideline removed", tone: "good" });
      },
    });

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <h3 className="text-sm font-semibold text-ink">Colour guideline</h3>
      {url ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-brand-text hover:underline", focusRing)}>
            <span className="truncate">{name || "Open colour guideline"}</span>
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
          </a>
          <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)} disabled={save.isPending}>
            Remove
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">No colour guideline yet.</p>
      )}
      <FileDrop
        label={url ? "Replace the colour guideline" : "Upload a colour guideline"}
        help="PDF, PNG, JPG or WEBP, up to 10 MB."
        accept={GUIDELINE_TYPES}
        maxSize={GUIDELINE_MAX}
        multiple={false}
        maxFiles={1}
        disabled={save.isPending}
        items={[]}
        onAdd={(files) => files[0] && run(files[0])}
        onRemove={() => undefined}
      />
      {save.isPending && (
        <p role="status" className="text-sm text-muted">
          Saving…
        </p>
      )}
      {save.error && !confirmRemove && (
        <Callout tone="warn" title="The colour guideline wasn't saved">
          {errorMessage(save.error, "Try again.")}
        </Callout>
      )}
      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        tone="destructive"
        title="Remove the colour guideline?"
        description="The file is deleted from storage. You can upload a new one later."
        primaryAction={{ label: "Remove", onClick: () => run(null), loading: save.isPending }}
      >
        {save.error && <p className="text-sm text-bad">{errorMessage(save.error, "Couldn't remove it. Try again.")}</p>}
      </Modal>
    </div>
  );
}

export function ThresholdTab({ companyId }: { companyId: number }) {
  const { toast } = useToast();
  const threshold = useThreshold(companyId);
  const save = useSaveThreshold(companyId);
  const current = threshold.data ?? null;
  const [raw, setRaw] = useState<string | null>(null);
  const shown = raw ?? (current ? String(Number(current.threshold_percentage)) : "");
  const parsed = parseThreshold(shown);
  const [touched, setTouched] = useState(false);

  if (threshold.isPending) return <p className="text-sm text-muted">Loading threshold…</p>;
  if (threshold.error) return <EmptyState compact variant="error" title="Couldn't load the threshold." action={<Button onClick={() => void threshold.refetch()}>Try again</Button>} />;

  const unchanged = !!current && "value" in parsed && parsed.value === Number(current.threshold_percentage);
  const submit = () => {
    setTouched(true);
    if (!("value" in parsed)) return;
    save.mutate(
      { existing: current, value: parsed.value },
      {
        onSuccess: () => {
          setRaw(null);
          setTouched(false);
          toast({ title: `Threshold set to ${parsed.value}%`, tone: "good" });
        },
      },
    );
  };

  return (
    <section className="max-w-md space-y-3" aria-label="Threshold">
      <p className="text-sm text-muted">
        When a site's entries for a category move more than this from the previous period, Add data flags them. Allowed: 2 to 5%.
        {!current && " No value is set, so the default of 5% applies."}
      </p>
      {save.error && <Callout tone="warn" title="Couldn't save the threshold">{errorMessage(save.error, "Try again.")}</Callout>}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          className="w-40"
          label="Threshold (%)"
          inputMode="decimal"
          value={shown}
          onChange={setRaw}
          error={touched && "error" in parsed ? parsed.error : undefined}
        />
        <Button type="submit" variant="primary" loading={save.isPending} disabled={save.isPending || unchanged}>
          Save
        </Button>
      </form>
      <GoLink to={`/factors/thresholds?client=${companyId}`}>All thresholds</GoLink>
    </section>
  );
}

export function MappingsTab({ companyId }: { companyId: number }) {
  const count = useMappingCount(companyId);
  return (
    <section className="space-y-3" aria-label="Mappings">
      {count.isPending ? (
        <p className="text-sm text-muted">Loading mappings…</p>
      ) : count.error ? (
        <EmptyState compact variant="error" title="Couldn't load mappings." />
      ) : (
        <p className="text-sm text-ink">
          <span className="font-num font-semibold">{count.data}</span> of this client's own category names are mapped to ESGLite categories.
        </p>
      )}
      <GoLink to={`/factors/mappings?client=${companyId}`}>Open category mappings</GoLink>
    </section>
  );
}

export function DangerTab({ row, sites, onToggleActive, onDelete }: { row: ClientRow; sites: ListLoad; onToggleActive: () => void; onDelete: () => void }) {
  // The confirmation lists the sites that go with the client, so it waits for them.
  const blocker = sites.failed ? "Couldn't load its sites. Reload the page and try again." : sites.loading ? "Checking its sites…" : null;
  return (
    <section className="space-y-4" aria-label="Danger zone">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-line p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{row.active ? "Deactivate client" : "Reactivate client"}</h3>
          <p className="text-sm text-muted">
            {row.active
              ? "Its people can't sign in, and anyone signed in is stopped on their next action. Its data stays; nothing is deleted."
              : "Its people can sign in again."}
          </p>
        </div>
        <Button onClick={onToggleActive}>{row.active ? "Deactivate" : "Reactivate"}</Button>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-control border border-bad/40 p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Delete client</h3>
          <p className="text-sm text-muted">{blocker ??
              "Deletes the client with its sites, its people's accounts, brand theme and category mappings. Only a client with no reporting history can be deleted; deactivate one that has data. This can't be undone."}</p>
        </div>
        <Button variant="danger" onClick={onDelete} disabled={!!blocker}>
          Delete client
        </Button>
      </div>
    </section>
  );
}
