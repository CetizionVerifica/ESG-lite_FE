import { useEffect, useMemo, useRef } from "react";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { MapPinOff } from "lucide-react";
import { EmptyState, Skeleton } from "../../../../ui";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../../../../lib/geo/googleMapsLoader";
import type { TravelMode } from "../../logic/distance";
import { greatCircleArc } from "./arc";

type LatLng = { lat: number; lng: number };

type Props = {
  /** Keep these stable between renders (memoise them): the map refits when they change. */
  from: LatLng | null;
  to: LatLng | null;
  mode: TravelMode;
  /** Google encoded polyline of the road route. */
  polyline: string | null;
  /** Sea route as [lng, lat] pairs. */
  seaPath: [number, number][] | null;
};

const CENTER = { lat: 20, lng: 0 };

/** Theme colour for the map's lines (Google Maps takes colour strings, not classes). */
const token = (name: string) =>
  typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The route on a Google map; the distance is still shown in words if the map can't load. Ported from the legacy MapView. */
export function RouteMap({ from, to, mode, polyline, seaPath }: Props) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);
  const map = useRef<google.maps.Map | null>(null);

  const road = useMemo<LatLng[]>(() => {
    if (!isLoaded || !polyline || !window.google?.maps?.geometry) return [];
    return google.maps.geometry.encoding.decodePath(polyline).map((p) => ({ lat: p.lat(), lng: p.lng() }));
  }, [isLoaded, polyline]);

  const sea = useMemo<LatLng[]>(() => {
    if (mode !== "sea" || !from || !to) return [];
    if (seaPath?.length) return seaPath.map(([lng, lat]) => ({ lat, lng }));
    return greatCircleArc([from.lat, from.lng], [to.lat, to.lng]).map(([lat, lng]) => ({ lat, lng }));
  }, [mode, seaPath, from, to]);

  const routed = useMemo(() => (mode === "sea" ? sea : mode === "road" || mode === "rail" ? road : []), [mode, sea, road]);
  const straight = from && to && routed.length === 0 ? [from, to] : [];

  useEffect(() => {
    const m = map.current;
    if (!m || !isLoaded) return;
    const points = routed.length > 1 ? routed : [from, to].filter((p): p is LatLng => !!p);
    if (points.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend(p));
      m.fitBounds(bounds, 60);
    } else if (points.length === 1) {
      m.panTo(points[0]);
      m.setZoom(13);
    }
  }, [isLoaded, routed, from, to]);

  if (loadError) {
    return <EmptyState icon={MapPinOff} title="The map couldn't load" description="The distance is still worked out below." />;
  }
  if (!isLoaded) return <Skeleton className="h-64 w-full rounded-card" />;

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "16rem" }}
        center={CENTER}
        zoom={2}
        onLoad={(m) => {
          map.current = m;
        }}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
      >
        {from && <Marker position={from} label="A" />}
        {to && <Marker position={to} label="B" />}
        {straight.length > 0 && (
          <Polyline
            path={straight}
            options={{
              strokeColor: token("--t-muted"),
              strokeOpacity: 0,
              icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "12px" }],
            }}
          />
        )}
        {routed.length > 0 && <Polyline path={routed} options={{ strokeColor: token("--t-brand"), strokeWeight: 4, strokeOpacity: 1 }} />}
      </GoogleMap>
    </div>
  );
}
