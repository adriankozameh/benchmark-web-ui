// Thresholds and palettes migrated from the legacy Burncast portlets.
export const BANDS: Record<string, { ends: number[]; colors: string[]; labels: string[] }> = {
  ATMOSPHERIC_DISPERSION_INDEX: { ends: [20, 40, 60, 80], colors: ['#FD0100', '#FC7D02', '#FBDB0F', '#93CE07', '#3B7F3B'], labels: ['≤20', '20–40', '40–60', '60–80', '>80'] },
  UV_INDEX: { ends: [2, 5, 7, 10], colors: ['#93CE07', '#FBDB0F', '#FC7D02', '#FD0100', '#AA069F'], labels: ['0–2', '2–5', '5–7', '7–10', '>10'] },
  KBDI: { ends: [200, 400, 600], colors: ['#3B7F3B', '#FBDB0F', '#FC7D02', '#FD0100'], labels: ['0–200', '200–400', '400–600', '600–800'] },
};
export function bandColor(metric: string, value: number): string {
  const band = BANDS[metric];
  if (!Number.isFinite(value)) return '#e5e7eb';
  if (metric === 'HAINES_INDEX') return ['#006400', '#006400', '#90ee90', '#ffff00', '#ffa500', '#ff0000'][Math.max(0, Math.min(5, Math.round(value) - 1))];
  const index = band.ends.findIndex(end => value <= end);
  return band.colors[index < 0 ? band.colors.length - 1 : index];
}
const PALETTES: Record<string, [number, string[]]> = {
  ATMOSPHERIC_DISPERSION_INDEX: [100, ['#4287f5', '#ffffff', '#999999']],
  CLOUD_COVER: [100, ['#4287f5', '#ffffff', '#999999']],
  HAINES_INDEX: [6, ['#ffffff', '#f59042']],
  PRECIPITATION_CHANCE: [100, ['#ffffff', '#446950']],
  RELATIVE_HUMIDITY: [100, ['#ff4b14', '#dbcc40', '#21ba02', '#446950']],
  TEMPERATURE: [120, ['#006c9e', '#21ba02', '#dbcc40', '#ff4b14']],
  VENTILATION_RATE: [150, ['#ff4b14', '#446950']],
  WIND_SPEED: [100, ['#ffffff', '#7c6e99']], WIND_GUST: [100, ['#ffffff', '#7c6e99']],
};
export function tableColor(metric: string, raw: number | undefined): string | undefined {
  if (raw === undefined || !Number.isFinite(raw)) return undefined;
  if (metric === 'UV_INDEX' || metric === 'KBDI') return bandColor(metric, raw);
  const palette = PALETTES[metric]; if (!palette) return undefined;
  // Fixed physical scale: changing display units must not change a cell's color.
  const value = metric === 'TEMPERATURE' ? raw * 1.8 + 32 : ['WIND_SPEED', 'WIND_GUST'].includes(metric) ? raw / .44704 : raw;
  const position = Math.max(0, Math.min(1, value / palette[0])) * (palette[1].length - 1);
  const index = Math.min(palette[1].length - 2, Math.floor(position)), fraction = position - index;
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const a = rgb(palette[1][index]), b = rgb(palette[1][index + 1]);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * fraction).toString(16).padStart(2, '0')).join('');
}
export function ink(background?: string): string {
  if (!background) return '#172b3a';
  const rgb = [1, 3, 5].map(i => parseInt(background.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? '#172b3a' : '#ffffff';
}
