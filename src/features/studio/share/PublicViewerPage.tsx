// DS-11 · `/s/:token`: the public, read-only view of a shared PDF (D15). No
// session and no app chrome: the company logo, the design's title, which
// version it is, when the link expires, the stored PDF in the browser's PDF
// viewer, and a download. An expired or turned-off link says so.
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Download, Link2Off } from "lucide-react";
import { EmptyState, Loading, cn, focusRing } from "../../../ui";
import { getPublicShare, publicFileUrl } from "./api";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function PublicViewerPage() {
  const { token = "" } = useParams();
  const meta = useQuery({ queryKey: ["studio", "public-share", token], queryFn: () => getPublicShare(token), retry: false, refetchOnWindowFocus: false });

  if (meta.isPending) return <Loading label="Opening the report">{null}</Loading>;
  if (meta.isError) {
    const status = (meta.error as { status?: number }).status;
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-6">
        <EmptyState
          icon={Link2Off}
          title={status === 410 ? "This link has expired." : status === 429 ? "Too many requests." : "Link not found."}
          description={status === 410 ? "It expired or was turned off. Ask the person who shared it for a new one." : status === 429 ? "Wait a minute, then try again." : "Check the link, or ask the person who shared it for a new one."}
        />
      </main>
    );
  }
  const m = meta.data;
  const file = publicFileUrl(m.fileUrl);
  return (
    <div className="flex h-screen flex-col bg-canvas text-ink" data-testid="public-viewer">
      <header className="flex flex-none flex-wrap items-center gap-4 border-b border-line bg-panel px-5 py-3">
        {m.logoUrl && <img src={m.logoUrl} alt={m.company} className="max-h-9 max-w-40 object-contain" />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{m.title}</h1>
          <p className="text-[13px] text-muted">
            {m.company} · {m.label}
            {m.pageCount ? ` · ${m.pageCount} pages` : ""} · Read only · Link expires {day(m.expiresAt)}
          </p>
        </div>
        <a href={`${file}?download=1`} className={cn("inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90", focusRing)}>
          <Download aria-hidden className="size-4" /> Download PDF
        </a>
      </header>
      <main className="min-h-0 flex-1">
        <iframe src={file} title={`${m.title} · ${m.label}`} className="block size-full border-0" />
      </main>
    </div>
  );
}
