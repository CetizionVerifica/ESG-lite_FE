import { useState, useEffect, useMemo } from "react";
import { ArrowDownUp, Car, Navigation, Route } from "lucide-react";
import Modal from "../../../components/Modal";
import LocationSearchInput from "./LocationSearchInput";
import MapView from "./MapView";
import { GeocodingResult } from "../../../services/geocodingService";
import {
  getRoute,
  convertDistanceFromMeters,
  haversineDistanceMeters,
  RouteResult,
} from "../../../services/routingService";

type TravelMode = "road" | "air-sea";

interface DistanceCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUnit: string;
  onDistanceCalculated: (distance: number) => void;
}

const DistanceCalculatorModal = ({
  isOpen,
  onClose,
  targetUnit,
  onDistanceCalculated,
}: DistanceCalculatorModalProps) => {
  const [startLocation, setStartLocation] = useState<GeocodingResult | null>(
    null,
  );
  const [endLocation, setEndLocation] = useState<GeocodingResult | null>(null);
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("road");

  // Instant aerial distance (Haversine — great-circle)
  const aerialDistance = useMemo(() => {
    if (!startLocation || !endLocation) return null;
    const meters = haversineDistanceMeters(
      [startLocation.lat, startLocation.lon],
      [endLocation.lat, endLocation.lon],
    );
    return convertDistanceFromMeters(meters, targetUnit);
  }, [startLocation, endLocation, targetUnit]);

  // Road distance from OSRM (async)
  const roadDistance = route
    ? convertDistanceFromMeters(route.distanceMeters, targetUnit)
    : null;

  // Only fetch road route in Road mode (Air / Sea uses Haversine)
  useEffect(() => {
    if (!startLocation || !endLocation || travelMode !== "road") return;

    let cancelled = false;
    setIsCalculating(true);
    setError(null);

    getRoute(
      [startLocation.lat, startLocation.lon],
      [endLocation.lat, endLocation.lon],
    )
      .then((result) => {
        if (!cancelled) setRoute(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to calculate route");
      })
      .finally(() => {
        if (!cancelled) setIsCalculating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [startLocation, endLocation, travelMode]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStartLocation(null);
      setEndLocation(null);
      setStartQuery("");
      setEndQuery("");
      setRoute(null);
      setError(null);
      setIsCalculating(false);
      setTravelMode("road");
    }
  }, [isOpen]);

  // Clear road route when switching modes
  const handleModeChange = (mode: TravelMode) => {
    setTravelMode(mode);
    setRoute(null);
    setError(null);
  };

  const currentDistance =
    travelMode === "road" ? roadDistance : aerialDistance;

  const handleUseDistance = () => {
    if (currentDistance !== null) {
      onDistanceCalculated(currentDistance);
      onClose();
    }
  };

  const handleStartSelect = (result: GeocodingResult) => {
    setStartLocation(result);
    setStartQuery(result.display_name);
    setRoute(null);
  };

  const handleStartClear = () => {
    setStartLocation(null);
    setStartQuery("");
    setRoute(null);
  };

  const handleEndSelect = (result: GeocodingResult) => {
    setEndLocation(result);
    setEndQuery(result.display_name);
    setRoute(null);
  };

  const handleEndClear = () => {
    setEndLocation(null);
    setEndQuery("");
    setRoute(null);
  };

  const handleSwap = () => {
    setStartLocation(endLocation);
    setEndLocation(startLocation);
    setStartQuery(endQuery);
    setEndQuery(startQuery);
    setRoute(null);
  };

  const shortName = (name: string) => {
    const parts = name.split(",");
    return parts.length > 1
      ? `${parts[0].trim()}, ${parts[1].trim()}`
      : parts[0].trim();
  };

  const bothLocationsSet = startLocation && endLocation;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Calculate Distance"
      className="max-w-2xl!"
    >
      <div className="space-y-4">
        {/* Travel mode selector */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange("road")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              travelMode === "road"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Car size={16} />
            Road
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("air-sea")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              travelMode === "air-sea"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Navigation size={16} />
            Air / Sea
          </button>
        </div>

        {/* Location inputs with swap button */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-3">
            <LocationSearchInput
              label="Start Location"
              value={startQuery}
              onSelect={handleStartSelect}
              onClear={handleStartClear}
              placeholder="Search for start location..."
              markerColor="green"
            />
            <LocationSearchInput
              label="End Location"
              value={endQuery}
              onSelect={handleEndSelect}
              onClear={handleEndClear}
              placeholder="Search for end location..."
              markerColor="red"
            />
          </div>
          {(startLocation || endLocation) && (
            <button
              type="button"
              onClick={handleSwap}
              className="mb-3 p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              title="Swap start and end"
            >
              <ArrowDownUp size={18} />
            </button>
          )}
        </div>

        {/* Map */}
        <MapView
          startPoint={
            startLocation ? [startLocation.lat, startLocation.lon] : null
          }
          endPoint={endLocation ? [endLocation.lat, endLocation.lon] : null}
          routeGeometry={
            travelMode === "road" ? (route?.geometry ?? null) : null
          }
          startLabel={startQuery ? shortName(startQuery) : undefined}
          endLabel={endQuery ? shortName(endQuery) : undefined}
        />

        {/* Distance result — Driving mode */}
        {travelMode === "road" && bothLocationsSet && (
          <>
            {isCalculating && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 animate-pulse">
                <Route size={18} className="text-blue-400 shrink-0" />
                <div className="text-sm text-blue-600">
                  Calculating road distance...
                </div>
              </div>
            )}

            {roadDistance !== null && !isCalculating && (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <Car size={18} className="text-green-500 shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-green-600">Road Distance</div>
                  <div className="text-xl font-semibold text-green-800">
                    {roadDistance.toLocaleString()} {targetUnit}
                  </div>
                </div>
              </div>
            )}

            {error && !isCalculating && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {error}
              </div>
            )}
          </>
        )}

        {/* Distance result — Air / Sea mode (instant) */}
        {travelMode === "air-sea" && aerialDistance !== null && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Navigation size={18} className="text-green-500 shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-green-600">
                Straight-Line Distance (Great Circle)
              </div>
              <div className="text-xl font-semibold text-green-800">
                {aerialDistance.toLocaleString()} {targetUnit}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUseDistance}
            disabled={currentDistance === null || isCalculating}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Use Distance
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DistanceCalculatorModal;
