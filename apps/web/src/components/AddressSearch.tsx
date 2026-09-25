import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { UserLanguage } from '@benchmark/domain';
import { t } from '../language';

export type LocationSuggestion = {
  displayName: string;
  latitude: number;
  longitude: number;
};

type Props = {
  onSelect: (suggestion: LocationSuggestion) => void;
  language: UserLanguage;
};

export function AddressSearch({ onSelect, language }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=${language}&q=${encodeURIComponent(trimmed)}`;
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);
        const json = (await response.json()) as Array<Record<string, unknown>>;
        if (id !== requestId.current) return;

        const next = json
          .map((item) => ({
            displayName: String(item.display_name ?? ''),
            latitude: Number(item.lat),
            longitude: Number(item.lon),
          }))
          .filter(
            (item) =>
              item.displayName && Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
          );
        setResults(next);
        setOpen(true);
      } catch {
        if (id === requestId.current) {
          setResults([]);
          setOpen(true);
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [query, language]);

  return (
    <div className="address-search">
      <Search size={18} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={t('Search street address, city, farm, or place', language)}
        aria-label={t('Search street address, city, farm, or place', language)}
      />
      {open && (
        <div className="address-results">
          {loading && <div className="address-result empty">{t('Searching…', language)}</div>}
          {!loading && results.length === 0 && (
            <div className="address-result empty">{t('No matching locations', language)}</div>
          )}
          {!loading &&
            results.map((result) => (
              <button
                type="button"
                className="address-result"
                key={`${result.latitude}-${result.longitude}-${result.displayName}`}
                onClick={() => {
                  setQuery(result.displayName);
                  setOpen(false);
                  onSelect(result);
                }}
              >
                <strong>{result.displayName}</strong>
                <span>
                  {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
