import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FileQuestion, Save } from "lucide-react";
import { Button, Callout, EmptyState, Modal, PageHeader, SkeletonText, TabPanel, Tabs, cn, panel, useToast, useUnsavedGuard } from "../../ui";
import { useFactorNames, useForm, useLibrary, useSaveForm, useTestSetup } from "./api";
import { type BuilderDraft, type BuilderTab, type SourceConfig, draftFromConfig, hasRemovals, isDirty, renameMap, savedRemovals, toUpdatePayload, validateBuilder } from "./builder";
import { CalcTab } from "./components/builder/CalcTab";
import { ChoicesTab } from "./components/builder/ChoicesTab";
import { ExtraTab } from "./components/builder/ExtraTab";
import { FieldsTab } from "./components/builder/FieldsTab";
import { MatchTab } from "./components/builder/MatchTab";
import { Preview } from "./components/builder/Preview";
import { TestTab } from "./components/builder/TestTab";
import { errorMessage } from "./logic";

const TABS: { value: BuilderTab; label: string }[] = [
  { value: "fields", label: "Fields" },
  { value: "choices", label: "Choices" },
  { value: "match", label: "Factor match" },
  { value: "extra", label: "Extra details" },
  { value: "calculation", label: "Calculation" },
  { value: "test", label: "Test" },
];
const isTab = (v: string | null): v is BuilderTab => TABS.some((t) => t.value === v);

/** P24 `/capture/forms/:id`: one place to edit a data-entry form, with a live preview. */
export default function BuilderPage() {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const form = useForm(valid ? id : null);

  if (!valid || (form.error && (form.error as { response?: { status?: number } }).response?.status === 404)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Form not found" />
        <EmptyState icon={FileQuestion} title="This form doesn't exist any more." action={<Link to="/capture/forms" className="text-sm text-brand-text underline">Back to data-entry forms</Link>} />
      </div>
    );
  }
  if (form.error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Form" />
        <EmptyState variant="error" title="Couldn't load this form." description={errorMessage(form.error, "Try again.")} action={<Button onClick={() => void form.refetch()}>Try again</Button>} />
      </div>
    );
  }
  if (!form.data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <PageHeader title="Form" loading />
        <div className={cn(panel, "p-4")}>
          <SkeletonText lines={6} />
        </div>
      </div>
    );
  }
  // Remount when a save brings a new server copy, so the draft starts from it.
  return <Builder key={JSON.stringify(form.data)} id={id} source={form.data} />;
}

