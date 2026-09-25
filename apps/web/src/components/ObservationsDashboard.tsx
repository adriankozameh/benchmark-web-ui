import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { DisplayUnits, UserLanguage, WeatherStation } from '@benchmark/domain';
import { displayMetricValue } from '../forecastUnits';
import { errorMessage, t } from '../language';
import { MetricChart } from './ForecastDashboard';
import type { ChartPoint } from './ForecastDashboard';

const DAY_MS = 86_400_000;
const ORDER = [
  'TEMPERATURE', 'RELATIVE_HUMIDITY', 'PRECIPITATION_QUANTITY',
  'WIND_SPEED', 'WIND_GUST', 'WIND_DIRECTION',
];
const COLORS = ['#e44d47', '#2479ab', '#8061bd', '#319978'];

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

function earliestBackfillDay(today: string): string {
  const [year, month, day] = today.split('-').map(Number);
  const lastDayOfMonth = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return utcDay(new Date(Date.UTC(year - 1, month - 1, Math.min(day, lastDayOfMonth))));
}

export function ObservationsDashboard({
  api, organizationId, stations, plan, units, language, onUnauthorized, focusStationId,
}: {
  api: BenchmarkApi;
  organizationId: string;
  stations: WeatherStation[];
  plan: string;
  units: DisplayUnits;
  language: UserLanguage;
  onUnauthorized: () => void;
  focusStationId?: string | null;
}) {
  const today = utcDay(new Date());
  const [stationId, setStationId] = useState(focusStationId ?? stations[0]?.id ?? '');
  const [viewFrom, setViewFrom] = useState(() => addUtcDays(utcDay(new Date()), -6));
  const [viewThrough, setViewThrough] = useState(() => utcDay(new Date()));
  const [backfillFrom, setBackfillFrom] = useState(() => addUtcDays(utcDay(new Date()), -30));
  const [backfillThrough, setBackfillThrough] = useState(() => addUtcDays(utcDay(new Date()), -1));
  const [refreshKey, setRefreshKey] = useState(0);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [responseZone, setResponseZone] = useState<{ stationId: string; value: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [queuedDays, setQueuedDays] = useState<number | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;

  const selectedStationId = stations.some((station) => station.id === stationId)
    ? stationId : stations[0]?.id ?? '';
  const selectedStation = stations.find((station) => station.id === selectedStationId);
  const stationZone = selectedStation?.timeZone || 'UTC';
  const timeZone = responseZone?.stationId === selectedStationId ? responseZone.value : stationZone;
  const hasHardware = Boolean(selectedStation?.dataProviderId && selectedStation?.providerStationId);
  const canBackfill = plan === 'PREMIUM' && hasHardware;
  const earliestDay = earliestBackfillDay(today);

  const viewDays = viewFrom && viewThrough
    ? (Date.parse(`${viewThrough}T00:00:00Z`) - Date.parse(`${viewFrom}T00:00:00Z`)) / DAY_MS + 1
    : 0;
  const validView = viewDays >= 1 && viewFrom >= earliestDay && viewThrough <= today;
  const validBackfill = backfillFrom >= earliestDay && backfillFrom <= backfillThrough
    && backfillThrough < today;

  useEffect(() => {
    if (!selectedStationId || !validView) {
      setPoints([]);
      return;
    }
    let current = true;
    setLoading(true);
    setQueryError(null);
    setPoints([]);
    void (async () => {
      const endExclusive = addUtcDays(viewThrough, 1);
      const rows: ChartPoint[] = [];
      for (let day = viewFrom; day < endExclusive;) {
        // The API accepts at most 31 days. Adjacent half-open windows cover the
        // selected year without overlap or missing the last UTC hour.
        const next = addUtcDays(day, 31);
        const end = next < endExclusive ? next : endExclusive;
        const response = await api.getStationObservations(organizationId, selectedStationId,
          `${day}T00:00:00Z`, `${end}T00:00:00Z`);
        if (!current) return;
        setResponseZone({ stationId: selectedStationId, value: response.timeZone || stationZone });
        rows.push(...response.points
          .map((point) => ({ ...point, time: Date.parse(point.utcDateTime) }))
          .filter((point) => Number.isFinite(point.time) && point.provider && point.values));
        day = end;
      }
      if (current) setPoints(rows.sort((a, b) => a.time - b.time));
    })()
      .catch((cause: unknown) => {
        if (!current) return;
        if (cause instanceof BenchmarkApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setQueryError(errorMessage(cause, languageRef.current));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, organizationId, selectedStationId, stationZone, viewFrom, viewThrough,
    validView, refreshKey, onUnauthorized]);

  useEffect(() => {
    setBackfillError(null);
    setQueuedDays(null);
  }, [selectedStationId]);

  const providers = useMemo(() => [...new Set(points.map((point) => point.provider))].sort(), [points]);
  const colors = Object.fromEntries(providers.map((provider, index) => [provider, COLORS[index % COLORS.length]]));
  const metrics = useMemo(() => {
    const available = [...new Set(points.flatMap((point) => Object.entries(point.values)
      .filter(([, value]) => Number.isFinite(value)).map(([name]) => name)))];
    return available.filter((metric) => metric !== 'WIND_DIRECTION' || !available.includes('WIND_SPEED'))
      .sort((a, b) => {
        const ai = ORDER.indexOf(a);
        const bi = ORDER.indexOf(b);
        return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.localeCompare(b);
      });
  }, [points]);
  const displayPoints = useMemo(() => points.map((point) => ({
    ...point,
    values: Object.fromEntries(Object.entries(point.values)
      .map(([metric, value]) => [metric, displayMetricValue(metric, value, units)])),
  })), [points, units]);

  async function submitBackfill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canBackfill || !validBackfill || !selectedStationId || backfillBusy) return;
    setBackfillBusy(true);
    setBackfillError(null);
    setQueuedDays(null);
    try {
      const result = await api.requestObservationBackfill(organizationId, selectedStationId,
        backfillFrom, addUtcDays(backfillThrough, 1));
      setQueuedDays(result.queuedDays);
      setRefreshKey((key) => key + 1);
    } catch (cause: unknown) {
      if (cause instanceof BenchmarkApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setBackfillError(errorMessage(cause, language));
    } finally {
      setBackfillBusy(false);
    }
  }

  if (!stations.length) {
    return <div className="forecast-empty">{t('Add a station in Settings to see its observations.', language)}</div>;
  }

  return <div className="forecast-dashboard">
    <div className="page-heading-row">
      <div>
        <span className="eyebrow">{t('Station observations', language)}</span>
        <h2>{t('Observed weather', language)}</h2>
        <p>{t("Hourly observations use the selected station's local time zone.", language)}</p>
      </div>
      <button type="button" className="secondary-button" disabled={loading}
        onClick={() => setRefreshKey((key) => key + 1)}>
        <RefreshCw size={15} /> {t('Refresh', language)}
      </button>
    </div>

    <div className="forecast-controls observation-controls">
      <label className="field"><span>{t('Station', language)}</span>
        <select value={selectedStationId} onChange={(event) => setStationId(event.target.value)}>
          {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
        </select>
      </label>
      <label className="field"><span>{t('View from (UTC day)', language)}</span>
        <input type="date" value={viewFrom} max={today} onChange={(event) => setViewFrom(event.target.value)} />
      </label>
      <label className="field"><span>{t('View through (UTC day)', language)}</span>
        <input type="date" value={viewThrough} max={today} onChange={(event) => setViewThrough(event.target.value)} />
      </label>
    </div>
    {!validView && <div className="alert error"><CircleAlert size={18} />
      {t('Choose a UTC range within the last 12 months to view.', language)}</div>}
    {queryError && <div className="alert error"><CircleAlert size={18} />{queryError}</div>}
    {loading && <div className="forecast-empty"><LoaderCircle className="spin" size={20} />
      {t('Loading observations…', language)}</div>}
    {!loading && validView && !queryError && points.length === 0 &&
      <div className="forecast-empty">{t('No observations were returned for this station and time range.', language)}</div>}
    {!loading && !queryError && points.length > 0 && <>
      <div className="forecast-provider-filter"><span>{t('Providers', language)}</span>
        {providers.map((provider) => <span className="observation-provider" key={provider}>
          <i style={{ background: colors[provider] }} />{provider.replaceAll('_', ' ')}
        </span>)}
      </div>
      <div className="forecast-chart-grid">
        {metrics.map((metric) => <MetricChart key={metric} chartKind="observation" metric={metric}
          points={displayPoints} providers={providers} colors={colors} timeZone={timeZone}
          windowStart={Date.parse(`${viewFrom}T00:00:00Z`)}
          windowEnd={Date.parse(`${addUtcDays(viewThrough, 1)}T00:00:00Z`)}
          units={units} language={language} />)}
      </div>
    </>}

    <section className="observation-backfill">
      <h3>{t('Load historical station data', language)}</h3>
      <p>{t('Request complete UTC days from your linked station provider. Existing hourly values are updated as data arrives.', language)}</p>
      {!canBackfill ? <p>{t('Historical imports require PREMIUM and a connected station provider.', language)}</p>
        : <form onSubmit={(event) => { void submitBackfill(event); }}>
          <label className="field"><span>{t('First UTC day', language)}</span>
            <input type="date" required min={earliestDay} max={addUtcDays(today, -1)}
              value={backfillFrom} onChange={(event) => setBackfillFrom(event.target.value)} />
          </label>
          <label className="field"><span>{t('Last UTC day', language)}</span>
            <input type="date" required min={backfillFrom || earliestDay} max={addUtcDays(today, -1)}
              value={backfillThrough} onChange={(event) => setBackfillThrough(event.target.value)} />
          </label>
          <button type="submit" className="primary-button" disabled={!validBackfill || backfillBusy}>
            {backfillBusy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
            {t(backfillBusy ? 'Queuing days…' : 'Load historical data', language)}
          </button>
        </form>}
      {backfillError && <div className="alert error"><CircleAlert size={18} />{backfillError}</div>}
      {queuedDays !== null && <p role="status" className="observation-backfill-status">
        {t('Days queued:', language)} {queuedDays}. {t('Import runs in the background. Refresh the charts to see new data.', language)}
      </p>}
    </section>
  </div>;
}
