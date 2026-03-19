
import { useEffect, useMemo, useRef } from "react";
import {
  GoogleMap,
  Marker,
  Polyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../../../utils/googleMapsLoader";

const DEFAULT_CENTER = { lat: 20, lng: 0 };
const DEFAULT_ZOOM = 2;

interface MapViewProps {
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  encodedPolyline?: string | null;
  travelMode?: "road" | "air" | "sea";
}

function greatCircleArc(
  start: [number, number],
  end: [number, number],
  numPoints = 50,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const lat1 = toRad(start[0]);
  const lon1 = toRad(start[1]);
  const lat2 = toRad(end[0]);
  const lon2 = toRad(end[1]);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) *
            Math.cos(lat2) *
            Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );

  if (d < 1e-10) return [start, end];

  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x =
      A * Math.cos(lat1) * Math.cos(lon1) +
      B * Math.cos(lat2) * Math.cos(lon2);
    const y =
      A * Math.cos(lat1) * Math.sin(lon1) +
      B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);

    points.push([
      toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      toDeg(Math.atan2(y, x)),
    ]);
  }

  return points;
}

const mapContainerStyle = {
  width: "100%",
  height: "300px",
  borderRadius: "0.75rem",
};

const MapView = ({
  startPoint,
  endPoint,
  encodedPolyline,
  travelMode,
}: MapViewProps) => {
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const roadPath = useMemo(() => {
    if (!isLoaded || !encodedPolyline || !window.google?.maps?.geometry) return [];

    const decoded =
      google.maps.geometry.encoding.decodePath(encodedPolyline);

    return decoded.map((p) => ({
      lat: p.lat(),
      lng: p.lng(),
    }));
  }, [isLoaded, encodedPolyline]);

  const seaArcPath = useMemo(() => {
    if (travelMode !== "sea" || !startPoint || !endPoint) return [];
    return greatCircleArc(startPoint, endPoint).map(([lat, lng]) => ({
      lat,
      lng,
    }));
  }, [travelMode, startPoint, endPoint]);

  const straightLinePath = useMemo(() => {
    if (!startPoint || !endPoint) return [];
    if (travelMode === "sea") return [];
    if (travelMode === "road" && roadPath.length > 0) return [];

    return [
      { lat: startPoint[0], lng: startPoint[1] },
      { lat: endPoint[0], lng: endPoint[1] },
    ];
  }, [startPoint, endPoint, travelMode, roadPath]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (roadPath.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      roadPath.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 60);
      return;
    }

    if (startPoint && endPoint) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: startPoint[0], lng: startPoint[1] });
      bounds.extend({ lat: endPoint[0], lng: endPoint[1] });
      map.fitBounds(bounds, 60);
      return;
    }

    if (startPoint) {
      map.panTo({ lat: startPoint[0], lng: startPoint[1] });
      map.setZoom(13);
      return;
    }

    if (endPoint) {
      map.panTo({ lat: endPoint[0], lng: endPoint[1] });
      map.setZoom(13);
      return;
    }

    map.panTo(DEFAULT_CENTER);
    map.setZoom(DEFAULT_ZOOM);
  }, [startPoint, endPoint, roadPath]);

  if (loadError) {
    return (
      <div className="h-75 w-full rounded-lg border border-red-200 bg-red-50 flex items-center justify-center text-sm text-red-600">
        Failed to load Google Maps
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-75 w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Loading map...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        }}
      >
        {startPoint && (
          <Marker
            position={{ lat: startPoint[0], lng: startPoint[1] }}
            label="A"
          />
        )}

        {endPoint && (
          <Marker
            position={{ lat: endPoint[0], lng: endPoint[1] }}
            label="B"
          />
        )}

        {straightLinePath.length > 0 && (
          <Polyline
            path={straightLinePath}
            options={{
              strokeColor: "#9ca3af",
              strokeOpacity: 0,
              strokeWeight: 2,
              icons: [
                {
                  icon: {
                    path: "M 0,-1 0,1",
                    strokeOpacity: 1,
                    scale: 3,
                  },
                  offset: "0",
                  repeat: "12px",
                },
              ],
            }}
          />
        )}

        {seaArcPath.length > 0 && (
          <Polyline
            path={seaArcPath}
            options={{
              strokeColor: "#0ea5e9",
              strokeWeight: 3,
              strokeOpacity: 1,
            }}
          />
        )}

        {roadPath.length > 0 && travelMode === "road" && (
          <Polyline
            path={roadPath}
            options={{
              strokeColor: "#2563eb",
              strokeWeight: 4,
              strokeOpacity: 1,
            }}
          />
        )}
      </GoogleMap>
    </div>
  );
};

export default MapView;
