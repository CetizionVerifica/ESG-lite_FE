
const KPICards = ({ kpis }: any) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm font-medium text-gray-500">Total Emissions</div>
        <div className="text-2xl font-bold text-gray-900 mt-1">
          {kpis.totalEmissions.toFixed(2)}
        </div>
        <div className="text-xs text-gray-400 mt-1">tCO2e</div>
      </div>
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm font-medium text-gray-500">Pending Approvals</div>
        <div className="text-2xl font-bold text-yellow-600 mt-1">
          {kpis.pendingCount}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          {kpis.pendingEmissionValue.toFixed(2)} tCO2e
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm font-medium text-gray-500">Approved</div>
        <div className="text-2xl font-bold text-green-600 mt-1">
          {kpis.approvedCount}
        </div>
        <div className="text-xs text-gray-400 mt-1">entries</div>
      </div>
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm font-medium text-gray-500">Rejected</div>
        <div className="text-2xl font-bold text-red-600 mt-1">
          {kpis.rejectedCount}
        </div>
        <div className="text-xs text-gray-400 mt-1">entries</div>
      </div>
    </div>
  );
};

export default KPICards;
