import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DisplayUnits, ForecastProductsResponse, UserLanguage } from '@benchmark/domain';
import { displayMetricValue, metricUnit } from '../forecastUnits';
import { locale, t } from '../language';
import { BANDS, bandColor, ink, tableColor } from './burncastColors';

type Day = ForecastProductsResponse['products']['daily'][number];
const TABLE: Array<[string, string]> = [
  ['ATMOSPHERIC_DISPERSION_INDEX', 'Atmospheric dispersion index'], ['CLOUD_COVER', 'Cloud cover'],
  ['HAINES_INDEX', 'Haines index'], ['MIXING_HEIGHT', 'Mixing height'], ['PRECIPITATION_CHANCE', 'Precipitation chance'],
  ['RELATIVE_HUMIDITY', 'Relative humidity'], ['TEMPERATURE', 'Temperature'], ['VENTILATION_RATE', 'Ventilation rate'],
  ['WIND_DIRECTION', 'Wind direction'], ['WIND_GUST', 'Wind gust'], ['WIND_SPEED', 'Wind speed'],
  ['UV_INDEX', 'UV index'], ['KBDI', 'KBDI'],
];
function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
export function BurncastDashboard({ data, units, language }: { data: ForecastProductsResponse; units: DisplayUnits; language: UserLanguage }) {
  const id = useId().replaceAll(':', '');
  const [detail, setDetail] = useState('');
  const days = data.products.daily;
  const fireSize = useChartWidth(), indexSize = useChartWidth();
  const compact = fireSize.width < 600;
  const showDate = (i: number, count: number, space: number) => i % Math.max(1, Math.ceil(count * 65 / space)) === 0;
  const height = compact ? 345 : 300, left = compact ? 42 : 150, right = compact ? 35 : 65, top = compact ? 65 : 45, bottom = compact ? 190 : 175;
  const width = fireSize.width, plot = Math.max(1, width - left - right);
  const x = (index: number) => left + plot * (index + .5) / Math.max(1, days.length);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale(language), { weekday: 'short', day: '2-digit', timeZone: 'UTC' }), [language]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }), [language]);
  const label = (day: Day) => dateFormatter.format(new Date(day.localDate + 'T12:00:00Z'));
  const value = (day: Day, metric: string, suffix = '_MAX') => day.values[metric + suffix];
  const format = (metric: string, raw?: number) => raw === undefined ? '—' : numberFormatter.format(displayMetricValue(metric, raw, units));
  const display = (metric: string, raw: number) => displayMetricValue(metric, raw, units);
  const maximum = (metric: string) => Math.max(1, ...days.map(d => display(metric, value(d, metric) ?? 0))) * 1.1;
  const mhMax = maximum('MIXING_HEIGHT'), windMax = maximum('TRANSPORT_WIND_SPEED');
  const y = (v: number, max: number) => bottom - v / max * (bottom - top);
  const segments = (metric: string) => {
    const groups: Array<Array<{ i: number; v: number }>> = []; let group: Array<{ i: number; v: number }> = [];
    days.forEach((day, i) => { const v = value(day, metric); if (v === undefined) { if (group.length) groups.push(group); group = []; } else group.push({ i, v: display(metric, v) }); });
    if (group.length) groups.push(group); return groups;
  };
  const direction = (day: Day) => day.values.TRANSPORT_WIND_DIRECTION_AT_MAX;
  const info = (day: Day) => `${day.localDate} · ${t('Mixing height', language)}: ${format('MIXING_HEIGHT', value(day, 'MIXING_HEIGHT'))} ${metricUnit('MIXING_HEIGHT', units)} · ${t('Transport wind speed', language)}: ${format('TRANSPORT_WIND_SPEED', value(day, 'TRANSPORT_WIND_SPEED'))} ${metricUnit('TRANSPORT_WIND_SPEED', units)} · ${t('Transport wind direction', language)}: ${format('TRANSPORT_WIND_DIRECTION', direction(day))}° · ${t('Ventilation rate', language)}: ${format('VENTILATION_RATE', value(day, 'VENTILATION_RATE'))} ${metricUnit('VENTILATION_RATE', units)} · ${t('Haines index', language)}: ${format('HAINES_INDEX', value(day, 'HAINES_INDEX'))}`;
  function dailyTable(metrics: Array<[string, string]>, extrema: boolean) {
    return <div className="burncast-scroll" tabIndex={0} role="region" aria-label={t('Daily forecast summary', language)}><table className="burncast-table">
      <thead><tr><th>{t('Metric', language)}</th>{days.map(d => <th key={d.localDate} title={d.localDate}>{label(d)}</th>)}</tr></thead>
      <tbody>{metrics.flatMap(([metric, title]) => (metric === 'KBDI' ? [''] : extrema ? ['_MAX', '_MIN'] : ['_MAX']).map(suffix => <tr key={metric + suffix}>
        <th>{extrema && suffix && t(suffix === '_MAX' ? 'Maximum' : 'Minimum', language)} {t(title, language)} {metricUnit(metric, units)}</th>
        {days.map(day => { const raw = value(day, metric, suffix), color = tableColor(metric, raw); return <td key={day.localDate} style={{ backgroundColor: color, color: ink(color) }}>
          {metric === 'WIND_DIRECTION' && raw !== undefined && <span className="burncast-direction" aria-hidden="true" style={{ transform: `rotate(${raw}deg)` }}>↑</span>}{format(metric, raw)}{metric === 'WIND_DIRECTION' && raw !== undefined ? '°' : ''}
        </td>; })}</tr>))}</tbody>
    </table></div>;
  }
  function indexChart(metric: string, title: string) {
    const band = BANDS[metric], suffix = metric === 'KBDI' ? '' : '_MAX';
    const values = days.map(d => value(d, metric, suffix)), max = Math.max(metric === 'KBDI' ? 800 : 1, ...values.filter((v): v is number => v !== undefined)) * (metric === 'KBDI' ? 1 : 1.1);
    const w = metric === 'KBDI' ? fireSize.width : indexSize.width, px = (i: number) => 55 + (w - 80) * (i + .5) / Math.max(1, days.length), py = (v: number) => 175 - v / max * 140;
    return <section className="forecast-chart-card burncast-index" key={metric}><h3>{t(title, language)}</h3>
      <div ref={metric === 'ATMOSPHERIC_DISPERSION_INDEX' ? indexSize.ref : undefined} className="burncast-chart" role="region" aria-label={t(title, language)}><svg viewBox={`0 0 ${w} 220`} style={{ height: 220 }} role="img" aria-label={t(title, language)}>
        {[0, 1, 2, 3, 4].map(n => <g key={n}><line x1={55} x2={w - 25} y1={py(max * n / 4)} y2={py(max * n / 4)} stroke="#dbe3eb" /><text x={48} y={py(max * n / 4) + 4} textAnchor="end">{Math.round(max * n / 4)}</text></g>)}
        {values.flatMap((v, i) => {
          if (v === undefined || i === 0 || values[i - 1] === undefined) return [];
          const previous = values[i - 1]!;
          const cuts = [0, ...band.ends.filter(b => b > Math.min(previous, v) && b < Math.max(previous, v)).map(b => (b - previous) / (v - previous)).sort((a, b) => a - b), 1];
          return cuts.slice(1).map((end, j) => { const start = cuts[j], a = previous + (v - previous) * start, b = previous + (v - previous) * end;
            return <line key={`${i}-${j}`} x1={px(i - 1) + (px(i) - px(i - 1)) * start} x2={px(i - 1) + (px(i) - px(i - 1)) * end} y1={py(a)} y2={py(b)} stroke={bandColor(metric, (a + b) / 2)} strokeWidth={2.5} />; });
        })}
        {days.map((day, i) => <g key={day.localDate}>{showDate(i, days.length, w - 80) && <text x={px(i)} y={203} textAnchor="middle">{label(day)}</text>}{values[i] !== undefined && <circle cx={px(i)} cy={py(values[i]!)} r={4} fill="white" stroke={bandColor(metric, values[i]!)} strokeWidth={2} tabIndex={0} role="button" aria-label={`${day.localDate}: ${values[i]}`} onFocus={() => setDetail(`${day.localDate} · ${t(title, language)}: ${format(metric, values[i])}`)} onClick={() => setDetail(`${day.localDate} · ${t(title, language)}: ${format(metric, values[i])}`)}><title>{day.localDate}: {format(metric, values[i])}</title></circle>}</g>)}
      </svg></div>
      {values.every(v => v === undefined) && <p>{t('Required forecast data is unavailable or incomplete.', language)}</p>}
      <div className="burncast-legend">{band.labels.map((text, i) => <span key={text}><i style={{ background: band.colors[i] }} />{text}</span>)}</div>
      <details><summary>{t('View details', language)}</summary>{dailyTable([[metric, title]], false)}</details>
    </section>;
  }
  return <div className="burncast-dashboard">
    <section className="forecast-chart-card burncast-fire"><h3>{t('Fire Weather', language)}</h3>
      <p className="product-note">{t('Daily max. Arrows show the wind source direction at peak transport wind speed.', language)}</p>
      <div ref={fireSize.ref} className="burncast-chart" role="region" aria-label={t('Fire Weather', language)}><svg viewBox={`0 0 ${width} ${height}`} style={{ height }} role="img" aria-label={t('Fire Weather', language)}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f44a00" stopOpacity=".65" /><stop offset="100%" stopColor="#f44a00" stopOpacity=".03" /></linearGradient></defs>
        <text x={compact ? 0 : left} y={20} fill="#c53e00">{t('Mixing height', language)} ({metricUnit('MIXING_HEIGHT', units)})</text>
        <text x={compact ? 0 : width - right} y={compact ? 40 : 20} textAnchor={compact ? 'start' : 'end'}>{t('Transport wind speed', language)} ({metricUnit('TRANSPORT_WIND_SPEED', units)})</text>
        {[0, 1, 2, 3, 4].map(n => <g key={n}><line x1={left} x2={width - right} y1={y(n / 4, 1)} y2={y(n / 4, 1)} stroke="#dbe3eb" /><text x={left - 10} y={y(n / 4, 1) + 4} textAnchor="end" fill="#c53e00">{Math.round(mhMax * n / 4)}</text><text x={width - right + 10} y={y(n / 4, 1) + 4}>{Math.round(windMax * n / 4)}</text></g>)}
        {segments('MIXING_HEIGHT').map((group, i) => <g key={i}><path d={`M${x(group[0].i)},${bottom} ` + group.map(p => `L${x(p.i)},${y(p.v, mhMax)}`).join(' ') + ` L${x(group[group.length - 1].i)},${bottom} Z`} fill={`url(#${id})`} /><polyline points={group.map(p => `${x(p.i)},${y(p.v, mhMax)}`).join(' ')} fill="none" stroke="#f44a00" strokeWidth={2.5} /></g>)}
        {segments('TRANSPORT_WIND_SPEED').map((group, i) => <polyline key={i} points={group.map(p => `${x(p.i)},${y(p.v, windMax)}`).join(' ')} fill="none" stroke="#334154" strokeWidth={2.5} />)}
        {days.map((day, i) => { const mh = value(day, 'MIXING_HEIGHT'), wind = value(day, 'TRANSPORT_WIND_SPEED'), dir = direction(day), haines = value(day, 'HAINES_INDEX'), color = haines === undefined ? '#f1f5f9' : bandColor('HAINES_INDEX', haines), cell = plot / days.length;
          return <g key={day.localDate}>
            {mh !== undefined && <circle cx={x(i)} cy={y(display('MIXING_HEIGHT', mh), mhMax)} r={3} fill="white" stroke="#f44a00" />}
            {wind !== undefined && (dir === undefined ? <circle cx={x(i)} cy={y(display('TRANSPORT_WIND_SPEED', wind), windMax)} r={4} fill="#334154" /> : <path d="M0,-11 L-7,-2 L-3,-2 L-3,10 L3,10 L3,-2 L7,-2 Z" transform={`translate(${x(i)},${y(display('TRANSPORT_WIND_SPEED', wind), windMax)}) rotate(${dir})`} fill="#334154" />)}
            <rect x={x(i) - cell / 2} y={compact ? 225 : 200} width={cell} height={29} fill="white" stroke="#475569" /><text x={x(i)} y={compact ? 244 : 219} fontSize={cell < 28 ? 9 : 11} textAnchor="middle">{cell >= 35 ? format('VENTILATION_RATE', value(day, 'VENTILATION_RATE') === undefined ? undefined : value(day, 'VENTILATION_RATE')! / 1000) : value(day, 'VENTILATION_RATE') === undefined ? '—' : new Intl.NumberFormat(locale(language), { notation: 'compact', maximumFractionDigits: 0 }).format(display('VENTILATION_RATE', value(day, 'VENTILATION_RATE')!) / 1000)}</text>
            <rect x={x(i) - cell / 2} y={compact ? 280 : 229} width={cell} height={29} fill={color} stroke="#475569" /><text x={x(i)} y={compact ? 299 : 248} textAnchor="middle" fill={ink(color)}>{format('HAINES_INDEX', haines)}</text>
            {showDate(i, days.length, plot) && <text x={x(i)} y={compact ? 332 : 280} textAnchor="middle">{label(day)}</text>}
            <rect className="burncast-hit" x={x(i) - cell / 2} y={top} width={cell} height={bottom - top} fill="transparent" tabIndex={0} role="button" aria-label={info(day)} onFocus={() => setDetail(info(day))} onClick={() => setDetail(info(day))}><title>{info(day)}</title></rect>
          </g>;
        })}
        <text x={compact ? left : left - 10} y={compact ? 215 : 213} textAnchor={compact ? 'start' : 'end'}>{t('Ventilation rate', language)}</text><text x={compact ? left : left - 10} y={compact ? 260 : 226} textAnchor={compact ? 'start' : 'end'}>{`(×1000 ${metricUnit('VENTILATION_RATE', units)})`}</text>
        <text x={compact ? left : left - 10} y={compact ? 275 : 248} textAnchor={compact ? 'start' : 'end'}>{t('Haines index', language)}</text>
      </svg></div>
      <details><summary>{t('View details', language)}</summary>{dailyTable([['MIXING_HEIGHT', 'Mixing height'], ['TRANSPORT_WIND_SPEED', 'Transport wind speed'], ['VENTILATION_RATE', 'Ventilation rate'], ['HAINES_INDEX', 'Haines index']], true)}</details>
    </section>
    {detail && <p className="product-note" role="status">{detail}</p>}
    <div className="burncast-index-grid">{indexChart('ATMOSPHERIC_DISPERSION_INDEX', 'Dispersion index')}{indexChart('UV_INDEX', 'UV index')}{indexChart('KBDI', 'KBDI')}</div>
    <section className="station-form-card"><h3>{t('Daily forecast summary', language)}</h3><p className="product-note">{t('Daily values require every hour of the local day. Missing or partial days show a dash.', language)}</p>{dailyTable(TABLE, true)}</section>
  </div>;
}
