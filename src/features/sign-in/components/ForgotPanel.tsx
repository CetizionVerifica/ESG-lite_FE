import { type FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button, TextField } from "../../../ui";
import { forgotPassword } from "../api";
import { errorStatus } from "../logic";
import { FormError, FormHeading, FormNote } from "./FormBits";

/**
 * Forgot-password panel, swapped in place of the sign-in form. The reply never
 * says whether the address has an account.
 */
export function ForgotPanel({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const send = useMutation({
    mutationFn: (address: string) => forgotPassword(address),
  });
  // A 4xx (unknown address, validation) reads the same as a sent link; only
  // an outage or a network error is worth reporting.
  const failed = send.isError && (errorStatus(send.error) ?? 500) >= 500;
  const sent = send.isSuccess || (send.isError && !failed);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) send.mutate(email.trim());
  };

  return (
    <div>
      <FormHeading title="Reset your password" lead="Enter your company email and we'll send you a link." />
      {sent ? (
        <FormNote>If that email has an account, we've sent a link to reset the password. Check your inbox.</FormNote>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField label="Email" type="email" name="email" autoComplete="email" required autoFocus value={email} onChange={setEmail} placeholder="name@company.com" />
          {failed && <FormError>We couldn't send the link right now. Try again in a moment.</FormError>}
          <Button type="submit" variant="primary" className="h-10 w-full" loading={send.isPending} disabled={!email.trim()}>
            Send reset link
          </Button>
        </form>
      )}
      <Button variant="ghost" size="sm" className="mt-4" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={onBack}>
        Back to sign in
      </Button>
    </div>
  );
}
