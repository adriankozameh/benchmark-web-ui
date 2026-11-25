import type { GladiatorHorizon, GladiatorMetric, GladiatorResponse, GladiatorWindow } from '@benchmark/domain';

export const GLADIATOR_HORIZONS: readonly GladiatorHorizon[] = [24, 48, 120, 240, 336];
export const GLADIATOR_WINDOWS: readonly GladiatorWindow[] = [7, 15, 30];
export const GLADIATOR_DEFAULT_HORIZON: GladiatorHorizon = 24;
export const GLADIATOR_DEFAULT_WINDOW: GladiatorWindow = 7;
const PANEL_VISIBILITY_KEY = 'benchmark.forecast.gladiatorPanelVisible';
export const GLADIATOR_METRICS: readonly GladiatorMetric[] = [
  'TEMPERATURE', 'RELATIVE_HUMIDITY', 'WIND_SPEED', 'WIND_GUST', 'WIND_DIRECTION',
  'PRECIPITATION_QUANTITY', 'PRESSURE', 'SOLAR_RADIATION', 'UV_INDEX', 'EVAPOTRANSPIRATION',
];
export type GladiatorDisplay = 'all' | 'top3';
export type GladiatorMetricState = { loading: boolean; data: GladiatorResponse | null; error: unknown };

export function isGladiatorMetric(metric: string): metric is GladiatorMetric {
  return GLADIATOR_METRICS.includes(metric as GladiatorMetric);
}

export type ForecastPreference = { provider?: string; basis: 'STATISTICS' | 'DEFAULT' | 'NONE' };

/** A display preference never creates a measured winner, score, or top-three ranking. */
export function forecastPreference(data: GladiatorResponse | null | undefined, available: readonly string[], metric?: string): ForecastPreference {
  const none: ForecastPreference = { basis: 'NONE' };
  const defaultChoice = (): ForecastPreference => {
    const provider = ['Benchmark', 'NOAA_GFS'].find(name => available.includes(name));
    return provider ? { provider, basis: 'DEFAULT' } : none;
  };
  // These metrics are known to have no Gladiator evaluator, rather than a failed request.
  if (!data) return metric && !isGladiatorMetric(metric) ? defaultChoice() : none;
  const provider = data?.bestForecastProvider;
  if (data.bestForecastBasis === 'STATISTICS' && data.statisticsAvailable && data.winnerProvider === provider) {
    return provider && available.includes(provider) ? { provider, basis: 'STATISTICS' } : none;
  }
  if (data.bestForecastBasis === 'DEFAULT' && !data.statisticsAvailable) {
    return defaultChoice();
  }
  if (!data.winnerProvider && ['INSUFFICIENT_DATA', 'INSUFFICIENT_EVENTS'].includes(data.status)) return defaultChoice();
  return none;
}

export function highlightedProvider(data: GladiatorResponse | null | undefined, available: readonly string[], metric?: string): string | undefined {
  return forecastPreference(data, available, metric).provider;
}

export function readGladiatorPanelVisibility(): boolean {
  try { return typeof window === 'undefined' || window.localStorage.getItem(PANEL_VISIBILITY_KEY) !== 'false'; }
  catch { return true; }
}

export function saveGladiatorPanelVisibility(visible: boolean): void {
  try { window.localStorage.setItem(PANEL_VISIBILITY_KEY, String(visible)); }
  catch { /* Display preferences remain usable when browser storage is unavailable. */ }
}

export function chartProviders(available: readonly string[], hidden: readonly string[], mode: GladiatorDisplay,
  data?: GladiatorResponse | null): string[] {
  // Empty rankings do not blank the chart or manufacture a top three from defaults.
  const selected = mode === 'top3' && data?.topProviders.length ? data.topProviders.slice(0, 3) : available;
  return [...new Set(selected)].filter(provider => available.includes(provider) && !hidden.includes(provider));
}

export function matchesGladiatorSelection(data: GladiatorResponse, organizationId: string, stationId: string,
  locationRevision: string | null | undefined, metric: GladiatorMetric, horizon: GladiatorHorizon, days: GladiatorWindow): boolean {
  return data.organizationId === organizationId && data.stationId === stationId && data.metric === metric
    && data.hoursFrom0Time === horizon && data.days === days
    && (!locationRevision || data.locationRevision === locationRevision);
}

/** Bound request fan-out; cancellation prevents queued work from starting. */
export async function loadGladiatorMetrics(metrics: readonly GladiatorMetric[], signal: AbortSignal,
  load: (metric: GladiatorMetric) => Promise<GladiatorResponse>,
  receive: (metric: GladiatorMetric, data: GladiatorResponse | null, error: unknown) => void): Promise<void> {
  const queue = [...new Set(metrics)];
  let next = 0;
  async function worker() {
    while (!signal.aborted && next < queue.length) {
      const metric = queue[next++];
      try {
        const data = await load(metric);
        if (!signal.aborted) receive(metric, data, null);
      } catch (error: unknown) {
        if (!signal.aborted) receive(metric, null, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
}
