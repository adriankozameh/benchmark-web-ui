import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { UserLanguage } from '@benchmark/domain';
import { t } from '../language';
import { createWorldMap } from './worldMap';

type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  language: UserLanguage;
};

const FALLBACK_CENTER: L.LatLngExpression = [39.5, -98.35];

export function MapPicker({ latitude, longitude, onChange, language }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const { map, dispose } = createWorldMap(containerRef.current, { center: FALLBACK_CENTER, zoom: 4 }, language);

    map.on('click', (event: L.LeafletMouseEvent) => {
      onChangeRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;

    return () => {
      dispose();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || latitude == null || longitude == null) return;

    const point = L.latLng(latitude, longitude);
    if (!markerRef.current) {
      const icon = L.divIcon({
        className: 'benchmark-map-pin-wrap',
        html: '<div class="benchmark-map-pin"><div></div></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 28],
      });
      const marker = L.marker(point, { draggable: true, icon }).addTo(map);
      marker.on('dragend', () => {
        const next = marker.getLatLng();
        onChangeRef.current(next.lat, next.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(point);
    }

    if (map.getZoom() < 9) map.setView(point, 11, { animate: true });
    else map.panTo(point, { animate: true });
  }, [latitude, longitude, language]);

  return <div ref={containerRef} className="map-picker" aria-label={t('Station location map', language)} />;
}
