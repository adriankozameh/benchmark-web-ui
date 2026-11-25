import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, before, after } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { GLADIATOR_HORIZONS, GLADIATOR_WINDOWS, chartProviders, highlightedProvider,
  isGladiatorMetric, loadGladiatorMetrics, matchesGladiatorSelection } from '../src/components/gladiator.ts';
import { displayMetricError } from '../src/forecastUnits.ts';
import { providerLabel } from '../src/components/forecastProviders.ts';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(new URL('../../../packages/api/src/index.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { BenchmarkApi } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const models = ['Benchmark', 'NOAA_GFS', 'WCS_ECMWF', 'WCS_GEFS'];
const score = (provider, rank = 1) => ({ provider, rank, eligible: true, sampleCount: 48, expectedSamples: 96,
  availableForecastSamples: 96, scoredDays: 3, coveragePercent: 50, mae: 1, rmse: 2, bias: -0.5,
  outsideTolerancePercent: 0, allHours: null, rainEvents: null });
const response = (overrides = {}) => ({
  organizationId: 'org', stationId: 'station', locationRevision: 'rev1', metric: 'TEMPERATURE', hoursFrom0Time: 24, days: 7,
  from: '2026-11-17T00:00:00Z', to: '2026-11-24T00:00:00Z',
  observationSource: { kind: 'HARDWARE', id: 'hardware-source', provider: 'TEMPEST' }, scoringPolicy: 'v2-test',
  scoreMetric: 'MAE', unit: 'degC', tolerance: 2, percentageDefinition: 'OUTSIDE_TOLERANCE', status: 'READY',
  winnerProvider: 'NOAA_GFS', tiedForBest: false, comparisonProviders: models.slice(0, 2), topProviders: ['NOAA_GFS', 'Benchmark'],
  rankings: [score('NOAA_GFS'), score('Benchmark', 2)], committedDays: 3, scoredDays: 3,
  windowCoveragePercent: 42.8, minimumSamples: 12, minimumDays: 3, minimumCoveragePercent: 50,
  lastCalculatedAt: '2026-11-24T12:01:00Z', sampleSelection: 'ALL', comparisonMode: 'COMPETITIVE',
  comparisonDefinition: { issue: null, timestampConvention: 'INSTANT', observation: null, forecasts: {} },
  minimumWindSpeed: null, daylightElevation: null, minimumRainEvents: null, statisticsAvailable: true,
  bestForecastProvider: 'NOAA_GFS', bestForecastBasis: 'STATISTICS', ...overrides,
});


test('provider labels use backend branding without translating IBM identifiers', () => {
  assert.equal(providerLabel('Benchmark'), 'Benchmark');
  assert.equal(providerLabel('IBM_GRAF'), 'IBM GRAF');
  assert.equal(providerLabel('BENCHMARK'), 'BENCHMARK');
});

test('public API provider names match measured winners and top-three rankings directly', () => {
  const data = response({ bestForecastProvider: 'Benchmark', winnerProvider: 'Benchmark',
    topProviders: ['Benchmark', 'NOAA_GFS', 'WCS_ECMWF'],
    comparisonDefinition: { issue: null, timestampConvention: 'INSTANT', observation: null,
      forecasts: { Benchmark: { quantity: 'TEMPERATURE', unit: 'degC', intervalHours: 0, timestampLabel: 'INSTANT' } } } });
  assert.equal(highlightedProvider(data, models), 'Benchmark');
  assert.deepEqual(chartProviders(models, [], 'top3', data), ['Benchmark', 'NOAA_GFS', 'WCS_ECMWF']);
  assert.deepEqual(chartProviders(models, ['Benchmark'], 'top3', data), ['NOAA_GFS', 'WCS_ECMWF']);
  assert.match(summary(data, { showAccuracy: true }), /Benchmark/);
  assert.equal(Object.keys(data.comparisonDefinition.forecasts)[0], 'Benchmark');
});

test('selectors expose only the agreed horizons/windows and supported metrics', () => {
  assert.deepEqual(GLADIATOR_HORIZONS, [24, 48, 120, 240, 336]);
  assert.deepEqual(GLADIATOR_WINDOWS, [7, 15, 30]);
  assert.equal(isGladiatorMetric('WIND_DIRECTION'), true);
  assert.equal(isGladiatorMetric('PRECIPITATION_CHANCE'), false);
});

test('measured winner is independent per metric and respects current availability', () => {
  assert.equal(highlightedProvider(response(), models), 'NOAA_GFS');
  assert.equal(highlightedProvider(response({ metric: 'WIND_SPEED', winnerProvider: 'Benchmark', bestForecastProvider: 'Benchmark' }), models), 'Benchmark');
  assert.equal(highlightedProvider(response(), ['Benchmark']), undefined);
  assert.equal(highlightedProvider(null, models), undefined);
});

test('no-statistics defaults prefer IBM and use NOAA only when IBM is absent', () => {
  const empty = { statisticsAvailable: false, bestForecastBasis: 'DEFAULT', winnerProvider: null, status: 'PENDING' };
  assert.equal(highlightedProvider(response({ ...empty, bestForecastProvider: 'Benchmark' }), models), 'Benchmark');
  assert.equal(highlightedProvider(response({ ...empty, bestForecastProvider: 'NOAA_GFS' }), ['NOAA_GFS']), 'NOAA_GFS');
  assert.equal(highlightedProvider(response({ ...empty, bestForecastProvider: null, bestForecastBasis: 'NONE' }), models), undefined);
});

test('a backend NOAA default cannot override available IBM forecasts or create a measured winner', () => {
  const data = response({ statisticsAvailable: false, bestForecastBasis: 'DEFAULT',
    bestForecastProvider: 'NOAA_GFS', winnerProvider: null, status: 'PENDING', topProviders: [], rankings: [] });
  assert.equal(highlightedProvider(data, models), 'Benchmark');
  assert.equal(highlightedProvider(data, ['NOAA_GFS']), 'NOAA_GFS');
  assert.equal(highlightedProvider(data, ['WCS_ECMWF']), undefined);
  const html = summary(data, { showAccuracy: true });
  assert.match(html, /Default · Benchmark/);
  assert.doesNotMatch(html, /Default · NOAA GFS|Best performing/);
  assert.equal(data.bestForecastProvider, 'NOAA_GFS');
  assert.equal(data.winnerProvider, null);
});

test('insufficient-data responses use a display default without manufacturing a winner', () => {
  for (const status of ['INSUFFICIENT_DATA', 'INSUFFICIENT_EVENTS']) {
    const data = response({ status, bestForecastProvider: null, bestForecastBasis: 'NONE', winnerProvider: null });
    assert.equal(highlightedProvider(data, models), 'Benchmark');
    assert.equal(highlightedProvider(data, ['NOAA_GFS']), 'NOAA_GFS');
    assert.equal(data.winnerProvider, null);
    assert.equal(data.bestForecastBasis, 'NONE');
  }
  assert.equal(highlightedProvider(response({ status: 'SINGLE_PROVIDER', bestForecastProvider: null,
    bestForecastBasis: 'NONE', winnerProvider: null }), models), undefined);
});

test('unevaluated metrics have a display default; failed requests for scored metrics do not', () => {
  assert.equal(highlightedProvider(null, models, 'PRECIPITATION_CHANCE'), 'Benchmark');
  assert.equal(highlightedProvider(null, ['NOAA_GFS'], 'CLOUD_COVER'), 'NOAA_GFS');
  assert.equal(highlightedProvider(null, models, 'TEMPERATURE'), undefined);
});

test('a no-statistics backend default outside the visible forecast window uses the available IBM/NOAA alternative', () => {
  assert.equal(highlightedProvider(response({ statisticsAvailable: false, bestForecastBasis: 'DEFAULT',
    bestForecastProvider: 'Benchmark', winnerProvider: null, status: 'PENDING' }), ['NOAA_GFS']), 'NOAA_GFS');
});

test('top three is per metric, capped, and preserves manual visibility without replacing a hidden rank', () => {
  const data = response({ topProviders: ['WCS_GEFS', 'NOAA_GFS', 'Benchmark', 'WCS_ECMWF'] });
  assert.deepEqual(chartProviders(models, [], 'top3', data), ['WCS_GEFS', 'NOAA_GFS', 'Benchmark']);
  assert.deepEqual(chartProviders(models, ['NOAA_GFS'], 'top3', data), ['WCS_GEFS', 'Benchmark']);
  assert.deepEqual(chartProviders(models, [], 'top3', response()), ['NOAA_GFS', 'Benchmark']);
  assert.deepEqual(chartProviders(models, [], 'top3', response({ topProviders: ['Benchmark'], status: 'SINGLE_PROVIDER' })), ['Benchmark']);
});

test('empty rankings preserve the normal forecast instead of manufacturing a top three', () => {
  assert.deepEqual(chartProviders(models, ['WCS_GEFS'], 'top3', response({ topProviders: [] })), models.slice(0, 3));
  assert.deepEqual(chartProviders(['WCS_ECMWF'], [], 'top3', response()), []);
  assert.deepEqual(chartProviders(models, [], 'all', response()), models);
});

test('error and tolerance conversions preserve zero and signed differences without a Fahrenheit offset', () => {
  assert.equal(displayMetricError('TEMPERATURE', 0, 'IMPERIAL'), 0);
  assert.equal(displayMetricError('TEMPERATURE', 2, 'IMPERIAL'), 3.6);
  assert.equal(displayMetricError('TEMPERATURE', -2, 'IMPERIAL'), -3.6);
  assert.equal(displayMetricError('TEMPERATURE', 2, 'METRIC'), 2);
  assert.equal(displayMetricError('PRECIPITATION_QUANTITY', 25.4, 'IMPERIAL'), 1);
  assert.equal(displayMetricError('RELATIVE_HUMIDITY', 10, 'IMPERIAL'), 10);
  assert.equal(displayMetricError('WIND_DIRECTION', 2, 'IMPERIAL'), 2);
  assert.equal(displayMetricError('WIND_SPEED', 0.44704, 'IMPERIAL'), 1);
});

test('selection matching rejects other tenants, stations, locations, metrics and filters', () => {
  const matches = data => matchesGladiatorSelection(data, 'org', 'station', 'rev1', 'TEMPERATURE', 24, 7);
  assert.equal(matches(response()), true);
  for (const change of [{ organizationId: 'other' }, { stationId: 'other' }, { locationRevision: 'rev2' },
    { metric: 'WIND_SPEED' }, { hoursFrom0Time: 48 }, { days: 30 }]) assert.equal(matches(response(change)), false);
});

test('request fan-out is bounded, duplicate metrics are eliminated, and failures do not hide successful metrics', async () => {
  let active = 0, maximum = 0;
  const received = [];
  await loadGladiatorMetrics(['TEMPERATURE', 'TEMPERATURE', 'WIND_SPEED', 'WIND_DIRECTION', 'PRESSURE'], new AbortController().signal,
    async metric => {
      maximum = Math.max(maximum, ++active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      if (metric === 'PRESSURE') throw new Error('unavailable');
      return response({ metric });
    }, (metric, data, error) => received.push({ metric, data, error }));
  assert.equal(maximum, 3);
  assert.equal(received.length, 4);
  assert.equal(received.find(row => row.metric === 'PRESSURE').data, null);
  assert.equal(received.filter(row => row.data).length, 3);
});

test('cancellation suppresses late results and prevents remaining requests from starting', async () => {
  const abort = new AbortController();
  const releases = [], received = [], started = [];
  const job = loadGladiatorMetrics(['TEMPERATURE', 'WIND_SPEED', 'WIND_DIRECTION', 'PRESSURE'], abort.signal,
    metric => { started.push(metric); return new Promise(resolve => releases.push(() => resolve(response({ metric })))); },
    (...args) => received.push(args));
  assert.equal(started.length, 3);
  abort.abort();
  releases.forEach(resolve => resolve());
  await job;
  assert.equal(started.length, 3);
  assert.equal(received.length, 0);
});

test('API uses the authenticated station endpoint, passes cancellation and never caches statistics', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(response()));
  };
  try {
    const api = new BenchmarkApi('https://example.test', async () => 'access-token');
    const signal = new AbortController().signal;
    await api.getGladiator('org/a', 'station/b', 'TEMPERATURE', 48, 15, signal);
    await api.getGladiator('org/a', 'station/b', 'TEMPERATURE', 48, 15, signal);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://example.test/api/v1/organizations/org%2Fa/stations/station%2Fb/gladiator?metric=TEMPERATURE&hoursFrom0Time=48&days=15');
    assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer access-token');
    assert.equal(calls[0].options.signal, signal);
    assert.equal(calls[0].options.cache, 'no-store');
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(api.getGladiator('org', 'station', 'TEMPERATURE', 24, 7), error => error.status === 503);
  } finally { globalThis.fetch = previous; }
});

