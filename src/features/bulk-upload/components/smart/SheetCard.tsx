import { useState } from "react";
import { Badge, type BadgeTone, Button, Callout, Combobox, Select, Toggle, useDebounced } from "../../../../ui";
import { useActivityOptions } from "../../smart/api";
import { CHIP_LABEL, type MatchChip, SOURCE_LABEL, activityChip, categoryChip, categoryNotFound, categoryText, fieldChip, notInContextText, otherSiteLines, periodText, profileDiffers, profileSummary, profileWhenText, sheetBlockers } from "../../smart/logic";
import type { FieldMapping, MappingProfile, ProposedActivityMatch, SheetProposal } from "../../smart/types";

const CHIP_TONE: Record<Exclude<MatchChip, null>, BadgeTone> = { matched: "good", remembered: "brand", suggested: "info", check: "warn", skipped: "neutral" };

export function Chip({ chip }: { chip: MatchChip }) {
  return chip ? <Badge tone={CHIP_TONE[chip]}>{CHIP_LABEL[chip]}</Badge> : null;
}

export type CategoryOption = { value: number; label: string };

export interface SheetCardActions {
  onExclude: (excluded: boolean) => void;
  onFieldColumn: (key: string, column: string | null) => void;
  onConfirmField: (key: string) => void;
  onSkipField: (key: string) => void;
  onActivityFactor: (sheetText: string, factorName: string | null) => void;
  onConfirmActivity: (sheetText: string) => void;
  onSaveMapping: (sheetText: string) => void;
  onConfirmCategory: () => void;
  onFixedCategory: (id: number, label: string) => void;
  onCategoryValue: (text: string, id: number | null) => void;
  /** Puts the remembered mapping back on the card. */
  onUseProfile: (profile: MappingProfile) => void;
  /** "Forget this mapping": the profile is deleted on the server. */
  onForgetProfile: (profile: MappingProfile) => void;
}

/**
 * One sheet of the proposal: what the mapper worked out, with a chip per part
 * (Matched by name, Remembered from a profile, Suggested by the model, Check
 * when it isn't sure) and a control to confirm or change each one.
 */
