export type BarSlot = { x: number; width: number };

export function usesForecastBars(metric: string): boolean {
  return metric === 'PRECIPITATION_QUANTITY' || metric === 'PRECIPITATION_CHANCE';
}

export function isPlottableForecastValue(metric: string, value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && (!usesForecastBars(metric) || (value >= 0 && (metric !== 'PRECIPITATION_CHANCE' || value <= 100)));
}

/** Allocate fixed provider positions within each timestamp, including when a provider is missing. */
export function forecastBarSlots(times: readonly number[], providers: readonly string[], start: number, end: number,
  left: number, right: number, fallbackCadence = 3_600_000): Map<number, Map<string, BarSlot>> {
  const slots = new Map<number, Map<string, BarSlot>>();
  const names = [...new Set(providers)];
  if (!names.length || ![start, end, left, right].every(Number.isFinite) || end <= start || right <= left) return slots;
  const ordered = [...new Set(times)].filter(time => Number.isFinite(time) && time >= start && time < end).sort((a, b) => a - b);
  const intervals = ordered.slice(1).map((time, index) => time - ordered[index]).sort((a, b) => a - b);
  const cadence = intervals[Math.floor(intervals.length / 2)]
    ?? (Number.isFinite(fallbackCadence) && fallbackCadence > 0 ? fallbackCadence : 3_600_000);
  const groupWidth = Math.min((right - left) * cadence / (end - start) * 0.8, names.length * 20);
  for (const time of ordered) {
    const center = left + (time - start) / (end - start) * (right - left);
    // Trim the group at the plot boundary, then divide the visible space between all providers.
    const groupLeft = Math.max(left, center - groupWidth / 2);
    const groupRight = Math.min(right, center + groupWidth / 2);
    const cell = (groupRight - groupLeft) / names.length;
    slots.set(time, new Map(names.map((provider, index) => [provider, {
      x: groupLeft + cell * index + cell * 0.06,
      width: cell * 0.88,
    }])));
  }
  return slots;
}
