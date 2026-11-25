import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastBarSlots, isPlottableForecastValue, usesForecastBars } from '../src/components/forecastBars.ts';

const HOUR = 3_600_000;
const providers = ['IBM_GRAF', 'NOAA_GFS'];

test('only precipitation quantity and chance use bars', () => {
  assert.equal(usesForecastBars('PRECIPITATION_QUANTITY'), true);
  assert.equal(usesForecastBars('PRECIPITATION_CHANCE'), true);
  assert.equal(usesForecastBars('TEMPERATURE'), false);
  assert.equal(usesForecastBars('PRECIPITATION_QUANTITY_PROBOFABOVE'), false);
});

test('rain bars retain zero, reject invalid values, and allow negative temperatures on line charts', () => {
  assert.equal(isPlottableForecastValue('PRECIPITATION_QUANTITY', 0), true);
  assert.equal(isPlottableForecastValue('PRECIPITATION_CHANCE', 0), true);
  assert.equal(isPlottableForecastValue('PRECIPITATION_CHANCE', 100), true);
  for (const value of [-1, NaN, Infinity, undefined, null]) assert.equal(isPlottableForecastValue('PRECIPITATION_QUANTITY', value), false);
  assert.equal(isPlottableForecastValue('PRECIPITATION_CHANCE', 101), false);
  assert.equal(isPlottableForecastValue('TEMPERATURE', -5), true);
});

test('grouped bars use distinct provider slots without overlapping neighboring timestamps', () => {
  const slots = forecastBarSlots([0, HOUR, 2 * HOUR], providers, 0, 3 * HOUR, 57, 746);
  let previousRight = 57;
  for (const time of [0, HOUR, 2 * HOUR]) {
    const first = slots.get(time).get('IBM_GRAF');
    const second = slots.get(time).get('NOAA_GFS');
    assert.ok(first.x >= previousRight);
    assert.ok(first.width > 0);
    assert.ok(first.x + first.width < second.x);
    assert.ok(second.x + second.width <= 746);
    previousRight = second.x + second.width;
  }
});

test('missing readings keep their provider slot and gaps are not filled', () => {
  const slots = forecastBarSlots([0, HOUR, 4 * HOUR], providers, 0, 5 * HOUR, 0, 100);
  assert.equal(slots.size, 3);
  assert.equal(slots.has(2 * HOUR), false);
  assert.equal(slots.get(4 * HOUR).size, 2);
  assert.ok(slots.get(HOUR).get('IBM_GRAF').x < slots.get(HOUR).get('NOAA_GFS').x);
});

test('timestamps outside the half-open window and duplicate timestamps/providers do not create extra bars', () => {
  const slots = forecastBarSlots([-HOUR, 0, 0, HOUR, 2 * HOUR, NaN], [...providers, 'IBM_GRAF'], 0, 2 * HOUR, 0, 100);
  assert.equal(slots.size, 2);
  assert.equal(slots.get(0).size, 2);
  assert.equal(slots.has(2 * HOUR), false);
});

test('single samples, empty selections and long provider lists have finite, bounded geometry', () => {
  assert.equal(forecastBarSlots([0], [], 0, HOUR, 0, 100).size, 0);
  assert.equal(forecastBarSlots([0], providers, 0, 0, 0, 100).size, 0);
  const names = Array.from({ length: 20 }, (_, index) => 'model-' + index);
  for (const slot of forecastBarSlots([0], names, 0, 375 * HOUR, 0, 100).get(0).values()) {
    assert.ok(Number.isFinite(slot.x) && Number.isFinite(slot.width));
    assert.ok(slot.width > 0 && slot.x >= 0 && slot.x + slot.width <= 100);
  }
});

test('daily samples retain actual 23/25-hour day spacing and single-day cadence', () => {
  const slots = forecastBarSlots([0, 23 * HOUR, 48 * HOUR], providers, 0, 73 * HOUR, 0, 730);
  const a = slots.get(23 * HOUR).get('IBM_GRAF');
  const b = slots.get(48 * HOUR).get('IBM_GRAF');
  assert.ok(b.x - a.x > 0);
  assert.equal(forecastBarSlots([12 * HOUR], providers, 0, 24 * HOUR, 0, 730, 24 * HOUR).get(12 * HOUR).size, 2);
});
