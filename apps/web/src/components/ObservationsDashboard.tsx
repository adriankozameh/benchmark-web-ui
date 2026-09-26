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

type Aggregation = 'daily' | 'hourly';
type ViewQuery = { from: string; through: string; aggregation: Aggregation };

function localDay(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

// Find the start of a local calendar day without assuming a fixed UTC offset.
// This also handles DST transitions that skip midnight.
function localDayStart(day: string, timeZone: string): number {
    const nominal = Date.parse(`${day}T00:00:00Z`);
    let low = nominal - 2 * DAY_MS;
    let high = nominal + 2 * DAY_MS;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (localDay(new Date(middle), timeZone) < day) low = middle + 1;
        else high = middle;
    }
    return low;
}

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
    const [initialToday] = useState(() => localDay(new Date(),
        (stations.find((station) => station.id === focusStationId) ?? stations[0])?.timeZone || 'UTC'));
    const [viewFrom, setViewFrom] = useState(() => addUtcDays(initialToday, -6));
    const [viewThrough, setViewThrough] = useState(initialToday);
    const [aggregation, setAggregation] = useState<Aggregation>('daily');
    const [appliedView, setAppliedView] = useState<ViewQuery>(() => ({
        from: addUtcDays(initialToday, -6), through: initialToday, aggregation: 'daily',
    }));
    const [backfillFrom, setBackfillFrom] = useState(() => addUtcDays(utcDay(new Date()), -30));
    const [backfillThrough, setBackfillThrough] = useState(() => addUtcDays(utcDay(new Date()), -1));
    const [refreshKey, setRefreshKey] = useState(0);
    const [hourlyPoints, setHourlyPoints] = useState<ChartPoint[]>([]);
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
    const today = localDay(new Date(), timeZone);
    const hasHardware = Boolean(selectedStation?.dataProviderId && selectedStation?.providerStationId);
    const canBackfill = plan === 'PREMIUM' && hasHardware;
    const earliestDay = monthsBefore(today, 12);

    const viewDays = viewFrom && viewThrough
        ? (Date.parse(`${viewThrough}T00:00:00Z`) - Date.parse(`${viewFrom}T00:00:00Z`)) / DAY_MS + 1
        : 0;
    const validView = viewDays >= 1 && viewFrom >= earliestDay && viewThrough <= today;
    const hourlyAllowed = validView && viewDays <= 30;
    const effectiveAggregation = hourlyAllowed ? aggregation : 'daily';
    const pendingChanges = viewFrom !== appliedView.from || viewThrough !== appliedView.through
        || effectiveAggregation !== appliedView.aggregation;
    const hourlyView = appliedView.aggregation === 'hourly';
    const hourlyWindow = useMemo(() => ({
        start: localDayStart(appliedView.from, stationZone),
        end: localDayStart(addUtcDays(appliedView.through, 1), stationZone),
    }), [appliedView.from, appliedView.through, stationZone]);

    function applyView(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!validView || !selectedStationId) return;
        setAppliedView({ from: viewFrom, through: viewThrough, aggregation: effectiveAggregation });
    }

    const validBackfill = backfillFrom >= monthsBefore(utcToday, 12) && backfillFrom <= backfillThrough
        && backfillThrough < utcToday;

    useEffect(() => {
        if (!selectedStationId) return;
        let current = true;
        setLoading(true);
        setQueryError(null);
        setDays([]);
        setHourlyPoints([]);
        const query = async () => {
            if (appliedView.aggregation === 'hourly') {
                const response = await api.getStationObservations(organizationId, selectedStationId,
                    new Date(hourlyWindow.start).toISOString(), new Date(hourlyWindow.end).toISOString());
                if (!current) return;
                setResponseZone({ stationId: selectedStationId, value: response.timeZone || stationZone });
                setHourlyPoints(response.points
                    .map((point) => ({ ...point, time: Date.parse(point.utcDateTime) }))
                    .filter((point) => Number.isFinite(point.time) && point.provider && point.values
                        && point.time >= hourlyWindow.start && point.time < hourlyWindow.end)
                    .sort((a, b) => a.time - b.time));
            } else {
                const response = await api.getDailyStationObservations(organizationId, selectedStationId,
                    appliedView.from, appliedView.through);
                if (!current) return;
                setResponseZone({ stationId: selectedStationId, value: response.timeZone || stationZone });
                setDays(response.days);
            }
        };
        void query()
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
    }, [api, organizationId, selectedStationId, stationZone, appliedView, hourlyWindow,
        refreshKey, onUnauthorized]);

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
    const primaryPoints = hourlyView ? hourlyPoints : dailyMax;
    const metricPoints = hourlyView ? hourlyPoints : [...dailyMax, ...dailyMin];
    const providers = [...new Set(metricPoints.map((point) => point.provider))].sort();
    const colors = Object.fromEntries(providers.map((provider, index) => [provider, COLORS[index % COLORS.length]]));
    const metrics = (() => {
        const available = [...new Set(metricPoints.flatMap((point) => Object.entries(point.values)
            .filter(([, value]) => Number.isFinite(value)).map(([name]) => name)))];
        return available.filter((metric) => metric !== 'WIND_DIRECTION' || !available.includes('WIND_SPEED'))
            .sort((a, b) => {
                const ai = ORDER.indexOf(a);
                const bi = ORDER.indexOf(b);
                return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.localeCompare(b);
            });
    })();
    const convertPoints = (source: ChartPoint[]) => source.map((point) => ({
        ...point,
        values: Object.fromEntries(Object.entries(point.values)
            .map(([metric, value]) => [metric, displayMetricValue(metric, value, units)])),
    }));
    const displayMax = convertPoints(primaryPoints);
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
                <p>{t("Observations use the selected station's local calendar dates.", language)}</p>
            </div>
            <button type="button" className="secondary-button" disabled={loading}
                    onClick={() => setRefreshKey((key) => key + 1)}>
                <RefreshCw size={15} /> {t('Refresh', language)}
            </button>
        </div>

        <form className="forecast-controls observation-controls" onSubmit={applyView}>
            <label className="field"><span>{t('Station', language)}</span>
                <select value={selectedStationId} onChange={(event) => setStationId(event.target.value)}>
                    {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
                </select>
            </label>
            <label className="field"><span>{t('View from (local day)', language)}</span>
                <input type="date" required min={earliestDay} value={viewFrom} max={today} onChange={(event) => setViewFrom(event.target.value)} />
            </label>
            <label className="field"><span>{t('View through (local day)', language)}</span>
                <input type="date" required min={viewFrom || earliestDay} value={viewThrough} max={today} onChange={(event) => setViewThrough(event.target.value)} />
            </label>
            <label className="field"><span>{t('Aggregation', language)}</span>
                <select value={effectiveAggregation} onChange={(event) => setAggregation(event.target.value as Aggregation)}
                        aria-describedby="hourly-range-help">
                    <option value="daily">{t('Daily', language)}</option>
                    <option value="hourly" disabled={!hourlyAllowed}>{t('Hourly', language)}</option>
                </select>
            </label>
            <button type="submit" className="primary-button" disabled={!validView || loading}>
                {t('Apply', language)}
            </button>
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
        </form>
        <p id="hourly-range-help">{t('Hourly observations are available for ranges of 30 days or less. Longer ranges use daily aggregation.', language)}</p>
        {pendingChanges && <p role="status" style={{
            background: '#e8edf3',
            border: '1px solid #d5dde6',
            borderRadius: 8,
            padding: '12px 16px',
        }}>{t('Click Apply to update the charts.', language)}</p>}
        <p>{t('Showing:', language)} {appliedView.from} – {appliedView.through} · {t(hourlyView ? 'Hourly' : 'Daily', language)}</p>
        {!validView && <div className="alert error"><CircleAlert size={18} />
            {t('Choose local dates within the last 12 months to view.', language)}</div>}
        {queryError && <div className="alert error"><CircleAlert size={18} />{queryError}</div>}
        {loading && <div className="forecast-empty"><LoaderCircle className="spin" size={20} />
            {t('Loading observations…', language)}</div>}
        {!loading && !queryError && metricPoints.length === 0 &&
            <div className="forecast-empty">{t('No observations were returned for this station and time range.', language)}</div>}
        {!loading && !queryError && metricPoints.length > 0 && <>
            <div className="forecast-provider-filter"><span>{t('Providers', language)}</span>
                {providers.map((provider) => <span className="observation-provider" key={provider}>
          <i style={{ background: colors[provider] }} />{provider.replaceAll('_', ' ')}
        </span>)}
            </div>
            <div className="forecast-chart-grid">
                {metrics.map((metric) => {
                    const bounds = !hourlyView && (metric === 'TEMPERATURE' || metric === 'RELATIVE_HUMIDITY');
                    return <MetricChart key={`${appliedView.aggregation}-${metric}`}
                                        chartKind="observation" metric={metric}
                                        title={hourlyView ? undefined : `${t(metric === 'PRECIPITATION_QUANTITY' ? 'Precipitation'
                                            : metric === 'RELATIVE_HUMIDITY' ? 'Relative humidity'
                                                : metric === 'TEMPERATURE' ? 'Temperature' : metric === 'WIND_SPEED' ? 'Wind speed' : metric, language)} · ${t(metric === 'PRECIPITATION_QUANTITY' ? 'Daily total'
                                            : bounds ? 'Daily range' : 'Daily maximum', language)}`}
                                        points={displayMax} secondaryPoints={bounds ? displayMin : undefined}
                                        providers={providers} colors={colors} timeZone={timeZone}
                                        windowStart={hourlyView ? hourlyWindow.start : Date.parse(`${addUtcDays(appliedView.from, -1)}T00:00:00Z`)}
                                        windowEnd={hourlyView ? hourlyWindow.end : Date.parse(`${addUtcDays(appliedView.through, 2)}T00:00:00Z`)}
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
