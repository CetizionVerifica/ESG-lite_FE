// DS-13 · File ▾ → "Save as template…" and "Save this page as a layout…"
// (RS-10 §1–2): the design (or the page in view) becomes a company template
// or layout. Elements you locked become locked for everyone who uses it
// (template locks), unless "Lock locked elements" is turned off.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, TextField, Toggle } from "../../../ui";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { useEditor } from "../editor/EditorContext";
import { dsError } from "../share/api";
import { useSafeToast } from "../share/useSafeToast";
import { saveLayoutFromPage, saveTemplateFromDoc } from "./api";

export type SaveAs = "template" | "layout";

export function SaveTemplateDialog({ mode, onClose }: { mode: SaveAs | null; onClose: () => void }) {
  const ed = useEditor();
  const companyId = useStudioCompanyId();
  const qc = useQueryClient();
  const toast = useSafeToast();
  const page = ed.page;
  const [name, setName] = useState("");
  const [lock, setLock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = mode === "layout" ? (page?.elements ?? []).filter((e) => e.locked).length : ed.doc.pages.reduce((n, p) => n + (p.kind === "freeform" ? p.elements.filter((e) => e.locked).length : 0), 0);
  useEffect(() => {
    if (!mode) return;
    setName(mode === "template" ? `${ed.doc.meta.title} template` : (page?.name ?? "My layout"));
    setLock(true);
    setError(null);
    // Prefill once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "template") await saveTemplateFromDoc({ docId: ed.docId, name: name.trim(), lockLocked: lock }, companyId);
      else if (page) await saveLayoutFromPage({ docId: ed.docId, pageId: page.id, name: name.trim(), lockLocked: lock }, companyId);
      await qc.invalidateQueries({ queryKey: ["studio", mode === "template" ? "templates" : "layouts"] });
      toast({ title: mode === "template" ? `Saved "${name.trim()}" to your templates` : `Saved "${name.trim()}" to your layouts`, tone: "good" });
      onClose();
    } catch (err) {
      setError(dsError(err).message ?? "It couldn't be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={mode === "template" ? "Save as template" : "Save this page as a layout"}
      description={mode === "template" ? "Your team can start new designs from it. Numbers stay linked: they fill in from each new design's data." : "It appears under Add page and in the Templates drawer for this kind of report."}
      error={error}
      primaryAction={{ label: "Save", onClick: () => void save(), loading: busy, disabled: !name.trim() || (mode === "layout" && !page) }}
    >
      <div className="flex flex-col gap-3">
        <TextField label="Name" value={name} onChange={setName} required maxLength={200} />
        <Toggle
          label="Lock locked elements for everyone"
          help={locked ? `${locked} locked element${locked === 1 ? "" : "s"} (logos, backgrounds, page furniture) can't be moved or edited in designs made from it.` : "Lock elements first (Position → Layers) to keep them fixed in designs made from it."}
          checked={lock}
          onChange={setLock}
        />
      </div>
    </Modal>
  );
}
