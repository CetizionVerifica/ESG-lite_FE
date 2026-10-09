import { useParams } from "react-router-dom";
import { Loading } from "../../ui";
import { PLANETPULSE } from "../../theme";
import { AuthLayout } from "./components/AuthLayout";
import { SignInForm } from "./components/SignInForm";
import { usePublicBrand } from "./hooks/usePublicBrand";

/**
 * P01 sign-in. `/login` is PlanetPulse; `/{clientSlug}/login` wears the
 * client's theme once its public brand loads (PlanetPulse if it can't).
 */
export function SignInPage() {
  const { clientSlug } = useParams();
  const { pack, loading } = usePublicBrand(clientSlug);
  const clientName = pack.id === PLANETPULSE.id ? null : pack.name;

  // Blank until the brand answers, so PlanetPulse never flashes before the client theme.
  if (loading) return <Loading label="Loading sign-in" className="min-h-screen bg-page">{null}</Loading>;
  return (
    <AuthLayout pack={pack} clientName={clientName}>
      <SignInForm door="client" title="Sign in" lead="Use your company email." />
    </AuthLayout>
  );
}

/** P01 staff sign-in: always PlanetPulse. */
export function StaffSignInPage() {
  return (
    <AuthLayout pack={PLANETPULSE} clientName={null} coverHeading="Staff access for PlanetPulse">
      <SignInForm door="staff" title="PlanetPulse staff sign in" lead="Use your PlanetPulse email." />
    </AuthLayout>
  );
}

export { ResetPasswordPage } from "./ResetPasswordPage";
