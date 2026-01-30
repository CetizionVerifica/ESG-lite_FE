import { EmissionIntensityData } from "../../../services/productionDataService";

interface EmissionIntensityCardProps {
  data: EmissionIntensityData | null;
  loading: boolean;
  isDark?: boolean;
}

const EmissionIntensityCard = ({ data, loading, isDark = false }: EmissionIntensityCardProps) => {
  const cardClass = isDark
    ? "bg-slate-800 rounded-lg shadow-lg shadow-slate-900/50 p-5 border border-slate-700"
    : "bg-white rounded-lg shadow p-5";

  const labelClass = isDark
    ? "text-sm font-medium text-slate-400"
    : "text-sm font-medium text-gray-500";

  const valueClass = isDark
    ? "text-2xl font-bold text-purple-400 mt-1"
    : "text-2xl font-bold text-purple-600 mt-1";

  const unitClass = isDark
    ? "text-xs text-slate-500 mt-1"
    : "text-xs text-gray-400 mt-1";

  const secondaryClass = isDark
    ? "text-xs text-slate-400 mt-2"
    : "text-xs text-gray-500 mt-2";

  if (loading) {
    return (
      <div className={cardClass}>
        <div className={labelClass}>Emission Intensity</div>
        <div className={`animate-pulse h-8 rounded mt-2 ${isDark ? "bg-slate-700" : "bg-gray-200"}`}></div>
      </div>
    );
  }

  if (!data || data.productionByUnit.length === 0) {
    return (
      <div className={cardClass}>
        <div className={labelClass}>Emission Intensity</div>
        <div className={`text-lg mt-1 ${isDark ? "text-slate-500" : "text-gray-400"}`}>No data</div>
        <div className={unitClass}>
          Add production data to calculate
        </div>
      </div>
    );
  }

  // Show the primary intensity (first unit type)
  const primary = data.productionByUnit[0];

  return (
    <div className={cardClass}>
      <div className={labelClass}>Emission Intensity</div>
      <div className={valueClass}>
        {primary.emissionIntensity.toFixed(4)}
      </div>
      <div className={unitClass}>
        tCO2e per {primary.unit}
      </div>
      <div className={secondaryClass}>
        Production: {primary.totalProduction.toLocaleString()} {primary.unit}
      </div>
    </div>
  );
};

export default EmissionIntensityCard;
