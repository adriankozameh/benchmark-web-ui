import type { DisplayUnits, GladiatorDefinition, GladiatorModelScore, GladiatorResponse, GladiatorStatus, UserLanguage } from '@benchmark/domain';
import { displayMetricError, metricUnit } from '../forecastUnits';
import { errorMessage, locale, t } from '../language';
import { forecastPreference, isGladiatorMetric, type GladiatorDisplay, type GladiatorMetricState } from './gladiator';
import { providerLabel } from './forecastProviders';

const STATUS_LABELS: Record<GladiatorStatus, string> = {
  PENDING: 'Collecting statistics', NO_DATA: 'No matched observations', INSUFFICIENT_DATA: 'Insufficient samples',
  INSUFFICIENT_EVENTS: 'Insufficient rain events', INCOMPARABLE: 'Not comparable',
  SINGLE_PROVIDER: 'One provider evaluated', PARTIAL: 'Partial coverage', READY: 'Ready',
};

export function GladiatorMetricSummary({ metric, state, availableProviders, mode, showAccuracy, units, language, timeZone, daily = false }: {
  metric: string; state?: GladiatorMetricState; availableProviders: string[]; mode: GladiatorDisplay;
  showAccuracy: boolean; units: DisplayUnits; language: UserLanguage; timeZone: string; daily?: boolean;
}) {
  if (!isGladiatorMetric(metric)) {
    const preferred = forecastPreference(null, availableProviders, metric).provider;
    return <div className="gladiator-metric-summary">
      {preferred && <span className="gladiator-best defaulted">{t('Default', language)} · {providerLabel(preferred)}</span>}
      {(showAccuracy || mode === 'top3') && <p className="gladiator-note">{t('Accuracy comparison is not available for this metric. Showing the selected providers.', language)}</p>}
    </div>;
  }
  if (state?.error) return <p className="gladiator-note gladiator-error" role="status">
    {t('Accuracy could not be loaded. Forecasts remain available.', language)} <span>{errorMessage(state.error, language)}</span>
  </p>;
  const data = state?.data;
  if (!data) return <p className="gladiator-note" role="status">{t('Loading model accuracy…', language)}</p>;
  const preference = forecastPreference(data, availableProviders, metric);
  const preferred = preference.provider;
  const measured = preference.basis === 'STATISTICS';
  const defaulted = preference.basis === 'DEFAULT';
  const hasTop = data.topProviders.length > 0;
  return <div className="gladiator-metric-summary">
    <div className="gladiator-badges">
      {preferred && (measured || defaulted) && <span className={`gladiator-best ${measured ? 'measured' : 'defaulted'}`}>
        {t(measured ? 'Best performing' : 'Default', language)} · {providerLabel(preferred)}
        {measured && data.tiedForBest && <> · {t('Tied for best', language)}</>}
      </span>}
      <span className="gladiator-status">{t(STATUS_LABELS[data.status] ?? 'Accuracy unavailable', language)}</span>
    </div>
    {defaulted && <p className="gladiator-note">{t('Default selection until enough data is available; not a measured winner.', language)}</p>}
    {data.bestForecastBasis === 'STATISTICS' && data.bestForecastProvider && !availableProviders.includes(data.bestForecastProvider) && <p className="gladiator-note">
      {t('The preferred model has no forecast for this metric in the current view.', language)}</p>}
    {mode === 'top3' && <p className="gladiator-note">{hasTop
      ? t('Showing up to {count} evaluated models, subject to forecast availability and provider visibility.', language).replace('{count}', String(Math.min(3, data.topProviders.length)))
      : t('Top 3 is not available yet. Showing the selected providers.', language)}</p>}
    {showAccuracy && <AccuracyDetails data={data} metric={metric} units={units} language={language} timeZone={timeZone} daily={daily} />}
  </div>;
}

