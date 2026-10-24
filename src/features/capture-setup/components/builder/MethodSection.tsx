import { Button, Callout, SegmentedControl, Select, TextField, cn, panel } from "../../../../ui";
import { categoryLabel } from "../../../../lib/scope3/labels";
import { categoryMethods, methodHint, methodLabel, type RowMethod } from "../../../../lib/scope3/dq";
import { recipeFor } from "../../../../lib/forms/recipes";
import { type BuilderDraft, fieldTitle } from "../../builder";
import { setMethodUnits, unitsText } from "../../methodOptions";
import { type MethodMode, choiceAnswers, choiceFields, clearMethod, methodMode, setChoiceColumn, setChoiceMethod, setOneMethod, stopOffering, unmappedOffered } from "../../formSettings";
import { MethodsOffered } from "./MethodsOffered";

export type MethodSectionProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  /** The form's GHG Protocol category (1–15). */
  ghgCategory: number;
  /** Adds a method's recipe (its fields, creating any the library lacks, and its formula). */
  onApplyRecipe: (method: RowMethod) => void;
  /** Adds a "What does your record show?" choice field to the form. */
  onAddQuestion: () => void;
  /** A recipe or the question is being added. */
  busy?: boolean;
};

const MODE_OPTIONS: { value: Exclude<MethodMode, "several">; label: string }[] = [
  { value: "one", label: "One method" },
  { value: "choice", label: "It depends on the record" },
  { value: "none", label: "Not set" },
];

/**
 * SE-3 · "How is this category calculated for this client?" The Superadmin
 * fixes one method, or lets a choice in the client's words pick it ("What does
 * your record show?" → Fuel bill / Trip distance). Method names show here
 * only; contributors answer the question, never a method.
 */
