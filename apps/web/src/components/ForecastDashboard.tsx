import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { StationTimeSeriesPoint, WeatherStation } from '@benchmark/domain';

const RANGES = [
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
  { label: '16 days', hours: 384 },
] as const;

const COLORS = ['#e44d47', '#2479ab', '#8061bd', '#319978', '#db9031', '#637897', '#a54683', '#6e8335'];
const FIRST_METRICS = [
  'TEMPERATURE', 'RELATIVE_HUMIDITY', 'PRECIPITATION_QUANTITY',
  'PRECIPITATION_CHANCE', 'WIND_SPEED', 'WIND_GUST', 'WIND_DIRECTION',
  'CLOUD_COVER', 'PRESSURE', 'SOLAR_RADIATION', 'UV_INDEX',
];

const METRIC_LABELS: Record<string, string> = {
  ATMOSPHERIC_DISPERSION_INDEX: 'Atmospheric dispersion index',
  CLOUD_COVER: 'Cloud cover',
  EVAPOTRANSPIRATION: 'Evapotranspiration',
  HAINES_INDEX: 'Haines index',
  MIXING_HEIGHT: 'Mixing height',
  PRECIPITATION_CHANCE: 'Precipitation chance',
  PRECIPITATION_QUANTITY: 'Precipitation',
  PRECIPITATION_QUANTITY_PROBOFABOVE: 'Precipitation probability above',
  PRECIPITATION_QUANTITY_PROBOFBELOW: 'Precipitation probability below',
  PRESSURE: 'Pressure',
  RELATIVE_HUMIDITY: 'Relative humidity',
  SOLAR_RADIATION: 'Solar radiation',
  TEMPERATURE: 'Temperature',
  TEMPERATURE_PROBOFABOVE: 'Temperature probability above',
  TEMPERATURE_PROBOFBELOW: 'Temperature probability below',
  TRANSPORT_WIND_DIRECTION: 'Transport wind direction',
  TRANSPORT_WIND_SPEED: 'Transport wind speed',
  UV_INDEX: 'UV index',
  VENTILATION_RATE: 'Ventilation rate',
  WIND_DIRECTION: 'Wind direction',
  WIND_GUST: 'Wind gust',
  WIND_SPEED: 'Wind speed',
};

const PROVIDER_LABELS: Record<string, string> = {
  NOAA_GFS: 'NOAA GFS',
  IBM_GRAF: 'IBM GRAF',
  WCS_ECMWF: 'ECMWF',
  WCS_GEFS: 'GEFS',
  WCS_ERA5: 'ERA5',
};

const WIND_DIRECTIONS: Record<string, string> = {
  WIND_SPEED: 'WIND_DIRECTION',
  TRANSPORT_WIND_SPEED: 'TRANSPORT_WIND_DIRECTION',
};

type ForecastPoint = StationTimeSeriesPoint & { time: number };

function localLabel(timestamp: number | string, timeZone: string, includeTime = false, includeOffset = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, month: 'short', day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    ...(includeOffset ? { timeZoneName: 'shortOffset' as const } : {}),
  }).format(typeof timestamp === 'string' ? new Date(timestamp) : timestamp);
}

function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric.replaceAll('_', ' ').toLowerCase();
}

