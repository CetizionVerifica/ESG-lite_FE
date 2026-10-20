// DS-9 · design from a brief (05-ux S4, from the studio home or the AI panel):
// "A 12-page GHG summary for our board, dark look, focus on Scope 3 suppliers"
// → 2–3 proposals from the company's own templates (name, format, look, the
// chapters to keep, why it fits) → "Build this design" makes the design
// through DS-5 (POST /studio/docs, approved data, AI text on) and opens it.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { FRAMEWORKS_BY_KIND, type BriefProposal, type ReportKind } from "../../../lib/studio/contracts";
import { useDesignStudio } from "../../../lib/studio/switch";
import { Badge, Button, Modal, SegmentedControl, Textarea, cn, panel } from "../../../ui";
import { latestClosedYear } from "../home/logic";
import { errorCode, useBrief } from "./api";
import { aiErrorText } from "./logic";

const FORMAT_LABEL: Record<string, string> = { a4: "A4", a4_landscape: "A4 landscape", letter: "Letter", a5: "A5", slide_16_9: "16:9 deck", square: "Square", social_191: "Social 1.91:1" };
const LOOK_LABEL: Record<string, string> = { classic: "Classic", light: "Light", night: "Night" };

export function BriefDialog({ open, onClose, defaultKind = "ghg" }: { open: boolean; onClose: () => void; defaultKind?: ReportKind }) {
  const navigate = useNavigate();
  const { kinds } = useDesignStudio();
  const [kind, setKind] = useState<ReportKind>(defaultKind);
  const [text, setText] = useState("");
  const [building, setBuilding] = useState<number | null>(null);
  const { brief, build } = useBrief();
  const proposals = brief.data?.proposals ?? [];
  const error = brief.error ? aiErrorText(errorCode(brief.error)) : build.error ? "The design couldn't be built. Try again." : null;

  const close = () => {
    if (build.isPending) return;
    brief.reset();
    build.reset();
    setBuilding(null);
    onClose();
  };

  const accept = (p: BriefProposal) => {
    setBuilding(p.templateId);
    const yearType = "FY" as const;
    build.mutate(
      { kind, templateId: p.templateId, year: latestClosedYear(yearType), yearType, sites: "all", frameworks: [FRAMEWORKS_BY_KIND[kind][0]], inputs: {}, ai: true, title: p.title },
      { onSuccess: (r) => navigate(`/studio/${r.id}`), onSettled: () => setBuilding(null) },
    );
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="Design from a brief"
      description="Describe the design you need. We'll suggest templates from your library; numbers come from your approved data."
      primaryAction={{ label: proposals.length ? "Suggest again" : "Suggest designs", onClick: () => brief.mutate({ kind, brief: text.trim() }), loading: brief.isPending, disabled: text.trim().length < 3 || build.isPending }}
      cancelLabel="Close"
      error={error}
    >
      <div className="space-y-3">
        <SegmentedControl
          label="Report kind"
          value={kind}
          onChange={(k) => {
            if (k === "sustainability" && !kinds.sustainability) return;
            setKind(k);
            brief.reset();
          }}
          options={[
            { value: "ghg", label: "GHG report" },
            { value: "sustainability", label: kinds.sustainability ? "Sustainability report" : "Sustainability (needs KPI tracking)" },
          ]}
        />
        <Textarea label="Brief" rows={3} maxLength={1000} value={text} onChange={setText} placeholder="A 12-page GHG summary for our board, dark look, focus on Scope 3 suppliers" />
        {proposals.length > 0 && (
          <ul className="space-y-2" aria-label="Suggested designs" data-testid="brief-proposals">
            {proposals.map((p) => (
              <li key={p.templateId} className={cn(panel, "space-y-1.5 p-3")}>
                <div className="flex items-start gap-2">
                  <LayoutTemplate aria-hidden className="mt-0.5 size-4 text-brand-text" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{p.title}</p>
                    <p className="text-xs text-muted">
                      {p.templateName} · {FORMAT_LABEL[p.format] ?? p.format}
                      {p.look ? ` · ${LOOK_LABEL[p.look] ?? p.look}` : ""} · {p.chapters.length} pages
                    </p>
                  </div>
                  <Badge tone="brand" className="gap-0.5">
                    <Sparkles aria-hidden className="size-3" /> Suggested by AI
                  </Badge>
                </div>
                <p className="text-[13px] text-ink">{p.reason}</p>
                <p className="text-xs text-muted">{p.chapters.join(" · ")}</p>
                <Button size="sm" variant="primary" loading={building === p.templateId} disabled={build.isPending && building !== p.templateId} onClick={() => accept(p)}>
                  Build this design
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
