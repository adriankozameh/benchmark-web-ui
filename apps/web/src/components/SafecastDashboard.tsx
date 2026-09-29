import { useEffect, useMemo, useRef, useState } from 'react';
import type { DisplayUnits, ForecastProductsResponse, UserLanguage } from '@benchmark/domain';
import { displayMetricValue, metricUnit } from '../forecastUnits';
import { locale, t } from '../language';
import { bandColor, ink, tableColor } from './burncastColors';

type Hour = ForecastProductsResponse['products']['hourly'][number];
const HEAT = ['Low', 'Caution', 'Extreme caution', 'Danger', 'Extreme danger'];
const FROST = ['Over 30 min', '30 min', '10 min', '5 min'];
const HEAT_COLORS = ['#008000', '#ffff00', '#ffb347', '#ff8c00', '#ff0000'];
const FROST_COLORS = ['#4caf50', '#ffff00', '#ff8c00', '#ff0000'];
const METRICS = [
  ['TEMPERATURE', 'Temperature'], ['HEAT_INDEX', 'Heat index'], ['RELATIVE_HUMIDITY', 'Relative humidity'],
  ['UV_INDEX', 'UV index'], ['CLOUD_COVER', 'Cloud cover'], ['PRECIPITATION_CHANCE', 'Precipitation chance'],
  ['SOLAR_RADIATION', 'Solar radiation'], ['WIND_SPEED', 'Wind speed'], ['WIND_CHILL', 'Wind chill'],
] as const;
const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);
function riskColor(metric: string, value?: number) {
  if (!finite(value)) return '#e5e7eb';
  const colors = metric === 'HEAT_RISK' ? HEAT_COLORS : FROST_COLORS;
  return colors[value] ?? '#e5e7eb';
}

