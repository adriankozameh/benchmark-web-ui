import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { DailyStationObservation, DisplayUnits, UserLanguage, WeatherStation } from '@benchmark/domain';
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
const VIEW_PRESETS = [
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
] as const;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

function monthsBefore(today: string, months: number): string {
  const [year, month, day] = today.split('-').map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDayOfMonth = new Date(Date.UTC(targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDayOfMonth));
  return utcDay(targetMonth);
}

function presentValues(entries: [string, number | null][]): Record<string, number> {
  return Object.fromEntries(entries.filter((entry): entry is [string, number] => entry[1] !== null));
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
  const utcToday = utcDay(new Date());
  const [stationId, setStationId] = useState(focusStationId ?? stations[0]?.id ?? '');
  const [viewFrom, setViewFrom] = useState(() => addUtcDays(utcDay(new Date()), -6));
  const [viewThrough, setViewThrough] = useState(() => utcDay(new Date()));
  const [backfillFrom, setBackfillFrom] = useState(() => addUtcDays(utcDay(new Date()), -30));
  const [backfillThrough, setBackfillThrough] = useState(() => addUtcDays(utcDay(new Date()), -1));
  const [refreshKey, setRefreshKey] = useState(0);
  const [days, setDays] = useState<DailyStationObservation[]>([]);
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
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const hasHardware = Boolean(selectedStation?.dataProviderId && selectedStation?.providerStationId);
  const canBackfill = plan === 'PREMIUM' && hasHardware;
  const earliestDay = monthsBefore(today, 12);

  const viewDays = viewFrom && viewThrough
    ? (Date.parse(`${viewThrough}T00:00:00Z`) - Date.parse(`${viewFrom}T00:00:00Z`)) / DAY_MS + 1
    : 0;
  const validView = viewDays >= 1 && viewFrom >= earliestDay && viewThrough <= today;
  const validBackfill = backfillFrom >= monthsBefore(utcToday, 12) && backfillFrom <= backfillThrough
    && backfillThrough < utcToday;

  useEffect(() => {
    if (!selectedStationId || !validView) {
      setDays([]);
      return;
    }
    let current = true;
    setLoading(true);
    setQueryError(null);
    setDays([]);
    void api.getDailyStationObservations(organizationId, selectedStationId, viewFrom, viewThrough)
      .then((response) => {
        if (!current) return;
        setResponseZone({ stationId: selectedStationId, value: response.timeZone });
        setDays(response.days);
      })
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

  const dailyMax = useMemo(() => days.map((day): ChartPoint => ({
    provider: day.provider, utcDateTime: day.utcDateTime, localDateTime: day.localDateTime,
    hoursFrom0Time: null, time: Date.parse(day.utcDateTime),
    values: presentValues([
      ['TEMPERATURE', day.temperatureMax], ['RELATIVE_HUMIDITY', day.relativeHumidityMax],
      ['PRECIPITATION_QUANTITY', day.precipitationTotal], ['WIND_SPEED', day.windSpeedMax],
      ['WIND_DIRECTION', day.windDirectionAtMax],
    ]),
  })), [days]);
  const dailyMin = useMemo(() => days.map((day): ChartPoint => ({
    provider: day.provider, utcDateTime: day.utcDateTime, localDateTime: day.localDateTime,
    hoursFrom0Time: null, time: Date.parse(day.utcDateTime),
    values: presentValues([
      ['TEMPERATURE', day.temperatureMin], ['RELATIVE_HUMIDITY', day.relativeHumidityMin],
    ]),
  })), [days]);
  const providers = useMemo(() => [...new Set(dailyMax.map((point) => point.provider))].sort(), [dailyMax]);
  const colors = Object.fromEntries(providers.map((provider, index) => [provider, COLORS[index % COLORS.length]]));
  const metrics = useMemo(() => {
    const available = [...new Set(dailyMax.flatMap((point) => Object.entries(point.values)
      .filter(([, value]) => Number.isFinite(value)).map(([name]) => name)))];
    return available.filter((metric) => ['TEMPERATURE', 'RELATIVE_HUMIDITY',
      'PRECIPITATION_QUANTITY', 'WIND_SPEED'].includes(metric))
      .sort((a, b) => {
        const ai = ORDER.indexOf(a);
        const bi = ORDER.indexOf(b);
        return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.localeCompare(b);
      });
  }, [dailyMax]);
  const convertPoints = (source: ChartPoint[]) => source.map((point) => ({
    ...point,
    values: Object.fromEntries(Object.entries(point.values)
      .map(([metric, value]) => [metric, displayMetricValue(metric, value, units)])),
  }));
  const displayMax = convertPoints(dailyMax);
  const displayMin = convertPoints(dailyMin);

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
        <p>{t("Daily observations use the selected station's local calendar date.", language)}</p>
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
      <label className="field"><span>{t('View from (local day)', language)}</span>
        <input type="date" value={viewFrom} max={today} onChange={(event) => setViewFrom(event.target.value)} />
      </label>
      <label className="field"><span>{t('View through (local day)', language)}</span>
        <input type="date" value={viewThrough} max={today} onChange={(event) => setViewThrough(event.target.value)} />
      </label>
      <div className="forecast-range observation-presets" role="group" aria-label={t('View range', language)}>
        {VIEW_PRESETS.map(({ label, months }) => {
          const selected = viewFrom === monthsBefore(today, months) && viewThrough === today;
          return <button type="button" key={months} className={selected ? 'selected' : ''}
            aria-pressed={selected} onClick={() => {
              setViewFrom(monthsBefore(today, months));
              setViewThrough(today);
            }}>{t(label, language)}</button>;
        })}
      </div>
    </div>
    {!validView && <div className="alert error"><CircleAlert size={18} />
      {t('Choose local dates within the last 12 months to view.', language)}</div>}
    {queryError && <div className="alert error"><CircleAlert size={18} />{queryError}</div>}
    {loading && <div className="forecast-empty"><LoaderCircle className="spin" size={20} />
      {t('Loading observations…', language)}</div>}
    {!loading && validView && !queryError && days.length === 0 &&
      <div className="forecast-empty">{t('No observations were returned for this station and time range.', language)}</div>}
    {!loading && !queryError && days.length > 0 && <>
      <div className="forecast-provider-filter"><span>{t('Providers', language)}</span>
        {providers.map((provider) => <span className="observation-provider" key={provider}>
          <i style={{ background: colors[provider] }} />{provider.replaceAll('_', ' ')}
        </span>)}
      </div>
      <div className="forecast-chart-grid">
        {metrics.map((metric) => {
          const bounds = metric === 'TEMPERATURE' || metric === 'RELATIVE_HUMIDITY';
          return <MetricChart key={metric}
            chartKind="observation" metric={metric}
            title={`${t(metric === 'PRECIPITATION_QUANTITY' ? 'Precipitation'
              : metric === 'RELATIVE_HUMIDITY' ? 'Relative humidity'
                : metric === 'TEMPERATURE' ? 'Temperature' : metric === 'WIND_SPEED' ? 'Wind speed' : metric, language)} · ${t(metric === 'PRECIPITATION_QUANTITY' ? 'Daily total'
              : bounds ? 'Daily range' : 'Daily maximum', language)}`}
            points={displayMax} secondaryPoints={bounds ? displayMin : undefined}
            providers={providers} colors={colors} timeZone={timeZone}
            windowStart={Date.parse(`${addUtcDays(viewFrom, -1)}T00:00:00Z`)}
            windowEnd={Date.parse(`${addUtcDays(viewThrough, 2)}T00:00:00Z`)}
            units={units} language={language} />;
        })}
      </div>
    </>}

    <section className="observation-backfill">
      <h3>{t('Load historical station data', language)}</h3>
      <p>{t('Request complete UTC days from your linked station provider. Existing hourly values are updated as data arrives.', language)}</p>
      {!canBackfill ? <p>{t('Historical imports require PREMIUM and a connected station provider.', language)}</p>
        : <form onSubmit={(event) => { void submitBackfill(event); }}>
          <label className="field"><span>{t('First UTC day', language)}</span>
            <input type="date" required min={monthsBefore(utcToday, 12)} max={addUtcDays(utcToday, -1)}
              value={backfillFrom} onChange={(event) => setBackfillFrom(event.target.value)} />
          </label>
          <label className="field"><span>{t('Last UTC day', language)}</span>
            <input type="date" required min={backfillFrom || monthsBefore(utcToday, 12)} max={addUtcDays(utcToday, -1)}
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
