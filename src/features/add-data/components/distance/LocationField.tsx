import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { X } from "lucide-react";
import { Field, cn, focusRing, inputBase } from "../../../../ui";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../../../../lib/geo/googleMapsLoader";
import { resolveLocation, type ResolvedLocation } from "../../api";

type Props = {
  label: string;
  /** "A" or "B", matching the map's markers. */
  marker: string;
  value: ResolvedLocation | null;
  onChange: (location: ResolvedLocation | null) => void;
};

const normalise = (text: string) => text.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();

/**
 * A place: Google suggestions when Places loads, otherwise (or for a pasted
 * address) Enter or leaving the field looks it up on the backend.
 * Ported from the legacy LocationSearchInput with token styling.
 */
export function LocationField({ label, marker, value, onChange }: Props) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const [text, setText] = useState(value?.display_name ?? "");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autocomplete = useRef<google.maps.places.Autocomplete | null>(null);
  const picked = useRef(!!value);

  useEffect(() => {
    setText(value?.display_name ?? "");
    picked.current = !!value;
  }, [value]);

  const resolve = async () => {
    const query = normalise(text);
    if (!query || picked.current || resolving) return;
    setResolving(true);
    setError(null);
    try {
      const place = await resolveLocation(query);
      picked.current = true;
      onChange(place);
    } catch {
      setError("Couldn't find that place. Try a fuller address or pick a suggestion.");
    } finally {
      setResolving(false);
    }
  };

  const onPlaceChanged = () => {
    const place = autocomplete.current?.getPlace();
    const at = place?.geometry?.location;
    if (!place?.formatted_address || !at) return;
    picked.current = true;
    onChange({ display_name: place.formatted_address, lat: at.lat(), lon: at.lng(), place_id: place.place_id });
  };

  const input = (props: InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...props}
      type="text"
      value={text}
      placeholder="Search for a place"
      onChange={(e) => {
        setText(e.target.value);
        picked.current = false;
        setError(null);
      }}
      // Let a picked suggestion land before looking the typed text up.
      onBlur={() => window.setTimeout(() => void resolve(), 200)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          void resolve();
        }
      }}
      className={cn(inputBase, "h-9 pr-9")}
    />
  );

  return (
    <Field
      label={
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-on-brand">
            {marker}
          </span>
          {label}
        </span>
      }
      error={error ?? undefined}
      loading={resolving}
    >
      {(control) => (
        <div className="relative">
          {isLoaded ? (
            <Autocomplete
              onLoad={(ac) => (autocomplete.current = ac)}
              onPlaceChanged={onPlaceChanged}
              options={{ fields: ["formatted_address", "geometry", "place_id", "name"] }}
            >
              {input(control)}
            </Autocomplete>
          ) : (
            input(control)
          )}
          {text && (
            <button
              type="button"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                setText("");
                picked.current = false;
                onChange(null);
              }}
              className={cn("absolute right-1.5 top-1/2 -translate-y-1/2 rounded-control p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>
      )}
    </Field>
  );
}
