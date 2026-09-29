import { useEffect, useState } from 'react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { CurrentConditions, CurrentConditionReading, DisplayUnits, UserLanguage, WeatherStation } from '@benchmark/domain';
import { displayMetricValue, metricUnit } from '../forecastUnits';
import { locale, t } from '../language';

import thermostatIcon from '../assets/current-conditions/thermostat.svg';
import minimumIcon from '../assets/current-conditions/cold-temp.svg';
import maximumIcon from '../assets/current-conditions/hot-temp.svg';
import rainIcon from '../assets/current-conditions/raindrops.svg';
import windIcon from '../assets/current-conditions/wind.svg';
import directionIcon from '../assets/current-conditions/wi-wind-deg.svg';

const COMPASS_DIRECTIONS = ['North', 'North East', 'East', 'South East', 'South', 'South West', 'West', 'North West'] as const;

const METRICS = [
  ['TEMPERATURE', 'Temperature'], ['TEMPERATURE_MIN', 'Minimum temperature'],
  ['TEMPERATURE_MAX', 'Maximum temperature'], ['RELATIVE_HUMIDITY', 'Relative humidity'],
  ['WIND_SPEED', 'Wind speed'], ['WIND_DIRECTION', 'Wind direction'],
  ['PRECIPITATION_QUANTITY', 'Precipitation'], ['PRECIPITATION_CHANCE', 'Precipitation chance'],
] as const;
const METRIC_ICONS: Record<(typeof METRICS)[number][0], string> = {
  TEMPERATURE: thermostatIcon, TEMPERATURE_MIN: minimumIcon, TEMPERATURE_MAX: maximumIcon,
  RELATIVE_HUMIDITY: rainIcon, WIND_SPEED: windIcon, WIND_DIRECTION: directionIcon,
  PRECIPITATION_QUANTITY: rainIcon, PRECIPITATION_CHANCE: rainIcon,
};
const PERIODS: Record<CurrentConditionReading['period'], string> = {
  INSTANT: 'Station reading', PAST_HOUR: 'Past hour samples', ROLLING_HOUR: 'Rolling hour',
  REPORTED_PAST_HOUR: 'Reported in past hour', FORECAST_HOUR: 'Forecast hour', LOCAL_DAY: 'Today — station local time',
};

export function CurrentConditionsBar({ api, organizationId, station, units, language, onUnauthorized }: {
  api: BenchmarkApi; organizationId: string; station: WeatherStation; units: DisplayUnits;
  language: UserLanguage; onUnauthorized: () => void;
}) {
  const [result, setResult] = useState<{ key: string; data: CurrentConditions } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const key = `${organizationId}/${station.id}/${station.locationRevision ?? ''}/${station.updatedAt ?? ''}`;
  const data = result?.key === key ? result.data : null;
  useEffect(() => {
    let active = true;
    let pending = false;
    const abort = new AbortController();
    setResult(null); setFailed(false);
    async function load() {
      if (pending) return;
      pending = true;
      setBusy(true);
      try {
        const response = await api.getCurrentConditions(organizationId, station.id, abort.signal);
        if (active && response.stationId === station.id) { setResult({ key, data: response }); setFailed(false); }
      } catch (error: unknown) {
        if (!active) return;
        setResult(null); setFailed(true);
        if (error instanceof BenchmarkApiError && error.status === 401) onUnauthorized();
      } finally { pending = false; if (active) setBusy(false); }
    }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15 * 60_000);
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; abort.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [api, organizationId, station.id, key, refresh, onUnauthorized]);

  const localTime = (value: string) => new Intl.DateTimeFormat(locale(language), {
    timeZone: data?.timeZone || station.timeZone || 'UTC', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(value));
  const hasObserved = data && Object.values(data.metrics).some(value => value.source === 'OBSERVED');
  const status = failed ? 'Current conditions could not be loaded.' : !data ? 'Loading current conditions…'
    : hasObserved ? data?.observationStatus === 'STALE' ? 'Station readings are stale.' : 'Station observations'
      : 'Station readings unavailable.';
  return <section className="current-conditions" aria-label={t('Current conditions', language)} aria-busy={busy}>
    <div className="current-conditions-heading">
      <div><h2>{t('Current conditions', language)} <span>{station.name}</span></h2>
        <p role="status">{t(status, language)}{data && <> · {t('Checked', language)} {localTime(data.fetchedAt)}</>}</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>
        {t('Refresh conditions', language)}</button>
    </div>
    <dl className="current-conditions-grid">{METRICS.map(([metric, label]) => {
      const candidate = data?.metrics[metric];
      // Enforce the display contract even while an older backend is being replaced.
      const reading = candidate && (metric === 'PRECIPITATION_CHANCE'
        ? candidate.source === 'FORECAST' && candidate.provider === 'IBM_GRAF'
        : candidate.source === 'OBSERVED') ? candidate : undefined;
      const baseMetric = metric.startsWith('TEMPERATURE_') ? 'TEMPERATURE' : metric;
      const value = reading && Number.isFinite(reading.value)
        ? metric === 'WIND_DIRECTION'
          ? t(COMPASS_DIRECTIONS[Math.round(((reading.value % 360 + 360) % 360) / 45) % 8], language)
          : new Intl.NumberFormat(locale(language), { maximumFractionDigits: metric === 'PRECIPITATION_QUANTITY' ? 2 : 1 })
          .format(displayMetricValue(baseMetric, reading.value, units)) : '—';
      const details = reading ? `${reading.provider.replaceAll('_', ' ')} · ${localTime(reading.validAt)}${reading.periodStart && reading.periodEnd
        ? ` · ${localTime(reading.periodStart)} – ${localTime(reading.periodEnd)}` : ''}` : t('Unavailable', language);
      return <div key={metric} className="current-condition">
        <dt><span className="current-condition-icon" aria-hidden="true" style={{
          maskImage: `url("${METRIC_ICONS[metric]}")`, WebkitMaskImage: `url("${METRIC_ICONS[metric]}")`,
          transform: metric === 'WIND_DIRECTION' && reading && Number.isFinite(reading.value)
            ? `rotate(${reading.value}deg)` : undefined,
        }} /><span>{t(label, language)}</span></dt><dd><strong className={metric === 'WIND_DIRECTION' ? 'current-condition-direction' : undefined}>{value}</strong>{reading && metric !== 'WIND_DIRECTION' && <span>{metricUnit(baseMetric, units)}</span>}</dd>
        <small className={reading?.source === 'FORECAST' ? 'condition-forecast' : ''}>
          {reading ? t(reading.source === 'OBSERVED' ? 'Observed' : 'IBM forecast', language) : t('Unavailable', language)}
        </small>
        {reading && <small>{t(PERIODS[reading.period], language)}</small>}
        {reading && <small className="condition-time" title={details}>{localTime(reading.validAt)}</small>}
      </div>;
    })}</dl>
  </section>;
}
