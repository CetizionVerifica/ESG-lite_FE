import { useState } from "react";
import { BellOff } from "lucide-react";
import { Button, EmptyState, Toggle, useToast } from "../../../ui";
import { useSavePreferences } from "../api";
import { isEnabled, mergePreferences, notificationOptions, preferencesDirty, serverMessage } from "../logic";
import { Section } from "./Section";

/** Email toggles for the user's role. In-app notifications are always on. */
export function NotificationsSection({ role, saved }: { role: string | null; saved: Record<string, boolean> }) {
  const options = notificationOptions(role);
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const save = useSavePreferences();
  const { toast } = useToast();
  const dirty = preferencesDirty(saved, edits);

  const value = (key: string) => (key in edits ? edits[key] : isEnabled(saved, key));

  const submit = () =>
    save.mutate(
      { notification_preferences: mergePreferences(saved, edits) },
      {
        onSuccess: () => {
          setEdits({});
          toast({ title: "Email notifications saved", tone: "good" });
        },
        onError: (e) => toast({ title: "Email notifications weren't saved", description: serverMessage(e, "Try again in a moment."), tone: "bad" }),
      },
    );

  return (
    <Section
      id="notifications"
      title="Notifications"
      description="Choose which emails you get. In-app notifications are always on."
      footer={
        options.length > 0 && (
          <>
            <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={submit}>
              Save notifications
            </Button>
            {dirty && !save.isPending && <span className="text-xs text-muted">Unsaved changes</span>}
          </>
        )
      }
    >
      {options.length === 0 ? (
        <EmptyState compact icon={BellOff} title="No email notifications for your role yet" />
      ) : (
        <ul className="divide-y divide-line">
          {options.map((o) => (
            <li key={o.key} className="py-3 first:pt-0 last:pb-0">
              <Toggle
                label={o.label}
                help={o.description}
                checked={value(o.key)}
                inlineLabel={value(o.key) ? "On" : "Off"}
                onChange={(checked) => setEdits((prev) => ({ ...prev, [o.key]: checked }))}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
