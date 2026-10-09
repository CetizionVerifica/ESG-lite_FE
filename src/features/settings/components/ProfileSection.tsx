import { KeyRound } from "lucide-react";
import { Button, Callout, useToast } from "../../../ui";
import { useSendResetLink } from "../api";
import { type ProfileView, serverMessage } from "../logic";
import { ReadOnlyRow, Section } from "./Section";

const dash = <span className="text-muted">Not set</span>;

/**
 * Who the user is. Read-only for now: the backend has no endpoint to edit a
 * profile or change a password while signed in (proposed PATCH /auth/me), so
 * the password row sends the same reset link as "Forgot password".
 */
export function ProfileSection({ profile }: { profile: ProfileView }) {
  const { toast } = useToast();
  const reset = useSendResetLink();

  const sendLink = () =>
    reset.mutate(profile.email, {
      onSuccess: () => toast({ title: "Reset link sent", description: `Check ${profile.email} for a link to set a new password.`, tone: "good" }),
      onError: (e) => toast({ title: "The reset link wasn't sent", description: serverMessage(e, "Try again in a moment."), tone: "bad" }),
    });

  return (
    <Section id="profile" title="Profile" description="Your details as your administrator set them up.">
      <dl className="grid gap-4 sm:grid-cols-2">
        <ReadOnlyRow label="Name">{profile.name || dash}</ReadOnlyRow>
        <ReadOnlyRow label="Last name">{profile.lastName || dash}</ReadOnlyRow>
        <ReadOnlyRow label="Phone">{profile.phone || dash}</ReadOnlyRow>
        <ReadOnlyRow label="Email">{profile.email || dash}</ReadOnlyRow>
        <ReadOnlyRow label="Role">{profile.role || dash}</ReadOnlyRow>
        <ReadOnlyRow label={profile.sites.length === 1 ? "Site" : "Sites"}>
          {profile.sites.length ? profile.sites.join(", ") : <span className="text-muted">No sites assigned</span>}
        </ReadOnlyRow>
      </dl>
      <Callout tone="info">Ask your administrator to change your name, phone or sites.</Callout>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Password</p>
          <p className="text-xs text-muted">We'll email you a link to set a new one (at least 8 characters).</p>
        </div>
        <Button
          icon={<KeyRound aria-hidden className="size-4" />}
          loading={reset.isPending}
          disabled={!profile.email}
          onClick={sendLink}
        >
          Email me a reset link
        </Button>
      </div>
    </Section>
  );
}
