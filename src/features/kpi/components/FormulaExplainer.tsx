import { Calculator } from "lucide-react";
import type { MyKpiFormulaInput } from "../../../lib/kpi/contracts";
import { evaluateFormula, explainFormula, inputsByCode } from "../../../lib/kpi/formula";
import { VALUE_STATUS_LABEL } from "../../../lib/kpi/labels";
import { cn } from "../../../ui";

/**
 * KPI-6 · "How it's calculated" for a calculated (formula) KPI: the working
 * with every input's value, or what it's waiting for. A preview: the server
 * calculates the reported figure, and its number wins when it sends one.
 */
export function FormulaExplainer({
  name,
  formula,
  inputs,
  unit,
  decimals,
  serverValue,
  className,
}: {
  name: string;
  formula: string;
  inputs: MyKpiFormulaInput[];
  unit: string | null;
  decimals?: number;
  /** The server's calculated value, when it has one. */
  serverValue?: number | null;
  className?: string;
}) {
  const byCode = inputsByCode(inputs);
  const result = evaluateFormula(formula, byCode);
  const text = explainFormula(formula, byCode, { name, unit, decimals });
  const waiting = inputs.filter((i) => i.status && i.status !== "approved");
  return (
    <div className={cn("space-y-1 text-sm", className)}>
      <p className="flex items-start gap-1.5 text-ink">
        <Calculator aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <span>{text}</span>
      </p>
      {result.ok && serverValue == null && (
        <p className="text-xs text-muted">
          {waiting.length
            ? `Preview. It's final once ${waiting.map((w) => `${w.name.toLowerCase()} (${VALUE_STATUS_LABEL[w.status as keyof typeof VALUE_STATUS_LABEL].toLowerCase()})`).join(" and ")} ${waiting.length === 1 ? "is" : "are"} approved.`
            : "Preview. ESGLite calculates the final figure."}
        </p>
      )}
    </div>
  );
}
