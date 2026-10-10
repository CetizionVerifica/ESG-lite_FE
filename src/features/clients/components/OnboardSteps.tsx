import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { textOnGradient } from "../../../theme";
import { BLACK } from "../../../theme/color";
import { Button, Callout, ColourField, FileDrop, PoweredBy, Select, TextField, Toggle } from "../../../ui";
import { EMPLOYEE_RANGES } from "../logic";
import { GUIDELINE_MAX, GUIDELINE_TYPES, INDUSTRIES, type OnboardDraft, type OnboardField, PASSWORD_MIN, REGIONS, coverFor, hasBrandInput, suggestFromPixels, toBrandUpdate } from "../onboarding";

export type StepProps = {
  draft: OnboardDraft;
  set: <K extends OnboardField>(k: K, v: OnboardDraft[K]) => void;
  error: (k: OnboardField) => string | undefined;
};

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const LOGO_MAX = 5 * 1024 * 1024;

/** A legacy free-text value stays pickable next to the standard list. */
const listWith = (list: readonly string[], current: string) => (current && !list.includes(current) ? [current, ...list] : [...list]).map((v) => ({ value: v, label: v }));

export function CompanyStep({ draft, set, error }: StepProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField className="sm:col-span-2" label="Company name" required value={draft.companyName} onChange={(v) => set("companyName", v)} error={error("companyName")} maxLength={160} />
      <Select<string> label="Industry" placeholder="Not set" value={draft.industry || null} onChange={(v) => set("industry", v ?? "")} options={listWith(INDUSTRIES, draft.industry)} />
      <Select<string> label="Region" placeholder="Not set" value={draft.region || null} onChange={(v) => set("region", v ?? "")} options={listWith(REGIONS, draft.region)} />
      <Select<string>
        label="Employee range"
        placeholder="Not set"
        value={draft.employeeRange || null}
        onChange={(v) => set("employeeRange", v ?? "")}
        options={EMPLOYEE_RANGES.map((r) => ({ value: r, label: r }))}
      />
      <TextField label="CIN" value={draft.cinNumber} onChange={(v) => set("cinNumber", v)} />
      <TextField className="sm:col-span-2" label="Address" help="Also used for the client's first site." value={draft.address} onChange={(v) => set("address", v)} />
    </div>
  );
}

export function AdminStep({ draft, set, error }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">This person becomes the client's company admin and can add the rest of their team.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Contact name" required value={draft.contactPerson} onChange={(v) => set("contactPerson", v)} error={error("contactPerson")} autoComplete="off" />
        <TextField label="Email" type="email" required value={draft.email} onChange={(v) => set("email", v)} error={error("email")} autoComplete="off" />
        <TextField label="Phone" type="tel" value={draft.phoneNumber} onChange={(v) => set("phoneNumber", v)} />
        <TextField
          label="Password"
          type="password"
          required
          help={`At least ${PASSWORD_MIN} characters. Share it with the admin safely; they can change it in Settings.`}
          value={draft.password}
          onChange={(v) => set("password", v)}
          error={error("password")}
          autoComplete="new-password"
        />
      </div>
    </div>
  );
}

