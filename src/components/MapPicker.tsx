import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
};

const FALLBACK_CENTER: L.LatLngExpression = [39.5, -98.35];

export function MapPicker({ latitude, longitude, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; Esri, ArcGIS',
        maxZoom: 19,
      },
    );

    const map = L.map(containerRef.current, {
      center: FALLBACK_CENTER,
      zoom: 4,
      layers: [street],
      zoomControl: true,
    });

    L.control.layers({ 'Base map': street, Satellite: satellite }, undefined, {
      position: 'topright',
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      onChangeRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || latitude == null || longitude == null) return;

    const point = L.latLng(latitude, longitude);

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: 'benchmark-map-pin-wrap',
        html: '<div class="benchmark-map-pin"><div></div></div>',
        iconSize: [34, 42],
        iconAnchor: [17, 40],
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
  }, [latitude, longitude]);

  return <div ref={containerRef} className="map-picker" aria-label="Station location map" />;
}
