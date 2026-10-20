// DS-11 · a sandboxed frame for preview.html (RS-5 FE 1): `sandbox="allow-scripts"`
// without same-origin, filled through srcdoc (the HTML was fetched with the
// session), so report content can run its pagination script but can't reach
// the app. Messages come back through the bridge (lib/studio/outputs.ts).
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { goMessage, parseBridgeMessage, type BridgeMessage } from "../../../lib/studio/outputs";
import { cn } from "../../../ui";

export interface PreviewFrameHandle {
  go: (index: number) => void;
  focus: () => void;
}

export const PreviewFrame = forwardRef<PreviewFrameHandle, { html: string; title: string; onMessage?: (m: BridgeMessage) => void; className?: string }>(function PreviewFrame({ html, title, onMessage, className }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = parseBridgeMessage(e.data);
      if (m) handler.current?.(m);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useImperativeHandle(ref, () => ({
    go: (index: number) => frame.current?.contentWindow?.postMessage(goMessage(index), "*"),
    focus: () => frame.current?.focus(),
  }));

  return <iframe ref={frame} title={title} sandbox="allow-scripts" srcDoc={html} className={cn("block size-full border-0", className)} data-testid="preview-frame" />;
});