function AccuracyDetails({ data, metric, units, language, timeZone, daily }: {
  data: GladiatorResponse; metric: string; units: DisplayUnits; language: UserLanguage; timeZone: string; daily: boolean;
}) {
  const number = (value: number | null | undefined, digits = 2): string => value == null || !Number.isFinite(value)
    ? '—' : new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(value);
  const error = (value: number | null | undefined): string => value == null ? '—'
    : number(displayMetricError(metric, value, units), units === 'IMPERIAL' && ['PRECIPITATION_QUANTITY', 'EVAPOTRANSPIRATION'].includes(metric) ? 3 : 2);
  const percent = (value: number | null | undefined): string => value == null ? '—' : `${number(value, 1)}%`;
  const unit = metric === 'RELATIVE_HUMIDITY' ? t('percentage points', language)
    : metricUnit(metric, units) || t('index units', language);
  const tolerance = `${error(data.tolerance)} ${unit}`;
  const localTime = data.lastCalculatedAt && Number.isFinite(Date.parse(data.lastCalculatedAt))
    ? new Intl.DateTimeFormat(locale(language), { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.lastCalculatedAt)) : '—';
  const endDay = new Date(Date.parse(data.to) - 86400000).toISOString().slice(0, 10);
  const source = data.observationSource;
  const sourceLabel = source.kind === 'HARDWARE'
    ? `${t('Hardware observations', language)}${source.provider ? ` · ${providerLabel(source.provider)}` : ''}`
    : `${t('NOAA observations', language)}${source.id ? ` · ${source.id}` : ''}`;
  const diagnostics = (row: GladiatorModelScore, type: 'allHours' | 'wet') => type === 'allHours' ? row.allHours : row.rainEvents?.observedWetHours;
  return <div className="gladiator-accuracy">
    <p className="gladiator-note">{t('Completed UTC days', language)}: {data.from.slice(0, 10)} – {endDay}
      {' · '}{t('Scored days', language)}: {data.scoredDays}/{data.days}
      {' · '}{t('Window coverage', language)}: {percent(data.windowCoveragePercent)}</p>
    <p className="gladiator-note">{sourceLabel}{source.kind === 'HARDWARE' && <> · {t('Missing hardware readings are skipped.', language)}</>}
      {' · '}{t('Last calculated', language)}: {localTime}</p>
    {daily && <p className="gladiator-note">{t('Rankings evaluate hourly forecasts, including in this daily view.', language)}</p>}
    <p className="gladiator-note">{t('Ranked by mean absolute error (MAE); lower is better.', language)}
      {' '}{t('Errors and tolerance use {unit}.', language).replace('{unit}', unit)}
      {' '}{t(metric === 'WIND_DIRECTION'
        ? 'Positive direction bias means a clockwise angular difference from observations.'
        : 'Positive bias means forecasts were higher than observations.', language)}</p>
    <p className="gladiator-note">{t('Outside tolerance is the share of matched predictions whose absolute error exceeds {tolerance}; it is not percentage error relative to the observation.', language).replace('{tolerance}', tolerance)}</p>
    {metric === 'WIND_DIRECTION' && data.minimumWindSpeed != null && <p className="gladiator-note">
      {t('Direction uses the shortest angular error and observed wind speed of at least {speed}.', language)
        .replace('{speed}', `${number(displayMetricError('WIND_SPEED', data.minimumWindSpeed, units))} ${metricUnit('WIND_SPEED', units)}`)}</p>}
    {['SOLAR_RADIATION', 'UV_INDEX'].includes(metric) && <p className="gladiator-note">{t('Primary scores use daylight samples. All-hour diagnostics include nighttime.', language)}</p>}
    <div className="gladiator-table-scroll" tabIndex={0} role="region" aria-label={t('Model accuracy', language)}>
      <table><caption>{t('Model accuracy', language)}</caption><thead><tr>
        {[ 'Provider', 'Rank', 'MAE', 'RMSE', 'Bias', 'Outside tolerance', 'Samples', 'Coverage' ].map(label => <th key={label}>{t(label, language)}</th>)}
      </tr></thead><tbody>{data.rankings.map(row => <tr key={row.provider}>
        <th scope="row">{providerLabel(row.provider)}</th><td>{row.rank ?? '—'}</td>
        <td>{error(row.mae)}</td><td>{error(row.rmse)}</td><td>{error(row.bias)}</td>
        <td>{percent(row.outsideTolerancePercent)}</td><td>{number(row.sampleCount, 0)}/{number(row.expectedSamples, 0)}</td>
        <td>{percent(row.coveragePercent)}{!row.eligible && <> · {t('Not eligible', language)}</>}</td>
      </tr>)}</tbody></table>
    </div>
    <p className="gladiator-note">{t('Eligibility requires {samples} samples, {days} days and {coverage}% coverage.', language)
      .replace('{samples}', number(data.minimumSamples, 0)).replace('{days}', String(data.minimumDays)).replace('{coverage}', number(data.minimumCoveragePercent, 1))}</p>
    {data.rankings.some(row => row.rainEvents) && <details className="gladiator-diagnostics"><summary>{t('Rain event details', language)}</summary>
      <p className="gladiator-note">{t('A winner also requires at least {count} matched wet intervals.', language).replace('{count}', String(data.minimumRainEvents ?? '—'))}</p>
      <div className="gladiator-table-scroll" tabIndex={0} role="region" aria-label={t('Rain event details', language)}><table><thead><tr>
        {['Provider', 'Rain threshold', 'Hits', 'Misses', 'False alarms', 'Correct dry intervals', 'CSI', 'Hit rate', 'False alarm ratio', 'Frequency bias'].map(label => <th key={label}>{t(label, language)}</th>)}
      </tr></thead><tbody>{data.rankings.filter(row => row.rainEvents).map(row => {
        const rain = row.rainEvents!;
        return <tr key={row.provider}><th scope="row">{providerLabel(row.provider)}</th><td>{error(rain.eventThresholdMm)} {unit}</td>
          <td>{number(rain.hits, 0)}</td><td>{number(rain.misses, 0)}</td><td>{number(rain.falseAlarms, 0)}</td><td>{number(rain.correctNegatives, 0)}</td>
          <td>{number(rain.criticalSuccessIndex)}</td><td>{percent(rain.hitRatePercent)}</td><td>{percent(rain.falseAlarmRatioPercent)}</td><td>{number(rain.frequencyBias)}</td></tr>;
      })}</tbody></table></div>
      <p className="gladiator-note">{t('CSI ranges from 0 to 1; higher is better. Undefined scores are shown as a dash.', language)}</p>
    </details>}
    {(['wet', 'allHours'] as const).map(type => data.rankings.some(row => diagnostics(row, type)) && <details className="gladiator-diagnostics" key={type}>
      <summary>{t(type === 'wet' ? 'Observed wet intervals' : 'All-hour diagnostics', language)}</summary>
      <div className="gladiator-table-scroll" tabIndex={0} role="region" aria-label={t(type === 'wet' ? 'Observed wet intervals' : 'All-hour diagnostics', language)}>
        <table><thead><tr>{['Provider', 'Samples', 'MAE', 'RMSE', 'Bias', 'Outside tolerance'].map(label => <th key={label}>{t(label, language)}</th>)}</tr></thead>
          <tbody>{data.rankings.filter(row => diagnostics(row, type)).map(row => {
            const values = diagnostics(row, type)!;
            return <tr key={row.provider}><th scope="row">{providerLabel(row.provider)}</th><td>{number(values.sampleCount, 0)}</td>
              <td>{error(values.mae)}</td><td>{error(values.rmse)}</td><td>{error(values.bias)}</td><td>{percent(values.outsideTolerancePercent)}</td></tr>;
          })}</tbody></table>
      </div>
    </details>)}
    <details className="gladiator-diagnostics"><summary>{t('Comparison definitions', language)}</summary>
      {data.comparisonDefinition.issue && <p className="gladiator-note">{t('Verified, matching measurement definitions are required before these models can compete.', language)}</p>}
      <div className="gladiator-table-scroll" tabIndex={0} role="region" aria-label={t('Comparison definitions', language)}><table><thead><tr>
        {['Source', 'Quantity', 'Unit', 'Interval', 'Timestamp'].map(label => <th key={label}>{t(label, language)}</th>)}
      </tr></thead><tbody>{[
        [t('Observations', language), data.comparisonDefinition.observation],
        ...Object.entries(data.comparisonDefinition.forecasts).map(([provider, definition]) => [providerLabel(provider), definition]),
      ].map(([label, raw]) => {
        const definition = raw as GladiatorDefinition | null;
        return <tr key={String(label)}><th scope="row">{String(label)}</th><td>{definition?.quantity.replaceAll('_', ' ') ?? '—'}</td>
          <td>{definition?.unit ?? '—'}</td><td>{definition ? `${number(definition.intervalHours)} h` : '—'}</td>
          <td>{definition ? t(definition.timestampLabel === 'INSTANT' ? 'Instant' : definition.timestampLabel === 'PERIOD_START' ? 'Interval start' : 'Interval end', language) : '—'}</td></tr>;
      })}</tbody></table></div>
    </details>
  </div>;
}
