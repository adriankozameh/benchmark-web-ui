/**
 * Fingerprint of a chart's plotted values. Used as the React key of the chart's `.chart-draw` group, so the
 * draw-in animation replays when the data changes (station, range, refresh) but not on hover, resize or
 * unrelated re-renders that rebuild the same values.
 */
export function drawKey(values: Iterable<number | undefined>): string {
  let count = 0;
  let hash = 0;
  for (const value of values) {
    count += 1;
    const n = value === undefined || !Number.isFinite(value) ? 0x9e3779b9 : Math.round(value * 1000);
    hash = (Math.imul(hash, 31) + n) | 0;
  }
  return `${count}:${hash}`;
}
