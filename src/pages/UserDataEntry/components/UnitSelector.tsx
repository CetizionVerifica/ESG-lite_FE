import { canConvert, getConversionFactor, unitsMatchExact } from "../../../utils/unitConversions";
import { UnitData } from "../../../services/unitService";

interface UnitSelectorProps {
  currentUnit: string | undefined;
  expectedUnit: string | null;
  units: UnitData[];
  onChange: (value: string) => void;
}

const UnitSelector = ({
  currentUnit,
  expectedUnit,
  units,
  onChange,
}: UnitSelectorProps) => {
  const isMatch = !expectedUnit || !currentUnit || unitsMatchExact(expectedUnit, currentUnit);
  const conversionAvailable = expectedUnit && currentUnit && canConvert(currentUnit, expectedUnit);

  const getBorderClass = () => {
    if (!isMatch && !conversionAvailable) return "border-red-500 focus:ring-red-300";
    if (!isMatch && conversionAvailable) return "border-yellow-500 focus:ring-yellow-300";
    return "border-gray-300 focus:ring-blue-300";
  };

  return (
    <div className="space-y-1">
      <select
        value={currentUnit || ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border px-2 py-1 rounded focus:outline-none focus:ring ${getBorderClass()}`}
      >
        <option value="">Select Unit</option>
        {units.map((unit) => (
          <option key={unit.unit_id} value={unit.unit_name}>
            {unit.unit_name}
            {expectedUnit && unit.unit_name.toLowerCase() === expectedUnit.toLowerCase()
              ? " (Expected)"
              : ""}
          </option>
        ))}
      </select>

      {expectedUnit && (
        <div className="text-xs text-gray-500">
          Expected: <span className="font-medium">{expectedUnit}</span>
        </div>
      )}

      {!isMatch && !conversionAvailable && (
        <div className="text-xs text-red-600">
          Unit mismatch! Select "{expectedUnit}" to proceed.
        </div>
      )}

      {!isMatch && conversionAvailable && (
        <div className="text-xs text-yellow-600">
          <button
            type="button"
            onClick={() => onChange(expectedUnit!)}
            className="underline hover:text-yellow-800"
          >
            Use {expectedUnit} instead
          </button>
          <div className="text-xs text-gray-500 mt-1">
            Conversion: 1 {currentUnit} = {getConversionFactor(currentUnit, expectedUnit)}{" "}
            {expectedUnit}
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitSelector;
