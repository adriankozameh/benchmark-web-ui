import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DisplayUnits, ForecastProductsResponse, UserLanguage } from '@benchmark/domain';
import { displayMetricValue, metricUnit } from '../forecastUnits';
import { locale, t } from '../language';
import { heatCondition, frostbiteCondition } from './safecastConditions';
import { ink, tableColor } from './burncastColors';

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
// Requested display defaults only; preserve missing API values for condition guidance.
function displayValue(metric: string, value?: number): number | undefined {
  return !finite(value) && (metric === 'UV_INDEX' || metric === 'HEAT_INDEX') ? 0 : value;
}
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
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }), [language]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale(language), { timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' }), [language, timeZone]);
  const format = (metric: string, raw?: number) => { const value = displayValue(metric, raw); return !finite(value) ? '—' : numberFormatter.format(displayMetricValue(metric, value, units)); };
  const local = (time: string) => dateFormatter.format(new Date(time));
  const riskLabel = (metric: string, value?: number) => t(finite(value) ? (metric === 'HEAT_RISK' ? HEAT : FROST)[value] ?? 'Unavailable' : 'Unavailable', language);
  const describe = (point: Hour) => `${local(point.utcDateTime)} · ` + METRICS.filter(([key]) => ['TEMPERATURE', 'HEAT_INDEX', 'RELATIVE_HUMIDITY', 'UV_INDEX', 'WIND_SPEED', 'WIND_CHILL'].includes(key)).map(([key, title]) => `${t(title, language)}: ${format(key, point.values[key])} ${metricUnit(key, units)}`).join(' · ') + ` · ${t('Heat risk', language)}: ${riskLabel('HEAT_RISK', point.values.HEAT_RISK)} · ${t('Estimated frostbite exposure', language)}: ${riskLabel('FROSTBITE_RISK', point.values.FROSTBITE_RISK)}`;
  const cell = (metric: string, value?: number, risk?: number) => {
    const color = !finite(value) && (metric === 'UV_INDEX' || metric === 'HEAT_INDEX') ? '#008000' : metric === 'HEAT_INDEX' ? riskColor('HEAT_RISK', risk) : tableColor(metric, value);
    return { backgroundColor: color, color: ink(color) };
  };
  return <div className="safecast-dashboard">
    <p className="product-note">{t('Missing UV and heat-index readings display as green zero values (32°F for heat index). These defaults do not confirm safe conditions. Frostbite exposure times are estimates.', language)}</p>
    <SafetyChart hours={hours} kind="heat" units={units} language={language} timeZone={timeZone} describe={describe} />
    <SafetyChart hours={hours} kind="cold" units={units} language={language} timeZone={timeZone} describe={describe} />
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
      <HourlySummary hours={hours} language={language} units={units} local={local} format={format} cell={cell} riskLabel={riskLabel} />
    </section>
  </div>;
}

/** Fixed-width columns preserve the full scroll range while mounting only the visible hours. */
function HourlySummary({ hours, language, units, local, format, cell, riskLabel }: {
  hours: Hour[]; language: UserLanguage; units: DisplayUnits;
  local: (time: string) => string; format: (metric: string, value?: number) => string;
  cell: (metric: string, value?: number, risk?: number) => { backgroundColor: string | undefined; color: string };
  riskLabel: (metric: string, value?: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ left: 0, width: 900 });
  const labelWidth = 210, columnWidth = 150;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollLeft = 0;
    const update = () => setViewport({ left: element.scrollLeft, width: element.clientWidth });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [hours]);
  const start = Math.max(0, Math.floor(viewport.left / columnWidth) - 2);
  const end = Math.min(hours.length, start + Math.ceil(viewport.width / columnWidth) + 5);
  const visible = hours.slice(start, end);
  const before = start * columnWidth, after = (hours.length - end) * columnWidth;
  const spacer = (width: number) => width > 0 ? <td className="hour-spacer" aria-hidden="true" style={{ width }} /> : null;
  return <div ref={ref} className="burncast-scroll" tabIndex={0} role="region" aria-label={t('Hourly forecast summary', language)}
    onScroll={event => { const node = event.currentTarget; setViewport({ left: node.scrollLeft, width: node.clientWidth }); }}>
    <table className="burncast-table safecast-hourly-table" aria-colcount={hours.length + 1} style={{ width: labelWidth + hours.length * columnWidth }}>
      <colgroup><col style={{ width: labelWidth }} />{before > 0 && <col style={{ width: before }} />}
        {visible.map(hour => <col key={hour.utcDateTime} style={{ width: columnWidth }} />)}{after > 0 && <col style={{ width: after }} />}</colgroup>
      <thead><tr><th scope="col" aria-colindex={1}>{t('Metric', language)}</th>{spacer(before)}
        {visible.map((hour, index) => <th scope="col" aria-colindex={start + index + 2} key={hour.utcDateTime}>{local(hour.utcDateTime)}</th>)}{spacer(after)}</tr></thead>
      <tbody>{METRICS.map(([metric, title]) => <tr key={metric}><th scope="row" aria-colindex={1}>{t(title, language)} {metricUnit(metric, units)}</th>{spacer(before)}
        {visible.map((hour, index) => <td aria-colindex={start + index + 2} key={hour.utcDateTime} style={cell(metric, hour.values[metric], hour.values.HEAT_RISK)}>{format(metric, hour.values[metric])}</td>)}{spacer(after)}</tr>)}
        {(['HEAT_RISK', 'FROSTBITE_RISK'] as const).map(metric => <tr key={metric}><th scope="row" aria-colindex={1}>{t(metric === 'HEAT_RISK' ? 'Heat risk' : 'Estimated frostbite exposure', language)}</th>{spacer(before)}
          {visible.map((hour, index) => { const color = riskColor(metric, hour.values[metric]); return <td aria-colindex={start + index + 2} key={hour.utcDateTime} style={{ backgroundColor: color, color: ink(color) }}>{riskLabel(metric, hour.values[metric])}</td>; })}{spacer(after)}</tr>)}
      </tbody>
    </table>
  </div>;
}

