import { useEffect, useMemo, useRef, useState } from 'react';
import { BenchmarkApiError, type BenchmarkApi, type ExplorerStation, type ExplorerDetails } from '@benchmark/api';
import type { DisplayUnits, UserLanguage } from '@benchmark/domain';
import { AddressSearch } from '../components/AddressSearch';
import { ExplorerMap } from './ExplorerMap';
import { loadCatalog, loadDetails, distanceKm, type Catalog } from './catalog';
import './explorer.css';

type Props = { api: BenchmarkApi; organizationId: string; language: UserLanguage; units: DisplayUnits; onUnauthorized: () => void };
const labels: Record<string, string> = { TMIN: 'Minimum temperature', TMAX: 'Maximum temperature', TAVG: 'Average temperature', TOBS: 'Temperature at observation',
  PRCP: 'Precipitation', SNOW: 'Snowfall', SNWD: 'Snow depth', AWND: 'Average wind speed', AWDR: 'Average wind direction',
  RHAV: 'Average humidity', RHMN: 'Minimum humidity', RHMX: 'Maximum humidity', WESD: 'Snow water equivalent', MDPR: 'Multiday precipitation', DAPR: 'Days in precipitation total' };
export function StationExplorer({ api, organizationId, language, units, onUnauthorized }: Props) {
  const tr = (en: string, es: string) => language === 'es' ? es : en;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [activeOnly, setActiveOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState(3);
  const [group, setGroup] = useState<ExplorerStation[] | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ExplorerStation | null>(null);
  const [details, setDetails] = useState<ExplorerDetails | null>(null);
  const [detailsError, setDetailsError] = useState('');
  const [detailsAttempt, setDetailsAttempt] = useState(0);
  const [variables, setVariables] = useState<string[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [unitSystem, setUnitSystem] = useState<string>(units.toLowerCase());
  const [downloading, setDownloading] = useState(false);
  const detailPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected && window.matchMedia('(max-width: 1100px)').matches) detailPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);
  const downloadController = useRef<AbortController | null>(null);
  const unauthorized = useRef(onUnauthorized); unauthorized.current = onUnauthorized;
  function message(cause: unknown) {
    if (cause instanceof BenchmarkApiError && cause.status === 401) unauthorized.current();
    return cause instanceof Error ? cause.message : 'Unable to load station data';
  }
  useEffect(() => {
    let current = true;
    setError('');
    loadCatalog(api, organizationId).then(value => { if (current) setCatalog(value); })
      .catch(cause => { if (current) setError(message(cause)); });
    return () => { current = false; };
  }, [api, organizationId, attempt]);
  useEffect(() => {
    let current = true;
    setDetails(null); setDetailsError(''); setVariables([]);
    if (selected && catalog) loadDetails(api, organizationId, catalog.manifest.metadataFile, selected.id).then(value => {
      if (!current) return;
      setDetails(value); setStart(`${value.minYear}-01-01`);
      setVariables(value.variables.filter(v => v.downloadable && ['TMIN', 'TMAX', 'PRCP'].includes(v.id)).map(v => v.id));
    }).catch(cause => { if (current) setDetailsError(message(cause)); });
    return () => { current = false; downloadController.current?.abort(); };
  }, [api, organizationId, selected, catalog, detailsAttempt]);
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (catalog?.stations ?? []).filter(s => (!activeOnly || s.active === 1)
      && (!text || s.id.toLowerCase().includes(text) || s.name.toLowerCase().includes(text)))
      .map(station => ({ station, distance: center ? distanceKm(center[0], center[1], station) : null }))
      .filter(row => row.distance === null || row.distance <= radius)
      .sort((a, b) => center ? a.distance! - b.distance! : a.station.name.localeCompare(b.station.name));
  }, [catalog, activeOnly, query, center, radius]);
  const stations = useMemo(() => matches.map(row => row.station), [matches]);
  const groupIds = useMemo(() => group ? new Set(group.map(s => s.id)) : null, [group]);
  const rows = groupIds ? matches.filter(row => groupIds.has(row.station.id)) : matches;
  useEffect(() => { setPage(0); setGroup(null); }, [matches]);
  function location(lat: number, lon: number) { setCenter([lat, lon]); setCoordinates(`${lat.toFixed(5)}, ${lon.toFixed(5)}`); setGroup(null); }
  async function download() {
    if (!catalog || !selected || !details || !variables.length || !start || !end || start > end) return;
    const controller = new AbortController(); downloadController.current = controller;
    setDownloading(true); setDetailsError('');
    try {
      const blob = await api.downloadExplorerCsv(organizationId, selected.id, { version: catalog.manifest.metadataFile, startDate: start, endDate: end, vars: variables.join(','), unitSystem }, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `noaa_${selected.id}_${start}_${end}.csv`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { if (!controller.signal.aborted) setDetailsError(message(cause)); }
    finally { setDownloading(false); }
  }
  return <section className="station-explorer">
    <div><h2>{tr('Station Explorer', 'Explorador de estaciones')}</h2><p>{tr('Explore NOAA daily observations. Search an address, enter coordinates, or click the map.', 'Explora observaciones diarias de NOAA. Busca una dirección, ingresa coordenadas o haz clic en el mapa.')}</p></div>
    {error && <div role="alert" className="alert error">{error}<button onClick={() => setAttempt(x => x + 1)}>{tr('Retry', 'Reintentar')}</button></div>}
    {!catalog && !error && <p role="status">{tr('Preparing station catalog…', 'Preparando catálogo de estaciones…')}</p>}
    <div className="explorer-controls">
      <AddressSearch language={language} onSelect={s => location(s.latitude, s.longitude)} />
      <form onSubmit={e => { e.preventDefault(); const parts = coordinates.split(',').map(v => Number(v.trim()));
        if (parts.length === 2 && coordinates.split(',').every(v => v.trim()) && parts.every(Number.isFinite) && Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180) { setError(''); location(parts[0], parts[1]); }
        else setError(tr('Enter valid latitude, longitude.', 'Ingresa latitud, longitud válidas.')); }}>
        <input aria-label="Latitude, longitude" placeholder="Latitude, longitude" value={coordinates} onChange={e => setCoordinates(e.target.value)} /><button type="submit">{tr('Find nearby', 'Buscar cercanas')}</button>
      </form>
      <label>{tr('Radius (km)', 'Radio (km)')} <select value={radius} onChange={e => setRadius(Number(e.target.value))}>{[1, 3, 5, 10, 25, 50, 100, 250].map(n => <option key={n}>{n}</option>)}</select></label>
      <label><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} /> {tr('Active stations only', 'Solo estaciones activas')}</label>
      <input aria-label="Station name or ID" placeholder={tr('Station name or ID', 'Nombre o ID de estación')} value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={() => { setCenter(null); setCoordinates(''); setQuery(''); setGroup(null); }}>{tr('Clear search', 'Limpiar búsqueda')}</button>
    </div>
    <div className="explorer-layout">
      <div className="explorer-main">
        <ExplorerMap stations={stations} selected={selected?.id ?? null} center={center} radius={radius} onLocation={location} onSelect={setSelected} onGroup={value => { setGroup(value); setPage(0); }} />
        <div className="explorer-results">
          <strong>{rows.length.toLocaleString()} {tr('stations', 'estaciones')}</strong>
          {group && <button onClick={() => setGroup(null)}>{tr('Show all results', 'Ver todos los resultados')}</button>}
          {rows.length === 0 && catalog && <p>{tr('No stations found. Increase the radius or clear your filters.', 'No hay estaciones. Amplía el radio o limpia los filtros.')}</p>}
          <div className="explorer-stations">{rows.slice(page * 30, (page + 1) * 30).map(({ station, distance }) => <button key={station.id} className={selected?.id === station.id ? 'selected' : ''} onClick={() => setSelected(station)}>
            <strong>{station.name}</strong><span>{station.id}{distance !== null ? ` · ${distance.toFixed(1)} km` : ''} · {station.active ? tr('Active', 'Activa') : tr('Inactive', 'Inactiva')}</span>
          </button>)}</div>
          <div className="explorer-pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>{tr('Previous', 'Anterior')}</button><span>{page + 1} / {Math.max(1, Math.ceil(rows.length / 30))}</span><button disabled={(page + 1) * 30 >= rows.length} onClick={() => setPage(p => p + 1)}>{tr('Next', 'Siguiente')}</button></div>
        </div>
      </div>
      <aside ref={detailPanel} className="explorer-details" aria-label="Station details">
        {!selected ? <p>{tr('Select a station to view available variables and download observations.', 'Selecciona una estación para ver variables y descargar observaciones.')}</p> : <>
          <h3>{selected.name}</h3><p>{selected.id} · {selected.active ? tr('Active', 'Activa') : tr('Inactive', 'Inactiva')}</p>
          <p>{selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</p>
          {detailsError && <div role="alert">{detailsError}<button onClick={() => setDetailsAttempt(v => v + 1)}>{tr('Retry details', 'Reintentar detalles')}</button></div>}
          {!details && !detailsError && <p role="status">{tr('Loading details…', 'Cargando detalles…')}</p>}
          {details && <>
            <p>{details.state} {details.elevation !== null ? `· ${details.elevation} m` : ''} · {details.minYear}–{details.maxYear}</p>
            <p>{tr('Coverage varies by variable; years do not guarantee complete daily records.', 'La cobertura varía por variable; los años no garantizan registros diarios completos.')}</p>
            <div className="explorer-actions"><button onClick={() => setVariables(details.variables.filter(v => v.downloadable).map(v => v.id))}>{tr('Select all', 'Seleccionar todas')}</button><button onClick={() => setVariables([])}>{tr('Clear', 'Limpiar')}</button></div>
            <div className="explorer-variables">{details.variables.map(v => <label key={v.id} title={labels[v.id] ?? v.id}>
              <input type="checkbox" disabled={!v.downloadable} checked={variables.includes(v.id)} onChange={e => setVariables(current => e.target.checked ? [...current, v.id] : current.filter(id => id !== v.id))} />
              <span><strong>{v.id}</strong> {v.startYear}–{v.endYear}<small>{labels[v.id] ?? v.id}{!v.downloadable && ` · ${tr('Download unavailable', 'Descarga no disponible')}`}</small></span>
            </label>)}</div>
            <label>{tr('From', 'Desde')}<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label>{tr('Through', 'Hasta')}<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
            <label>{tr('Units', 'Unidades')}<select value={unitSystem} onChange={e => setUnitSystem(e.target.value)}><option value="metric">{tr('Metric', 'Métrico')}</option><option value="imperial">Imperial</option></select></label>
            {start > end && <p role="alert">{tr('Start date must precede end date.', 'La fecha inicial debe preceder a la final.')}</p>}
            <button className="primary-button" disabled={downloading || !variables.length || !start || !end || start > end} onClick={download}>{downloading ? tr('Preparing CSV…', 'Preparando CSV…') : tr('Download CSV', 'Descargar CSV')}</button>
          </>}
        </>}
      </aside>
    </div>
  </section>;
}
