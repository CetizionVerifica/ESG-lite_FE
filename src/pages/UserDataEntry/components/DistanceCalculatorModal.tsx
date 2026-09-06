import { useState, useEffect, useMemo } from "react";
import { ArrowDownUp, Car, Navigation, Anchor, Route, TrainFront } from "lucide-react";
import Modal from "../../../components/Modal";
import LocationSearchInput from "./LocationSearchInput";
import type { ResolvedLocation as GeocodingResult } from "../../../services/locationService";
import MapView from "./MapView";
import {
  convertDistanceFromMeters,
  haversineDistanceMeters,
} from "../../../services/routingService";
import {
  calculateRoadDistance,
  calculateSeaDistance,
  type RoadDistanceData,
  type SeaDistanceData,
} from "../../../services/distanceService";
import { getCanonicalDistanceUnit } from "../../../utils/distanceUnits";

type TravelMode = "road" | "air" | "sea" | "rail";

// Rail has no public routing service (Google routes roads, not railways). The
// Rail mode ESTIMATES: it uses the road route between the two points — freight
// rail follows the same corridors, typically within 10-15% — and falls back to
// straight-line × a standard rail circuity factor when no road route exists.
// The result is labelled as an estimate wherever it is shown.
const RAIL_STRAIGHT_LINE_FACTOR = 1.2;

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
  const [roadResult, setRoadResult] = useState<RoadDistanceData | null>(null);
  const [seaResult, setSeaResult] = useState<SeaDistanceData | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("road");

  const displayUnit = getCanonicalDistanceUnit(targetUnit) || targetUnit;

  const haversineMeters = useMemo(() => {
    if (!startLocation || !endLocation) return null;

    return haversineDistanceMeters(
      [startLocation.lat, startLocation.lon],
      [endLocation.lat, endLocation.lon],
    );
  }, [startLocation, endLocation]);

  const airDistance = useMemo(() => {
    if (haversineMeters === null) return null;
    return convertDistanceFromMeters(haversineMeters, targetUnit);
  }, [haversineMeters, targetUnit]);

  // Keep current formula-based sea logic as fallback
  const fallbackSeaNauticalMiles = useMemo(() => {
    if (haversineMeters === null) return null;
    return Math.round((haversineMeters / METERS_PER_NAUTICAL_MILE) * 100) / 100;
  }, [haversineMeters]);

  const fallbackSeaDistance = useMemo(() => {
    if (fallbackSeaNauticalMiles === null) return null;

    return convertDistanceFromMeters(
      fallbackSeaNauticalMiles * METERS_PER_NAUTICAL_MILE,
      targetUnit,
    );
  }, [fallbackSeaNauticalMiles, targetUnit]);

  const roadDistance = roadResult
    ? convertDistanceFromMeters(roadResult.distanceMeters, targetUnit)
    : null;

  // Rail estimate: road corridor first, straight-line × factor as fallback.
  const railFallbackDistance =
    airDistance !== null
      ? Math.round(airDistance * RAIL_STRAIGHT_LINE_FACTOR * 100) / 100
      : null;
  const railDistance = roadDistance ?? (error ? railFallbackDistance : null);

  const apiSeaDistance = seaResult
    ? convertDistanceFromMeters(seaResult.distanceMeters, targetUnit)
    : null;

  const finalSeaDistance = apiSeaDistance ?? fallbackSeaDistance;

  const finalSeaNauticalMiles =
    seaResult?.distanceMeters != null
      ? Math.round(
          (seaResult.distanceMeters / METERS_PER_NAUTICAL_MILE) * 100,
        ) / 100
      : fallbackSeaNauticalMiles;

  useEffect(() => {
    if (!startLocation || !endLocation) return;
    if (travelMode !== "road" && travelMode !== "sea" && travelMode !== "rail") return;

    let cancelled = false;

    setIsCalculating(true);
    setError(null);
    setRoadResult(null);
    setSeaResult(null);

    const commonPayload = {
      origin: {
        address: startLocation.display_name,
        lat: startLocation.lat,
        lng: startLocation.lon,
        placeId: startLocation.place_id || undefined,
      },
      destination: {
        address: endLocation.display_name,
        lat: endLocation.lat,
        lng: endLocation.lon,
        placeId: endLocation.place_id || undefined,
      },
    };

    const handleError = (err: any, mode: "road" | "sea") => {
      if (cancelled) return;

      setError(
        err?.response?.data?.message ||
          err?.message ||
          `Failed to calculate ${mode} distance`,
      );
    };

    if (travelMode === "road" || travelMode === "rail") {
      // rail = road corridor estimate (see RAIL_STRAIGHT_LINE_FACTOR note)
      calculateRoadDistance({
        ...commonPayload,
        mode: "road",
      })
        .then((result) => {
          if (cancelled) return;
          setRoadResult(result);
        })
        .catch((err: any) => handleError(err, "road"))
        .finally(() => {
          if (!cancelled) setIsCalculating(false);
        });
    } else {
      calculateSeaDistance({
        ...commonPayload,
        mode: "sea",
      })
        .then((result) => {
          if (cancelled) return;
          setSeaResult(result);
        })
        .catch((err: any) => handleError(err, "sea"))
        .finally(() => {
          if (!cancelled) setIsCalculating(false);
        });
    }

    return () => {
      // A mode switch mid-request must not leave the spinner (and the
      // "Use Distance" button) stuck: the in-flight .finally is skipped
      // when cancelled, so reset here.
      cancelled = true;
      setIsCalculating(false);
    };
  }, [startLocation, endLocation, travelMode]);

  useEffect(() => {
    if (!isOpen) {
      setStartLocation(null);
      setEndLocation(null);
      setStartQuery("");
      setEndQuery("");
      setRoadResult(null);
      setSeaResult(null);
      setError(null);
      setIsCalculating(false);
      setTravelMode("road");
    }
  }, [isOpen]);

  const handleModeChange = (mode: TravelMode) => {
    setTravelMode(mode);
    setRoadResult(null);
    setSeaResult(null);
    setError(null);
    setIsCalculating(false);
  };

  const currentDistance =
    travelMode === "road"
      ? roadDistance
      : travelMode === "rail"
        ? railDistance
        : travelMode === "air"
          ? airDistance
          : finalSeaDistance;

  const handleUseDistance = () => {
    if (currentDistance !== null) {
      onDistanceCalculated(currentDistance);
      onClose();
    }
  };

  const handleStartSelect = (result: GeocodingResult) => {
    setStartLocation(result);
    setStartQuery(result.display_name);
    setRoadResult(null);
    setSeaResult(null);
    setError(null);
  };

  const handleStartClear = () => {
    setStartLocation(null);
    setStartQuery("");
    setRoadResult(null);
    setSeaResult(null);
    setError(null);
  };

  const handleEndSelect = (result: GeocodingResult) => {
    setEndLocation(result);
    setEndQuery(result.display_name);
    setRoadResult(null);
    setSeaResult(null);
    setError(null);
  };

  const handleEndClear = () => {
    setEndLocation(null);
    setEndQuery("");
    setRoadResult(null);
    setSeaResult(null);
    setError(null);
  };

  const handleSwap = () => {
    setStartLocation(endLocation);
    setEndLocation(startLocation);
    setStartQuery(endQuery);
    setEndQuery(startQuery);
    setRoadResult(null);
    setSeaResult(null);
    setError(null);
  };

  const bothLocationsSet = Boolean(startLocation && endLocation);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Calculate Distance"
      className="max-w-2xl!"
    >
      <div className="space-y-4">
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
            onClick={() => handleModeChange("rail")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              travelMode === "rail"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            title="Estimated from the road corridor"
          >
            <TrainFront size={16} />
            Rail
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

        <MapView
          startPoint={
            startLocation ? [startLocation.lat, startLocation.lon] : null
          }
          endPoint={endLocation ? [endLocation.lat, endLocation.lon] : null}
          encodedPolyline={travelMode === "road" || travelMode === "rail" ? roadResult?.encodedPolyline : null}
          seaGeometry={travelMode === "sea" ? seaResult?.seaGeometry ?? null : null}
          travelMode={travelMode === "rail" ? "road" : travelMode}
        />

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
                  {roadResult?.durationText && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Estimated duration: {roadResult.durationText}
                    </div>
                  )}
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

        {travelMode === "rail" && bothLocationsSet && (
          <>
            {isCalculating && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 animate-pulse">
                <Route size={18} className="text-blue-400 shrink-0" />
                <div className="text-sm text-blue-600">Estimating rail distance from the road corridor...</div>
              </div>
            )}

            {roadDistance !== null && !isCalculating && (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <TrainFront size={18} className="text-green-500 shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-green-600">Rail Distance — estimated from the road corridor</div>
                  <div className="text-xl font-semibold text-green-800">
                    {roadDistance.toLocaleString()} {displayUnit}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Freight rail follows the same corridors as the road network; actual track distance is typically within 10–15%. Recorded as an estimate.
                  </div>
                </div>
              </div>
            )}

            {error && !isCalculating && railFallbackDistance !== null && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <TrainFront size={18} className="text-amber-500 shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-amber-700">Rail Distance — straight line × {RAIL_STRAIGHT_LINE_FACTOR} (no road route available)</div>
                  <div className="text-xl font-semibold text-amber-800">
                    {railFallbackDistance.toLocaleString()} {displayUnit}
                  </div>
                </div>
              </div>
            )}

            {error && !isCalculating && railFallbackDistance === null && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
            )}
          </>
        )}

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

        {travelMode === "sea" && bothLocationsSet && (
          <>
            {isCalculating && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 animate-pulse">
                <Route size={18} className="text-blue-400 shrink-0" />
                <div className="text-sm text-blue-600">
                  Calculating sea distance...
                </div>
              </div>
            )}

            {finalSeaDistance !== null &&
              finalSeaNauticalMiles !== null &&
              !isCalculating &&
              !error && (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <Anchor size={18} className="text-green-500 shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs text-green-600">Sea Distance</div>
                    <div className="text-xl font-semibold text-green-800">
                      {finalSeaDistance.toLocaleString()} {displayUnit}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {finalSeaNauticalMiles.toLocaleString()} nautical miles
                    </div>
                  </div>
                </div>
              )}

            {error && !isCalculating && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {/* The sea-route service failed but a straight-line estimate exists:
                offer it clearly labelled instead of leaving the user with nothing. */}
            {error && !isCalculating && fallbackSeaDistance !== null && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <Anchor size={18} className="text-amber-500 shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-amber-700">Straight-line estimate (sea route unavailable)</div>
                  <div className="text-xl font-semibold text-amber-800">
                    {fallbackSeaDistance.toLocaleString()} {displayUnit}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleUseDistance}
            disabled={
              currentDistance === null ||
              currentDistance <= 0 ||
              isCalculating ||
              (!!error &&
                !(travelMode === "sea" && fallbackSeaDistance !== null) &&
                !(travelMode === "rail" && railFallbackDistance !== null))
            }
            title={currentDistance !== null && currentDistance <= 0 ? "Start and end are the same place" : undefined}
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
