import { useState } from "react";
import { cn } from "./cn";
import { initials } from "./initials";

const sizes = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm" };

/** Photo or initials. The name is the accessible label. */
export function Avatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: keyof typeof sizes; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-brand-100 font-medium text-brand-800",
        sizes[size],
        className,
      )}
    >
      {showImage ? <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} /> : <span aria-hidden>{initials(name)}</span>}
    </span>
  );
}
