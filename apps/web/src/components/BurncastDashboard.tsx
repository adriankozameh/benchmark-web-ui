import { useId, useState } from 'react';
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
export function BurncastDashboard({ data, units, language }: { data: ForecastProductsResponse; units: DisplayUnits; language: UserLanguage }) {
  const id = useId().replaceAll(':', '');
  const [detail, setDetail] = useState('');
  const days = data.products.daily;
  const height = 390, left = 150, right = 85, top = 55, bottom = 255;
  const width = Math.max(760, left + right + days.length * 76), plot = width - left - right;
  const x = (index: number) => left + plot * (index + .5) / Math.max(1, days.length);
  const label = (day: Day) => new Intl.DateTimeFormat(locale(language), { weekday: 'short', day: '2-digit', timeZone: 'UTC' }).format(new Date(day.localDate + 'T12:00:00Z'));
  const value = (day: Day, metric: string, suffix = '_MAX') => day.values[metric + suffix];
  const format = (metric: string, raw?: number) => raw === undefined ? '—' : new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(displayMetricValue(metric, raw, units));
  const display = (metric: string, raw: number) => displayMetricValue(metric, raw, units);
  const maximum = (metric: string) => Math.max(1, ...days.map(d => display(metric, value(d, metric) ?? 0))) * 1.1;
  const mhMax = maximum('MIXING_HEIGHT'), windMax = maximum('TRANSPORT_WIND_SPEED');
  const y = (v: number, max: number) => bottom - v / max * (bottom - top);
  const segments = (metric: string) => {
    const groups: Array<Array<{ i: number; v: number }>> = []; let group: Array<{ i: number; v: number }> = [];
    days.forEach((day, i) => { const v = value(day, metric); if (v === undefined) { if (group.length) groups.push(group); group = []; } else group.push({ i, v: display(metric, v) }); });
    if (group.length) groups.push(group); return groups;
  };
  const direction = (day: Day) => {
    const start = Date.parse(day.utcDateTime), index = days.indexOf(day);
    const end = index + 1 < days.length ? Date.parse(days[index + 1].utcDateTime) : Date.parse(data.forecast.to);
    const peak = data.products.hourly.filter(h => Date.parse(h.utcDateTime) >= start && Date.parse(h.utcDateTime) < end && h.values.TRANSPORT_WIND_SPEED !== undefined)
      .reduce<(typeof data.products.hourly)[number] | undefined>((best, h) => !best || h.values.TRANSPORT_WIND_SPEED > best.values.TRANSPORT_WIND_SPEED ? h : best, undefined);
    return peak?.values.TRANSPORT_WIND_DIRECTION;
  };
  const info = (day: Day) => `${day.localDate} · ${t('Mixing height', language)}: ${format('MIXING_HEIGHT', value(day, 'MIXING_HEIGHT'))} ${metricUnit('MIXING_HEIGHT', units)} · ${t('Transport wind speed', language)}: ${format('TRANSPORT_WIND_SPEED', value(day, 'TRANSPORT_WIND_SPEED'))} ${metricUnit('TRANSPORT_WIND_SPEED', units)} · ${t('Transport wind direction', language)}: ${format('TRANSPORT_WIND_DIRECTION', direction(day))}° · ${t('Haines index', language)}: ${format('HAINES_INDEX', value(day, 'HAINES_INDEX'))}`;
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
    const w = Math.max(620, days.length * 62 + 80), px = (i: number) => 55 + (w - 80) * (i + .5) / Math.max(1, days.length), py = (v: number) => 245 - v / max * 205;
    return <section className="forecast-chart-card burncast-index" key={metric}><h3>{t(title, language)}</h3>
      <div className="burncast-scroll" tabIndex={0} role="region" aria-label={t(title, language)}><svg viewBox={`0 0 ${w} 290`} style={{ minWidth: Math.max(400, days.length * 48 + 80) }} role="img" aria-label={t(title, language)}>
        {[0, 1, 2, 3, 4].map(n => <g key={n}><line x1={55} x2={w - 25} y1={py(max * n / 4)} y2={py(max * n / 4)} stroke="#dbe3eb" /><text x={48} y={py(max * n / 4) + 4} textAnchor="end">{Math.round(max * n / 4)}</text></g>)}
        {values.flatMap((v, i) => {
          if (v === undefined || i === 0 || values[i - 1] === undefined) return [];
          const previous = values[i - 1]!;
          const cuts = [0, ...band.ends.filter(b => b > Math.min(previous, v) && b < Math.max(previous, v)).map(b => (b - previous) / (v - previous)).sort((a, b) => a - b), 1];
          return cuts.slice(1).map((end, j) => { const start = cuts[j], a = previous + (v - previous) * start, b = previous + (v - previous) * end;
            return <line key={`${i}-${j}`} x1={px(i - 1) + (px(i) - px(i - 1)) * start} x2={px(i - 1) + (px(i) - px(i - 1)) * end} y1={py(a)} y2={py(b)} stroke={bandColor(metric, (a + b) / 2)} strokeWidth={2.5} />; });
        })}
        {days.map((day, i) => <g key={day.localDate}><text x={px(i)} y={273} textAnchor="middle">{label(day)}</text>{values[i] !== undefined && <circle cx={px(i)} cy={py(values[i]!)} r={4} fill="white" stroke={bandColor(metric, values[i]!)} strokeWidth={2} tabIndex={0} role="button" aria-label={`${day.localDate}: ${values[i]}`} onFocus={() => setDetail(`${day.localDate} · ${t(title, language)}: ${format(metric, values[i])}`)} onClick={() => setDetail(`${day.localDate} · ${t(title, language)}: ${format(metric, values[i])}`)}><title>{day.localDate}: {format(metric, values[i])}</title></circle>}</g>)}
      </svg></div>
      {values.every(v => v === undefined) && <p>{t('Required forecast data is unavailable or incomplete.', language)}</p>}
      <div className="burncast-legend">{band.labels.map((text, i) => <span key={text}><i style={{ background: band.colors[i] }} />{text}</span>)}</div>
      <details><summary>{t('View details', language)}</summary>{dailyTable([[metric, title]], false)}</details>
    </section>;
  }
  return <div className="burncast-dashboard">
    <section className="forecast-chart-card burncast-fire"><h3>{t('Fire Weather', language)}</h3>
      <p className="product-note">{t('Daily maxima. Arrows show the wind source direction at peak transport wind speed.', language)}</p>
      <div className="burncast-scroll" tabIndex={0} role="region" aria-label={t('Fire Weather', language)}><svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} role="img" aria-label={t('Fire Weather', language)}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f44a00" stopOpacity=".65" /><stop offset="100%" stopColor="#f44a00" stopOpacity=".03" /></linearGradient></defs>
        <text x={left} y={20} fill="#c53e00">{t('Mixing height', language)} ({metricUnit('MIXING_HEIGHT', units)})</text>
        <text x={width - right} y={20} textAnchor="end">{t('Transport wind speed', language)} ({metricUnit('TRANSPORT_WIND_SPEED', units)})</text>
        {[0, 1, 2, 3, 4].map(n => <g key={n}><line x1={left} x2={width - right} y1={y(n / 4, 1)} y2={y(n / 4, 1)} stroke="#dbe3eb" /><text x={left - 10} y={y(n / 4, 1) + 4} textAnchor="end" fill="#c53e00">{Math.round(mhMax * n / 4)}</text><text x={width - right + 10} y={y(n / 4, 1) + 4}>{Math.round(windMax * n / 4)}</text></g>)}
        {segments('MIXING_HEIGHT').map((group, i) => <g key={i}><path d={`M${x(group[0].i)},${bottom} ` + group.map(p => `L${x(p.i)},${y(p.v, mhMax)}`).join(' ') + ` L${x(group[group.length - 1].i)},${bottom} Z`} fill={`url(#${id})`} /><polyline points={group.map(p => `${x(p.i)},${y(p.v, mhMax)}`).join(' ')} fill="none" stroke="#f44a00" strokeWidth={2.5} /></g>)}
        {segments('TRANSPORT_WIND_SPEED').map((group, i) => <polyline key={i} points={group.map(p => `${x(p.i)},${y(p.v, windMax)}`).join(' ')} fill="none" stroke="#334154" strokeWidth={2.5} />)}
        {days.map((day, i) => { const mh = value(day, 'MIXING_HEIGHT'), wind = value(day, 'TRANSPORT_WIND_SPEED'), dir = direction(day), haines = value(day, 'HAINES_INDEX'), color = haines === undefined ? '#f1f5f9' : bandColor('HAINES_INDEX', haines), cell = plot / days.length;
          return <g key={day.localDate}>
            {mh !== undefined && <circle cx={x(i)} cy={y(display('MIXING_HEIGHT', mh), mhMax)} r={3} fill="white" stroke="#f44a00" />}
            {wind !== undefined && (dir === undefined ? <circle cx={x(i)} cy={y(display('TRANSPORT_WIND_SPEED', wind), windMax)} r={4} fill="#334154" /> : <path d="M0,-11 L-7,-2 L-3,-2 L-3,10 L3,10 L3,-2 L7,-2 Z" transform={`translate(${x(i)},${y(display('TRANSPORT_WIND_SPEED', wind), windMax)}) rotate(${dir})`} fill="#334154" />)}
            <rect x={x(i) - cell / 2} y={280} width={cell} height={29} fill="white" stroke="#475569" /><text x={x(i)} y={299} textAnchor="middle">{format('VENTILATION_RATE', value(day, 'VENTILATION_RATE') === undefined ? undefined : value(day, 'VENTILATION_RATE')! / 1000)}</text>
            <rect x={x(i) - cell / 2} y={309} width={cell} height={29} fill={color} stroke="#475569" /><text x={x(i)} y={328} textAnchor="middle" fill={ink(color)}>{format('HAINES_INDEX', haines)}</text>
            <text x={x(i)} y={360} textAnchor="middle">{label(day)}</text>
            <rect className="burncast-hit" x={x(i) - cell / 2} y={top} width={cell} height={bottom - top} fill="transparent" tabIndex={0} role="button" aria-label={info(day)} onFocus={() => setDetail(info(day))} onClick={() => setDetail(info(day))}><title>{info(day)}</title></rect>
          </g>;
        })}
        <text x={left - 10} y={293} textAnchor="end">{t('Ventilation rate', language)}</text><text x={left - 10} y={306} textAnchor="end">{`(×1000 ${metricUnit('VENTILATION_RATE', units)})`}</text>
        <text x={left - 10} y={328} textAnchor="end">{t('Haines index', language)}</text>
      </svg></div>
      <details><summary>{t('View details', language)}</summary>{dailyTable([['MIXING_HEIGHT', 'Mixing height'], ['TRANSPORT_WIND_SPEED', 'Transport wind speed'], ['VENTILATION_RATE', 'Ventilation rate'], ['HAINES_INDEX', 'Haines index']], true)}</details>
    </section>
    {detail && <p className="product-note" role="status">{detail}</p>}
    <div className="burncast-index-grid">{indexChart('ATMOSPHERIC_DISPERSION_INDEX', 'Dispersion index')}{indexChart('UV_INDEX', 'UV index')}{indexChart('KBDI', 'KBDI')}</div>
    <section className="station-form-card"><h3>{t('Daily forecast summary', language)}</h3><p className="product-note">{t('Daily values require every hour of the local day. Missing or partial days show a dash.', language)}</p>{dailyTable(TABLE, true)}</section>
  </div>;
}