export function AccessStep({ draft, set, calendar }: StepProps & { calendar: { rule: string | null; loading: boolean } }) {
  return (
    <div className="space-y-4">
      <Toggle label="ESG-Mitra access" inlineLabel="This client can use ESG-Mitra" checked={draft.esgMitraAccess} onChange={(v) => set("esgMitraAccess", v)} />
      <div>
        <h3 className="text-sm font-medium text-ink">Reporting calendar</h3>
        <p className="mt-1 text-sm text-muted">
          {calendar.loading
            ? "Loading…"
            : `Reports offer calendar years and financial years${calendar.rule ? ` (${calendar.rule})` : ""}. The financial year is the same for every client today.`}
        </p>
      </div>
    </div>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

async function coloursFromImage(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  return suggestFromPixels(ctx.getImageData(0, 0, size, size).data);
}

function SignInCover({ name, primary, logoUrl }: { name: string; primary: string; logoUrl: string | null }) {
  const { coverFrom, coverTo } = coverFor(primary);
  const ink = textOnGradient(coverFrom, coverTo, BLACK);
  return (
    <figure className="space-y-1">
      <div
        aria-label="Sign-in cover preview"
        role="img"
        className="flex h-36 flex-col justify-between rounded-card p-4"
        // Brand data being previewed, not a UI colour.
        style={{ background: `linear-gradient(135deg, ${coverFrom}, ${coverTo})`, color: ink }}
      >
        {logoUrl ? <img src={logoUrl} alt="" className="h-8 max-w-[10rem] object-contain object-left" /> : <span className="text-lg font-semibold">{name || "Client name"}</span>}
        <span className="text-sm opacity-90">Sign in to {name || "your company"}</span>
      </div>
      <figcaption>
        <PoweredBy />
      </figcaption>
    </figure>
  );
}

export function BrandStep({ draft, set, error, onSkip }: StepProps & { onSkip: () => void }) {
  const logoUrl = useObjectUrl(draft.logo);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const preview = toBrandUpdate(draft);

  if (!draft.brandOn) {
    return (
      <div className="space-y-3">
        <Callout tone="info">No logo or colours will be saved, so this client will see the PlanetPulse theme. You can set its brand later from the client's Brand theme tab.</Callout>
        <Button onClick={() => set("brandOn", true)}>Set up the brand now</Button>
      </div>
    );
  }

  const suggest = async () => {
    if (!logoUrl) return;
    setSuggesting(true);
    setSuggestNote(null);
    try {
      const s = await coloursFromImage(logoUrl);
      if (!s) setSuggestNote("No clear colour in this logo. Pick the colours yourself.");
      else {
        set("primary", s.primary);
        if (s.accent) set("accent", s.accent);
      }
    } catch {
      setSuggestNote("Couldn't read this logo. Pick the colours yourself.");
    } finally {
      setSuggesting(false);
    }
  };

  const fileItems = (f: File | null, id: string) => (f ? [{ id, file: f, status: "done" as const }] : []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FileDrop
            label="Logo"
            help="PNG, JPG, WEBP or SVG, up to 5 MB."
            accept={LOGO_TYPES}
            maxSize={LOGO_MAX}
            multiple={false}
            maxFiles={1}
            items={fileItems(draft.logo, "logo")}
            onAdd={(files) => set("logo", files[0] ?? null)}
            onRemove={() => set("logo", null)}
          />
          <FileDrop
            label="Logo for dark backgrounds (optional)"
            help="A white or one-colour version."
            accept={LOGO_TYPES}
            maxSize={LOGO_MAX}
            multiple={false}
            maxFiles={1}
            items={fileItems(draft.logoDark, "logo-dark")}
            onAdd={(files) => set("logoDark", files[0] ?? null)}
            onRemove={() => set("logoDark", null)}
          />
        </div>
        <FileDrop
          label="Colour guideline (optional)"
          help="The client's brand sheet: PDF, PNG, JPG or WEBP, up to 10 MB. Kept with the brand for reference."
          accept={GUIDELINE_TYPES}
          maxSize={GUIDELINE_MAX}
          multiple={false}
          maxFiles={1}
          items={fileItems(draft.guideline, "guideline")}
          onAdd={(files) => set("guideline", files[0] ?? null)}
          onRemove={() => set("guideline", null)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ColourField label="Primary" help="Optional. Leave empty to keep PlanetPulse colours." value={draft.primary} onChange={(v) => set("primary", v)} error={error("primary")} />
          <ColourField label="Accent" help="Leave empty to derive one from the primary." value={draft.accent} onChange={(v) => set("accent", v)} error={error("accent")} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Wand2 aria-hidden className="size-4" />} onClick={() => void suggest()} disabled={!logoUrl} loading={suggesting}>
            Suggest from logo
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
        {suggestNote && <p className="text-sm text-warn">{suggestNote}</p>}
      </div>
      <div>{preview ? <SignInCover name={draft.companyName.trim()} primary={preview.primary} logoUrl={logoUrl} /> : <p className="text-sm text-muted">Pick a primary colour to preview the sign-in cover.</p>}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-36 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value || <span className="text-muted">Not set</span>}</dd>
    </div>
  );
}

export function ReviewStep({ draft, onEdit }: { draft: OnboardDraft; onEdit: (step: number) => void }) {
  const brand = toBrandUpdate(draft);
  const section = (title: string, step: number, rows: [string, string][]) => (
    <section className="rounded-control border border-line p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <Button size="sm" variant="ghost" onClick={() => onEdit(step)} aria-label={`Edit ${title.toLowerCase()}`}>
          Edit
        </Button>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([l, v]) => (
          <Row key={l} label={l} value={v} />
        ))}
      </dl>
    </section>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {section("Company", 0, [
        ["Name", draft.companyName],
        ["Industry", draft.industry],
        ["Region", draft.region],
        ["Employee range", draft.employeeRange],
        ["CIN", draft.cinNumber],
        ["Address", draft.address],
      ])}
      {section("Admin user", 1, [
        ["Name", draft.contactPerson],
        ["Email", draft.email],
        ["Phone", draft.phoneNumber],
        ["Password", "•".repeat(Math.min(draft.password.length, 12))],
      ])}
      {section("Access", 2, [["ESG-Mitra", draft.esgMitraAccess ? "On" : "Off"]])}
      {section(
        "Brand",
        3,
        brand
          ? [
              ["Colours", `${brand.primary} · ${brand.accent}`],
              ["Logo", draft.logo?.name ?? ""],
              ["Dark logo", draft.logoDark?.name ?? ""],
              ["Colour guideline", draft.guideline?.name ?? ""],
            ]
          : hasBrandInput(draft)
          ? [
              ["Colours", "PlanetPulse (none picked)"],
              ["Logo", draft.logo?.name ?? ""],
              ["Dark logo", draft.logoDark?.name ?? ""],
              ["Colour guideline", draft.guideline?.name ?? ""],
            ]
          : [["Theme", "PlanetPulse (brand skipped)"]],
      )}
    </div>
  );
}
