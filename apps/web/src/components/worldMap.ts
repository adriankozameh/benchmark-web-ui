import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { UserLanguage } from '@benchmark/domain';
import { t } from '../language';

// Web Mercator's latitude limit; the tiled world ends here.
const WORLD_BOUNDS = L.latLngBounds([-85.0511, -180], [85.0511, 180]);
// The world is 256px wide at zoom 0 and doubles with each zoom level.
const TILE_SIZE = 256;

export type WorldMap = { map: L.Map; dispose: () => void };

/** Creates a street/satellite map that never shows the world more than once or pans past its edges. */
export function createWorldMap(container: HTMLElement, options: L.MapOptions, language: UserLanguage): WorldMap {
  const tileOptions: L.TileLayerOptions = { maxZoom: 19, noWrap: true, bounds: WORLD_BOUNDS };
  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    ...tileOptions, attribution: '&copy; OpenStreetMap contributors',
  });
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { ...tileOptions, attribution: '&copy; Esri, ArcGIS' },
  );

  const map = L.map(container, { ...options, layers: [street], maxBounds: WORLD_BOUNDS, maxBoundsViscosity: 1 });
  L.control.layers({ [t('Base map', language)]: street, [t('Satellite', language)]: satellite }, undefined, {
    position: 'topright',
  }).addTo(map);

  // Lowest zoom at which the world still fills the viewport; recomputed as the container resizes.
  const fitWorld = () => {
    map.invalidateSize();
    const { x, y } = map.getSize();
    if (x && y) map.setMinZoom(Math.ceil(Math.log2(Math.max(x, y) / TILE_SIZE)));
  };
  fitWorld();
  const resize = new ResizeObserver(fitWorld);
  resize.observe(container);

  return {
    map,
    dispose: () => {
      resize.disconnect();
      map.remove();
    },
  };
}