function SafetyChart({ hours, kind, units, language, timeZone, describe }: {
  hours: Hour[]; kind: 'heat' | 'cold'; units: DisplayUnits; language: UserLanguage; timeZone: string;
  describe: (point: Hour) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gradientId = useId().replaceAll(':', '');
  const [width, setWidth] = useState(600);
  const [offset, setOffset] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const popupId = `safecast-popup-${gradientId}`;
  const dismiss = () => { setActive(null); setPinned(false); };
  useEffect(() => {
    if (active === null) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) { setActive(null); setPinned(false); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setActive(null); setPinned(false); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [active]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setOffset(0); setActive(null); setPinned(false); }, [hours]);

  const heat = kind === 'heat', compact = width < 650;
  const title = t(heat ? 'Heat Stress' : 'Frostbite', language);
  const color = heat ? '#f44a00' : '#1976d2';
  const metric = heat ? 'TEMPERATURE' : 'WIND_CHILL';
  const left = compact ? 45 : 96, right = heat ? 38 : 20;
  const plot = Math.max(1, width - left - right), top = compact && heat ? 57 : 38, bottom = 218;
  // Keep hourly cells readable. The slider pans the same window across every row.
  const capacity = Math.max(1, Math.min(30, Math.floor(plot / 30)));
  const maxOffset = Math.max(0, hours.length - capacity);
  const first = Math.min(offset, maxOffset);
  const visible = hours.slice(first, first + capacity);
  const cellWidth = plot / Math.max(1, visible.length);
  const x = (index: number) => left + (index + .5) * cellWidth;
  const values = visible.map(p => p.values[metric]).filter(finite).map(v => displayMetricValue(metric, v, units));
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const roughStep = Math.max(1, (high - low) / 5);
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 5, 10].find(n => n * power >= roughStep) ?? 10) * power;
  const min = Math.floor(low / step) * step, max = Math.max(min + step, Math.ceil(high / step) * step);
  const y = (key: string, value: number) => bottom - (key === 'RELATIVE_HUMIDITY' ? value / 100 : (displayMetricValue(key, value, units) - min) / (max - min)) * (bottom - top);
  const rows = heat ? [['UV_INDEX', 'UV index'], ['HEAT_INDEX', 'Heat index']] : [['FROSTBITE_RISK', 'Frostbite']];
  const rowTop = (row: number) => bottom + (compact ? 35 : heat ? 12 : 46) + row * (compact ? 57 : 30);
  const axisY = rowTop(rows.length - 1) + 46;
  const height = axisY + 26;
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale(language), { timeZone, weekday: 'short', day: 'numeric' }), [language, timeZone]);
  const hourFormat = useMemo(() => new Intl.DateTimeFormat(locale(language), { timeZone, hour: 'numeric' }), [language, timeZone]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale(language), { maximumFractionDigits: 0 }), [language]);
  const labelEvery = Math.max(1, Math.ceil(76 / cellWidth));
  const number = (key: string, raw?: number) => { const value = displayValue(key, raw); return finite(value) ? numberFormatter.format(displayMetricValue(key, value, units)) : '—'; };
  const uvColor = (value?: number) => !finite(value) ? '#e5e7eb' : value <= 2 ? '#008000' : value <= 5 ? '#ffff00' : value <= 7 ? '#ffa500' : value <= 10 ? '#ff0000' : '#800080';
  const heatColor = (value?: number) => !finite(value) ? '#e5e7eb' : HEAT_COLORS[value >= 54 ? 4 : value >= 46 ? 3 : value >= 39 ? 2 : value >= 33 ? 1 : 0];
  const groups = (key: string) => {
    const result: Array<Array<{ index: number; value: number }>> = [];
    visible.forEach((hour, index) => {
      const value = hour.values[key];
      if (!finite(value)) return;
      const group = result[result.length - 1], last = group?.[group.length - 1];
      const contiguous = last && last.index === index - 1 && Date.parse(hour.utcDateTime) - Date.parse(visible[last.index].utcDateTime) <= 5400000;
      if (contiguous) group.push({ index, value }); else result.push([{ index, value }]);
    });
    return result;
  };
  const select = (index: number) => { setActive(index); setPinned(true); };
  const hover = (index: number) => { if (!pinned) setActive(index); };
  const selected = active === null ? undefined : visible[active];
  const condition = heatCondition(selected?.values.HEAT_INDEX);
  const frost = frostbiteCondition(selected?.values.FROSTBITE_RISK);
  const popupWidth = Math.min(360, Math.max(1, width - 16));
  const popupLeft = Math.max(8, Math.min(width - popupWidth - 8, x(active ?? 0) - popupWidth / 2));
  const timeLabel = selected ? new Intl.DateTimeFormat(locale(language), { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset' }).format(new Date(selected.utcDateTime)) : '';
  const popupMetrics = heat ? [['TEMPERATURE', 'Temperature'], ['RELATIVE_HUMIDITY', 'Relative humidity'], ['UV_INDEX', 'UV index'], ['HEAT_INDEX', 'Heat index']] : [['WIND_CHILL', 'Wind chill']];
  return <section className="forecast-chart-card safecast-legacy-card"><h3>{title}</h3>
    <div ref={ref} className="safecast-chart safecast-interactive" role="group" aria-label={title} onPointerLeave={() => { if (!pinned) setActive(null); }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} role="group" aria-label={title}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".75" /><stop offset="50%" stopColor={color} stopOpacity=".45" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <text x={left} y={20} fill={color}>{t(heat ? 'Temperature' : 'Wind chill', language)} ({metricUnit(metric, units)})</text>
        {heat && <text x={compact ? left : width - right} y={compact ? 40 : 20} textAnchor={compact ? 'start' : 'end'} fill="#334154">{t('Relative humidity', language)} (%)</text>}
        {Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => {
          const v = min + i * step, py = bottom - (v - min) / (max - min) * (bottom - top);
          return <g key={i}><line x1={left} x2={width - right} y1={py} y2={py} stroke="#e2e5e9" /><text x={left - 7} y={py + 4} textAnchor="end" fill={color}>{v}</text></g>;
        })}
        <line x1={left} x2={left} y1={top} y2={bottom} stroke={color} opacity=".5" />
        {heat && <><line x1={width - right} x2={width - right} y1={top} y2={bottom} stroke="#334154" opacity=".5" />{[0, 25, 50, 75, 100].map(v => <text key={v} x={width - right + 6} y={y('RELATIVE_HUMIDITY', v) + 4} fill="#334154">{v}</text>)}</>}
        {(heat ? [metric, 'RELATIVE_HUMIDITY'] : [metric]).map(key => groups(key).map((group, groupIndex) => {
          const stroke = key === 'RELATIVE_HUMIDITY' ? '#334154' : color;
          const path = group.map((p, i) => `${i ? 'L' : 'M'}${x(p.index)},${y(key, p.value)}`).join(' ');
          return <g key={`${key}-${groupIndex}`}>
            {key === metric && <path d={`${path} L${x(group[group.length - 1].index)},${bottom} L${x(group[0].index)},${bottom} Z`} fill={`url(#${gradientId})`} />}
            <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
            {group.map(p => <circle key={p.index} cx={x(p.index)} cy={y(key, p.value)} r={1.8} fill="white" stroke={stroke} strokeWidth={1} />)}
          </g>;
        }))}
        {rows.map(([key, name], row) => <g key={key}>
          <text x={compact ? left : left - 6} y={rowTop(row) + (compact ? -9 : 19)} textAnchor={compact ? 'start' : 'end'} fill="#64748b">{t(name, language)}{key === 'HEAT_INDEX' ? ` (${metricUnit(key, units)})` : ''}</text>
          {visible.map((hour, index) => {
            const value = displayValue(key, hour.values[key]);
            const fill = key === 'UV_INDEX' ? uvColor(value) : key === 'HEAT_INDEX' ? heatColor(value) : riskColor(key, value);
            const text = key === 'FROSTBITE_RISK' ? finite(value) ? ['>30', '30', '10', '5'][value] ?? '—' : '—' : number(key, value);
            return <g key={hour.utcDateTime} onClick={() => select(index)} onPointerEnter={event => { if (event.pointerType === 'mouse') hover(index); }}><rect x={left + index * cellWidth} y={rowTop(row)} width={cellWidth} height={30} fill={fill} stroke="#263238" strokeWidth={.7} /><text x={x(index)} y={rowTop(row) + 19} textAnchor="middle" fill={ink(fill)} fontSize={10}>{text}</text><title>{describe(hour)}</title></g>;
          })}
        </g>)}
        {visible.map((hour, index) => index % labelEvery === 0 && <text key={hour.utcDateTime} x={x(index)} y={axisY} textAnchor={index === 0 ? 'start' : 'middle'} fill="#64748b" fontSize={10}>
          <tspan x={x(index)}>{dateFormat.format(new Date(hour.utcDateTime))}</tspan><tspan x={x(index)} dy={13}>{hourFormat.format(new Date(hour.utcDateTime))}</tspan>
        </text>)}
        {active !== null && visible[active] && <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#64748b" strokeDasharray="3 3" />}
        {visible.map((hour, index) => <rect key={hour.utcDateTime} className="safecast-hour-hit" x={left + index * cellWidth} y={top} width={cellWidth} height={bottom - top} fill="transparent" tabIndex={0} role="button" aria-label={describe(hour)} aria-controls={popupId} onPointerEnter={event => { if (event.pointerType === 'mouse') hover(index); }} onFocus={() => select(index)} onClick={() => select(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(index); } }}><title>{describe(hour)}</title></rect>)}
      </svg>
      {selected && <div id={popupId} className="safecast-popup" role="dialog" aria-label={`${title} · ${timeLabel}`} style={{ left: popupLeft, width: popupWidth, top: top + 8 }}>
        <div className="safecast-popup-heading"><strong>{timeLabel}</strong><button type="button" aria-label={t('Close', language)} onClick={dismiss}>×</button></div>
        <dl>{popupMetrics.map(([key, name]) => <div key={key}><dt>{t(name, language)}</dt><dd>{number(key, selected.values[key])} {metricUnit(key, units)}</dd></div>)}
          {heat && condition && <>
            <div><dt>{t('Heat Risk Level', language)}</dt><dd>{t(condition.level, language)}</dd></div>
            <div><dt>{t('Work : Rest (Minutes)', language)}</dt><dd>{t(condition.workRest, language)}</dd></div>
            <div><dt>{t('Min. Water Needed', language)}</dt><dd>{t(condition.water, language)}</dd></div>
          </>}
          {!heat && <div><dt>{t('Frostbite', language)}</dt><dd>{frost ? t(frost.exposure, language) : t('Unavailable', language)}</dd></div>}
        </dl>
        {heat ? condition ? <p><strong>{t('Recommendation', language)}: </strong>{t(condition.recommendation, language)}</p> : <p>{t('Required forecast data is unavailable or incomplete.', language)}</p>
          : <p>{t(frost?.description ?? 'Required forecast data is unavailable or incomplete.', language)}</p>}
      </div>}
    </div>
    {!values.length && <p className="product-note">{t('Required forecast data is unavailable or incomplete.', language)}</p>}
    {maxOffset > 0 && <input className="safecast-pan" type="range" min={0} max={maxOffset} value={first} onChange={event => { setOffset(Number(event.target.value)); dismiss(); }} aria-label={t('Move forecast window', language)} aria-valuetext={`${dateFormat.format(new Date(visible[0].utcDateTime))} ${hourFormat.format(new Date(visible[0].utcDateTime))} – ${dateFormat.format(new Date(visible[visible.length - 1].utcDateTime))} ${hourFormat.format(new Date(visible[visible.length - 1].utcDateTime))}`} />}
    <details className="safecast-key"><summary>{t('View details', language)}</summary><p className="product-note">{t('Move the slider to view later hours. Select a point for details.', language)}</p>
      <div className="burncast-legend">{(heat ? HEAT : FROST).map((name, i) => <span key={name}><i style={{ background: (heat ? HEAT_COLORS : FROST_COLORS)[i] }} />{t(name, language)}</span>)}</div>
      {heat && <div className="burncast-legend"><span>{t('UV index', language)}</span>{['0–2', '3–5', '6–7', '8–10', '≥11'].map((label, i) => <span key={label}><i style={{ background: uvColor([0, 3, 6, 8, 11][i]) }} />{label}</span>)}</div>}
    </details>
  </section>;
}
