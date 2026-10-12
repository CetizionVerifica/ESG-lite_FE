import { type ReactNode, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Link2, ShieldAlert, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Avatar, Badge, Button, Callout, EmptyState, Loading, Skeleton, cn, panel } from "../../ui";
import { useConsentRequest, useDecide } from "./api";
import { NEVER_SENTENCE, canAllow, consentError, isSafeRedirect, refusalMessage, scopeSentences, switchHint } from "./logic";

/** Sends the browser back to the app that asked (Claude). */
function leaveTo(url: string) {
  window.location.assign(url);
}

/**
 * IM10 · Connect Claude consent: `/oauth/consent?request=<id>`. ESG-lite's
 * `/oauth/authorize` lands here after validating the request; the person is
 * already signed in (the shell's ProtectedRoute brought them through sign-in
 * and back). Allow or Deny posts the decision and follows the redirect.
 */
export default function ConsentPage() {
  const [params] = useSearchParams();
  const request = params.get("request");
  const { role } = useAuth();
  const info = useConsentRequest(request);
  const decide = useDecide(request);
  const [leaving, setLeaving] = useState<"allow" | "deny" | null>(null);

  const onDecide = (decision: "allow" | "deny") => {
    decide.mutate(decision, {
      onSuccess: (result) => {
        if (isSafeRedirect(result.redirect_to)) {
          setLeaving(decision);
          leaveTo(result.redirect_to);
        }
      },
    });
  };

  if (!request) {
    return (
      <Frame>
        <EmptyState
          variant="error"
          icon={ShieldAlert}
          title="This link is missing its sign-in request."
          description="Start again from Claude: add the ESGLite connector and sign in from there."
        />
      </Frame>
    );
  }

  if (info.isPending) {
    return (
      <Frame>
        <Loading label="Loading the sign-in request" className="space-y-4 p-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-10 w-full" />
        </Loading>
      </Frame>
    );
  }

  if (info.isError || !info.data) {
    const e = consentError(info.error, "This sign-in request has expired or is not valid.");
    return (
      <Frame>
        <EmptyState
          variant="error"
          icon={ShieldAlert}
          title={e.message}
          description="Go back to Claude and start the connection again; a request is valid for ten minutes."
          action={e.redirectTo ? <Button onClick={() => leaveTo(e.redirectTo as string)}>Back to Claude</Button> : <Button onClick={() => void info.refetch()}>Try again</Button>}
        />
      </Frame>
    );
  }

  const data = info.data;
  const allowed = canAllow(data) && role === "Superadmin";
  const refusal = refusalMessage({ ...data, user: { ...data.user, role: role ?? data.user.role } });
  const hint = switchHint(data.clients_with_imports_enabled);
  const sentences = scopeSentences(data.scopes);
  const decisionError = decide.isError ? consentError(decide.error, "The decision wasn't saved. Try again.") : null;
  const busy = decide.isPending || leaving !== null;

  return (
    <Frame>
      <div className="space-y-5 p-6">
        <header className="flex items-start gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-control bg-tint text-brand-text">
            {data.client.logo_uri ? <img src={data.client.logo_uri} alt="" className="size-7 object-contain" /> : <Link2 className="size-5" />}
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink">
              Connect <span className="break-words">{data.client.client_name}</span> to ESGLite?
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              It will send you back to <span className="font-medium text-ink">{data.client.redirect_host}</span>.
            </p>
          </div>
        </header>

        <section aria-label="Signed in as" className="flex items-center gap-3 rounded-control bg-tint px-3 py-2.5">
          <Avatar name={data.user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{data.user.name}</p>
            <p className="truncate text-xs text-muted">{data.user.email}</p>
          </div>
          <Badge tone={allowed ? "brand" : "neutral"}>{role ?? data.user.role}</Badge>
        </section>

        {refusal ? (
          <Callout tone="warn" title={refusal}>
            Ask an ESGLite administrator to connect Claude. Nothing was shared with {data.client.client_name}.
          </Callout>
        ) : (
          <section aria-labelledby="consent-can" className="space-y-2">
            <h2 id="consent-can" className="text-sm font-semibold text-ink">
              What it can do
            </h2>
            <ul className="space-y-1.5">
              {sentences.map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm text-ink">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-good" />
                  <span>{s}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-sm text-muted">
                <X aria-hidden className="mt-0.5 size-4 shrink-0 text-bad" />
                <span>{NEVER_SENTENCE}</span>
              </li>
            </ul>
            <p className="text-xs text-muted">Entries it creates wait for a manager's approval in Approvals. You can disconnect it any time in Settings → Connected apps.</p>
            {hint && (
              <Callout tone="info" title="No client is ready for Claude imports yet">
                {hint}
              </Callout>
            )}
          </section>
        )}

        {decisionError && (
          <Callout tone="warn" title={decisionError.message}>
            {decisionError.redirectTo && (
              <Button size="sm" className="mt-2" onClick={() => leaveTo(decisionError.redirectTo as string)}>
                Back to Claude
              </Button>
            )}
          </Callout>
        )}

        <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end")}>
          <Button onClick={() => onDecide("deny")} disabled={busy} loading={leaving === "deny" || (decide.isPending && decide.variables === "deny")}>
            {refusal ? "Back to Claude" : "Deny"}
          </Button>
          {!refusal && (
            <Button variant="primary" onClick={() => onDecide("allow")} disabled={busy} loading={leaving === "allow" || (decide.isPending && decide.variables === "allow")}>
              Allow
            </Button>
          )}
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg py-4 sm:py-10">
      <div className={panel}>{children}</div>
    </div>
  );
}
