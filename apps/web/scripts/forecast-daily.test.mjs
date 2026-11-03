import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateDaily, dailyRule, dailyWindow, localDate, zonedMidnight } from '../src/components/forecastDaily.ts';

const NY = 'America/New_York';
const H = 60 * 60 * 1000;
const hourly = (provider, startIso, hours, values, step = 1) => Array.from({ length: Math.ceil(hours / step) }, (_, i) => {
  const time = Date.parse(startIso) + i * step * H;
  return { provider, utcDateTime: new Date(time).toISOString(), localDateTime: null, hoursFrom0Time: null, time, values: values(i * step, time) };
});

test('local midnight follows the station time zone, including DST changes', () => {
  assert.equal(new Date(zonedMidnight('2026-11-04', NY)).toISOString(), '2026-11-04T05:00:00.000Z');
  assert.equal(new Date(zonedMidnight('2026-07-04', NY)).toISOString(), '2026-07-04T04:00:00.000Z');
  assert.equal(zonedMidnight('2026-03-09', NY) - zonedMidnight('2026-03-08', NY), 23 * H);
  assert.equal(zonedMidnight('2026-11-02', NY) - zonedMidnight('2026-11-01', NY), 25 * H);
  assert.equal(localDate(Date.parse('2026-11-04T04:59:00Z'), NY), '2026-11-03');
  assert.equal(new Date(zonedMidnight('2026-11-04', 'Asia/Kolkata')).toISOString(), '2026-11-03T18:30:00.000Z');
});

test('the daily window starts tomorrow and spans whole local days', () => {
  const { start, end } = dailyWindow(Date.parse('2026-11-03T15:00:00Z'), 3, NY);
  assert.equal(new Date(start).toISOString(), '2026-11-04T05:00:00.000Z');
  assert.equal(new Date(end).toISOString(), '2026-11-07T05:00:00.000Z');
  // Late evening local time is still "today" even though UTC has rolled over.
  assert.equal(new Date(dailyWindow(Date.parse('2026-11-04T03:00:00Z'), 1, NY).start).toISOString(), '2026-11-04T05:00:00.000Z');
});

test('metrics aggregate by their daily rule', () => {
  assert.equal(dailyRule('TEMPERATURE'), 'range');
  assert.equal(dailyRule('PRECIPITATION_QUANTITY'), 'sum');
  assert.equal(dailyRule('WIND_GUST'), 'max');
  assert.equal(dailyRule('CLOUD_COVER'), 'mean');
  assert.equal(dailyRule('SOMETHING_NEW'), 'mean');

  // Two full days plus a partial third (the forecast horizon).
  const points = hourly('GFS', '2026-11-04T05:00:00Z', 60, (h) => ({
    TEMPERATURE: 10 + (h % 24),          // 10…33 each day
    PRECIPITATION_QUANTITY: 0.5,         // 12 mm per full day
    WIND_SPEED: h % 24 === 15 ? 40 : 10, // peak at 15:00 local
    WIND_DIRECTION: h % 24 === 15 ? 270 : 90,
    CLOUD_COVER: h % 2 ? 100 : 0,        // mean 50
  }));
  const { max, min } = aggregateDaily(points, NY);
  assert.deepEqual(max.map((p) => p.localDateTime), ['2026-11-04', '2026-11-05', '2026-11-06']);
  assert.deepEqual(max[0].values, { TEMPERATURE: 33, PRECIPITATION_QUANTITY: 12, WIND_SPEED: 40, WIND_DIRECTION: 270, CLOUD_COVER: 50 });
  assert.equal(max[0].coverage, undefined, 'complete days carry no coverage');
  assert.deepEqual(min[0].values, { TEMPERATURE: 10 });
  assert.equal(new Date(max[0].time).toISOString(), '2026-11-04T17:00:00.000Z', 'placed at local midday');
});

test('a partial horizon day is aggregated from the hours available and flagged', () => {
  // 36 hours: one full day, then 12 hours (00:00–11:00 local) of the next.
  const points = hourly('GFS', '2026-11-04T05:00:00Z', 36, (h) => ({ TEMPERATURE: 10 + (h % 24), PRECIPITATION_QUANTITY: 0.5 }));
  const { max, min } = aggregateDaily(points, NY);
  const last = max.at(-1);
  assert.equal(last.localDateTime, '2026-11-05');
  assert.deepEqual(last.values, { TEMPERATURE: 21, PRECIPITATION_QUANTITY: 6 }, 'understated by design');
  assert.deepEqual(last.coverage, {
    TEMPERATURE: { hours: 12, expected: 24 }, PRECIPITATION_QUANTITY: { hours: 12, expected: 24 },
  });
  assert.deepEqual(min.at(-1).coverage, last.coverage, 'the minimum line is flagged too');
});

test('providers with a coarser cadence and DST days still count as complete', () => {
  const threeHourly = hourly('ECMWF', '2026-11-04T05:00:00Z', 24, () => ({ PRECIPITATION_QUANTITY: 1 }), 3);
  assert.equal(aggregateDaily(threeHourly, NY).max[0].values.PRECIPITATION_QUANTITY, 8);
  const shortDay = hourly('GFS', '2026-03-08T05:00:00Z', 23, () => ({ TEMPERATURE: 5 }));
  assert.deepEqual(aggregateDaily(shortDay, NY).max.map((p) => p.localDateTime), ['2026-03-08']);
  assert.equal(aggregateDaily(shortDay, NY).max[0].coverage, undefined);
  const longDay = hourly('GFS', '2026-11-01T04:00:00Z', 24, () => ({ TEMPERATURE: 5 }));
  assert.deepEqual(aggregateDaily(longDay, NY).max[0].coverage, { TEMPERATURE: { hours: 24, expected: 25 } },
    'a 25-hour day needs 25 hourly points');
});

test('coverage is per metric: one metric missing hours does not flag the others', () => {
  const points = hourly('GFS', '2026-11-04T05:00:00Z', 24, (h) => h === 3
    ? { TEMPERATURE: 20 } : { TEMPERATURE: 20, PRECIPITATION_QUANTITY: 1 });
  const [day] = aggregateDaily(points, NY).max;
  assert.deepEqual(day.values, { TEMPERATURE: 20, PRECIPITATION_QUANTITY: 23 });
  assert.deepEqual(day.coverage, { PRECIPITATION_QUANTITY: { hours: 23, expected: 24 } });
});

test('providers are aggregated independently', () => {
  const points = [
    ...hourly('A', '2026-11-04T05:00:00Z', 24, () => ({ TEMPERATURE: 1 })),
    ...hourly('B', '2026-11-04T05:00:00Z', 24, () => ({ TEMPERATURE: 2 })),
  ];
  const { max } = aggregateDaily(points, NY);
  assert.deepEqual(max.map((p) => [p.provider, p.values.TEMPERATURE]).sort(), [['A', 1], ['B', 2]]);
});
