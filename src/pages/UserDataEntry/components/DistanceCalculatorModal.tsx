import { useState, useEffect, useMemo } from "react";
import { ArrowDownUp, Car, Navigation, Anchor, Route } from "lucide-react";
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
import { getCanonicalDistanceUnit } from "../../../utils/distanceUnits";

type TravelMode = "road" | "air" | "sea";

const METERS_PER_NAUTICAL_MILE = 1852;

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

  // Display unit: always show the pure distance unit (e.g. "km" from "tonne.km")
  const displayUnit = getCanonicalDistanceUnit(targetUnit) || targetUnit;

  // Haversine distance in meters (used by both Air and Sea)
  const haversineMeters = useMemo(() => {
    if (!startLocation || !endLocation) return null;
    return haversineDistanceMeters(
      [startLocation.lat, startLocation.lon],
      [endLocation.lat, endLocation.lon],
    );
  }, [startLocation, endLocation]);

  // Air: straight-line distance in target unit
  const airDistance = useMemo(() => {
    if (haversineMeters === null) return null;
    return convertDistanceFromMeters(haversineMeters, targetUnit);
  }, [haversineMeters, targetUnit]);

  // Sea: calculate in nautical miles, then convert to target unit
  const seaNauticalMiles = useMemo(() => {
    if (haversineMeters === null) return null;
    return Math.round((haversineMeters / METERS_PER_NAUTICAL_MILE) * 100) / 100;
  }, [haversineMeters]);

  const seaDistance = useMemo(() => {
    if (seaNauticalMiles === null) return null;
    // Convert nautical miles to target unit
    const seaMeters = seaNauticalMiles * METERS_PER_NAUTICAL_MILE;
    return convertDistanceFromMeters(seaMeters, targetUnit);
  }, [seaNauticalMiles, targetUnit]);

  // Road distance from OSRM (async)
  const roadDistance = route
    ? convertDistanceFromMeters(route.distanceMeters, targetUnit)
    : null;

  // Only fetch road route in Road mode (Air / Sea uses Haversine)
  useEffect(() => {
    if (!startLocation || !endLocation || travelMode !== "road") return;

    const controller = new AbortController();
    setIsCalculating(true);
    setError(null);

    getRoute(
      [startLocation.lat, startLocation.lon],
      [endLocation.lat, endLocation.lon],
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setRoute(result);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err.message || "Failed to calculate route");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsCalculating(false);
      });

    return () => {
      controller.abort();
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
    travelMode === "road" ? roadDistance : travelMode === "air" ? airDistance : seaDistance;

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
            onClick={() => handleModeChange("air")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              travelMode === "air"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Navigation size={16} />
            Air
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("sea")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              travelMode === "sea"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Anchor size={16} />
            Sea
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
          travelMode={travelMode}
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
                    {roadDistance.toLocaleString()} {displayUnit}
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

        {/* Distance result — Air mode (straight-line) */}
        {travelMode === "air" && airDistance !== null && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Navigation size={18} className="text-green-500 shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-green-600">
                Straight-Line Distance (Great Circle)
              </div>
              <div className="text-xl font-semibold text-green-800">
                {airDistance.toLocaleString()} {displayUnit}
              </div>
            </div>
          </div>
        )}

        {/* Distance result — Sea mode (nautical miles converted to target unit) */}
        {travelMode === "sea" && seaDistance !== null && seaNauticalMiles !== null && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Anchor size={18} className="text-green-500 shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-green-600">
                Sea Distance (Nautical)
              </div>
              <div className="text-xl font-semibold text-green-800">
                {seaDistance.toLocaleString()} {displayUnit}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {seaNauticalMiles.toLocaleString()} nautical miles
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
