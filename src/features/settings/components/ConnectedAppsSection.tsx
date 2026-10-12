import { useState } from "react";
import { Copy, Link2, Unplug } from "lucide-react";
import type { OauthGrant } from "../../../services/oauthService";
import { Button, Callout, EmptyState, Modal, Skeleton, cn, focusRing, formatDateTime, timeAgo, useToast } from "../../../ui";
import { useDisconnect, useGrants } from "../api";
import { serverMessage } from "../logic";
import { Section } from "./Section";

const SCOPE_LABEL: Record<string, string> = {
  "imports:read": "Read sites, categories and forms",
  "imports:write": "Create entries for review",
};

/** The connector URL with a copy button; the clipboard may be unavailable (http, iframe), so copying can fail quietly. */
function ConnectorUrl({ url }: { url: string }) {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Connector URL copied", tone: "good" });
    } catch {
      toast({ title: "Couldn't copy. Select the URL and copy it yourself." });
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 select-all break-all rounded-control bg-tint px-2.5 py-1.5 text-xs text-ink" aria-label="Connector URL">
        {url}
      </code>
      <Button size="sm" icon={<Copy aria-hidden className="size-3.5" />} onClick={() => void copy()}>
        Copy
      </Button>
    </div>
  );
}

function HowToConnect({ url }: { url: string }) {
  return (
    <div className="space-y-2 text-sm text-muted">
      <p>In Claude, open Settings → Connectors → Add custom connector, paste this URL and sign in with your ESGLite staff account.</p>
      <ConnectorUrl url={url} />
    </div>
  );
}

/** Settings → Connected apps (Superadmin): the apps allowed to act for this account, and how to add Claude. */
export function ConnectedAppsSection() {
  const grants = useGrants(true);
  const disconnect = useDisconnect();
  const { toast } = useToast();
  const [leaving, setLeaving] = useState<OauthGrant | null>(null);

  const description = "Claude can import activity data for review through ESGLite's connector. Disconnecting an app stops its access at once.";

  return (
    <Section id="apps" title="Connected apps" description={description}>
      {grants.isPending ? (
        <div role="status" aria-busy="true" className="space-y-2">
          <span className="sr-only">Loading connected apps</span>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : grants.isError ? (
        <EmptyState
          compact
          variant="error"
          title={serverMessage(grants.error, "Your connected apps couldn't be loaded.")}
          action={<Button onClick={() => void grants.refetch()}>Try again</Button>}
        />
      ) : grants.data.grants.length === 0 ? (
        <div className="space-y-3">
          <EmptyState compact icon={Link2} title="No apps connected" description="Add ESGLite to Claude once; it then shows up here." />
          <HowToConnect url={grants.data.connector_url} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-control border border-line" aria-label="Connected apps">
            {grants.data.grants.map((g) => (
              <li key={g.grant_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-control bg-tint text-brand-text">
                  {g.client.logo_uri ? <img src={g.client.logo_uri} alt="" className="size-6 object-contain" /> : <Link2 className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{g.client.client_name}</p>
                  <p className="text-xs text-muted">
                    Connected {formatDateTime(g.created_at)}
                    {" · "}
                    {g.last_used_at ? `Last used ${timeAgo(g.last_used_at)}` : "Not used yet"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{g.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(" · ")}</p>
                </div>
                <Button size="sm" icon={<Unplug aria-hidden className="size-3.5" />} onClick={() => setLeaving(g)} className={cn(focusRing)}>
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
          <details className="text-sm">
            <summary className={cn("cursor-pointer text-muted hover:text-ink", focusRing, "rounded-chip")}>Add ESGLite to another Claude account</summary>
            <div className="mt-2">
              <HowToConnect url={grants.data.connector_url} />
            </div>
          </details>
        </>
      )}

      {grants.data && grants.data.grants.length > 0 && (
        <Callout tone="info">Entries created by a connected app are pending until a manager approves them; disconnecting doesn't remove them.</Callout>
      )}

      <Modal
        open={leaving !== null}
        onClose={() => {
          disconnect.reset();
          setLeaving(null);
        }}
        title={`Disconnect ${leaving?.client.client_name ?? "this app"}?`}
        description="It stops working straight away. You can connect it again from Claude."
        tone="destructive"
        error={disconnect.isError ? serverMessage(disconnect.error, "Couldn't disconnect. Nothing was changed.") : null}
        primaryAction={{
          label: "Disconnect",
          loading: disconnect.isPending,
          onClick: () =>
            leaving &&
            disconnect.mutate(leaving.grant_id, {
              onSuccess: () => {
                toast({ title: `${leaving.client.client_name} disconnected`, tone: "good" });
                setLeaving(null);
              },
            }),
        }}
      />
    </Section>
  );
}
