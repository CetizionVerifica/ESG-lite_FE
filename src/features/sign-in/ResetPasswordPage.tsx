import { type FormEvent, type ReactNode, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Link2Off, Loader2 } from "lucide-react";
import { Button, cn, focusRing } from "../../ui";
import { PLANETPULSE } from "../../theme";
import { resetPassword, verifyResetToken } from "./api";
import { AuthLayout } from "./components/AuthLayout";
import { FormError, FormHeading, StrengthMeter } from "./components/FormBits";
import { PasswordField } from "./components/PasswordField";
import { MIN_PASSWORD_LENGTH, type ResetErrors, errorMessage, validateReset } from "./logic";

const primaryLink = cn(
  "inline-flex h-10 w-full items-center justify-center rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90",
  focusRing,
);

/** P01 reset password: verifying → invalid/expired | form → success. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const verify = useQuery({
    queryKey: ["auth", "reset-token", token],
    queryFn: () => verifyResetToken(token),
    enabled: token !== "",
    staleTime: Infinity,
    retry: false,
  });
  const reset = useMutation({ mutationFn: (password: string) => resetPassword(token, password) });

  let body;
  if (token !== "" && verify.isPending) {
    body = (
      <div role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Checking your reset link…
      </div>
    );
  } else if (token === "" || verify.isError || !verify.data?.valid) {
    body = (
      <StateBlock icon={<Link2Off aria-hidden className="size-6 text-bad" />} title="This link has expired" lead="Reset links work once and expire after a while. Ask for a new one from the sign-in page.">
        <Link to="/login" className={primaryLink}>
          Back to sign in
        </Link>
      </StateBlock>
    );
  } else if (reset.isSuccess) {
    body = (
      <StateBlock icon={<CheckCircle2 aria-hidden className="size-6 text-good" />} title="Password changed" lead="You can now sign in with your new password.">
        <Link to="/login" className={primaryLink}>
          Sign in
        </Link>
      </StateBlock>
    );
  } else {
    body = <ResetForm pending={reset.isPending} error={reset.isError ? errorMessage(reset.error, "We couldn't change your password. Try again.") : null} onSubmit={(pw) => reset.mutate(pw)} />;
  }

  return (
    <AuthLayout pack={PLANETPULSE} clientName={null}>
      {body}
    </AuthLayout>
  );
}

function ResetForm({ pending, error, onSubmit }: { pending: boolean; error: string | null; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<ResetErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = validateReset(password, confirm);
    setErrors(next);
    if (!next.password && !next.confirm) onSubmit(password);
  };

  return (
    <div>
      <FormHeading title="Choose a new password" lead={`At least ${MIN_PASSWORD_LENGTH} characters. Longer is stronger.`} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <PasswordField label="New password" autoComplete="new-password" required value={password} onChange={setPassword} error={errors.password} />
          <StrengthMeter password={password} />
        </div>
        <PasswordField label="Confirm new password" autoComplete="new-password" required value={confirm} onChange={setConfirm} error={errors.confirm} />
        {error && <FormError>{error}</FormError>}
        <Button type="submit" variant="primary" className="h-10 w-full" loading={pending}>
          Change password
        </Button>
      </form>
    </div>
  );
}

function StateBlock({ icon, title, lead, children }: { icon: ReactNode; title: string; lead: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-tint">{icon}</div>
      <FormHeading title={title} lead={lead} />
      {children}
    </div>
  );
}
