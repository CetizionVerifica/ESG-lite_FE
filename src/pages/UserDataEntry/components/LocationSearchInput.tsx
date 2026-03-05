import { useState, useEffect, useRef } from "react";
import {
  searchLocations,
  GeocodingResult,
} from "../../../services/geocodingService";

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
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Cleanup debounce timer and in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      try {
        const data = await searchLocations(text, controller.signal);
        setResults(data);
        setShowDropdown(data.length > 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  };

  const handleSelect = (result: GeocodingResult) => {
    setQuery(result.display_name);
    setShowDropdown(false);
    setResults([]);
    onSelect(result);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onClear?.();
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
        {markerColor && (
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${markerColor === "green" ? "bg-green-500" : "bg-red-500"}`}
          />
        )}
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          title={query || undefined}
          className="w-full border border-gray-300 rounded-md px-3 py-2 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-inset"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          {query && !isLoading && (
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

      {showDropdown && (
        <ul className="absolute w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto" style={{ zIndex: 10000 }}>
          {results.map((result, idx) => (
            <li
              key={`${result.lat}-${result.lon}-${idx}`}
              onClick={() => handleSelect(result)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
            >
              {result.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LocationSearchInput;
