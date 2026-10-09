export const GOOGLE_MAPS_LIBRARIES: ("places" | "geometry")[] = [
  "places",
  "geometry",
];

export const GOOGLE_MAPS_LOADER_OPTIONS = {
  id: "script-loader",
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
  libraries: GOOGLE_MAPS_LIBRARIES,
};