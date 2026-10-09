import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import type { ManagerUser } from "../../../services/managerService";
import { Button, Callout, Drawer, EmptyState, Toggle } from "../../../ui";
import { type AccessDraft, displayName, enabledIds, initialDraft, isDirty, saveError, setSite, sharedCategories } from "../logic";

/**
 * "Category access — {name}": one section per site, a switch per category.
 * Mount it with `key={user_id}` so each person starts from their saved access.
 */
export function AccessDrawer(props: {
  user: ManagerUser | null;
  saving: boolean;
  /** Server error from the last save; shown in the drawer. */
  error: string | null;
  onClose: () => void;
  onSave: (user: ManagerUser, categoryIds: number[]) => void;
}) {
  const { user } = props;
  const [draft, setDraft] = useState<AccessDraft>(() => (user ? initialDraft(user) : {}));
  const [touched, setTouched] = useState(false);

  const shared = useMemo(() => (user ? sharedCategories(user) : new Map<number, string[]>()), [user]);
  if (!user) return <Drawer open={false} onClose={props.onClose} title="" />;

  const name = displayName(user);
  const invalid = saveError(draft, user);
  const dirty = isDirty(draft, user);
  const toggle = (id: number, on: boolean) => {
    setTouched(true);
    setDraft((d) => ({ ...d, [id]: on }));
  };
  const save = () => {
    setTouched(true);
    if (!invalid) props.onSave(user, enabledIds(draft, user));
  };

  return (
    <Drawer
      open
      size="sm"
      onClose={props.onClose}
      title={`Category access — ${name}`}
      subtitle={user.email}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={props.saving} disabled={!dirty || props.saving}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {props.error && (
          // Focus moves here: the Save button it came from is disabled while saving, and Esc must still close.
          <div key={props.error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
            <Callout tone="warn" title="Couldn't save access">
              {props.error}
            </Callout>
          </div>
        )}
        {touched && invalid && <Callout tone="warn">{invalid}</Callout>}
        {shared.size > 0 && (
          <Callout icon={Link2}>
            Access is set per category, not per site. A category marked “also on” changes on every site listed.
          </Callout>
        )}
        {user.sites.length === 0 && <EmptyState compact title="This person isn't on any of your sites." />}
        {user.sites.map((site) => {
          const headingId = `access-site-${site.site_id}`;
          return (
            <section key={site.site_id} aria-labelledby={headingId} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={headingId} className="text-sm font-semibold text-ink">
                  {site.site_name}
                </h3>
                {site.categories.length > 0 && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Enable all on ${site.site_name}`}
                      onClick={() => {
                        setTouched(true);
                        setDraft((d) => setSite(d, user, site.site_id, true));
                      }}
                    >
                      Enable all
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Disable all on ${site.site_name}`}
                      onClick={() => {
                        setTouched(true);
                        setDraft((d) => setSite(d, user, site.site_id, false));
                      }}
                    >
                      Disable all
                    </Button>
                  </div>
                )}
              </div>
              {site.categories.length === 0 ? (
                <p className="text-sm text-muted">No categories are set up for this site.</p>
              ) : (
                <ul className="divide-y divide-line rounded-control border border-line">
                  {site.categories.map((c) => {
                    const on = !!draft[c.category_id];
                    const others = shared.get(c.category_id)?.filter((n) => n !== site.site_name);
                    return (
                      <li key={c.category_id} className="flex items-center gap-3 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{c.category_name}</span>
                          {others?.length ? <span className="block truncate text-xs text-muted">Also on {others.join(", ")}</span> : null}
                        </span>
                        <span className={`w-16 text-right text-xs font-medium ${on ? "text-good" : "text-bad"}`}>{on ? "Enabled" : "Revoked"}</span>
                        <Toggle label={`${c.category_name} on ${site.site_name}`} hideLabel checked={on} onChange={(v) => toggle(c.category_id, v)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}