export function MethodSection({ draft, onChange, ghgCategory: n, onApplyRecipe, onAddQuestion, busy }: MethodSectionProps) {
  const mode = methodMode(draft);
  const methods = categoryMethods(n);
  const options = mode === "several" ? [...MODE_OPTIONS, { value: "several" as const, label: "Several, by unit" }] : MODE_OPTIONS;
  const fields = choiceFields(draft);
  const choice = draft.methodByChoice;
  const answers = choice ? choiceAnswers(draft, choice.column) : [];
  const methodOptions = methods.map((m) => ({ value: m.key, label: methodLabel(m.key, n) }));

  const switchMode = (next: MethodMode) => {
    if (next === mode) return;
    if (next === "none") onChange(clearMethod);
    else if (next === "one") onChange((d) => setOneMethod(d, (d.methodOptions[0]?.method ?? methods[0]?.key) as RowMethod));
    else if (next === "choice") {
      const first = fields[0]?.column_name;
      onChange((d) => (first ? setChoiceColumn(d, first, n) : { ...d, methodByChoice: { column: "", map: {} }, methodOptions: [] }));
    }
  };

  return (
    <section aria-labelledby="method-title" className="space-y-3 border-b border-line pb-4" data-testid="method-section">
      <div className="space-y-1">
        <h3 id="method-title" className="text-sm font-medium text-ink">
          How is this category calculated for this client?
        </h3>
        <p className="text-xs text-muted">
          {categoryLabel(n)}. Contributors never see a method: with one method it is applied for them; when it depends on the record, they answer the question in your
          words.
        </p>
      </div>
      <SegmentedControl<MethodMode> label="How the method is set" value={mode} onChange={switchMode} options={options} size="sm" />

      {mode === "none" && <p className="text-sm text-muted">The form doesn't set a method; rows are calculated from their activity and unit as before.</p>}

      {mode === "one" && draft.methodOptions[0] && (
        <div className="space-y-3">
          <Select<string>
            label="Method"
            value={draft.methodOptions[0].method}
            onChange={(v) => v && onChange((d) => setOneMethod(d, v as RowMethod))}
            options={methodOptions}
            help={methodHint(draft.methodOptions[0].method)}
          />
          <MethodUnits draft={draft} onChange={onChange} n={n} />
          <RecipeCard method={draft.methodOptions[0].method} n={n} onApply={onApplyRecipe} busy={busy} />
        </div>
      )}

      {mode === "choice" && (
        <div className="space-y-3">
          {fields.length === 0 ? (
            <Callout tone="info" title="Add the question first">
              <p>The question is an ordinary choice field, such as "What does your record show?" with Fuel bill and Trip distance.</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={onAddQuestion} disabled={busy}>
                Add "What does your record show?"
              </Button>
            </Callout>
          ) : (
            <Select<string>
              label="The question contributors answer"
              value={choice?.column || null}
              onChange={(v) => v && onChange((d) => setChoiceColumn(d, v, n))}
              options={fields.map((f) => ({ value: f.column_name, label: fieldTitle(f.column_name) }))}
              placeholder="Choose a choice field"
              help="Its answers are in the client's words; set them on the Choices tab."
            />
          )}
          {choice?.column && answers.length === 0 && <p className="text-sm text-warn">"{fieldTitle(choice.column)}" has no choices yet. Add them on the Choices tab.</p>}
          {choice?.column && answers.length > 0 && (
            <ul className={cn(panel, "divide-y divide-line")} aria-label="Answer to method">
              {answers.map((a) => (
                <li key={a.id} className="grid gap-2 px-3 py-2 sm:grid-cols-2 sm:items-center" data-answer={a.id}>
                  <span className="text-sm text-ink">{a.label}</span>
                  <Select<string>
                    label={`Method for ${a.label}`}
                    hideLabel
                    value={choice.map[a.id] ?? ""}
                    onChange={(v) => onChange((d) => setChoiceMethod(d, a.id, (v || null) as RowMethod | null, n))}
                    options={[{ value: "", label: "Not mapped (the form's default)" }, ...methodOptions]}
                  />
                </li>
              ))}
            </ul>
          )}
          {draft.methodOptions.length > 0 && (
            <>
              <MethodUnits draft={draft} onChange={onChange} n={n} />
              <div className="space-y-2">
                {draft.methodOptions.map((o) => (
                  <RecipeCard key={o.method} method={o.method} n={n} onApply={onApplyRecipe} busy={busy} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {mode === "several" && (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            This form offers several methods without a question: the unit a contributor picks decides the method. Give it a question ("It depends on the record") or one method.
          </p>
          <MethodsOffered draft={draft} onChange={onChange} ghgCategory={n} />
        </div>
      )}
    </section>
  );
}

/** The units each offered method takes (the entry offers only these); a method no answer maps to can be dropped. */
function MethodUnits({ draft, onChange, n }: { draft: BuilderDraft; onChange: MethodSectionProps["onChange"]; n: number }) {
  const unmapped = unmappedOffered(draft);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {draft.methodOptions.map((o) => (
        <div key={o.method} className="space-y-1">
          <TextField
            label={`Units for ${methodLabel(o.method, n)}`}
            value={unitsText(o.units)}
            onChange={(v) => onChange((d) => setMethodUnits(d, o.method, v))}
            placeholder="e.g. litre"
            help={unmapped.includes(o.method) ? "No answer maps here; rows whose answer isn't mapped can still use it by its unit." : "Comma-separated."}
            error={o.units.some((u) => u.trim()) ? undefined : "Enter at least one unit."}
          />
          {unmapped.includes(o.method) && (
            <Button size="sm" variant="ghost" onClick={() => onChange((d) => stopOffering(d, o.method))}>
              Stop offering {methodLabel(o.method, n)}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/** What a method needs, from its recipe, with a button that adds the fields and formula. */
function RecipeCard({ method, n, onApply, busy }: { method: RowMethod; n: number; onApply: (m: RowMethod) => void; busy?: boolean }) {
  const recipe = recipeFor(method);
  if (!recipe) return <p className="text-xs text-muted">{methodLabel(method, n)}: no recipe yet; set its fields and formula below.</p>;
  return (
    <div className={cn(panel, "space-y-1.5 p-3 text-sm")} data-recipe={method}>
      <p className="font-medium text-ink">Recipe · {methodLabel(method, n)}</p>
      <p className="text-muted">{recipe.summary}</p>
      <p className="text-xs text-muted">
        {recipe.fields.length ? <>Fields: {recipe.fields.map((f) => f.name).join(", ")}. </> : null}
        Factor: {recipe.factor}
      </p>
      {(recipe.fields.length > 0 || recipe.formula) && (
        <Button size="sm" variant="secondary" onClick={() => onApply(method)} disabled={busy}>
          Add its fields and formula
        </Button>
      )}
    </div>
  );
}
