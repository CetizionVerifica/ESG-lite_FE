import { EmissionData } from "../../../services/emissionService";

interface PendingEmissionsListProps {
  pendingEmissions: EmissionData[];
  totalPendingCount: number;
}

const PendingEmissionsList = ({ pendingEmissions, totalPendingCount }: PendingEmissionsListProps) => {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          Pending Emissions
          <span className="ml-2 text-sm font-normal text-yellow-600">
            ({totalPendingCount})
          </span>
        </h3>
        {totalPendingCount > 5 && (
          <span className="text-sm text-blue-600">
            Showing 5 of {totalPendingCount}
          </span>
        )}
      </div>
      {pendingEmissions.length > 0 ? (
        <div className="space-y-3">
          {pendingEmissions.map((emission) => (
            <div
              key={emission.pk_id}
              className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-100"
            >
              <div>
                <div className="font-medium text-sm">
                  {emission.category?.category_name || "Unknown Category"}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(emission.date_of_reporting).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-yellow-700">
                  {(Number(emission.total_emission) || 0).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">tCO2e</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-50 text-gray-500">
          No pending emissions
        </div>
      )}
    </div>
  );
};

export default PendingEmissionsList;
