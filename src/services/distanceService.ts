import api from "../api/axios";

// export type DistanceMode = "road";

// export interface DistanceLocationPayload {
//   address?: string;
//   lat: number;
//   lng: number;
//   placeId?: string;
// }

// export interface CalculateDistancePayload {
//   origin: DistanceLocationPayload;
//   destination: DistanceLocationPayload;
//   mode: DistanceMode;
// }

// export interface CalculateDistanceResponse {
//   success: boolean;
//   data: {
//     mode: "road";
//     distanceMeters: number;
//     distanceText: string | null;
//     durationSeconds: number | null;
//     durationText: string | null;
//     origin: string;
//     destination: string;
//   };
// }

// export const calculateRoadDistance = async (
//   payload: CalculateDistancePayload,
// ): Promise<CalculateDistanceResponse["data"]> => {
//   const response = await api.post<CalculateDistanceResponse>(
//     "/user/emissions/calculate-distance",
//     payload,
//   );

//   return response.data.data;
// };


export type DistanceMode = "road";

export interface DistanceLocationPayload {
  address?: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface CalculateDistancePayload {
  origin: DistanceLocationPayload;
  destination: DistanceLocationPayload;
  mode: DistanceMode;
}

export interface CalculateDistanceResponse {
  success: boolean;
  data: {
    mode: "road";
    distanceMeters: number;
    duration: string | null;
    durationText: string | null;
    encodedPolyline: string | null;
    origin: string;
    destination: string;
  };
}

export const calculateRoadDistance = async (
  payload: CalculateDistancePayload,
): Promise<CalculateDistanceResponse["data"]> => {
  const response = await api.post<CalculateDistanceResponse>(
    "/user/emissions/calculate-distance",
    payload,
  );

  return response.data.data;
};