test('forecast API forwards cancellation so obsolete weather requests can be stopped', async () => {
  const previous = globalThis.fetch;
  let captured;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    captured = { url, options };
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (options.signal.aborted) abort();
    else options.signal.addEventListener('abort', abort, { once: true });
    started();
  });
  try {
    const api = new BenchmarkApi('https://example.test', async () => 'access-token');
    const controller = new AbortController();
    const pending = api.getStationForecast('org/a', 'station/b', '2026-11-24T00:00:00Z', '2026-11-25T00:00:00Z', controller.signal);
    const rejected = assert.rejects(pending, error => error.name === 'AbortError');
    await ready;
    assert.equal(captured.options.signal, controller.signal);
    assert.equal(captured.options.headers.get('Authorization'), 'Bearer access-token');
    assert.ok(captured.url.startsWith('https://example.test/api/v1/organizations/org%2Fa/stations/station%2Fb/timeseries/forecast?'));
    controller.abort();
    await rejected;
  } finally { globalThis.fetch = previous; }
});

let server, Summary, Controls, ChartInfo;
before(async () => {
  server = await createServer({ root, configFile: false, plugins: [react()], server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] } });
  Summary = (await server.ssrLoadModule('/src/components/GladiatorMetricSummary.tsx')).GladiatorMetricSummary;
  Controls = (await server.ssrLoadModule('/src/components/GladiatorControls.tsx')).GladiatorControls;
  ChartInfo = (await server.ssrLoadModule('/src/components/ChartInfo.tsx')).ChartInfo;
});
after(async () => { await server?.close(); });