function Builder({ id, source }: { id: number; source: SourceConfig }) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const tab: BuilderTab = isTab(params.get("tab")) ? (params.get("tab") as BuilderTab) : "fields";
  const setTab = (t: BuilderTab) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("tab", t);
        return next;
      },
      { replace: true },
    );

  const initial = useMemo(() => draftFromConfig(source), [source]);
  const [draft, setDraft] = useState<BuilderDraft>(initial);
  const [tried, setTried] = useState(false);
  const [confirmRename, setConfirmRename] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const library = useLibrary();
  const factors = useFactorNames(source.category?.category_id, source.site?.site_id);
  const save = useSaveForm(id);
  const testSetup = useTestSetup(tab === "test" ? source.site?.site_id : null, source.category?.category_id);

  const dirty = isDirty(draft, initial);
  const blocker = useUnsavedGuard(dirty && !save.isPending);
  const issues = validateBuilder(draft, library.data ?? []);
  const renames = renameMap(draft);
  const removals = savedRemovals(initial, draft);
  const removes = hasRemovals(removals);
  const savedExtraKeys = useMemo(() => new Set(initial.extraFields.map((x) => x.key)), [initial]);
  // Bumped on Discard so tabs with local text state start again from the saved form.
  const [resetKey, setResetKey] = useState(0);
  const update = (fn: (d: BuilderDraft) => BuilderDraft) => setDraft((d) => fn(d));

  const doSave = () => {
    setSaveErr(null);
    save.mutate(toUpdatePayload(draft), {
      onSuccess: (res) => {
        toast({
          title: res?.migrationWarning ? "Form saved, but some saved entries still use the old keys" : `Form "${draft.name.trim()}" saved`,
          tone: res?.migrationWarning ? "bad" : "good",
        });
      },
      onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
    });
  };
  const onSave = () => {
    setTried(true);
    if (issues.length) {
      setTab(issues[0].tab);
      return;
    }
    // A changed key is checked against library names, so wait for the library.
    if (Object.keys(renames).length && !library.data) {
      setSaveErr(library.isError ? "Couldn't load the column library to check the new keys. Reload and try again." : "Checking the new keys against the column library. Try again in a moment.");
      return;
    }
    if (Object.keys(renames).length || removes) setConfirmRename(true);
    else doSave();
  };

  const counts = Object.fromEntries(TABS.map((t) => [t.value, tried ? issues.filter((i) => i.tab === t.value).length : 0]));
  const where = [source.site?.name, source.category?.category_name].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <PageHeader
        title={draft.name.trim() || source.config_name}
        description={where || undefined}
        primaryAction={{ label: dirty ? "Save form" : "Saved", onClick: onSave, icon: <Save aria-hidden className="size-4" />, disabled: !dirty, loading: save.isPending }}
        secondaryActions={
          dirty
            ? [
                {
                  label: "Discard changes",
                  onClick: () => {
                    setDraft(initial);
                    setResetKey((k) => k + 1);
                  },
                },
              ]
            : []
        }
      />
      {saveErr && (
        <Callout tone="warn" title="Not saved" onDismiss={() => setSaveErr(null)}>
          {saveErr}
        </Callout>
      )}
      {tried && issues.length > 0 && (
        <Callout tone="warn" title={`Fix ${issues.length} ${issues.length === 1 ? "thing" : "things"} before saving`}>
          <ul className="list-disc pl-5">
            {issues.slice(0, 5).map((i) => (
              <li key={i.message}>
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setTab(i.tab)}>
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <div key={resetKey} className="grid gap-4 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
        <div className={cn(panel, "min-w-0 p-4")}>
          <Tabs<BuilderTab>
            label="Form builder"
            idBase="builder"
            items={TABS.map((t) => ({ ...t, count: counts[t.value] || undefined }))}
            value={tab}
            onChange={setTab}
            className="mb-4"
          />
          <TabPanel idBase="builder" value="fields" current={tab}>
            <FieldsTab draft={draft} onChange={update} library={library.data ?? []} libraryLoading={library.isPending} />
          </TabPanel>
          <TabPanel idBase="builder" value="choices" current={tab}>
            <ChoicesTab draft={draft} onChange={update} initial={initial} />
          </TabPanel>
          <TabPanel idBase="builder" value="match" current={tab}>
            <MatchTab
              draft={draft}
              onChange={update}
              targets={factors.data ?? null}
              targetsError={factors.isError}
              onGenerated={(n) => toast({ title: n ? `${n} ${n === 1 ? "rule" : "rules"} added` : "Every choice path already has a rule", tone: "neutral" })}
            />
          </TabPanel>
          <TabPanel idBase="builder" value="extra" current={tab}>
            <ExtraTab draft={draft} onChange={update} savedKeys={savedExtraKeys} />
          </TabPanel>
          <TabPanel idBase="builder" value="calculation" current={tab}>
            <CalcTab draft={draft} onChange={update} />
          </TabPanel>
          <TabPanel idBase="builder" value="test" current={tab}>
            <TestTab
              draft={draft}
              formId={id}
              setup={testSetup.data}
              loading={testSetup.isPending && testSetup.fetchStatus !== "idle"}
              error={testSetup.isError}
              onRetry={() => void testSetup.refetch()}
            />
          </TabPanel>
        </div>
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <Preview draft={draft} formId={id} siteName={source.site?.name} categoryName={source.category?.category_name} />
        </div>
      </div>

      {confirmRename && (
        <Modal
          open
          tone={removes ? "destructive" : undefined}
          title={removes ? "Save changes that affect saved entries?" : "Change field keys?"}
          description={[
            Object.keys(renames).length
              ? `${Object.entries(renames)
                  .map(([a, b]) => `"${a}" becomes "${b}"`)
                  .join(", ")}. Saved entries for ${where || "this form"} are updated to the new ${Object.keys(renames).length === 1 ? "key" : "keys"}.`
              : null,
            removals.fields.length ? `Removed ${removals.fields.length === 1 ? "field" : "fields"}: ${removals.fields.join(", ")}.` : null,
            ...removals.choices.map((c) => `${c.field} no longer offers ${c.labels.map((l) => `"${l}"`).join(", ")}.`),
            removals.extras.length ? `Extra details renamed or removed: ${removals.extras.join(", ")}.` : null,
            ...removals.extraChoices.map((c) => `${c.detail} no longer offers ${c.choices.map((l) => `"${l}"`).join(", ")}.`),
            removes ? "Entries and factor matches that already use them keep the old values." : null,
          ]
            .filter(Boolean)
            .join(" ")}
          primaryAction={{
            label: "Save form",
            onClick: () => {
              setConfirmRename(false);
              doSave();
            },
          }}
          onClose={() => setConfirmRename(false)}
        />
      )}
      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        description="Your changes to this form will be lost."
        tone="destructive"
        cancelLabel="Stay"
        primaryAction={{ label: "Leave", onClick: () => blocker.proceed?.() }}
      />
    </div>
  );
}
