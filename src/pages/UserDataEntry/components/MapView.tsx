import { useEffect, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// SVG-based colored markers — no external CDN dependency
function createSvgIcon(color: string, label: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="42" viewBox="0 0 28 42">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 28 14 28s14-17.5 14-28C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="14" cy="14" r="6" fill="#fff"/>
      <text x="14" y="18" text-anchor="middle" font-size="11" font-weight="bold" fill="${color}">${label}</text>
    </svg>`;
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -42],
  });
}

const startMarkerIcon = createSvgIcon("#16a34a", "A");
const endMarkerIcon = createSvgIcon("#dc2626", "B");

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

interface MapViewProps {
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  routeGeometry: GeoJSON.LineString | null;
  startLabel?: string;
  endLabel?: string;
}

function MapController({
  startPoint,
  endPoint,
  routePositions,
}: {
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  routePositions: [number, number][];
}) {
  const map = useMap();
  const prevStartRef = useRef<string | null>(null);
  const prevEndRef = useRef<string | null>(null);
  const prevRouteLen = useRef(0);

  useEffect(() => {
    const startKey = startPoint ? `${startPoint[0]},${startPoint[1]}` : null;
    const endKey = endPoint ? `${endPoint[0]},${endPoint[1]}` : null;
    const startChanged = startKey !== prevStartRef.current;
    const endChanged = endKey !== prevEndRef.current;
    const routeArrived =
      routePositions.length > 0 && prevRouteLen.current === 0;

    prevStartRef.current = startKey;
    prevEndRef.current = endKey;
    prevRouteLen.current = routePositions.length;

    if (!startChanged && !endChanged && !routeArrived) return;

    // Route just arrived — fit to full route polyline (may extend beyond endpoints)
    if (routeArrived && routePositions.length > 1) {
      const bounds = L.latLngBounds(routePositions);
      map.flyToBounds(bounds, { padding: [50, 50], duration: 0.8 });
      return;
    }

    // Both points set — fit to both markers
    if (startPoint && endPoint) {
      const bounds = L.latLngBounds([startPoint, endPoint]);
      map.flyToBounds(bounds, { padding: [50, 50], duration: 0.8 });
      return;
    }

    // Single point — fly to it
    if (startPoint) {
      map.flyTo(startPoint, 13, { duration: 0.8 });
      return;
    }
    if (endPoint) {
      map.flyTo(endPoint, 13, { duration: 0.8 });
      return;
    }

    // Both cleared — zoom back out to world view
    map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.6 });
  }, [map, startPoint, endPoint, routePositions]);

  return null;
}

const MapView = ({
  startPoint,
  endPoint,
  routeGeometry,
  startLabel,
  endLabel,
}: MapViewProps) => {
  const routePositions = useMemo<[number, number][]>(() => {
    if (!routeGeometry) return [];
    return routeGeometry.coordinates.map(
      (coord) => [coord[1], coord[0]] as [number, number],
    );
  }, [routeGeometry]);

  // Dashed straight line between points (shown before route loads)
  const showStraightLine =
    startPoint && endPoint && routePositions.length === 0;

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: "300px", width: "100%" }}
      className="rounded-lg border border-gray-200"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController
        startPoint={startPoint}
        endPoint={endPoint}
        routePositions={routePositions}
      />

      {startPoint && (
        <Marker position={startPoint} icon={startMarkerIcon}>
          {startLabel && <Popup>{startLabel}</Popup>}
        </Marker>
      )}
      {endPoint && (
        <Marker position={endPoint} icon={endMarkerIcon}>
          {endLabel && <Popup>{endLabel}</Popup>}
        </Marker>
      )}

      {showStraightLine && (
        <Polyline
          positions={[startPoint!, endPoint!]}
          color="#9ca3af"
          weight={2}
          dashArray="8 6"
        />
      )}

      {routePositions.length > 0 && (
        <Polyline positions={routePositions} color="#3b82f6" weight={4} />
      )}
    </MapContainer>
  );
};

export default MapView;
