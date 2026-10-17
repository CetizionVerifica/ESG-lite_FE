// Framework badge text (05-ux principle 1): "GRI 303-3", "BRSR P6-E3 · Core", "GRI 305-1 +1".
import { FRAMEWORK_CODES, type FrameworkCode } from "./contracts";
import { disclosureBadge } from "./labels";

export type FrameworkUse = { framework: FrameworkCode; code: string; core?: boolean };

export interface FrameworkBadge {
  framework: FrameworkCode;
  codes: string[];
  core: boolean;
  text: string;
}

/** One badge per framework, in GRI, BRSR, ESRS order; several disclosures show the first and "+n". */
export function groupUses(items: FrameworkUse[]): FrameworkBadge[] {
  return FRAMEWORK_CODES.flatMap((framework) => {
    const mine = items.filter((i) => i.framework === framework);
    if (!mine.length) return [];
    const codes = [...new Set(mine.map((i) => i.code))];
    const core = mine.some((i) => i.core);
    const text = `${disclosureBadge(framework, codes[0])}${codes.length > 1 ? ` +${codes.length - 1}` : ""}${core ? " · Core" : ""}`;
    return [{ framework, codes, core, text }];
  });
}