function formatValue(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function ForecastDashboard({
  api, organizationId, stations, onUnauthorized,
}: {
  api: BenchmarkApi;
  organizationId: string;
  stations: WeatherStation[];
  onUnauthorized: () => void;
}) {
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [rangeHours, setRangeHours] = useState<number>(72);
  const [refreshKey, setRefreshKey] = useState(0);
  const [points, setPoints] = useState<ForecastPoint[]>([]);
  const [forecastTimeZone, setForecastTimeZone] = useState<{ stationId: string; value: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenProviders, setHiddenProviders] = useState<string[]>([]);

  const selectedStationId = stations.some((station) => station.id === stationId)
    ? stationId : stations[0]?.id ?? '';
  const stationTimeZone = stations.find((station) => station.id === selectedStationId)?.timeZone ?? 'UTC';
  const timeZone = forecastTimeZone?.stationId === selectedStationId
    ? forecastTimeZone.value : stationTimeZone;

  useEffect(() => {
    if (!selectedStationId) return;
    let current = true;
    setLoading(true);
    setError(null);
    setPoints([]);

    const now = Date.now();
    const from = new Date(now - 6 * 60 * 60 * 1000).toISOString();
    const to = new Date(now + rangeHours * 60 * 60 * 1000).toISOString();
    void api.getStationForecast(organizationId, selectedStationId, from, to)
      .then((response) => {
        if (!current) return;
        setForecastTimeZone({ stationId: selectedStationId, value: response.timeZone || stationTimeZone });
        setPoints(response.points
          .map((point) => ({ ...point, time: Date.parse(point.utcDateTime) }))
          .filter((point) => Number.isFinite(point.time) && point.provider && point.values)
          .sort((a, b) => a.time - b.time));
      })
      .catch((cause: unknown) => {
        if (!current) return;
        if (cause instanceof BenchmarkApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(cause instanceof Error ? cause.message : 'Could not load the forecast.');
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, organizationId, selectedStationId, stationTimeZone, rangeHours, refreshKey, onUnauthorized]);

  const providers = useMemo(() => [...new Set(points.map((point) => point.provider))].sort(), [points]);
  const metrics = useMemo(() => {
    const available = [...new Set(points.flatMap((point) => Object.keys(point.values)))];
    // A direction is an angle: a line from 359° to 1° would misleadingly cross
    // the whole chart. Show it as arrows on its matching speed chart instead.
    return available.filter((metric) =>
      !((metric === 'WIND_DIRECTION' && available.includes('WIND_SPEED')) ||
        (metric === 'TRANSPORT_WIND_DIRECTION' && available.includes('TRANSPORT_WIND_SPEED'))))
      .sort((a, b) => {
      const ai = FIRST_METRICS.indexOf(a);
      const bi = FIRST_METRICS.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      return a.localeCompare(b);
      });
  }, [points]);
  const visibleProviders = providers.filter((provider) => !hiddenProviders.includes(provider));
  const colors = Object.fromEntries(providers.map((provider, index) => [provider, COLORS[index % COLORS.length]]));

  if (!stations.length) {
    return <div className="forecast-empty">Add a station in Settings to see its forecasts.</div>;
  }

  return (
    <div className="forecast-dashboard">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">Latest forecast</span>
          <h2>Compare forecast providers</h2>
          <p>Compare providers at the same moment. Times are shown in the selected station's local time zone.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="forecast-controls">
        <label className="field">
          <span>Station</span>
          <select value={selectedStationId} onChange={(event) => setStationId(event.target.value)}>
            {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
          </select>
        </label>
        <div className="forecast-range" role="group" aria-label="Forecast time range">
          {RANGES.map((range) => (
            <button key={range.hours} type="button" className={rangeHours === range.hours ? 'selected' : ''}
              aria-pressed={rangeHours === range.hours} onClick={() => setRangeHours(range.hours)}>
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert error"><CircleAlert size={18} /><div><strong>Forecast unavailable</strong><span>{error}</span></div></div>}
      {loading && <div className="forecast-empty"><LoaderCircle className="spin" size={20} /> Loading forecasts…</div>}
      {!loading && !error && points.length === 0 && (
        <div className="forecast-empty">No forecast data was returned for this station and time range.</div>
      )}

      {!loading && !error && points.length > 0 && (
        <>
          <div className="forecast-provider-filter" role="group" aria-label="Visible forecast providers">
            <span>Providers</span>
            {providers.map((provider) => (
              <button type="button" key={provider} aria-pressed={!hiddenProviders.includes(provider)}
                className={hiddenProviders.includes(provider) ? 'muted-provider' : ''}
                onClick={() => setHiddenProviders((hidden) => hidden.includes(provider)
                  ? hidden.filter((name) => name !== provider) : [...hidden, provider])}>
                <i style={{ background: colors[provider] }} />{PROVIDER_LABELS[provider] ?? provider.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          <div className="forecast-chart-grid">
            {metrics.map((metric) => (
              <MetricChart key={metric} metric={metric} points={points}
                providers={visibleProviders} colors={colors} timeZone={timeZone} />
            ))}
          </div>
          {metrics.length === 0 && <div className="forecast-empty">No numeric metrics were returned.</div>}
        </>
      )}
    </div>
  );
}

const WIDTH = 760;
const HEIGHT = 220;
const LEFT = 57;
const RIGHT = 14;
const TOP = 16;
const BOTTOM = 31;

function MetricChart({ metric, points, providers, colors, timeZone }: {
  metric: string;
  points: ForecastPoint[];
  providers: string[];
  colors: Record<string, string>;
  timeZone: string;
}) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const directionMetric = WIND_DIRECTIONS[metric];
  const series = useMemo(() => providers.map((provider) => ({
    provider,
    points: points.filter((point) => point.provider === provider &&
      typeof point.values[metric] === 'number' && Number.isFinite(point.values[metric])),
  })), [points, providers, metric]);
  const all = series.flatMap((item) => item.points);
  const times = [...new Set(all.map((point) => point.time))].sort((a, b) => a - b);
  const values = all.map((point) => point.values[metric]);
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.08, Math.abs(high) * 0.01, 0.1);
  const min = low - padding;
  const max = high + padding;
  const x = (time: number) => LEFT + (time - minTime) / (maxTime - minTime || 1) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) => TOP + (max - value) / (max - min) * (HEIGHT - TOP - BOTTOM);
  const activeTime = hoverTime !== null && times.length > 0
    ? times.reduce((nearest, time) => Math.abs(time - hoverTime) < Math.abs(nearest - hoverTime) ? time : nearest)
    : null;
  const active = series.map((item) => ({
    provider: item.provider,
    point: item.points.find((point) => point.time === activeTime),
  })).filter((item) => item.point !== undefined);

  function move(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const position = Math.min(1, Math.max(0, (event.clientX - box.left - LEFT / WIDTH * box.width) /
      ((WIDTH - LEFT - RIGHT) / WIDTH * box.width)));
    setHoverTime(minTime + position * (maxTime - minTime));
  }

  return (
    <section className="forecast-chart-card" aria-label={`${metricLabel(metric)} forecast chart`}>
      <div className="forecast-chart-heading"><h3>{metricLabel(metric)}</h3>
        <span>{activeTime === null ? timeZone
          : localLabel(active[0]?.point?.localDateTime ?? activeTime, timeZone, true, true)}</span></div>
      {directionMetric && <p className="forecast-wind-convention">Arrows point toward where the wind comes from · degrees clockwise from true north</p>}
      {all.length === 0 ? <div className="forecast-chart-blank">Select a provider to view this metric.</div> : (
        <>
          <svg className="forecast-plot" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
            aria-label={`${metricLabel(metric)} by provider, ${localLabel(minTime, timeZone)} to ${localLabel(maxTime, timeZone)} ${timeZone}${directionMetric ? '; arrows point toward the wind source' : ''}`}
            onPointerMove={move} onPointerLeave={() => setHoverTime(null)}>
            {[0, 0.5, 1].map((fraction) => {
              const rowY = TOP + fraction * (HEIGHT - TOP - BOTTOM);
              return <g key={fraction}>
                <line x1={LEFT} x2={WIDTH - RIGHT} y1={rowY} y2={rowY} stroke="#edf1f5" />
                <text x={LEFT - 9} y={rowY + 4} textAnchor="end" className="forecast-axis">{formatValue(max - fraction * (max - min))}</text>
              </g>;
            })}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <text key={fraction} x={LEFT + fraction * (WIDTH - LEFT - RIGHT)} y={HEIGHT - 6}
                textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}
                className="forecast-axis">{localLabel(minTime + fraction * (maxTime - minTime), timeZone, maxTime - minTime <= 48 * 60 * 60 * 1000)}</text>
            ))}
            {activeTime !== null && <line x1={x(activeTime)} x2={x(activeTime)} y1={TOP} y2={HEIGHT - BOTTOM}
              stroke="#9aa9b8" strokeDasharray="4 4" pointerEvents="none" />}
            {series.map(({ provider, points: providerPoints }) => {
              // Gaps in a provider's timestamps remain gaps in its line.
              const chunks: ForecastPoint[][] = [];
              const intervals = providerPoints.slice(1).map((point, index) => point.time - providerPoints[index].time)
                .filter((interval) => interval > 0).sort((a, b) => a - b);
              const cadence = intervals[Math.floor(intervals.length / 2)] ?? 60 * 60 * 1000;
              for (const point of providerPoints) {
                if (!chunks.length || point.time - chunks[chunks.length - 1].at(-1)!.time > Math.max(2 * 60 * 60 * 1000, cadence * 1.5)) chunks.push([]);
                chunks.at(-1)!.push(point);
              }
              return <g key={provider} fill="none" stroke={colors[provider]} strokeWidth="2.5" strokeLinejoin="round">
                {chunks.map((chunk, index) => chunk.length === 1
                  ? <circle key={index} cx={x(chunk[0].time)} cy={y(chunk[0].values[metric])} r="3" fill={colors[provider]} />
                  : <path key={index} d={chunk.map((point, position) =>
                    `${position === 0 ? 'M' : 'L'}${x(point.time).toFixed(2)} ${y(point.values[metric]).toFixed(2)}`).join(' ')} />)}
                {directionMetric && providerPoints
                  .filter((point) => Number.isFinite(point.values[directionMetric]))
                  .map((point) => <WindArrow key={point.time}
                    x={x(point.time)} y={y(point.values[metric])}
                    angle={point.values[directionMetric]} />)}
              </g>;
            })}
            {!directionMetric && active.map(({ provider, point }) => <circle key={provider} cx={x(point!.time)} cy={y(point!.values[metric])}
              r="5" fill={colors[provider]} stroke="white" strokeWidth="2" pointerEvents="none" />)}
          </svg>
          <div className="forecast-chart-values" aria-live="off">
            {activeTime === null ? <span>Move over the chart to compare values.</span> : active.length === 0
              ? <span>No values at this time.</span>
              : active.map(({ provider, point }) => <span key={provider}>
                <i style={{ background: colors[provider] }} />
                {PROVIDER_LABELS[provider] ?? provider.replaceAll('_', ' ')} <strong>{formatValue(point!.values[metric])}</strong>
                {directionMetric && Number.isFinite(point!.values[directionMetric]) &&
                  <span>· {formatValue(((point!.values[directionMetric] % 360) + 360) % 360)}° clockwise from N</span>}
              </span>)}
          </div>
        </>
      )}
    </section>
  );
}

function WindArrow({ x, y, angle }: { x: number; y: number; angle: number }) {
  // The unrotated arrow points north. SVG positive rotation is clockwise, so
  // the backend's meteorological bearing maps directly onto the glyph.
  const degrees = ((angle % 360) + 360) % 360;
  return <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${degrees})`}
    pointerEvents="none" aria-hidden="true">
    <path d="M0 5 V-5 M-4 -1 L0 -5 L4 -1" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M0 5 V-5 M-4 -1 L0 -5 L4 -1" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </g>;
}
