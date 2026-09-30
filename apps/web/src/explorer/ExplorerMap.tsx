import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ExplorerStation } from '@benchmark/api';

type Props = {
  stations: ExplorerStation[];
  selected: string | null;
  center: [number, number] | null;
  radius: number;
  onSelect: (station: ExplorerStation) => void;
  onGroup: (stations: ExplorerStation[]) => void;
  onLocation: (lat: number, lon: number) => void;
};
export function ExplorerMap(props: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const redraw = useRef<() => void>(() => {});
  useEffect(() => {
    if (!element.current) return;
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18, noWrap: true });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', maxZoom: 18, noWrap: true });
    const usBounds = L.latLngBounds([24.396308, -125], [49.384358, -66.93457]);
    const instance = L.map(element.current, { center: [39.5, -98.35], zoom: 4,
      minZoom: 3, maxZoom: 18, maxBounds: usBounds.pad(0.25), maxBoundsViscosity: 1,
      layers: [street], preferCanvas: true, worldCopyJump: false });
    instance.fitBounds(usBounds, { padding: [20, 20], animate: false });
    map.current = instance;
    L.control.layers({ 'Street': street, 'Satellite': satellite }).addTo(instance);
    const markers = L.layerGroup().addTo(instance);
    // Screen-space clustering bounds DOM markers by viewport size, not catalog size.
    const draw = () => {
      markers.clearLayers();
      const { stations, selected, onSelect, onGroup } = latest.current;
      const bounds = instance.getBounds().pad(0.1);
      const cells = new Map<string, ExplorerStation[]>();
      for (const station of stations) {
        if (!bounds.contains([station.lat, station.lon])) continue;
        const point = instance.project([station.lat, station.lon]);
        const key = `${Math.floor(point.x / 48)},${Math.floor(point.y / 48)}`;
        const group = cells.get(key);
        if (group) group.push(station); else cells.set(key, [station]);
      }
      for (const group of cells.values()) {
        const lat = group.reduce((sum, s) => sum + s.lat, 0) / group.length;
        const lon = group.reduce((sum, s) => sum + s.lon, 0) / group.length;
        const single = group.length === 1;
        const label = single ? group[0].name : `${group.length} stations`;
        const marker = L.marker([lat, lon], {
          title: label,
          icon: L.divIcon({ className: `explorer-marker ${single ? 'single' : ''} ${group.some(s => s.id === selected) ? 'selected' : ''}`,
            html: single ? '<span aria-hidden="true">●</span>' : String(group.length), iconSize: single ? [24, 24] : [38, 38] }),
        }).addTo(markers);
        marker.on('click', () => {
          if (single) onSelect(group[0]);
          else { onGroup(group); instance.fitBounds(L.latLngBounds(group.map(s => [s.lat, s.lon])), { maxZoom: Math.min(18, instance.getZoom() + 3), padding: [30, 30] }); }
        });
      }
    };
    redraw.current = draw;
    instance.on('moveend', draw);
    instance.on('click', (event: L.LeafletMouseEvent) => latest.current.onLocation(event.latlng.lat, event.latlng.lng));
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(element.current);
    draw();
    return () => { resize.disconnect(); instance.remove(); map.current = null; redraw.current = () => {}; };
  }, []);
  useEffect(() => { redraw.current(); }, [props.stations, props.selected]);
  useEffect(() => {
    const instance = map.current;
    const station = latest.current.stations.find(s => s.id === props.selected);
    if (instance && station && !instance.getBounds().contains([station.lat, station.lon])) instance.panTo([station.lat, station.lon]);
  }, [props.selected]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !props.center) return;
    const circle = L.circle(props.center, { radius: props.radius * 1000, color: '#287d91', weight: 2, fillOpacity: 0.06, interactive: false }).addTo(instance);
    instance.fitBounds(circle.getBounds(), { padding: [20, 20], maxZoom: 13 });
    return () => { circle.remove(); };
  }, [props.center, props.radius]);
  return <div className="explorer-map" ref={element} aria-label="NOAA station map" />;
}
