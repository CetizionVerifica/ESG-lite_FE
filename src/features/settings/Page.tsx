import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button, EmptyState, Loading, PageHeader, Skeleton, cn, focusRing, panel } from "../../ui";
import { usePreferences } from "./api";
import { AppearanceSection } from "./components/AppearanceSection";
import { ConnectedAppsSection } from "./components/ConnectedAppsSection";
import { NotificationsSection } from "./components/NotificationsSection";
import { ProfileSection } from "./components/ProfileSection";
import { Scope3Section } from "./components/Scope3Section";
import { TimezoneSection } from "./components/TimezoneSection";
import { type SectionId, profileView, sectionDomId, sectionFromTab, sectionsFor, serverMessage } from "./logic";

function jumpTo(id: SectionId) {
  const el = document.getElementById(sectionDomId(id));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  // Move focus too, so keyboard and screen reader users land in the section.
  document.getElementById(`${sectionDomId(id)}-title`)?.focus({ preventScroll: true });
}

/** P14 · Settings: profile, appearance, email notifications and timezone, each saved on its own. */
export default function SettingsPage() {
  const { user, role } = useAuth();
  const prefs = usePreferences();
  const profile = profileView(user, role);
  const sections = sectionsFor(role);
  const [params] = useSearchParams();
  const openOn = sectionFromTab(params.get("tab"), role);

  // `/settings?tab=apps` (from the consent page and Claude docs) lands on that section.
  useEffect(() => {
    if (openOn) jumpTo(openOn);
  }, [openOn]);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Your profile and how ESGLite looks and reaches you." />

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${sectionDomId(s.id)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jumpTo(s.id);
                  }}
                  className={cn("block rounded-control px-3 py-1.5 text-sm text-muted hover:bg-tint hover:text-ink", focusRing)}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 max-w-3xl space-y-5">
          <ProfileSection profile={profile} />
          <AppearanceSection />
          {prefs.isPending ? (
            <Loading label="Loading your notification settings" className="space-y-5">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-36 w-full" />
            </Loading>
          ) : prefs.isError ? (
            <div className={panel}>
              <EmptyState
                variant="error"
                title={serverMessage(prefs.error, "Your notification and timezone settings couldn't be loaded.")}
                action={<Button onClick={() => void prefs.refetch()}>Try again</Button>}
              />
            </div>
          ) : (
            <>
              <NotificationsSection role={role} saved={prefs.data.notification_preferences ?? {}} />
              <TimezoneSection saved={prefs.data.timezone ?? null} />
            </>
          )}
          {sections.some((s) => s.id === "scope3") && <Scope3Section />}
          {role === "Superadmin" && <ConnectedAppsSection />}
        </div>
      </div>
    </div>
  );
}
