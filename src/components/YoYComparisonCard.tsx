import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface YoYComparisonCardProps {
  label: string;
  currentValue: number;
  previousValue: number;
  unit?: string;
  currentYear?: number;
  previousYear?: number;
  isDark?: boolean;
  /** If true, an increase is shown as negative (red) - default for emissions */
  increaseIsNegative?: boolean;
  /** Optional color for the value text */
  valueColor?: string;
}

const YoYComparisonCard = ({
  label,
  currentValue,
  previousValue,
  unit = "tCO2e",
  currentYear = new Date().getFullYear(),
  previousYear = new Date().getFullYear() - 1,
  isDark = false,
  increaseIsNegative = true,
  valueColor,
}: YoYComparisonCardProps) => {
  // Calculate percentage change
  const calculateChange = () => {
    if (previousValue === 0) {
      if (currentValue === 0) return { percentage: 0, direction: "neutral" as const };
      return { percentage: 100, direction: "up" as const };
    }
    const change = ((currentValue - previousValue) / previousValue) * 100;
    if (Math.abs(change) < 0.01) return { percentage: 0, direction: "neutral" as const };
    return {
      percentage: Math.abs(change),
      direction: change > 0 ? "up" as const : "down" as const,
    };
  };

  const { percentage, direction } = calculateChange();
  const absoluteChange = Math.abs(currentValue - previousValue);

  // Determine if change is good or bad
  const isPositiveChange = increaseIsNegative
    ? direction === "down"
    : direction === "up";

  // Theme classes
  const cardClass = isDark
    ? "bg-slate-800 rounded-lg shadow-lg shadow-slate-900/50 p-5 border border-slate-700"
    : "bg-white rounded-lg shadow p-5";

  const labelClass = isDark
    ? "text-sm font-medium text-slate-400"
    : "text-sm font-medium text-gray-500";

  const valueClass = isDark
    ? "text-2xl font-bold text-slate-100 mt-1"
    : "text-2xl font-bold text-gray-900 mt-1";

  const unitClass = isDark
    ? "text-xs text-slate-500"
    : "text-xs text-gray-400";

  const yearLabelClass = isDark
    ? "text-xs text-slate-500"
    : "text-xs text-gray-400";

  // Change indicator colors
  const getChangeColor = () => {
    if (direction === "neutral") {
      return isDark ? "text-slate-400" : "text-gray-500";
    }
    if (isPositiveChange) {
      return isDark ? "text-green-400" : "text-green-600";
    }
    return isDark ? "text-red-400" : "text-red-600";
  };

  const getChangeBgColor = () => {
    if (direction === "neutral") {
      return isDark ? "bg-slate-700" : "bg-gray-100";
    }
    if (isPositiveChange) {
      return isDark ? "bg-green-900/30" : "bg-green-50";
    }
    return isDark ? "bg-red-900/30" : "bg-red-50";
  };

  const changeColor = getChangeColor();
  const changeBgColor = getChangeBgColor();

  // Render change icon
  const renderChangeIcon = () => {
    if (direction === "neutral") {
      return <Minus className="w-4 h-4" />;
    }
    if (direction === "up") {
      return <TrendingUp className="w-4 h-4" />;
    }
    return <TrendingDown className="w-4 h-4" />;
  };

  return (
    <div className={cardClass}>
      <div className={labelClass}>{label}</div>
      <div className={`${valueClass} ${valueColor || ""}`}>
        {currentValue.toFixed(2)}
      </div>
      <div className={`${unitClass} mb-3`}>{unit}</div>

      {/* Year-over-Year Change */}
      <div className={`${changeBgColor} rounded-lg p-2.5 mt-2`}>
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1.5 ${changeColor}`}>
            {renderChangeIcon()}
            <span className="text-sm font-semibold">
              {percentage.toFixed(1)}%
            </span>
          </div>
          <span className={yearLabelClass}>vs {previousYear}</span>
        </div>
        <div className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
          {direction === "neutral" ? (
            "No change"
          ) : (
            <>
              {direction === "up" ? "+" : "-"}{absoluteChange.toFixed(2)} {unit}
            </>
          )}
        </div>
      </div>

      {/* Previous year value */}
      <div className={`flex justify-between items-center mt-2 pt-2 border-t ${isDark ? "border-slate-700" : "border-gray-100"}`}>
        <span className={yearLabelClass}>{previousYear}</span>
        <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>
          {previousValue.toFixed(2)} {unit}
        </span>
      </div>
    </div>
  );
};

export default YoYComparisonCard;
