import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FileQuestion, History, Save } from "lucide-react";
import { Button, Callout, EmptyState, Modal, PageHeader, SkeletonText, TabPanel, Tabs, TextField, cn, panel, useToast, useUnsavedGuard } from "../../ui";
import { type SaveResult, useAddLibraryColumns, useDraftCheck, useFactorNames, useForm, useFormCheck, useLibrary, useSaveForm, useTestSetup } from "./api";
import { type CheckIssue, type FormCheck, fixCount, newErrors, tabForIssue } from "./check";
import { applyRecipe, formSettingsIssues, missingRecipeColumns, setChoiceColumn, setFieldSetting } from "./formSettings";
import { recipeFor } from "../../lib/forms/recipes";
import type { RowMethod } from "../../lib/scope3/dq";
import { addField, type ColumnEntity } from "./builder";
import { type BuilderDraft, type BuilderTab, type SourceConfig, draftFromConfig, hasRemovals, isDirty, renameMap, savedRemovals, toUpdatePayload, validateBuilder } from "./builder";
import { CalcTab } from "./components/builder/CalcTab";
import { CheckTab } from "./components/builder/CheckTab";
import { HistoryDrawer } from "./components/HistoryDrawer";
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
  { value: "check", label: "Check" },
];
const tabLabel = (t: BuilderTab) => TABS.find((x) => x.value === t)?.label ?? t;
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
  // SE-4: the saved form's check (on open), the unsaved form's (before save and on demand), history.
  const savedCheck = useFormCheck(id);
  const draftCheck = useDraftCheck();
  const [draftResult, setDraftResult] = useState<{ check: FormCheck | null; json: string } | null>(null);
  const [blocked, setBlocked] = useState<CheckIssue[] | null>(null);
  const [pendingCheck, setPendingCheck] = useState<FormCheck | null>(null);
  const [note, setNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const testSetup = useTestSetup(tab === "test" ? source.site?.site_id : null, source.category?.category_id);

  const dirty = isDirty(draft, initial);
  const draftJson = JSON.stringify(toUpdatePayload(draft));
  const showDraft = dirty && !!draftResult;
  const checkView = showDraft ? draftResult?.check : savedCheck.data;
  const runDraftCheck = async (): Promise<FormCheck | null> => {
    try {
      const check = await draftCheck.mutateAsync({ ...toUpdatePayload(draft), pk_id: id });
      setDraftResult({ check, json: draftJson });
      return check;
    } catch {
      // No check from the server: saving works as before, with nothing published.
      return null;
    }
  };
  const blocker = useUnsavedGuard(dirty && !save.isPending);
  const issues = [...validateBuilder(draft, library.data ?? []), ...formSettingsIssues(draft)];
  const addColumns = useAddLibraryColumns();
  const ghg = source.category?.ghg_category ?? null;

  // SE-3: a recipe's fields and formula; fields the library lacks are created first.
  const onApplyRecipe = (method: RowMethod) => {
    const recipe = recipeFor(method);
    if (!recipe) return;
    const lib = (library.data ?? []) as ColumnEntity[];
    const missing = missingRecipeColumns(draft, recipe, lib);
    const apply = (cols: ColumnEntity[]) => {
      update((d) => applyRecipe(d, recipe, cols));
      toast({ title: `Recipe added: ${recipe.fields.map((f) => f.name).join(", ") || "formula"}`, tone: "neutral" });
    };
    if (!missing.length) return apply(lib);
    addColumns.mutate(
      missing.map((f) => ({ column_name: f.name, column_type: f.type })),
      {
        onSuccess: (created) => apply([...lib, ...(created as ColumnEntity[])]),
        onError: (e) => setSaveErr(errorMessage(e, "The recipe's fields couldn't be added to the column library. Try again.")),
      },
    );
  };

  // SE-3: the method question, an ordinary choice field worded for the client.
  const QUESTION = "Record type";
  const onAddQuestion = () => {
    const lib = (library.data ?? []) as ColumnEntity[];
    const askWith = (col: ColumnEntity) =>
      update((d) => setFieldSetting(setChoiceColumn(addField(d, col), col.column_name, ghg), col.column_name, { label: "What does your record show?" }));
    const existing = lib.find((c) => c.column_name.toLowerCase() === QUESTION.toLowerCase() && c.column_type === "select");
    if (existing) return askWith(existing);
    addColumns.mutate([{ column_name: QUESTION, column_type: "select" }], {
      onSuccess: (created) => created[0] && askWith(created[0] as ColumnEntity),
      onError: (e) => setSaveErr(errorMessage(e, "The question couldn't be added to the column library. Try again.")),
    });
  };
  const renames = renameMap(draft);
  const removals = savedRemovals(initial, draft);
  const removes = hasRemovals(removals);
  const savedExtraKeys = useMemo(() => new Set(initial.extraFields.map((x) => x.key)), [initial]);
  // Bumped on Discard so tabs with local text state start again from the saved form.
  const [resetKey, setResetKey] = useState(0);
  const update = (fn: (d: BuilderDraft) => BuilderDraft) => setDraft((d) => fn(d));

  // SE-4: a form that passes the check is published as a new version once saved.
  const publishedLine = (res: SaveResult, check: FormCheck | null): { text?: string; bad?: boolean } => {
    if (res.publishError) return { text: `Not published: ${errorMessage(res.publishError, "the check failed on the server.")}`, bad: true };
    const v = res.published?.version?.version;
    if (v) return { text: res.published?.unchanged ? `Nothing changed since version ${v}, which stays live.` : `Version ${v} is live.` };
    if (check && !check.ok) return { text: `${fixCount(check.errors.length)} still to fix before a new version can go live (see Check).` };
    return {};
  };
  const doSave = (check: FormCheck | null) => {
    setSaveErr(null);
    save.mutate(
      { payload: toUpdatePayload(draft), publish: !!check?.ok, note },
      {
        onSuccess: (res) => {
          const line = publishedLine(res, check);
          toast({
            title: res?.migrationWarning ? "Form saved, but some saved entries still use the old keys" : `Form "${draft.name.trim()}" saved`,
            description: line.text,
            tone: res?.migrationWarning || line.bad ? "bad" : "good",
          });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };
  const onSave = async () => {
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
    // SE-4: a change may not add a problem the saved form doesn't have.
    const check = await runDraftCheck();
    const added = newErrors(check, savedCheck.data);
    if (added.length) {
      setBlocked(added);
      setTab("check");
      return;
    }
    setBlocked(null);
    setPendingCheck(check);
    if (Object.keys(renames).length || removes) setConfirmRename(true);
    else doSave(check);
  };

  const counts = Object.fromEntries(
    TABS.map((t) => [t.value, t.value === "check" ? (checkView?.errors.length ?? 0) : tried ? issues.filter((i) => i.tab === t.value).length : 0]),
  );
  const where = [source.site?.name, source.category?.category_name].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <PageHeader
        title={draft.name.trim() || source.config_name}
        description={where || undefined}
        primaryAction={{ label: dirty ? "Save form" : "Saved", onClick: () => void onSave(), icon: <Save aria-hidden className="size-4" />, disabled: !dirty, loading: save.isPending || draftCheck.isPending }}
        secondaryActions={[
          { label: "History", onClick: () => setHistoryOpen(true), icon: <History aria-hidden className="size-4" /> },
          ...(dirty
            ? [
                {
                  label: "Discard changes",
                  onClick: () => {
                    setDraft(initial);
                    setResetKey((k) => k + 1);
                    setBlocked(null);
                    setDraftResult(null);
                  },
                },
              ]
            : []),
        ]}
      />
      {dirty && (
        <TextField
          label="Note for this version (optional)"
          help="Shown in the form's history beside what changed."
          value={note}
          onChange={setNote}
          maxLength={500}
          className="max-w-xl"
        />
      )}
      {blocked && blocked.length > 0 && (
        <Callout tone="warn" title={`Fix ${fixCount(blocked.length)} before saving`} onDismiss={() => setBlocked(null)}>
          <p>These changes would add problems the saved form doesn't have:</p>
          <ul className="list-disc pl-5">
            {blocked.slice(0, 5).map((i) => (
              <li key={`${i.code}-${i.field}`}>
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setTab(tabForIssue(i.field))}>
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </Callout>
      )}
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
            <CalcTab draft={draft} onChange={update} ghgCategory={ghg} onApplyRecipe={onApplyRecipe} onAddQuestion={onAddQuestion} busy={addColumns.isPending} />
          </TabPanel>
          <TabPanel idBase="builder" value="check" current={tab}>
            <CheckTab
              check={checkView}
              isDraft={showDraft}
              stale={showDraft && draftResult?.json !== draftJson}
              loading={!showDraft && savedCheck.isPending}
              error={!showDraft && savedCheck.isError}
              checking={draftCheck.isPending || savedCheck.isFetching}
              onCheck={() => void (dirty ? runDraftCheck() : savedCheck.refetch())}
              onGo={setTab}
              tabLabel={tabLabel}
            />
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
          <Preview draft={draft} formId={id} siteName={source.site?.name} categoryName={source.category?.category_name} ghgCategory={source.category?.ghg_category ?? null} />
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
              doSave(pendingCheck);
            },
          }}
          onClose={() => setConfirmRename(false)}
        />
      )}
      <HistoryDrawer formId={id} open={historyOpen} onClose={() => setHistoryOpen(false)} />
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
