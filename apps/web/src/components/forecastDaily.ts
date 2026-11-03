import type { StationTimeSeriesPoint } from '@benchmark/domain';

/** Hours a daily value was computed from, set only when the day is incomplete for that metric. */
export type DayCoverage = { hours: number; expected: number };

type Point = StationTimeSeriesPoint & { time: number; coverage?: Record<string, DayCoverage> };

/** How an hourly forecast metric becomes one value per local day. */
export type DailyRule = 'range' | 'max' | 'sum' | 'mean' | 'atMax';

const RULES: Record<string, DailyRule> = {
  TEMPERATURE: 'range',
  RELATIVE_HUMIDITY: 'range',
  PRECIPITATION_QUANTITY: 'sum',
  PRECIPITATION_CHANCE: 'max',
  WIND_SPEED: 'max',
  WIND_GUST: 'max',
  TRANSPORT_WIND_SPEED: 'max',
  UV_INDEX: 'max',
  WIND_DIRECTION: 'atMax',
  TRANSPORT_WIND_DIRECTION: 'atMax',
};

/** A direction is reported at the hour of its paired speed's daily maximum. */
const DIRECTION_SPEED: Record<string, string> = {
  WIND_DIRECTION: 'WIND_SPEED',
  TRANSPORT_WIND_DIRECTION: 'TRANSPORT_WIND_SPEED',
};

/** Metrics without a specific rule (cloud cover, pressure, solar radiation, …) use the daily mean. */
export function dailyRule(metric: string): DailyRule {
  return RULES[metric] ?? 'mean';
}

const HOUR_MS = 60 * 60 * 1000;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(ms: number, timeZone: string): string {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter.format(ms);
}

export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 24 * HOUR_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

function offsetMs(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(ms).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of local midnight at the start of `date` in `timeZone`. */
export function zonedMidnight(date: string, timeZone: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const first = guess - offsetMs(guess, timeZone);
  // A second pass corrects guesses that land on the other side of a DST change.
  return guess - offsetMs(first, timeZone);
}

function medianInterval(points: Point[]): number {
  const intervals = points.slice(1).map((point, index) => point.time - points[index].time)
    .filter((interval) => interval > 0).sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)] ?? HOUR_MS;
}

export type DailySeries = { max: Point[]; min: Point[] };

/**
 * Aggregates hourly forecast points into one point per provider and local day, placed at local midday.
 * Days a metric doesn't fully cover (typically the forecast horizon's last day) are still aggregated from
 * the hours available and flagged in `coverage`, so the chart can mark them: their totals are understated
 * and their extremes may be missed. `min` holds the lower bound of 'range' metrics.
 */
export function aggregateDaily(points: Point[], timeZone: string): DailySeries {
  const byProvider = new Map<string, Point[]>();
  for (const point of points) {
    const series = byProvider.get(point.provider) ?? [];
    series.push(point);
    byProvider.set(point.provider, series);
  }

  const max: Point[] = [];
  const min: Point[] = [];
  for (const [provider, unsorted] of byProvider) {
    const series = [...unsorted].sort((a, b) => a.time - b.time);
    const cadence = medianInterval(series);
    const byDay = new Map<string, Point[]>();
    for (const point of series) {
      const day = localDate(point.time, timeZone);
      const group = byDay.get(day) ?? [];
      group.push(point);
      byDay.set(day, group);
    }

    for (const [day, group] of byDay) {
      const start = zonedMidnight(day, timeZone);
      const end = zonedMidnight(addDays(day, 1), timeZone);
      const expected = Math.max(1, Math.round((end - start) / cadence));

      const upper: Record<string, number> = {};
      const lower: Record<string, number> = {};
      const coverage: Record<string, DayCoverage> = {};
      const metrics = new Set(group.flatMap((point) => Object.keys(point.values)));
      for (const metric of metrics) {
        const rule = dailyRule(metric);
        const present = group.filter((point) => Number.isFinite(point.values[metric]));
        if (!present.length) continue;
        const values = present.map((point) => point.values[metric]);
        if (present.length < expected) {
          coverage[metric] = { hours: Math.round(present.length * cadence / HOUR_MS), expected: Math.round((end - start) / HOUR_MS) };
        }
        if (rule === 'sum') {
          upper[metric] = values.reduce((sum, value) => sum + value, 0);
        } else if (rule === 'mean') {
          upper[metric] = values.reduce((sum, value) => sum + value, 0) / values.length;
        } else if (rule === 'atMax') {
          const speed = DIRECTION_SPEED[metric];
          const peak = present.filter((point) => Number.isFinite(point.values[speed]))
            .reduce<Point | null>((best, point) => !best || point.values[speed] > best.values[speed] ? point : best, null);
          if (peak) upper[metric] = peak.values[metric];
        } else {
          upper[metric] = Math.max(...values);
          if (rule === 'range') lower[metric] = Math.min(...values);
        }
      }

      const midday = start + (end - start) / 2;
      const base = { provider, utcDateTime: new Date(midday).toISOString(), localDateTime: day, hoursFrom0Time: null, time: midday };
      const partial = Object.keys(coverage).length ? { coverage } : {};
      max.push({ ...base, ...partial, values: upper });
      if (Object.keys(lower).length) min.push({ ...base, ...partial, values: lower });
    }
  }
  return { max: max.sort((a, b) => a.time - b.time), min: min.sort((a, b) => a.time - b.time) };
}

/** Daily view window: whole local days starting tomorrow, so today's partial day is never shown. */
export function dailyWindow(now: number, days: number, timeZone: string): { start: number; end: number } {
  const tomorrow = addDays(localDate(now, timeZone), 1);
  return { start: zonedMidnight(tomorrow, timeZone), end: zonedMidnight(addDays(tomorrow, days), timeZone) };
}
