import { useMemo, useState } from "react";
import { Button, Combobox, useToast } from "../../../ui";
import { useSavePreferences } from "../api";
import { detectedTimezone, modernZone, serverMessage, timezoneLabel, timezoneList } from "../logic";
import { Section } from "./Section";

/** Searchable IANA zone list; reminders and escalations go out at 8:00 AM in this zone. */
export function TimezoneSection({ saved: savedRaw }: { saved: string | null }) {
  // A zone saved under its old name ("Asia/Calcutta") is the same zone; show and compare the new name.
  const saved = modernZone(savedRaw);
  const detected = useMemo(() => detectedTimezone(), []);
  const [choice, setChoice] = useState<string | null>(null);
  const current = choice ?? saved ?? detected;
  const save = useSavePreferences();
  const { toast } = useToast();

  const options = useMemo(
    () =>
      timezoneList([saved, detected]).map((tz) => ({
        value: tz,
        label: tz === detected ? `${timezoneLabel(tz)} · Auto-detected` : timezoneLabel(tz),
      })),
    [saved, detected],
  );

  // Nothing saved yet counts as a change: the server only learns the zone on save.
  const dirty = current !== null && current !== saved;

  const submit = () => {
    if (!current) return;
    save.mutate(
      { timezone: current },
      {
        onSuccess: () => {
          setChoice(null);
          toast({ title: "Timezone saved", description: timezoneLabel(current), tone: "good" });
        },
        onError: (e) => toast({ title: "Timezone wasn't saved", description: serverMessage(e, "Try again in a moment."), tone: "bad" }),
      },
    );
  };

  return (
    <Section
      id="timezone"
      title="Timezone"
      description="Reminders are sent at 8:00 AM your time."
      footer={
        <>
          <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={submit}>
            Save timezone
          </Button>
          {detected && current !== detected && (
            <Button variant="ghost" onClick={() => setChoice(detected)}>
              Use auto-detected ({timezoneLabel(detected)})
            </Button>
          )}
          {saved === null && !save.isPending && <span className="text-xs text-muted">Not saved yet</span>}
        </>
      }
    >
      <Combobox<string>
        label="Timezone"
        value={current}
        options={options}
        placeholder="Search by city or region"
        emptyText="No timezone matches"
        onChange={(v) => setChoice(v)}
      />
    </Section>
  );
}
