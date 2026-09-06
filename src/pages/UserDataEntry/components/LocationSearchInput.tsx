import { useEffect, useRef, useState } from "react";
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../../../utils/googleMapsLoader";
import type { ResolvedLocation as GeocodingResult } from "../../../services/locationService";
import { resolveLocationFromBackend } from "../../../services/locationService";

interface LocationSearchInputProps {
  label: string;
  value: string;
  onSelect: (result: GeocodingResult) => void;
  onClear?: () => void;
  placeholder?: string;
  markerColor?: "green" | "red";
}

const LocationSearchInput = ({
  label,
  value,
  onSelect,
  onClear,
  placeholder = "Search for a location...",
  markerColor,
}: LocationSearchInputProps) => {
  const [query, setQuery] = useState(value);
  const [autocomplete, setAutocomplete] =
    useState<google.maps.places.Autocomplete | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // True only when current value came from a selected Google suggestion
  const hasSelectedPlaceRef = useRef(false);

  // Prevent duplicate geocode calls from blur + enter
  const geocodeInFlightRef = useRef(false);

  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const normalizeText = (text: string) =>
    text
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .trim();

  const handlePlaceChanged = () => {
    if (!autocomplete) return;

    const place = autocomplete.getPlace();
    const location = place.geometry?.location;

    if (!place.formatted_address || !location) return;

    const result: GeocodingResult = {
      display_name: place.formatted_address,
      lat: location.lat(),
      lon: location.lng(),
      place_id: place.place_id,
    };

    hasSelectedPlaceRef.current = true;
    setQuery(place.formatted_address);
    onSelect(result);
  };

  const [resolveError, setResolveError] = useState<string | null>(null);

  const resolveRawQuery = async () => {
    const normalized = normalizeText(query);

    if (!normalized) return;
    if (hasSelectedPlaceRef.current) return;
    if (geocodeInFlightRef.current) return;

    try {
      geocodeInFlightRef.current = true;
      setIsResolving(true);

      setResolveError(null);
      const result = await resolveLocationFromBackend(normalized);

      hasSelectedPlaceRef.current = true;
      setQuery(result.display_name);
      onSelect(result);
    } catch (err) {
      console.error("Failed to geocode pasted location:", err);
      // Tell the user — a silent failure looked like a frozen form.
      setResolveError("Could not find that location. Try a fuller address or pick one from the suggestions.");
    } finally {
      geocodeInFlightRef.current = false;
      setIsResolving(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    hasSelectedPlaceRef.current = false;
    onClear?.();

    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  };

  const handleInputChange = (text: string) => {
    setQuery(text);
    hasSelectedPlaceRef.current = false;
    setResolveError(null);
  };

  const handleBlur = () => {
    // Delay to let handlePlaceChanged fire first when selecting from autocomplete dropdown
    setTimeout(() => resolveRawQuery(), 200);
  };

  const handleKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await resolveRawQuery();
    }
  };

  const handlePaste = () => {
    hasSelectedPlaceRef.current = false;
  };

  if (loadError) {
    return (
      <div className="relative">
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
          {markerColor && (
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                markerColor === "green" ? "bg-green-500" : "bg-red-500"
              }`}
            />
          )}
          {label}
        </label>

        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="w-full border border-red-300 rounded-md px-3 py-2 text-sm focus:outline-none"
        />

        <p className="text-xs text-red-500 mt-1">
          Failed to load Google Places
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
        {markerColor && (
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              markerColor === "green" ? "bg-green-500" : "bg-red-500"
            }`}
          />
        )}
        {label}
      </label>

      <div className="relative">
        {isLoaded ? (
          <Autocomplete
            onLoad={(ac) => setAutocomplete(ac)}
            onPlaceChanged={handlePlaceChanged}
            options={{
              fields: ["formatted_address", "geometry", "place_id", "name"],
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              title={query || undefined}
              className="w-full border border-gray-300 rounded-md px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-inset"
            />
          </Autocomplete>
        ) : (
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Loading Google Places..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 pr-20 text-sm focus:outline-none"
            disabled
          />
        )}

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isResolving && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}

          {query && !isResolving && (
            <button
              type="button"
              onClick={handleClear}
              className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              &times;
            </button>
          )}
        </div>
      </div>
      {resolveError && (
        <p className="text-xs text-red-500 mt-1">{resolveError}</p>
      )}
    </div>
  );
};

export default LocationSearchInput;