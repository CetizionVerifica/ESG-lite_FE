import { Link } from "react-router-dom";
import { Callout } from "../../../ui";
import { useDesignStudio } from "../../../lib/studio/switch";

/**
 * DS-3: with Design Studio on for the client, points to the studio Brand kit,
 * where report fonts, palettes and brand voice live. Logos and colours stay
 * here. Nothing shows while the studio is off.
 */
export function BrandKitLink() {
  const { enabled } = useDesignStudio();
  if (!enabled) return null;
  return (
    <Callout tone="brand" title="Design Studio brand kit">
      Report fonts, palettes and brand voice are set in the{" "}
      <Link to="/studio/brand-kit" className="text-brand-text underline underline-offset-2">
        Brand kit
      </Link>
      . Logos and colours set here show there too.
    </Callout>
  );
}
