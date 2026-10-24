import { Button, Textarea } from "../../../../ui";
import { BRAND_VOICE_MAX } from "../../../../lib/studio/contracts";

export const VOICE_EXAMPLE =
  "Plain, confident, specific. Lead with the number, then why it moved. Name what we haven't fixed yet. No “journey”, no “passionate”.";

/** The brand voice (D11): used in every AI writing prompt. Empty = plain, factual, third person. */
export function VoiceSection({ value, readOnly, error, onChange }: { value: string; readOnly: boolean; error?: string; onChange: (v: string) => void }) {
  return (
    <section aria-labelledby="bk-voice" className="space-y-3 rounded-card border border-line bg-panel p-4">
      <h2 id="bk-voice" className="text-sm font-semibold text-ink">
        Brand voice
      </h2>
      {readOnly ? (
        <p className="whitespace-pre-wrap text-sm text-ink">{value || "Not set. AI writes plain, factual, third person."}</p>
      ) : (
        <>
          <Textarea
            label="How your reports should sound"
            help={`${value.length.toLocaleString("en")} / ${BRAND_VOICE_MAX.toLocaleString("en")} characters. Empty means plain, factual, third person.`}
            rows={5}
            value={value}
            onChange={onChange}
            error={error}
            placeholder={VOICE_EXAMPLE}
          />
          {!value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(VOICE_EXAMPLE)}>
              Start from the example
            </Button>
          )}
        </>
      )}
    </section>
  );
}