export function SheetCard(props: {
  sheet: SheetProposal;
  index: number;
  siteName: string;
  /** Column names the sheet is known to have (the workbook's headers plus every column the proposal names). */
  columns: string[];
  categories: CategoryOption[];
  /** What the company confirmed last time for this sheet's layout (XI3), if anything. */
  profile: MappingProfile | null;
  forgetting: boolean;
  forgetError: string | null;
  /** The mapper is working out the fields for a category the user just picked. */
  reasking?: boolean;
  /** Why that re-ask failed, if it did. */
  reaskError?: string | null;
  actions: SheetCardActions;
}) {
  const { sheet, actions, index, profile } = props;
  const blockers = sheetBlockers(sheet);
  const columnOptions = props.columns.map((c) => ({ value: c, label: c }));
  const catChip = categoryChip(sheet.category);
  const notFound = categoryNotFound(sheet);
  const otherSites = otherSiteLines(sheet, props.siteName);
  const dropped = notInContextText(sheet.not_in_context);
  const titleId = `sheet-${index}-title`;

  return (
    <section aria-labelledby={titleId} className={`rounded-card border border-line bg-panel p-4 sm:p-5 ${sheet.excluded ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {sheet.sheet_name}
          </h2>
          <p className="text-sm text-muted">
            {sheet.data_rows} data {sheet.data_rows === 1 ? "row" : "rows"}, header on row {sheet.header_row}, {SOURCE_LABEL[sheet.source]}.
          </p>
        </div>
        <Toggle label={`Include ${sheet.sheet_name}`} hideLabel checked={!sheet.excluded} onChange={(on) => actions.onExclude(!on)} inlineLabel={sheet.excluded ? "Left out" : "Included"} />
      </div>

      {!sheet.excluded && (
        <div className="mt-4 space-y-5">
          {profile && <ProfileLine sheet={sheet} profile={profile} forgetting={props.forgetting} error={props.forgetError} actions={actions} />}
          {dropped && <Callout tone="warn" title="Some names aren't in your scope">{dropped}</Callout>}
          {otherSites.length > 0 && (
            <Callout tone="info" title="Other sites in this sheet">
              <ul className="list-disc pl-5">
                {otherSites.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Callout>
          )}

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                Category <Chip chip={catChip} />
              </dt>
              <dd className="space-y-2 text-sm text-muted">
                {sheet.category.kind === "fixed" ? (
                  <>
                    <div className="flex flex-wrap items-end gap-2">
                      <Select<number>
                        label={`Category of ${sheet.sheet_name}`}
                        hideLabel
                        placeholder={notFound ? "Choose a category" : undefined}
                        value={notFound ? null : sheet.category.id}
                        disabled={props.reasking}
                        options={notFound || props.categories.some((c) => c.value === (sheet.category as { id: number }).id) ? props.categories : [...props.categories, { value: sheet.category.id, label: sheet.category.label }]}
                        onChange={(v) => {
                          const match = props.categories.find((c) => c.value === v);
                          if (match) actions.onFixedCategory(match.value, match.label);
                        }}
                      />
                      {catChip === "check" && !notFound && !props.reasking && (
                        <Button size="sm" aria-label="Confirm category" onClick={actions.onConfirmCategory}>
                          Confirm
                        </Button>
                      )}
                    </div>
                    {notFound && <p className="text-xs text-muted">The app couldn't tell which category this sheet is. Choose one and its fields are worked out again.</p>}
                    {props.reasking && (
                      <p role="status" className="text-xs text-muted">
                        Working out the fields and activities for {sheet.category.label}…
                      </p>
                    )}
                    {props.reaskError && (
                      <Callout tone="warn" title="Fields not worked out">
                        {props.reaskError}
                      </Callout>
                    )}
                  </>
                ) : (
                  <>
                    <p>{categoryText(sheet.category)}</p>
                    <ul className="space-y-2">
                      {sheet.category.values.map((v) => (
                        <li key={v.text} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <span className="truncate text-ink">“{v.text}”</span>
                          <Select<number>
                            label={`Category for ${v.text}`}
                            hideLabel
                            placeholder="Not imported"
                            value={v.id}
                            options={props.categories}
                            onChange={(id) => actions.onCategoryValue(v.text, id)}
                          />
                        </li>
                      ))}
                    </ul>
                    {catChip === "check" && (
                      <Button size="sm" onClick={actions.onConfirmCategory}>
                        Confirm these
                      </Button>
                    )}
                  </>
                )}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-ink">Period</dt>
              <dd className="text-sm text-muted">{periodText(sheet.period)}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Fields</h3>
            <div className="divide-y divide-line rounded-card border border-line">
              {sheet.fields.map((f) => (
                <FieldRow key={f.key} field={f} sheetName={sheet.sheet_name} columns={columnOptions} actions={actions} />
              ))}
            </div>
          </div>

          {sheet.activities.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">Activities</h3>
              <p className="text-xs text-muted">The sheet's wording on the left, the emission factor it maps to on the right. Tick "Save for this client" to remember a match as a category mapping.</p>
              <div className="divide-y divide-line rounded-card border border-line">
                {sheet.activities.map((a) => (
                  <ActivityRow key={a.sheet_text} activity={a} siteId={sheet.site_id} actions={actions} />
                ))}
              </div>
            </div>
          )}

          {blockers.length > 0 && (
            <p className="text-sm text-muted" role="status">
              Still to check: {blockers.join(", ")}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * "Last time you mapped this as…": the mapping the company confirmed for this
 * layout before (XI3). "Use it" shows only while the card differs from it;
 * "Forget this mapping" deletes the profile, so the next upload starts afresh.
 * Whatever is confirmed here is remembered again when the import commits.
 */
function ProfileLine({ sheet, profile, forgetting, error, actions }: { sheet: SheetProposal; profile: MappingProfile; forgetting: boolean; error: string | null; actions: SheetCardActions }) {
  const differs = profileDiffers(sheet, profile);
  // Forgetting deletes the company's remembered mapping, so it asks first.
  const [confirming, setConfirming] = useState(false);
  return (
    <Callout tone="brand" title="Last time you mapped this as…">
      <p>
        {profileSummary(profile)} ({profileWhenText(profile)}).{differs ? " The card below differs; use it, or change anything and the new mapping is remembered on import." : " Change anything and the new mapping is remembered on import."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {differs && (
          <Button size="sm" variant="secondary" aria-label={`Use the remembered mapping for ${sheet.sheet_name}`} onClick={() => actions.onUseProfile(profile)}>
            Use it
          </Button>
        )}
        {!confirming && (
          <Button size="sm" variant="ghost" aria-label={`Forget the remembered mapping for ${sheet.sheet_name}`} disabled={forgetting} onClick={() => setConfirming(true)}>
            {forgetting ? "Forgetting…" : "Forget this mapping"}
          </Button>
        )}
      </div>
      {confirming && (
        <div className="mt-2" role="group" aria-label={`Confirm forgetting the mapping for ${sheet.sheet_name}`}>
          <p>Forget this mapping for everyone at your company? The next upload of this layout is worked out afresh. Rows already imported don't change.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              autoFocus
              onClick={() => {
                setConfirming(false);
                actions.onForgetProfile(profile);
              }}
            >
              Forget it
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-bad" role="alert">
          {error}
        </p>
      )}
    </Callout>
  );
}

function FieldRow({ field: f, sheetName, columns, actions }: { field: FieldMapping; sheetName: string; columns: { value: string; label: string }[]; actions: SheetCardActions }) {
  const chip = fieldChip(f);
  const options = f.column && !columns.some((c) => c.value === f.column) ? [...columns, { value: f.column, label: f.column }] : columns;
  return (
    <div className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
        {f.label}
        <span className="text-xs font-normal text-muted">{f.required ? "Required" : "Optional"}</span>
        <Chip chip={chip} />
      </p>
      <Combobox<string>
        label={`Column for ${f.label} in ${sheetName}`}
        hideLabel
        placeholder={f.skipped ? "Skipped" : "Choose a column"}
        value={f.column}
        options={options}
        emptyText="No column matches"
        disabled={f.skipped}
        onChange={(v) => actions.onFieldColumn(f.key, v)}
      />
      <div className="flex gap-1">
        {chip === "check" && f.column && (
          <Button size="sm" aria-label={`Confirm ${f.label}`} onClick={() => actions.onConfirmField(f.key)}>
            Confirm
          </Button>
        )}
        {!f.required ? (
          <Button size="sm" variant="ghost" aria-pressed={f.skipped} onClick={() => actions.onSkipField(f.key)}>
            {f.skipped ? "Use" : "Skip"}
          </Button>
        ) : (
          <span className="hidden w-14 sm:block" aria-hidden />
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity: a, siteId, actions }: { activity: ProposedActivityMatch; siteId: number; actions: SheetCardActions }) {
  const chip = activityChip(a);
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState(false);
  const debounced = useDebounced(q, 250);
  const options = useActivityOptions(siteId, a.category_id, debounced, searched);
  const names = new Set((options.data ?? []).map((o) => o.name));
  if (a.factor_name) names.add(a.factor_name);
  const factorOptions = [...names].map((n) => ({ value: n, label: n }));

  return (
    <div className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center">
      <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink">
        <span className="truncate font-medium">“{a.sheet_text}”</span>
        <Chip chip={chip} />
      </p>
      <Combobox<string>
        label={`Factor for ${a.sheet_text}`}
        hideLabel
        placeholder="Search factors…"
        value={a.factor_name}
        options={factorOptions}
        loading={options.isFetching}
        emptyText={options.error ? "Couldn't load the factor names" : searched ? "No factor matches" : "Type to search"}
        onSearch={(text) => {
          setSearched(true);
          setQ(text);
        }}
        onChange={(v) => actions.onActivityFactor(a.sheet_text, v)}
      />
      <div className="flex flex-wrap items-center gap-2">
        {chip === "check" && a.factor_name && (
          <Button size="sm" aria-label={`Confirm ${a.sheet_text}`} onClick={() => actions.onConfirmActivity(a.sheet_text)}>
            Confirm
          </Button>
        )}
        <label className="inline-flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" className="accent-brand" checked={a.save_mapping} disabled={!a.factor_name} onChange={() => actions.onSaveMapping(a.sheet_text)} />
          Save for this client
        </label>
      </div>
    </div>
  );
}