test('chart information has an accessible per-metric trigger and keeps explanations out of the closed chart', () => {
  for (const [language, label] of [['en', 'Chart information: Temperature (°C)'], ['es', 'Información del gráfico: Temperature (°C)']]) {
    const html = renderToStaticMarkup(createElement(ChartInfo, { title: 'Temperature (°C)', language },
      createElement('p', null, 'Collecting statistics')));
    assert.ok(html.includes(`aria-label="${label}"`));
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /Collecting statistics|<dialog/);
  }
});

function summary(data, extra = {}) {
  return renderToStaticMarkup(createElement(Summary, { metric: 'TEMPERATURE', state: { data, loading: false, error: null },
    availableProviders: models, mode: 'all', showAccuracy: false, units: 'METRIC', language: 'en', timeZone: 'UTC', ...extra }));
}

test('accuracy is optional, zero percent is valid, and temperature error units are converted in rendered details', () => {
  assert.doesNotMatch(summary(response()), /<table/);
  const markup = summary(response(), { showAccuracy: true, units: 'IMPERIAL', daily: true });
  assert.match(markup, /3\.6 °F/);
  assert.match(markup, /<td>0%<\/td>/);
  assert.match(markup, /<td>1\.8<\/td>/);
  assert.match(markup, /Rankings evaluate hourly forecasts/);
  assert.match(markup, /2026-11-23/);
  assert.match(markup, /Missing hardware readings are skipped/);
  assert.doesNotMatch(markup, /33\.8|35\.6/);
});

