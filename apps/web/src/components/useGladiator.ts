import { useEffect, useRef, useState } from 'react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { GladiatorHorizon, GladiatorMetric, GladiatorWindow, WeatherStation } from '@benchmark/domain';
import { isGladiatorMetric, loadGladiatorMetrics, matchesGladiatorSelection, type GladiatorMetricState } from './gladiator';

export function useGladiator(api: BenchmarkApi, organizationId: string, station: WeatherStation | undefined,
  metrics: readonly string[], horizon: GladiatorHorizon, days: GladiatorWindow, refresh: number,
  onUnauthorized: () => void, enabled: boolean): Partial<Record<GladiatorMetric, GladiatorMetricState>> {
  const metricKey = [...new Set(metrics.filter(isGladiatorMetric))].sort().join('|');
  const key = JSON.stringify([organizationId, station?.id, station?.locationRevision, station?.updatedAt,
    horizon, days, metricKey, refresh]);
  const [result, setResult] = useState<{ key: string; api: BenchmarkApi | null; entries: Partial<Record<GladiatorMetric, GladiatorMetricState>> }>({ key: '', api: null, entries: {} });
  const latestResult = useRef(result);
  latestResult.current = result;

  useEffect(() => {
    const selected = metricKey ? metricKey.split('|') as GladiatorMetric[] : [];
    if (!enabled || !station || !selected.length) return;
    // Weather reloads pause the batch; retain completed metrics and resume only unfinished work.
    const existing = latestResult.current.key === key && latestResult.current.api === api ? latestResult.current.entries : {};
    const pending = selected.filter(metric => !existing[metric] || existing[metric]!.loading);
    if (!pending.length) return;
    const controller = new AbortController();
    setResult({ key, api, entries: Object.fromEntries(selected.map(metric => [metric,
      existing[metric]?.loading === false ? existing[metric] : { loading: true, data: null, error: null }])) });
    // Debounce rapid selection changes and React development's setup/cleanup probe.
    const timer = window.setTimeout(() => {
      void loadGladiatorMetrics(pending, controller.signal, async metric => {
        const data = await api.getGladiator(organizationId, station.id, metric, horizon, days, controller.signal);
        if (!matchesGladiatorSelection(data, organizationId, station.id, station.locationRevision, metric, horizon, days)) {
          throw new Error('Statistics do not match the selected station and filters. Refresh to try again.');
        }
        return data;
      }, (metric, data, error) => {
        if (error instanceof BenchmarkApiError && error.status === 401) {
          controller.abort();
          onUnauthorized();
          return;
        }
        if (error instanceof BenchmarkApiError && (error.status === 403 || error.status === 429)) {
          controller.abort();
          setResult(previous => previous.key !== key || previous.api !== api ? previous : {
            key, api, entries: Object.fromEntries(selected.map(name => [name,
              previous.entries[name]?.data ? previous.entries[name]! : { loading: false, data: null, error }])),
          });
          return;
        }
        setResult(previous => previous.key !== key || previous.api !== api ? previous : {
          key, api, entries: { ...previous.entries, [metric]: { loading: false, data, error } },
        });
      });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [api, organizationId, station?.id, station?.locationRevision, station?.updatedAt, metricKey, horizon, days, refresh, key, onUnauthorized, enabled]);

  // Hide old winners immediately, including the render before the new effect executes.
  return result.key === key && result.api === api ? result.entries : {};
}
