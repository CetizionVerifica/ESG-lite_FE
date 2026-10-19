import { type FormEvent, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, TextField, cn, focusRing } from "../../../ui";
import { useSignIn } from "../hooks/useSignIn";
import { DOOR_PATH, type Door, errorMessage, errorStatus, wrongDoorMessage } from "../logic";
import { CodePanel } from "./CodePanel";
import { ForgotPanel } from "./ForgotPanel";
import { FormError, FormHeading } from "./FormBits";
import { PasswordField } from "./PasswordField";

const linkClass = cn("rounded-chip font-medium text-brand-text underline-offset-2 hover:underline", focusRing);

function signInError(error: unknown): string {
  const status = errorStatus(error);
  if (status === null) return "We couldn't reach ESGLite. Check your connection and try again.";
  if (status >= 500) return "Something went wrong on our side. Try again in a moment.";
  return errorMessage(error, "That email and password don't match.");
}

export interface SignInFormProps {
  door: Door;
  title: string;
  lead: string;
}

/** Email + password form for one door, with the forgot-password and email-code panel swaps. */
export function SignInForm({ door, title, lead }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [panel, setPanel] = useState<"password" | "forgot" | "code">("password");
  const signIn = useSignIn(door);
  const location = useLocation();
  const turnedAway = signIn.data && !signIn.data.ok ? signIn.data.rightDoor : null;

  if (panel === "forgot") {
    return <ForgotPanel initialEmail={email} onBack={() => setPanel("password")} onUseCode={() => setPanel("code")} />;
  }
  if (panel === "code") {
    return <CodePanel door={door} initialEmail={email} onBack={() => setPanel("password")} />;
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    signIn.mutate({ email, password });
  };

  return (
    <div>
      <FormHeading title={title} lead={lead} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate aria-busy={signIn.isPending || undefined}>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={setEmail}
          placeholder="name@company.com"
          className="[&_input]:h-10"
        />
        <PasswordField label="Password" name="password" autoComplete="current-password" required value={password} onChange={setPassword} />
        {signIn.isError && <FormError>{signInError(signIn.error)}</FormError>}
        {turnedAway && (
          <FormError>
            {wrongDoorMessage(turnedAway)}{" "}
            <Link to={DOOR_PATH[turnedAway]} state={location.state} className={linkClass}>
              {turnedAway === "staff" ? "Go to staff sign-in" : "Go to company sign-in"}
            </Link>
          </FormError>
        )}
        <Button type="submit" variant="primary" className="h-10 w-full" loading={signIn.isPending} disabled={!email.trim() || !password}>
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <button type="button" onClick={() => setPanel("forgot")} className={linkClass}>
          Forgot password?
        </button>
        <button type="button" onClick={() => setPanel("code")} className={linkClass}>
          Email me a sign-in code
        </button>
      </div>
    </div>
  );
}
