import api from "../api/axios"; // adjust if your shared axios instance file has a different name/path

export interface ResolvedLocation {
  display_name: string;
  lat: number;
  lon: number;
  place_id?: string;
}

interface ResolveLocationResponse {
  success: boolean;
  data: ResolvedLocation;
}

export async function resolveLocationFromBackend(
  query: string,
): Promise<ResolvedLocation> {
  const response = await api.post<ResolveLocationResponse>(
    "/user/emissions/geocode-location",
    { query },
  );

  return response.data.data;
}