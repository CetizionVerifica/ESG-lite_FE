import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, NumberField, formatNumber } from "../../../ui";
import { tripDistance } from "../../../lib/scope3/travel";

type Props = {
  /** The field the result goes into (Total distance (km)). */
  field: string;
  onUse: (km: number) => void;
};

/**
 * Commuting (distance_based): works out the year's distance from one-way km
 * × 2 × days × people and writes it into the distance field. Activity prep
 * only, like the distance drawer; the engine calculates the total.
 */
export function TripCalculator({ field, onUse }: Props) {
  const [oneWay, setOneWay] = useState<number | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [people, setPeople] = useState<number | null>(1);
  const km = tripDistance(oneWay, days, people);
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-brand-text">
        <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
        Trip calculator
      </summary>
      <div className="space-y-3 pt-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField label="One-way distance" unit="km" value={oneWay} onChange={setOneWay} min={0} />
          <NumberField label="Days commuted in the year" value={days} onChange={setDays} min={0} help="e.g. 5 days × 48 weeks = 240" />
          <NumberField label="People" value={people} onChange={setPeople} min={0} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-num text-sm text-ink" aria-live="polite">
            {km === null ? "Enter all three to work out the distance." : `${formatNumber(km, km % 1 ? 2 : 0)} km (there and back)`}
          </p>
          <Button size="sm" variant="secondary" disabled={km === null} onClick={() => km !== null && onUse(km)}>
            Use for {field}
          </Button>
        </div>
      </div>
    </details>
  );
}
