// DS-9 · "Design from a brief" on the studio home (05-ux S1/S4): opens the
// brief dialog; Accept builds the design through DS-5 and opens it.
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "../../../ui";
import { BriefDialog } from "./BriefDialog";

export function BriefButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon={<Sparkles aria-hidden className="size-4" />} onClick={() => setOpen(true)} data-testid="studio-brief">
        Design from a brief
      </Button>
      <BriefDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