export function SafecastDashboard({ data, units, language }: {
  data: ForecastProductsResponse; units: DisplayUnits; language: UserLanguage;
}) {
  const timeZone = data.forecast.timeZone || 'UTC';
  const hours = useMemo(() => [...data.products.hourly].sort((a, b) => Date.parse(a.utcDateTime) - Date.parse(b.utcDateTime)), [data]);
  const [detail, setDetail] = useState('');
  const format = (metric: string, value?: number) => !finite(value) ? '—' : new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(displayMetricValue(metric, value, units));
  const local = (time: string) => new Intl.DateTimeFormat(locale(language), { timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' }).format(new Date(time));
  const riskLabel = (metric: string, value?: number) => t(finite(value) ? (metric === 'HEAT_RISK' ? HEAT : FROST)[value] ?? 'Unavailable' : 'Unavailable', language);
  const describe = (point: Hour) => `${local(point.utcDateTime)} · ` + METRICS.filter(([key]) => ['TEMPERATURE', 'HEAT_INDEX', 'RELATIVE_HUMIDITY', 'UV_INDEX', 'WIND_SPEED', 'WIND_CHILL'].includes(key)).map(([key, title]) => `${t(title, language)}: ${format(key, point.values[key])} ${metricUnit(key, units)}`).join(' · ') + ` · ${t('Heat risk', language)}: ${riskLabel('HEAT_RISK', point.values.HEAT_RISK)} · ${t('Estimated frostbite exposure', language)}: ${riskLabel('FROSTBITE_RISK', point.values.FROSTBITE_RISK)}`;
  const cell = (metric: string, value?: number, risk?: number) => {
    const color = metric === 'HEAT_INDEX' ? riskColor('HEAT_RISK', risk) : tableColor(metric, value);
    return { backgroundColor: color, color: ink(color) };
  };
  return <div className="safecast-dashboard">
    <p className="product-note">{t('Heat index is shown at temperatures of at least 26.7°C. Frostbite exposure times are estimates.', language)}</p>
    <SafetyChart hours={hours} kind="heat" units={units} language={language} timeZone={timeZone} describe={describe} onDetail={setDetail} />
    <SafetyChart hours={hours} kind="cold" units={units} language={language} timeZone={timeZone} describe={describe} onDetail={setDetail} />
    {detail && <p className="product-note" role="status">{detail}</p>}
    <section className="station-form-card"><h3>{t('Daily forecast summary', language)}</h3>
      <p className="product-note">{t('Daily values require every hour of the local day. Missing or partial days show a dash.', language)}</p>
      <div className="burncast-scroll" tabIndex={0} role="region" aria-label={t('Daily forecast summary', language)}><table className="burncast-table">
        <thead><tr><th>{t('Metric', language)}</th>{data.products.daily.map(day => <th key={day.localDate}>{day.localDate}</th>)}</tr></thead>
        <tbody>{METRICS.flatMap(([metric, title]) => (['UV_INDEX', 'SOLAR_RADIATION', 'HEAT_INDEX'].includes(metric) ? ['MAX'] : ['MAX', 'MIN']).map(extreme => <tr key={`${metric}-${extreme}`}>
          <th>{t(extreme === 'MAX' ? 'Maximum' : 'Minimum', language)} {t(title, language)} {metricUnit(metric, units)}</th>
          {data.products.daily.map(day => <td key={day.localDate} style={cell(metric, day.values[`${metric}_${extreme}`], day.values.HEAT_RISK_MAX)}>{format(metric, day.values[`${metric}_${extreme}`])}</td>)}
        </tr>))}</tbody>
      </table></div>
    </section>
    <section className="station-form-card"><h3>{t('Hourly forecast summary', language)}</h3>
      <div className="burncast-scroll" tabIndex={0} role="region" aria-label={t('Hourly forecast summary', language)}><table className="burncast-table">
        <thead><tr><th>{t('Metric', language)}</th>{hours.map(hour => <th key={hour.utcDateTime}>{local(hour.utcDateTime)}</th>)}</tr></thead>
        <tbody>{METRICS.map(([metric, title]) => <tr key={metric}><th>{t(title, language)} {metricUnit(metric, units)}</th>{hours.map(hour => <td key={hour.utcDateTime} style={cell(metric, hour.values[metric], hour.values.HEAT_RISK)}>{format(metric, hour.values[metric])}</td>)}</tr>)}
          {(['HEAT_RISK', 'FROSTBITE_RISK'] as const).map(metric => <tr key={metric}><th>{t(metric === 'HEAT_RISK' ? 'Heat risk' : 'Estimated frostbite exposure', language)}</th>{hours.map(hour => { const color = riskColor(metric, hour.values[metric]); return <td key={hour.utcDateTime} style={{ backgroundColor: color, color: ink(color) }}>{riskLabel(metric, hour.values[metric])}</td>; })}</tr>)}
        </tbody>
      </table></div>
    </section>
  </div>;
}

function SafetyChart({ hours, kind, units, language, timeZone, describe, onDetail }: {
  hours: Hour[]; kind: 'heat' | 'cold'; units: DisplayUnits; language: UserLanguage; timeZone: string;
  describe: (point: Hour) => string; onDetail: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const heat = kind === 'heat';
  const title = t(heat ? 'Heat and UV forecast' : 'Wind chill and frostbite forecast', language);
  const series = heat ? [['TEMPERATURE', 'Temperature', '#f44a00'], ['RELATIVE_HUMIDITY', 'Relative humidity', '#334154']] : [['WIND_CHILL', 'Wind chill', '#2479ab']];
  const left = 46, right = heat ? 38 : 16, plot = Math.max(1, width - left - right), top = 20, bottom = 175;
  const start = hours.length ? Date.parse(hours[0].utcDateTime) : 0;
  const end = hours.length ? Date.parse(hours[hours.length - 1].utcDateTime) + 3600000 : 3600000;
  const x = (time: number) => left + (time - start) / (end - start) * plot;
  const values = hours.map(p => p.values[heat ? 'TEMPERATURE' : 'WIND_CHILL']).filter(finite).map(v => displayMetricValue('TEMPERATURE', v, units));
  const min = values.length ? Math.min(...values) - 2 : 0, max = values.length ? Math.max(...values) + 2 : 1;
  const y = (metric: string, value: number) => bottom - (metric === 'RELATIVE_HUMIDITY' ? value / 100 : (displayMetricValue(metric, value, units) - min) / (max - min)) * (bottom - top);
  const strips = heat ? [['UV_INDEX', 'UV index'], ['HEAT_RISK', 'Heat risk']] : [['FROSTBITE_RISK', 'Estimated frostbite exposure']];
  const height = heat ? 350 : 295;
  const tickCount = Math.max(2, Math.floor(plot / 95));
  const tick = (time: number) => new Intl.DateTimeFormat(locale(language), { timeZone, month: 'short', day: 'numeric', hour: '2-digit' }).format(new Date(time));
  const select = (index: number) => { const i = Math.max(0, Math.min(hours.length - 1, index)); setSelected(i); if (hours[i]) onDetail(describe(hours[i])); };
  return <section className="forecast-chart-card"><h3>{title}</h3>
    <div className="burncast-legend">{series.map(([metric, name, color]) => <span key={metric}><i style={{ background: color }} />{t(name, language)} ({metricUnit(metric, units)})</span>)}</div>
    <div ref={ref} className="safecast-chart" role="group" aria-label={title}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} role="img" aria-label={title}>
        {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1={left} x2={width - right} y1={top + (bottom - top) * i / 4} y2={top + (bottom - top) * i / 4} stroke="#dbe3eb" /><text x={left - 7} y={top + (bottom - top) * i / 4 + 4} textAnchor="end">{Math.round(max - (max - min) * i / 4)}</text>{heat && <text x={width - right + 6} y={top + (bottom - top) * i / 4 + 4}>{100 - i * 25}</text>}</g>)}
        {series.map(([metric, , color]) => { let path = ''; let previous = -Infinity;
          hours.forEach(hour => { const value = hour.values[metric], time = Date.parse(hour.utcDateTime); if (!finite(value)) { previous = -Infinity; return; } path += `${time - previous > 5400000 ? 'M' : 'L'}${x(time + 1800000)},${y(metric, value)} `; previous = time; });
          return <path key={metric} d={path} fill="none" stroke={color} strokeWidth={2} />;
        })}
        {strips.map(([metric, name], row) => <g key={metric}><text x={left} y={205 + row * 55}>{t(name, language)}</text>{hours.map(hour => {
          const value = hour.values[metric], time = Date.parse(hour.utcDateTime), color = metric === 'UV_INDEX' ? finite(value) ? bandColor(metric, value) : '#e5e7eb' : riskColor(metric, value);
          return <rect key={hour.utcDateTime} x={x(time)} y={214 + row * 55} width={Math.max(0, x(time + 3600000) - x(time))} height={25} fill={color}><title>{describe(hour)}</title></rect>;
        })}</g>)}
        {Array.from({ length: hours.length ? tickCount : 0 }, (_, i) => { const time = start + (end - start) * i / (tickCount - 1); return <text key={i} x={x(time)} y={height - 22} textAnchor={i === 0 ? 'start' : i === tickCount - 1 ? 'end' : 'middle'}>{tick(time)}</text>; })}
        {hours.map((hour, i) => <rect key={hour.utcDateTime} x={x(Date.parse(hour.utcDateTime))} y={top} width={plot * 3600000 / (end - start)} height={bottom - top} fill="transparent" onClick={() => select(i)}><title>{describe(hour)}</title></rect>)}
      </svg>
    </div>
    {!values.length && <p className="product-note">{t('Required forecast data is unavailable or incomplete.', language)}</p>}
    <div className="burncast-legend">{(heat ? HEAT : FROST).map((name, i) => <span key={name}><i style={{ background: (heat ? HEAT_COLORS : FROST_COLORS)[i] }} />{t(name, language)}</span>)}</div>
    {heat && <div className="burncast-legend"><span>{t('UV index', language)}</span>{['0–2', '2–5', '5–7', '7–10', '>10'].map((label, i) => <span key={label}><i style={{ background: bandColor('UV_INDEX', [0, 3, 6, 8, 11][i]) }} />{label}</span>)}</div>}
    {!!hours.length && <label className="field"><span>{t('Inspect forecast hour', language)} · {tick(Date.parse(hours[Math.min(selected, hours.length - 1)].utcDateTime))}</span><input type="range" min={0} max={hours.length - 1} value={Math.min(selected, hours.length - 1)} onChange={event => select(Number(event.target.value))} aria-valuetext={describe(hours[Math.min(selected, hours.length - 1)])} /></label>}
  </section>;
}
