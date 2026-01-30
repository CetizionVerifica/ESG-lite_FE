import { EmissionData } from "../../../services/emissionService";

interface PendingEmissionsListProps {
  pendingEmissions: EmissionData[];
  totalPendingCount: number;
  isDark?: boolean;
}

const PendingEmissionsList = ({ pendingEmissions, totalPendingCount, isDark = false }: PendingEmissionsListProps) => {
  const cardClass = isDark
    ? "bg-slate-800 rounded-lg shadow-lg shadow-slate-900/50 p-5 border border-slate-700"
    : "bg-white rounded-lg shadow p-5";

  const titleClass = isDark
    ? "text-lg font-semibold text-slate-100"
    : "text-lg font-semibold text-gray-900";

  const badgeClass = isDark
    ? "ml-2 text-sm font-normal text-yellow-400"
    : "ml-2 text-sm font-normal text-yellow-600";

  const showMoreClass = isDark
    ? "text-sm text-blue-400"
    : "text-sm text-blue-600";

  const itemClass = isDark
    ? "flex items-center justify-between p-3 bg-yellow-900/20 rounded-lg border border-yellow-700/30"
    : "flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-100";

  const itemTitleClass = isDark
    ? "font-medium text-sm text-slate-200"
    : "font-medium text-sm text-gray-900";

  const itemDateClass = isDark
    ? "text-xs text-slate-400"
    : "text-xs text-gray-500";

  const itemValueClass = isDark
    ? "font-semibold text-yellow-400"
    : "font-semibold text-yellow-700";

  const emptyClass = isDark
    ? "flex items-center justify-center h-50 text-slate-500"
    : "flex items-center justify-center h-50 text-gray-500";

  return (
    <div className={cardClass}>
      <div className="flex justify-between items-center mb-4">
        <h3 className={titleClass}>
          Pending Emissions
          <span className={badgeClass}>
            ({totalPendingCount})
          </span>
        </h3>
        {totalPendingCount > 5 && (
          <span className={showMoreClass}>
            Showing 5 of {totalPendingCount}
          </span>
        )}
      </div>
      {pendingEmissions.length > 0 ? (
        <div className="space-y-3">
          {pendingEmissions.map((emission) => (
            <div
              key={emission.pk_id}
              className={itemClass}
            >
              <div>
                <div className={itemTitleClass}>
                  {emission.category?.category_name || "Unknown Category"}
                </div>
                <div className={itemDateClass}>
                  {new Date(emission.date_of_reporting).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className={itemValueClass}>
                  {(Number(emission.total_emission) || 0).toFixed(2)}
                </div>
                <div className={itemDateClass}>tCO2e</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={emptyClass}>
          No pending emissions
        </div>
      )}
    </div>
  );
};

export default PendingEmissionsList;
