export interface GeocodingResult {
  display_name: string;
  lat: number;
  lon: number;
}

const NOMINATIM_BASE =
  import.meta.env.VITE_NOMINATIM_URL || "https://nominatim.openstreetmap.org";

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  if (!query || query.trim().length < 2) return [];

  const params = new URLSearchParams({
    q: query.trim(),
    format: "json",
    limit: "5",
  });

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: { "User-Agent": "ESG-Lite-App/1.0" },
    signal,
  });

  if (!res.ok) throw new Error("Geocoding search failed");

  const data: Array<{ display_name: string; lat: string; lon: string }> =
    await res.json();

  return data.map((item) => ({
    display_name: item.display_name,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
  }));
}
