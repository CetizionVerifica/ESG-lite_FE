import { EmissionCalculationResult } from "../types";

interface EmissionPreviewProps {
  result: EmissionCalculationResult;
}

const EmissionPreview = ({ result }: EmissionPreviewProps) => {
  if (result.value !== null) {
    const colorClass = result.status === "converted" ? "text-yellow-600" : "text-green-600";

    return (
      <div className="space-y-1">
        <div className={`font-semibold ${colorClass}`}>{result.value.toFixed(2)}</div>
        {result.status === "converted" && (
          <div className="text-xs text-yellow-600">(with conversion)</div>
        )}
      </div>
    );
  }

  return <div className="text-xs text-gray-400 italic">{result.status}</div>;
};

export default EmissionPreview;
