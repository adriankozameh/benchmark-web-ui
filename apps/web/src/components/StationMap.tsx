import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { UserLanguage, WeatherStation } from '@benchmark/domain';
import { t } from '../language';
import { createWorldMap } from './worldMap';

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

export function StationMap({ stations, selectedStationId, onSelect, language }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { map: instance, dispose } = createWorldMap(container, { center: [39.5, -98.35], zoom: 4 }, language);
    setMap(instance);

    return () => {
      dispose();
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
