// PE-2 · Brand fonts on the brand kit page: the uploaded families (each embedded
// in PDFs) and, for Managers and the Superadmin, the upload form with the
// licence tick. Delete asks inline first; designs using a deleted font fall
// back to their text style's font.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { FONT_IDS, FONT_MAX_BYTES, FONT_STYLES, FONT_WEIGHTS, type BrandFont, type FontStyle } from "../../../../lib/studio/contracts";
import { Badge, Button, Callout, EmptyState, FileDrop, Select, Skeleton, TextField, cn, focusRing, useToast, type FileDropItem } from "../../../../ui";
import { brandFontErrorMessage, useBrandFontMutations, useBrandFonts } from "../fontsApi";
import { FONT_ACCEPT, WEIGHT_NAMES, fontFilesLine, fontFromFileName, uploadProblem } from "../fontLogic";

function FontRow({ font, canEdit }: { font: BrandFont; canEdit: boolean }) {
  const { remove } = useBrandFontMutations();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="space-y-2 rounded-control border border-line p-3" data-testid={`brand-font-${font.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{font.family}</span>
        <span className="text-xs text-muted">· {fontFilesLine(font)}</span>
        <Badge tone="good">Embedded in PDF</Badge>
        {canEdit && !confirming && (
          <button type="button" aria-label={`Delete ${font.family}`} onClick={() => setConfirming(true)} className={cn("ml-auto rounded-control p-1 text-muted hover:bg-tint hover:text-bad", focusRing)}>
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {confirming && (
        <div role="group" aria-label={`Delete ${font.family}?`} className="space-y-2 rounded-control bg-tint p-2 text-sm text-ink">
          <p>Delete {font.family}? Text using it switches to its style's font. Finals already made keep it.</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={remove.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await remove.mutateAsync(font.id);
                } catch (e) {
                  setError(brandFontErrorMessage(e, "The font couldn't be deleted. Try again."));
                }
              }}
            >
              Delete font
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
    </li>
  );
}

function UploadForm() {
  const { upload } = useBrandFontMutations();
  const { toast } = useToast();
  const [item, setItem] = useState<FileDropItem | null>(null);
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState<number>(400);
  const [style, setStyle] = useState<FontStyle>("normal");
  const [licence, setLicence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const problem = uploadProblem(item?.file ?? null, family, licence);

  const submit = async () => {
    setTried(true);
    setError(null);
    if (problem || !item) return;
    try {
      const font = await upload.mutateAsync({ file: item.file, fields: { family: family.trim(), weight, style, licenceConfirmed: licence } });
      toast({ title: `${font.family} added`, description: "Everyone in the company can use it in their designs.", tone: "good" });
      setItem(null);
      setFamily("");
      setLicence(false);
      setTried(false);
    } catch (e) {
      setError(brandFontErrorMessage(e));
    }
  };

  return (
    <form
      className="space-y-3 border-t border-line pt-3"
      aria-label="Upload a font"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FileDrop
        label="Upload a font (WOFF2, TTF, OTF)"
        help="One file per weight and style, up to 5 MB."
        accept={FONT_ACCEPT}
        maxSize={FONT_MAX_BYTES}
        multiple={false}
        items={item ? [item] : []}
        onAdd={([file]) => {
          setItem({ id: file.name, file });
          const guess = fontFromFileName(file.name);
          setFamily((f) => f || guess.family);
          setWeight(guess.weight);
          setStyle(guess.style);
        }}
        onRemove={() => setItem(null)}
      />
      <TextField label="Font family" value={family} onChange={setFamily} maxLength={60} help="Text boxes show this name in the font list." />
      <div className="grid grid-cols-2 gap-3">
        <Select<number> label="Weight" value={weight} onChange={(v) => v && setWeight(v)} options={FONT_WEIGHTS.map((w) => ({ value: w, label: `${WEIGHT_NAMES[w]} (${w})` }))} />
        <Select<FontStyle> label="Style" value={style} onChange={(v) => v && setStyle(v)} options={FONT_STYLES.map((s) => ({ value: s, label: s === "italic" ? "Italic" : "Upright" }))} />
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 size-4 accent-accent" checked={licence} onChange={(e) => setLicence(e.target.checked)} aria-describedby="font-licence-help" />
        <span>We hold a licence that allows embedding this font in PDFs.</span>
      </label>
      <p id="font-licence-help" className="text-xs text-muted">
        Managers only. Added to the brand kit for everyone in the company. We record who confirmed the licence.
      </p>
      {tried && problem && <p className="text-xs text-bad">{problem}</p>}
      {error && (
        <Callout tone="warn" title="Not uploaded" onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}
      <Button type="submit" variant="primary" size="sm" loading={upload.isPending} disabled={!item}>
        Upload font
      </Button>
    </form>
  );
}

/** Uploaded brand fonts (PE-2). Managers and the Superadmin upload and delete; everyone else sees the list. */
export function BrandFontsSection() {
  const fonts = useBrandFonts();
  const canEdit = !!fonts.data?.canEdit;
  return (
    <section aria-labelledby="bk-brand-fonts" className="space-y-3 rounded-card border border-line bg-panel p-4">
      <h2 id="bk-brand-fonts" className="text-sm font-semibold text-ink">
        Brand fonts
      </h2>
      {fonts.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : fonts.isError ? (
        <EmptyState compact variant="error" title="Brand fonts couldn't be loaded." description={brandFontErrorMessage(fonts.error, "Try again in a moment.")} action={<Button size="sm" onClick={() => void fonts.refetch()}>Try again</Button>} />
      ) : (
        <>
          {fonts.data.fonts.length === 0 ? (
            <p className="text-sm text-muted">No uploaded fonts yet. {canEdit ? "Upload your brand font so text boxes can use it." : "A Manager can upload your brand font."}</p>
          ) : (
            <ul className="space-y-2">
              {fonts.data.fonts.map((f) => (
                <FontRow key={f.id} font={f} canEdit={canEdit} />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            {FONT_IDS.length} built-in fonts are always available <Badge tone="neutral">Built in</Badge>
          </p>
          {canEdit ? <UploadForm /> : <p className="text-xs text-muted">Only Managers can upload or delete brand fonts.</p>}
        </>
      )}
    </section>
  );
}
