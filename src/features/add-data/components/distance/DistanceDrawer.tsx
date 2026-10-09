import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { Badge, Button, Callout, Drawer, SegmentedControl, Skeleton, cn, formatNumber, panel } from "../../../../ui";
import { getCanonicalDistanceUnit } from "../../../../lib/geo/distanceUnits";
import { haversineDistanceMeters } from "../../../../lib/geo/routing";
import { useRoute, type ResolvedLocation } from "../../api";
import { modeDistance, type TravelMode } from "../../logic/distance";
import { LocationField } from "./LocationField";
import { RouteMap } from "./RouteMap";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The row's unit: km, miles, passenger.km… The result is converted to it. */
  unit: string;
  onUse: (distance: number) => void;
};

const MODES: { value: TravelMode; label: string }[] = [
  { value: "road", label: "Road" },
  { value: "rail", label: "Rail" },
  { value: "air", label: "Air" },
  { value: "sea", label: "Sea" },
];

/** Work a distance out from two places, by road, rail (estimate), air or sea, and put it in the row. */
export function DistanceDrawer({ open, onClose, unit, onUse }: Props) {
  const [mode, setMode] = useState<TravelMode>("road");
  const [from, setFrom] = useState<ResolvedLocation | null>(null);
  const [to, setTo] = useState<ResolvedLocation | null>(null);

  // Each opening starts clean, as the legacy calculator did.
  useEffect(() => {
    if (open) return;
    setMode("road");
    setFrom(null);
    setTo(null);
  }, [open]);

  const routeMode = mode === "sea" ? "sea" : mode === "air" ? null : "road";
  const route = useRoute(open ? routeMode : null, from, to);
  const straightMeters = useMemo(() => (from && to ? haversineDistanceMeters([from.lat, from.lon], [to.lat, to.lon]) : null), [from, to]);
  const result =
    from && to
      ? modeDistance(
          mode,
          {
            straightMeters,
            roadMeters: routeMode === "road" && route.data ? route.data.meters : null,
            seaMeters: routeMode === "sea" && route.data ? route.data.meters : null,
            failed: route.isError,
          },
          unit,
        )
      : null;
  const fromPoint = useMemo(() => (from ? { lat: from.lat, lng: from.lon } : null), [from]);
  const toPoint = useMemo(() => (to ? { lat: to.lat, lng: to.lon } : null), [to]);
  const shownUnit = getCanonicalDistanceUnit(unit) ?? unit;
  const calculating = !!from && !!to && routeMode !== null && route.isFetching;
  const usable = result !== null && result.value > 0 && !calculating;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Calculate distance"
      subtitle={`The result is entered in ${shownUnit}`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!usable} onClick={() => result && (onUse(result.value), onClose())}>
            Use this distance
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SegmentedControl label="Travel mode" options={MODES} value={mode} onChange={setMode} />
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-3">
            <LocationField label="From" marker="A" value={from} onChange={setFrom} />
            <LocationField label="To" marker="B" value={to} onChange={setTo} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Swap from and to"
            icon={<ArrowDownUp className="size-4" />}
            disabled={!from && !to}
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          />
        </div>

        <RouteMap
          from={fromPoint}
          to={toPoint}
          mode={mode}
          polyline={route.data?.polyline ?? null}
          seaPath={route.data?.seaPath ?? null}
        />

        <div aria-live="polite">
          {calculating && <Skeleton className="h-16 w-full rounded-card" />}
          {!calculating && result && (
            <div className={cn(panel, "p-4")}>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {result.note}
                {result.estimate && <Badge tone="warn">Estimate</Badge>}
              </p>
              <p className="mt-1 font-num text-xl font-semibold text-ink">
                {formatNumber(result.value, 2)} {shownUnit}
              </p>
              {result.nauticalMiles !== undefined && <p className="text-xs text-muted">{formatNumber(result.nauticalMiles, 2)} nautical miles</p>}
              {mode === "road" && route.data?.durationText && <p className="text-xs text-muted">About {route.data.durationText} by road</p>}
              {result.value <= 0 && <p className="mt-1 text-xs text-bad">From and to are the same place.</p>}
            </div>
          )}
          {!calculating && route.isError && (mode === "road" || !result) && (
            <Callout tone="warn">Couldn't work out a {mode} route between these places. Try nearby places or another mode.</Callout>
          )}
          {!from || !to ? <p className="text-sm text-muted">Choose where the trip starts and ends.</p> : null}
        </div>
      </div>
    </Drawer>
  );
}