test('rendered default is not a measured winner and absent top-three rankings have an explicit message', () => {
  const html = summary(response({ status: 'PENDING', statisticsAvailable: false, bestForecastBasis: 'DEFAULT',
    bestForecastProvider: 'Benchmark', winnerProvider: null, topProviders: [], rankings: [] }), { mode: 'top3', showAccuracy: true });
  assert.match(html, /Default · Benchmark/);
  assert.match(html, /not a measured winner/);
  assert.match(html, /Top 3 is not available yet/);
  assert.doesNotMatch(html, /Best performing/);
});

test('a single provider with samples receives no winner badge and ties are disclosed', () => {
  assert.doesNotMatch(summary(response({ status: 'SINGLE_PROVIDER', winnerProvider: null,
    bestForecastProvider: null, bestForecastBasis: 'NONE' })), /Best performing|Default ·/);
  assert.match(summary(response({ tiedForBest: true })), /Tied for best/);
});

test('insufficient statistics label the display default without changing accuracy details', () => {
  const html = summary(response({ status: 'INSUFFICIENT_DATA', winnerProvider: null, bestForecastProvider: null,
    bestForecastBasis: 'NONE', rankings: [{ ...score('Benchmark'), rank: null, eligible: false }] }), { showAccuracy: true });
  assert.match(html, /Default · Benchmark/);
  assert.match(html, /not a measured winner/);
  assert.match(html, /<td>1<\/td>/);
  assert.doesNotMatch(html, /Best performing/);
});

