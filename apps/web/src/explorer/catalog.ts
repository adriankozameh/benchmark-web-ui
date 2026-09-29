import type { BenchmarkApi, ExplorerManifest, ExplorerStation, ExplorerDetails } from '@benchmark/api';

const DB_NAME = 'benchmark-station-explorer';
const STORE = 'catalog';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Browser storage is blocked'));
  });
}
async function read<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDatabase();
    try { return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
  } catch { return undefined; } // Private browsing/storage denial must not break the explorer.
}
async function write(key: string, data: unknown, obsoletePrefix?: string, keepSuffix?: string): Promise<void> {
  try {
    const db = await openDatabase();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(data, key);
      if (obsoletePrefix) {
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          if (String(current.key).startsWith(obsoletePrefix) && current.key !== key
              && (!keepSuffix || String(current.key).endsWith(keepSuffix))) current.delete();
          current.continue();
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  } catch { /* Keep the working in-memory data when storage is unavailable/full. */ }
}
export function validStations(value: unknown): value is ExplorerStation[] {
  return Array.isArray(value) && value.length > 0 && value.every(s => s && typeof s.id === 'string'
    && /^[A-Za-z0-9_]{11}$/.test(s.id) && typeof s.name === 'string' && Number.isFinite(s.lat)
    && Math.abs(s.lat) <= 90 && Number.isFinite(s.lon) && Math.abs(s.lon) <= 180);
}
export type Catalog = { manifest: ExplorerManifest; stations: ExplorerStation[] };
// Scoped to this authenticated API instance. Public NOAA catalog persists separately in IndexedDB.
const loads = new WeakMap<BenchmarkApi, Map<string, Promise<Catalog>>>();
export function loadCatalog(api: BenchmarkApi, org: string): Promise<Catalog> {
  let entries = loads.get(api);
  if (!entries) { entries = new Map(); loads.set(api, entries); }
  const previous = entries.get(org);
  if (previous) return previous;
  const request = (async () => {
    const manifest = await api.getExplorerManifest(org);
    const key = `core:${manifest.coreFile}`;
    let stations = await read<ExplorerStation[]>(key);
    if (!validStations(stations)) {
      stations = await api.getExplorerCatalog(org, manifest.coreFile);
      if (!validStations(stations)) throw new Error('Invalid station catalog');
      await write(key, stations, 'core:'); // Atomic replacement: failed writes preserve the old version.
    }
    return { manifest, stations };
  })();
  entries.set(org, request);
  void request.catch(() => entries!.delete(org));
  return request;
}
const detailsMemory = new Map<string, ExplorerDetails>();
export async function loadDetails(api: BenchmarkApi, org: string, version: string, id: string): Promise<ExplorerDetails> {
  const key = `details:${version}:${id}`;
  const cached = detailsMemory.get(key) ?? await read<ExplorerDetails>(key);
  if (cached?.stationId === id && Array.isArray(cached.variables)) return cached;
  const value = await api.getExplorerDetails(org, id, version);
  // Per-station replacement never removes another station's metadata.
  await write(key, value, 'details:', `:${id}`);
  if (detailsMemory.size >= 100) detailsMemory.delete(detailsMemory.keys().next().value!);
  detailsMemory.set(key, value);
  return value;
}
export function distanceKm(lat: number, lon: number, station: ExplorerStation): number {
  const radians = Math.PI / 180;
  const a = Math.sin((station.lat - lat) * radians / 2) ** 2
    + Math.cos(lat * radians) * Math.cos(station.lat * radians) * Math.sin((station.lon - lon) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
