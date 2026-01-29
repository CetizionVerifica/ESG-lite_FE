import { EmissionIntensityData } from "../../../services/productionDataService";

interface EmissionIntensityCardProps {
  data: EmissionIntensityData | null;
  loading: boolean;
}

const EmissionIntensityCard = ({ data, loading }: EmissionIntensityCardProps) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm font-medium text-gray-500">Emission Intensity</div>
        <div className="animate-pulse h-8 bg-gray-200 rounded mt-2"></div>
      </div>
    );
  }

  if (!data || data.productionByUnit.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm font-medium text-gray-500">Emission Intensity</div>
        <div className="text-lg text-gray-400 mt-1">No data</div>
        <div className="text-xs text-gray-400 mt-1">
          Add production data to calculate
        </div>
      </div>
    );
  }

  // Show the primary intensity (first unit type)
  const primary = data.productionByUnit[0];

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="text-sm font-medium text-gray-500">Emission Intensity</div>
      <div className="text-2xl font-bold text-purple-600 mt-1">
        {primary.emissionIntensity.toFixed(4)}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        tCO2e per {primary.unit}
      </div>
      <div className="text-xs text-gray-500 mt-2">
        Production: {primary.totalProduction.toLocaleString()} {primary.unit}
      </div>
    </div>
  );
};

export default EmissionIntensityCard;
