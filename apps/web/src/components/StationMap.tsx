import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { UserLanguage, WeatherStation } from '@benchmark/domain';
import { t } from '../language';

type Props = {
  stations: WeatherStation[];
  selectedStationId: string;
  onSelect: (stationId: string) => void;
  language: UserLanguage;
};

const pinIcon = (selected: boolean) => L.divIcon({
  className: 'benchmark-map-pin-wrap',
  html: `<div class="benchmark-map-pin${selected ? '' : ' station-pin'}"><div></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 28],
});
const SELECTED_ICON = pinIcon(true);
const STATION_ICON = pinIcon(false);
// Web Mercator's latitude limit; the tiled world ends here.
const WORLD_BOUNDS = L.latLngBounds([-85.0511, -180], [85.0511, 180]);

export function StationMap({ stations, selectedStationId, onSelect, language }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tileOptions: L.TileLayerOptions = { maxZoom: 19, noWrap: true, bounds: WORLD_BOUNDS };
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      ...tileOptions, attribution: '&copy; OpenStreetMap contributors',
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { ...tileOptions, attribution: '&copy; Esri, ArcGIS' },
    );
    const instance = L.map(container, {
      center: [39.5, -98.35], zoom: 4, layers: [street],
      maxBounds: WORLD_BOUNDS, maxBoundsViscosity: 1,
    });
    L.control.layers({ [t('Base map', language)]: street, [t('Satellite', language)]: satellite }, undefined, {
      position: 'topright',
    }).addTo(instance);

    // Lowest zoom at which the world (256px wide at zoom 0) still fills the viewport, so it is never shown twice.
    const fitWorld = () => {
      instance.invalidateSize();
      const { x, y } = instance.getSize();
      if (x && y) instance.setMinZoom(Math.ceil(Math.log2(Math.max(x, y) / 256)));
    };
    fitWorld();
    const resize = new ResizeObserver(fitWorld);
    resize.observe(container);
    setMap(instance);

    return () => {
      resize.disconnect();
      instance.remove();
      setMap(null);
    };
  }, [language]);

  // Rebuild pins and refit only when the visible station set changes (e.g. a new site filter).
  useEffect(() => {
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const markers = markersRef.current;
    for (const station of stations) {
      const marker = L.marker([station.latitude, station.longitude], { icon: STATION_ICON })
        .bindTooltip(station.name, { direction: 'top', offset: [0, -32] })
        .on('click', () => onSelectRef.current(station.id))
        .addTo(layer);
      marker.getElement()?.setAttribute('aria-label', station.name);
      markers.set(station.id, marker);
    }
    if (stations.length) {
      map.fitBounds(L.latLngBounds(stations.map((station) => [station.latitude, station.longitude])),
        { padding: [40, 40], maxZoom: 12, animate: false });
    }
    return () => {
      layer.remove();
      markers.clear();
    };
  }, [map, stations]);

  useEffect(() => {
    if (!map) return;
    for (const [id, marker] of markersRef.current) {
      const selected = id === selectedStationId;
      marker.setIcon(selected ? SELECTED_ICON : STATION_ICON).setZIndexOffset(selected ? 1000 : 0);
    }
    const selected = markersRef.current.get(selectedStationId);
    if (selected && !map.getBounds().contains(selected.getLatLng())) map.panTo(selected.getLatLng());
  }, [map, stations, selectedStationId]);

  return <div ref={containerRef} className="station-map" aria-label={t('Stations map', language)} />;
}
