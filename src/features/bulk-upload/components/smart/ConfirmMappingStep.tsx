import { useMemo } from "react";
import { Button, Callout, EmptyState } from "../../../../ui";
import {
  applyProfile,
  canContinue,
  knownColumns,
  profileFor,
  confirmActivity,
  confirmCategory,
  confirmField,
  setActivityFactor,
  setCategoryValue,
  setFieldColumn,
  setFixedCategory,
  setSheetExcluded,
  toggleFieldSkip,
  toggleSaveMapping,
} from "../../smart/logic";
import type { MappingProfile, MappingProposal } from "../../smart/types";
import { type CategoryOption, SheetCard } from "./SheetCard";

/**
 * Smart import, screen 2: one card per sheet. Continue stays off while any
 * required part still shows Check (decision 4) or every sheet is left out.
 */
export function ConfirmMappingStep(props: {
  fileName: string;
  proposal: MappingProposal;
  onChange: (next: MappingProposal) => void;
  siteName: string;
  headers: string[];
  categories: CategoryOption[];
  /** The company's remembered mappings for these sheets (XI3); empty until read. */
  profiles: MappingProfile[];
  onForgetProfile: (profile: MappingProfile) => void;
  /** The profile being forgotten right now, and the one whose forget failed, with why. */
  forgetting: MappingProfile | null;
  forgetFailed: { profile: MappingProfile; message: string } | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const { proposal, onChange } = props;
  const columnsOf = useMemo(() => proposal.sheets.map((s) => knownColumns(s, props.headers)), [proposal.sheets, props.headers]);
  const included = proposal.sheets.filter((s) => !s.excluded).length;
  const ready = canContinue(proposal);

  if (proposal.sheets.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title="No usable sheet in this workbook" description="Every sheet was empty or had no header row the app could read. Check the file and upload it again." />
        <Button variant="secondary" onClick={props.onBack}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        What the app worked out from <span className="font-medium text-ink">{props.fileName}</span>. Confirm or change anything marked Check; nothing is planned until you continue.
      </p>
      {proposal.model && proposal.model.cached_profile_hits > 0 && (
        <Callout tone="info" title="Remembered from your last upload">
          {proposal.model.cached_profile_hits} {proposal.model.cached_profile_hits === 1 ? "sheet was" : "sheets were"} mapped the way you confirmed last time. Change anything that differs this month.
        </Callout>
      )}
      {proposal.sheets.map((sheet, i) => (
        <SheetCard
          key={`${sheet.sheet_name}-${i}`}
          sheet={sheet}
          index={i}
          siteName={props.siteName}
          columns={columnsOf[i]}
          categories={props.categories}
          profile={profileFor(sheet, props.profiles)}
          forgetting={props.forgetting?.fingerprint === sheet.fingerprint}
          forgetError={props.forgetFailed?.profile.fingerprint === sheet.fingerprint ? props.forgetFailed.message : null}
          actions={{
            onExclude: (excluded) => onChange(setSheetExcluded(proposal, i, excluded)),
            onFieldColumn: (key, column) => onChange(setFieldColumn(proposal, i, key, column)),
            onConfirmField: (key) => onChange(confirmField(proposal, i, key)),
            onSkipField: (key) => onChange(toggleFieldSkip(proposal, i, key)),
            onActivityFactor: (text, name) => onChange(setActivityFactor(proposal, i, text, name)),
            onConfirmActivity: (text) => onChange(confirmActivity(proposal, i, text)),
            onSaveMapping: (text) => onChange(toggleSaveMapping(proposal, i, text)),
            onConfirmCategory: () => onChange(confirmCategory(proposal, i)),
            onFixedCategory: (id, label) => onChange(setFixedCategory(proposal, i, id, label)),
            onCategoryValue: (text, id) => onChange(setCategoryValue(proposal, i, text, id)),
            onUseProfile: (profile) => onChange(applyProfile(proposal, i, profile)),
            onForgetProfile: props.onForgetProfile,
          }}
        />
      ))}
      {included === 0 && (
        <p className="text-sm text-muted" role="status">
          Every sheet is left out. Include at least one to continue.
        </p>
      )}
      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={props.onBack}>
          Back
        </Button>
        <Button variant="primary" disabled={!ready} onClick={props.onNext}>
          Continue to the rows
        </Button>
      </div>
    </div>
  );
}
