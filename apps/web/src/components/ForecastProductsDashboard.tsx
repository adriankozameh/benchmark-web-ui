import { CurrentConditionsBar } from './CurrentConditionsBar';
import { useEffect, useRef, useState } from 'react';
import { BenchmarkApi, BenchmarkApiError } from '@benchmark/api';
import type { DisplayUnits, ForecastProductsResponse, ForecastProductSources, UserLanguage, WeatherStation } from '@benchmark/domain';
import { SafecastDashboard } from './SafecastDashboard';
import { BurncastDashboard } from './BurncastDashboard';
import { MetricChart, type ChartPoint } from './ForecastDashboard';
import { displayMetricValue, metricUnit } from '../forecastUnits';
import { errorMessage, locale, t } from '../language';

export type ProductKind = 'burncast' | 'farmcast' | 'safecast';
const METRICS: Record<ProductKind, Array<[string, string, boolean?]>> = {
  burncast: [['HAINES_INDEX', 'Haines index'], ['MIXING_HEIGHT', 'Mixing height'],
    ['TRANSPORT_WIND_SPEED', 'Transport wind speed'], ['VENTILATION_RATE', 'Ventilation rate'],
    ['ATMOSPHERIC_DISPERSION_INDEX', 'Atmospheric dispersion index'], ['UV_INDEX', 'UV index'], ['KBDI', 'KBDI', true]],
  farmcast: [['GROWING_DEGREE_DAYS', 'Growing degree days', true], ['CHILLING_HOURS', 'Chilling hours', true],
    ['WATER_BALANCE', 'Water balance', true], ['EVAPOTRANSPIRATION', 'Evapotranspiration'], ['POWDERY_MILDEW', 'Powdery mildew index']],
  safecast: [['TEMPERATURE', 'Temperature'], ['RELATIVE_HUMIDITY', 'Relative humidity'],
    ['UV_INDEX', 'UV index'], ['HEAT_INDEX', 'Heat index'], ['WIND_CHILL', 'Wind chill']],
};
const TITLES = { burncast: 'Burncast', farmcast: 'Farmcast', safecast: 'Safecast' };
export function ForecastProductsDashboard({ api, organizationId, stations, kind, units, language, onUnauthorized, focusStationId, onStationChange, canManage = false }: {
  api: BenchmarkApi; organizationId: string; stations: WeatherStation[]; kind: ProductKind;
  units: DisplayUnits; language: UserLanguage; onUnauthorized: () => void; focusStationId: string | null; onStationChange: (stationId: string) => void; canManage?: boolean;
}) {
  const stationId = focusStationId ?? stations[0]?.id ?? '';
  const [gddStart, setGddStart] = useState('');
  const [chillStart, setChillStart] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const selection = useRef('');
  const appliedSettings = useRef<string | null>(null);
  const [days, setDays] = useState(7);
  const fixedForecastPeriod = kind === 'burncast' || kind === 'safecast';
  const forecastDays = fixedForecastPeriod ? 15 : days;
  const [revision, setRevision] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const [sources, setSources] = useState<ForecastProductSources | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [data, setData] = useState<ForecastProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lang = useRef(language); lang.current = language;
  const selected = stations.find(s => s.id === stationId) ?? stations[0];
  selection.current = `${organizationId}/${selected?.id ?? ''}`;
  useEffect(() => {
    appliedSettings.current = null;
    setGddStart(''); setChillStart(''); setSaveError(null); setSaved(false); setSaving(false);
  }, [organizationId, selected?.id]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let enrichmentChecks = 0;
    setError(null);
    if (!selected) { setData(null); setLoading(false); return; }
    const cached = api.getCachedForecastProducts(organizationId, selected.id, forecastDays, kind, selected.updatedAt);
    setData(cached);
    setLoading(!cached);
    const load = (refresh: boolean) => {
      void api.getForecastProducts(organizationId, selected.id, forecastDays, kind, selected.updatedAt, refresh).then(result => {
        if (!active) return;
        setData(result);
        const settingsKey = JSON.stringify(result.settings);
        if (appliedSettings.current !== settingsKey) {
          appliedSettings.current = settingsKey;
          setGddStart(result.settings?.gddStartDate ?? '');
          setChillStart(result.settings?.chillingStartDate ?? '');
        }
        const pending = result.notices.includes('ENRICHMENT_PENDING') && enrichmentChecks++ < 12;
        const expiry = Date.parse(result.expiresAt ?? '');
        const delay = pending ? 5_000 : Number.isFinite(expiry) ? Math.min(60_000, Math.max(1_000, expiry - Date.now() + 100)) : 60_000;
        timer = setTimeout(() => { if (active) load(true); }, delay);
      }).catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof BenchmarkApiError && (cause.status === 401 || cause.status === 403)) setData(null);
        if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
        else setError(errorMessage(cause, lang.current));
      }).finally(() => { if (active) setLoading(false); });
    };
    load(revision > 0);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [api, organizationId, selected?.id, selected?.updatedAt, forecastDays, kind, revision, onUnauthorized]);
  useEffect(() => {
    setSources(null); setSourcesError(null);
    if (!showSources || !selected || !data) return;
    const abort = new AbortController();
    void api.getForecastProductSources(organizationId, selected.id, forecastDays, kind, abort.signal)
      .then(result => { if (!abort.signal.aborted) setSources(result); })
      .catch((cause: unknown) => {
        if (abort.signal.aborted) return;
        if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
        else setSourcesError(errorMessage(cause, lang.current));
      });
    return () => abort.abort();
  }, [api, organizationId, selected?.id, selected?.updatedAt, forecastDays, kind, showSources, data?.cacheVersion, onUnauthorized]);
  const saveSettings = async () => {
    if (!selected || !canManage || saving) return;
    const target = selection.current;
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      await api.saveForecastSettings(organizationId, selected.id, {
        gddStartDate: gddStart || null, chillingStartDate: chillStart || null,
      });
      if (selection.current === target) { setSaved(true); setRevision(v => v + 1); }
    } catch (cause: unknown) {
      if (selection.current !== target) return;
      if (cause instanceof BenchmarkApiError && cause.status === 401) onUnauthorized();
      else setSaveError(errorMessage(cause, lang.current));
    } finally { if (selection.current === target) setSaving(false); }
  };
  const format = (metric: string, value: number | undefined) => value === undefined ? '—'
    : new Intl.NumberFormat(locale(language), { maximumFractionDigits: 2 }).format(displayMetricValue(metric, value, units));
  const local = (time: string) => new Intl.DateTimeFormat(locale(language), {
    timeZone: data?.forecast.timeZone || selected?.timeZone || 'UTC', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset',
  }).format(new Date(time));
  const toPoints = (daily: boolean): ChartPoint[] => (daily ? data?.products.daily ?? [] : data?.products.hourly ?? []).map(point => ({
    ...point, provider: 'UNIFIER', hoursFrom0Time: null, time: Date.parse(point.utcDateTime),
    values: Object.fromEntries(Object.entries(point.values).map(([key, value]) => [key, displayMetricValue(key, value, units)])),
  }));
  return <section className="forecast-products">
      {selected && <CurrentConditionsBar key={`${organizationId}/${selected.id}`} api={api} organizationId={organizationId} station={selected} units={units} language={language} onUnauthorized={onUnauthorized} />}
    <div className="page-heading-row"><div><h2>{TITLES[kind]}</h2></div>
      <button className="secondary-button" type="button" disabled={loading || !selected} onClick={() => setRevision(v => v + 1)}>{t('Refresh', language)}</button>
    </div>
    <div className="product-controls">
      <label className="field"><span>{t('Station', language)}</span><select value={selected?.id ?? ''} onChange={e => onStationChange(e.target.value)}>
        {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {fixedForecastPeriod ? <div className="field"><span>{t('Forecast period', language)}</span><strong>15 {t('days', language)}</strong></div> :
        <label className="field"><span>{t('Forecast period', language)}</span><select value={days} onChange={e => setDays(Number(e.target.value))}>
          {[3, 7, 15].map(value => <option key={value} value={value}>{value} {t('days', language)}</option>)}</select></label>}
    </div>
    {!selected && <p>{t('Create a station to view forecasts.', language)}</p>}
    {loading && <p role="status">{t('Loading forecasts…', language)}</p>}
    {error && <div className="alert error" role="alert">{error}</div>}
    {data && <>
      {data.notices.includes('ENRICHMENT_PENDING')
        ? <p role="status" className="product-note">{t('Historical season totals are being prepared. This page refreshes automatically; forecasts are available below.', language)}</p>
        : data.notices.includes('ENRICHMENT_UNAVAILABLE') && <p role="status" className="product-note">{t('Historical data could not be completed. Season totals may be missing or incomplete; forecasts are available below. We will retry automatically.', language)}</p>}
      {data.forecast.count === 0 && <p role="status">{t('No forecast data available for this period.', language)}</p>}
      {kind === 'farmcast' && <p className="product-note">{t('GDD uses a 10°C base. Chilling hours decrease during warm weather. Water balance is precipitation minus evapotranspiration.', language)}</p>}
      {kind === 'burncast' && data.notices.includes('KBDI_UNAVAILABLE') && <p className="product-note">{t('KBDI needs a valid index dated yesterday and complete daily temperature and precipitation forecasts.', language)}</p>}
      {kind === 'farmcast' && <section className="station-form-card">
        <h3>{t('Season accumulation', language)}</h3>
        <form onSubmit={e => { e.preventDefault(); void saveSettings(); }}>
          <div className="product-controls">
            <label className="field"><span>{t('GDD start date', language)}</span><input type="date" value={gddStart}
              disabled={!canManage || saving || loading} onChange={e => { setGddStart(e.target.value); setSaved(false); }} /></label>
            <label className="field"><span>{t('Chilling hours start date', language)}</span><input type="date" value={chillStart}
              disabled={!canManage || saving || loading} onChange={e => { setChillStart(e.target.value); setSaved(false); }} /></label>
          </div>
          {canManage && <button className="primary-button" type="submit" disabled={saving || loading}>
            {t(saving ? 'Saving…' : 'Save season dates', language)}</button>}
        </form>
        <p className="product-note">{t('Dates are saved per station. Choose today or a date within the past five years. Clear a date to disable that total.', language)}</p>
        {saved && <p role="status">{t('Season dates saved.', language)}</p>}
        {saveError && <p className="alert error" role="alert">{saveError}</p>}
        <div className="product-totals">{([
          ['GROWING_DEGREE_DAYS', 'Growing degree days', data.season?.growingDegreeDays],
          ['CHILLING_HOURS', 'Chilling hours', data.season?.chillingHours],
        ] as const).map(([metric, title, total]) => <div key={metric}>
          <span>{t(title, language)}</span><strong>{format(metric, total?.value ?? undefined)} {metricUnit(metric, units)}</strong>
          {total ? <><span>{total.startDate} – {total.throughDate} (UTC)</span>
            <span>{total.availableSamples} / {total.expectedSamples} {t('samples available', language)}</span>
            {!total.complete && <span>{t('Incomplete historical data', language)}</span>}</>
            : <span>{t('Set a start date to calculate this total.', language)}</span>}
        </div>)}</div>
      </section>}
      {kind === 'farmcast' && <section className="station-form-card"><h3>{t('Forecast-period totals', language)}</h3>
        <div className="product-totals">{METRICS.farmcast.filter(([, , daily]) => daily).map(([metric, title]) => {
          const complete = data.products.daily.length > 0 && data.products.daily.every(day => day.values[metric] !== undefined);
          const value = complete ? data.products.daily.reduce((sum, day) => sum + day.values[metric], 0) : undefined;
          return <div key={metric}><span>{t(title, language)}</span><strong>{format(metric, value)} {metricUnit(metric, units)}</strong></div>;
        })}</div><p className="product-note">{t('Totals cover the selected forecast period, not the historical season. Incomplete periods show a dash.', language)}</p>
      </section>}
      {kind === 'burncast' ? <BurncastDashboard data={data} units={units} language={language} /> : kind === 'safecast' ? <SafecastDashboard data={data} units={units} language={language} /> : <>
      <div className="forecast-chart-grid">{METRICS[kind].map(([metric, title, daily]) => {
        const points = toPoints(!!daily);
        return points.some(p => p.values[metric] !== undefined)
          ? <MetricChart key={metric} metric={metric} title={t(title, language)} points={points} providers={['UNIFIER']}
              colors={{ UNIFIER: '#2479ab' }} timeZone={data.forecast.timeZone || 'UTC'} units={units} language={language}
              windowStart={Date.parse(data.forecast.from)} windowEnd={Date.parse(data.forecast.to)} maxGapMs={daily ? 26 * 3600000 : 1.5 * 3600000} />
          : <section key={metric} className="forecast-chart-card"><h3>{t(title, language)}</h3><p className="product-note">{t('Required forecast data is unavailable or incomplete.', language)}</p></section>;
      })}</div>
      <section className="station-form-card product-daily"><h3>{t('Daily forecast summary', language)}</h3>
        <p className="product-note">{t('Daily values require every hour of the local day. Missing or partial days show a dash.', language)}</p>
        <div className="product-table-scroll" tabIndex={0} role="region" aria-label={t('Daily forecast summary', language)}><table>
          <thead><tr><th>{t('Local day', language)}</th>{METRICS[kind].map(([metric, title]) => <th key={metric}>{t(title, language)} {metricUnit(metric, units)}</th>)}</tr></thead>
          <tbody>{data.products.daily.map(day => <tr key={day.localDate}><th>{day.localDate}</th>{METRICS[kind].map(([metric, , daily]) => <td key={metric}>
            {daily ? format(metric, day.values[metric]) : `${format(metric, day.values[metric + '_MIN'])} / ${format(metric, day.values[metric + '_MAX'])}`}
          </td>)}</tr>)}</tbody>
        </table></div><p className="product-note">{t('Hourly metrics show daily minimum / maximum.', language)}</p>
      </section>
      </>}
      <details className="station-form-card" onToggle={e => setShowSources(e.currentTarget.open)}><summary>{t('Forecast sources', language)}</summary>
        {showSources && !sources && !sourcesError && <p role="status">{t('Loading forecasts…', language)}</p>}
        {sourcesError && <p className="alert error" role="alert">{sourcesError}</p>}

        <div className="product-table-scroll" tabIndex={0} role="region" aria-label={t('Forecast sources', language)}><table><thead><tr><th>{t('Local time', language)}</th><th>{t('Metric', language)}</th><th>{t('Provider', language)}</th></tr></thead>
          <tbody>{showSources && sources?.points.flatMap(point => Object.keys(point.sources).map(metric =>
            <tr key={`${point.utcDateTime}-${metric}`}><td>{local(point.utcDateTime)}</td><td>{t(METRICS[kind].find(([key]) => key === metric)?.[1] ?? metric.replaceAll('_', ' '), language)}</td><td>{point.sources[metric] === 'IBM_GRAF' ? 'Benchmark' : point.sources[metric]}</td></tr>))}</tbody>
        </table></div><p className="product-note">{t('Derived metrics use the unified inputs for the same time or local day.', language)}</p>
      </details>
    </>}
  </section>;
}
