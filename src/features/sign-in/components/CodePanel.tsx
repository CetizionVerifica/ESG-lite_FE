import { type FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button, TextField, cn, focusRing } from "../../../ui";
import { requestLoginCode } from "../api";
import { useSignIn } from "../hooks/useSignIn";
import { DOOR_PATH, type Door, LOGIN_CODE_LENGTH, cleanLoginCode, errorMessage, errorStatus, wrongDoorMessage } from "../logic";
import { FormError, FormHeading, FormNote } from "./FormBits";

const linkClass = cn("rounded-chip font-medium text-brand-text underline-offset-2 hover:underline", focusRing);

function sendError(error: unknown): string | null {
  const status = errorStatus(error);
  if (status === null) return "We couldn't reach ESGLite. Check your connection and try again.";
  // Not set up (503) and too many requests (429) carry the server's own words.
  if (status === 503 || status === 429) return errorMessage(error, "We couldn't send the code right now. Try again in a moment.");
  if (status >= 500) return "We couldn't send the code right now. Try again in a moment.";
  // Other 4xx read the same as a sent code: the reply never says whether the address has an account.
  return null;
}

function verifyError(error: unknown): string {
  const status = errorStatus(error);
  if (status === null) return "We couldn't reach ESGLite. Check your connection and try again.";
  if (status >= 500) return "Something went wrong on our side. Try again in a moment.";
  return errorMessage(error, "That code is wrong or has expired. Check the email or ask for a new code.");
}

/**
 * Sign in with a one-time code sent by email, swapped in place of the sign-in
 * form (for people who forgot their password). Step 1 sends the code, step 2
 * signs in with it through the same door rules as a password sign-in.
 */
export function CodePanel({ door, initialEmail, onBack }: { door: Door; initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const location = useLocation();
  const send = useMutation({ mutationFn: (address: string) => requestLoginCode(address) });
  const signIn = useSignIn(door);
  const turnedAway = signIn.data && !signIn.data.ok ? signIn.data.rightDoor : null;

  const sendCode = (address: string) =>
    send.mutate(address, {
      onSettled: (_data, error) => {
        if (!error || !sendError(error)) {
          setResent(sentTo !== null);
          setSentTo(address);
          setCode("");
          signIn.reset();
        }
      },
    });

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) sendCode(email.trim());
  };

  const onVerify = (e: FormEvent) => {
    e.preventDefault();
    if (sentTo && code.length === LOGIN_CODE_LENGTH) signIn.mutate({ email: sentTo, code });
  };

  const sendFailed = send.isError ? sendError(send.error) : null;

  return (
    <div>
      {sentTo === null ? (
        <>
          <FormHeading title="Sign in with a code" lead="Forgot your password? Enter your company email and we'll send you a one-time code." />
          <form onSubmit={onSend} className="space-y-4" noValidate>
            <TextField label="Email" type="email" name="email" autoComplete="email" required autoFocus value={email} onChange={setEmail} placeholder="name@company.com" />
            {sendFailed && <FormError>{sendFailed}</FormError>}
            <Button type="submit" variant="primary" className="h-10 w-full" loading={send.isPending} disabled={!email.trim()}>
              Send code
            </Button>
          </form>
        </>
      ) : (
        <>
          <FormHeading title="Enter your code" lead={`If ${sentTo} has an account, we've emailed it a ${LOGIN_CODE_LENGTH}-digit code. It expires in 10 minutes.`} />
          <form onSubmit={onVerify} className="space-y-4" noValidate aria-busy={signIn.isPending || undefined}>
            <TextField
              label="Sign-in code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(value) => setCode(cleanLoginCode(value))}
              placeholder="123456"
              className="[&_input]:h-10 [&_input]:tracking-[0.4em]"
            />
            {signIn.isError && <FormError>{verifyError(signIn.error)}</FormError>}
            {turnedAway && (
              <FormError>
                {wrongDoorMessage(turnedAway)}{" "}
                <Link to={DOOR_PATH[turnedAway]} state={location.state} className={linkClass}>
                  {turnedAway === "staff" ? "Go to staff sign-in" : "Go to company sign-in"}
                </Link>
              </FormError>
            )}
            {sendFailed && <FormError>{sendFailed}</FormError>}
            {resent && !sendFailed && !signIn.isError && <FormNote>We've sent a new code. Earlier codes no longer work.</FormNote>}
            <Button type="submit" variant="primary" className="h-10 w-full" loading={signIn.isPending} disabled={code.length !== LOGIN_CODE_LENGTH}>
              {signIn.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <button type="button" className={linkClass} disabled={send.isPending} onClick={() => sendCode(sentTo)}>
              Send a new code
            </button>
            <button type="button" className={linkClass} onClick={() => { setSentTo(null); setResent(false); send.reset(); signIn.reset(); }}>
              Use a different email
            </button>
          </div>
        </>
      )}
      <Button variant="ghost" size="sm" className="mt-4" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={onBack}>
        Back to sign in
      </Button>
    </div>
  );
}