test('a measured winner without current forecast points is explained, not replaced by a default', () => {
  const html = summary(response(), { availableProviders: ['Benchmark'] });
  assert.match(html, /preferred model has no forecast/);
  assert.doesNotMatch(html, /Default · Benchmark/);
});

test('errors never render a default or old winner, and unsupported metrics retain forecast visibility', () => {
  const failed = summary(response(), { state: { data: null, loading: false, error: new Error('offline') } });
  assert.match(failed, /Forecasts remain available/);
  assert.doesNotMatch(failed, /Best performing|Default ·/);
  assert.match(summary(null, { metric: 'CLOUD_COVER', mode: 'top3' }), /not available for this metric/);
});

test('all backend statuses render an appropriate explanation', () => {
  for (const status of ['PENDING', 'NO_DATA', 'INSUFFICIENT_DATA', 'INSUFFICIENT_EVENTS', 'INCOMPARABLE', 'SINGLE_PROVIDER', 'PARTIAL', 'READY']) {
    const html = summary(response({ status, bestForecastProvider: null, bestForecastBasis: 'NONE' }));
    assert.match(html, /gladiator-status/);
    assert.doesNotMatch(html, />undefined</);
  }
});

test('rain, daylight and direction details preserve metric-specific diagnostics and null scores', () => {
  const rain = response({ metric: 'PRECIPITATION_QUANTITY', minimumRainEvents: 3, tolerance: 1, rankings: [{ ...score('Benchmark'),
    rainEvents: { eventThresholdMm: 0.1, hits: 0, misses: 0, falseAlarms: 0, correctNegatives: 48,
      criticalSuccessIndex: null, hitRatePercent: null, falseAlarmRatioPercent: null, frequencyBias: null,
      observedWetHours: { sampleCount: 0, mae: null, rmse: null, bias: null, outsideTolerancePercent: null } } }] });
  const html = summary(rain, { metric: 'PRECIPITATION_QUANTITY', showAccuracy: true });
  assert.match(html, /Rain event details/);
  assert.match(html, /Observed wet intervals/);
  assert.match(html, /<td>—<\/td>/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(summary(rain, { metric: 'PRECIPITATION_QUANTITY', showAccuracy: true, units: 'IMPERIAL' }), /0\.004 in/);
  const direction = summary(response({ metric: 'WIND_DIRECTION', minimumWindSpeed: 3 }), { metric: 'WIND_DIRECTION', showAccuracy: true });
  assert.match(direction, /shortest angular error/);
  assert.match(direction, /clockwise angular difference/);
  assert.doesNotMatch(direction, /higher than observations/);
  const sun = summary(response({ metric: 'UV_INDEX', rankings: [{ ...score('Benchmark'), allHours: score('Benchmark') }] }), { metric: 'UV_INDEX', showAccuracy: true });
  assert.match(sun, /daylight samples/);
  assert.match(sun, /All-hour diagnostics/);
});

test('controls and accuracy labels support Spanish and expose accessible selected states', () => {
  const html = renderToStaticMarkup(createElement(Controls, { days: 7, horizon: 24, mode: 'top3',
    language: 'es', onDays() {}, onHorizon() {}, onMode() {} }));
  assert.match(html, /Período de evaluación/);
  assert.doesNotMatch(html, /Mostrar precisión|Ocultar precisión/);
  assert.match(html, /aria-pressed="true">Top 3/);
  assert.match(summary(response(), { language: 'es', showAccuracy: true }), /Fuera de tolerancia/);
});
