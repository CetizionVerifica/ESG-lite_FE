
import api from "../api/axios";

export type DistanceMode = "road" | "sea";

export interface DistanceLocationPayload {
  address?: string;
  lat: number;
  lng: number;
  placeId?: string | null;
}

export interface CalculateDistancePayload {
  origin: DistanceLocationPayload;
  destination: DistanceLocationPayload;
  mode: DistanceMode;
}

export interface RoadDistanceData {
  mode: "road";
  distanceMeters: number;
  duration: string | null;
  durationText: string | null;
  encodedPolyline: string | null;
  origin: string;
  destination: string;
}

export interface SeaDistanceData {
  mode: "sea";
  distanceMeters: number;
  duration: string | null;
  durationText: string | null;
  encodedPolyline: string | null;
  origin: string;
  destination: string;
  seaGeometry?: any | null;
}

export type CalculateDistanceData = RoadDistanceData | SeaDistanceData;

export interface CalculateDistanceResponse {
  success: boolean;
  data: CalculateDistanceData;
}

export const calculateRoadDistance = async (
  payload: Omit<CalculateDistancePayload, "mode"> & { mode: "road" },
): Promise<RoadDistanceData> => {
  const response = await api.post<CalculateDistanceResponse>(
    "/user/emissions/calculate-distance",
    payload,
  );

  return response.data.data as RoadDistanceData;
};

export const calculateSeaDistance = async (
  payload: Omit<CalculateDistancePayload, "mode"> & { mode: "sea" },
): Promise<SeaDistanceData> => {
  const response = await api.post<CalculateDistanceResponse>(
    "/user/emissions/calculate-distance",
    payload,
  );

  return response.data.data as SeaDistanceData;
};