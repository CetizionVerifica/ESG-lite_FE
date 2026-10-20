// DS-12 · "Mark as excluded…" (05-ux S8): one Scope 3 category (or an
// exclusion that has no reason) gets a reason in the report details
// (`exclusions[]`, PATCH /studio/docs/:id/inputs). "Draft with AI" asks for
// `exclusion_reason_draft`; the draft lands in the field for a person to edit
// and save, never on its own.
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import api from "../../../api/axios";
import { Button, Callout, Modal, Textarea } from "../../../ui";
import type { Check, ReportInputs, Suggestion } from "../../../lib/studio/contracts";
import { exclusionWhat, findExclusion, plainText, withExclusion, type Exclusion } from "../../../lib/studio/checks";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { studioErrorMessage, useDocInputs, useSaveDocInputs } from "../panels/data/api";
import { refreshChecks } from "./store";

export function ExclusionDialog({ docId, check, onClose }: { docId: number; check: Check | null; onClose: () => void }) {
  const inputs = useDocInputs(check ? docId : null);
  const save = useSaveDocInputs(docId);
  const companyId = useStudioCompanyId();
  const what = check ? exclusionWhat(check) : "";
  const stored = (inputs.data?.inputs ?? {}) as ReportInputs;
  const prefill = (inputs.data?.prefill ?? {}) as Record<string, { value?: unknown } | undefined>;
  const current: Exclusion[] = (stored.exclusions?.value as Exclusion[] | undefined) ?? (prefill.exclusions?.value as Exclusion[] | undefined) ?? [];
  const existing = current[findExclusion(current, what)];
  const [reason, setReason] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setReason(existing?.reason ?? "");
    setAiNote(null);
    setErr(null);
    // Only when the dialog opens for a check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, inputs.data?.rev]);

  const draft = async () => {
    if (!check) return;
    setDrafting(true);
    setAiNote(null);
    try {
      const { data } = await api.post<Suggestion>(`/studio/docs/${docId}/ai`, {
        action: "exclusion_reason_draft",
        target: { input: "exclusions" },
        params: { category: (check.details as { category?: number } | undefined)?.category ?? null, what },
        ...(companyId ? { company_id: companyId } : {}),
      });
      const text = plainText(data?.payload?.text);
      if (text) {
        setReason(text);
        setAiNote("Suggested by AI. Check it and edit it before you save.");
      } else setAiNote("AI had no suggestion. Write the reason yourself.");
    } catch {
      setAiNote("AI isn't available right now. Write the reason yourself.");
    } finally {
      setDrafting(false);
    }
  };

  const submit = () => {
    if (!check || !inputs.data) return;
    if (!reason.trim()) {
      setErr("Say why it's left out.");
      return;
    }
    save.mutate(
      { rev: inputs.data.rev, inputs: { exclusions: { value: withExclusion(current, what, reason.trim()), source: "typed" } } },
      {
        onSuccess: () => {
          refreshChecks(docId);
          onClose();
        },
        onError: (e) => setErr(studioErrorMessage(e, "The exclusion couldn't be saved. Try again.")),
      },
    );
  };

  return (
    <Modal
      open={!!check}
      onClose={onClose}
      title="Mark as excluded"
      description={what ? `${what}: the GHG Protocol accepts an excluded Scope 3 category when the report says why.` : undefined}
      primaryAction={{ label: "Save exclusion", onClick: submit, loading: save.isPending, disabled: !inputs.data }}
      error={err}
      size="md"
    >
      <div className="flex flex-col gap-2">
        <Textarea label="Reason" value={reason} onChange={setReason} rows={4} required help="For example: not relevant in the screening, or no activity in this category this year." />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<Sparkles aria-hidden className="size-4" />} loading={drafting} onClick={() => void draft()}>
            Draft with AI
          </Button>
          {aiNote && <span className="text-xs text-muted">{aiNote}</span>}
        </div>
        {inputs.isError && <Callout tone="warn">The report details couldn't load. Close this and try again.</Callout>}
      </div>
    </Modal>
  );
}
