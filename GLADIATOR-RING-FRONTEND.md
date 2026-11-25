# Gladiator Ring frontend

The Forecast dashboard now uses the station Gladiator endpoint to annotate the
existing latest forecast charts. It adds no browser access to InfluxDB and does
not calculate rankings from raw forecast/observation data.

## Apply and verify

Install the original `benchmark-web-ui-gladiator-ring.patch` first. Apply the
incremental `benchmark-web-ui-gladiator-display-bars.patch` from the frontend
repository root to add the collapsible controls, stronger preferred lines and
precipitation bars. Then apply the incremental
`benchmark-web-ui-chart-information.patch` to move chart explanations into
per-metric information dialogs:

```bash
git apply --check ~/Downloads/benchmark-web-ui-gladiator-display-bars.patch
git apply ~/Downloads/benchmark-web-ui-gladiator-display-bars.patch
git apply --check ~/Downloads/benchmark-web-ui-chart-information.patch
git apply ~/Downloads/benchmark-web-ui-chart-information.patch
pnpm install --frozen-lockfile
pnpm typecheck
pnpm --filter @benchmark/web test:gladiator
pnpm --filter @benchmark/web test:forecast-daily
pnpm --filter @benchmark/web test:forecast-bars
pnpm --filter @benchmark/web check:localization
pnpm build
```

The patch adds no dependencies and does not change the lockfile. Use the existing
frontend deployment process after verification. The deployed backend must include
the complete Gladiator backend patch and have Gladiator enabled. It must expose:

```http
GET /api/v1/organizations/{organizationId}/stations/{stationId}/gladiator?metric=TEMPERATURE&hoursFrom0Time=24&days=7
```

The existing Cognito access token authorizes these requests. The frontend respects
the endpoint's `no-store` contract. A disabled/unavailable endpoint shows an
accuracy error in the chart information dialog while retaining the forecast charts.

## Controls

- **Show/Hide Gladiator Ring:** remembers panel visibility in this browser. Hiding
  resets the ranking horizon/window to 24 hours and 7 completed days. Reopening
  starts with those same default options; provider visibility and Top 3 stay active. Statistics continue loading while the panel is hidden.
- **Evaluation period:** 7, 15 or 30 completed UTC days; default 7.
- **Forecast lead time:** 24, 48, 120, 240 or 336 hours; default 24.
- **All providers / Top 3:** controls the providers shown independently per metric.
- **Chart information (i):** opens all status/default/winner details, accuracy
  tables, source information, legends and explanations for that metric. The
  separate Show accuracy button is replaced by this per-chart control.

The existing forecast period selects the future data on the chart. Gladiator's
filters select past performance used to annotate those current forecast lines;
they do not replace the lines with sparse historical archive points.

The preferred provider keeps its stronger line, including daily minimum/maximum
bounds. This incremental patch preserves any manual line-width adjustment.
Existing provider colors, visibility chips, gaps, wind arrows and local-time
labels are retained. The backend converts `IBM_GRAF` to **Benchmark** at the
HTTP response boundary for both forecasts and Gladiator. The frontend uses
`Benchmark` directly for matching defaults, winners, rankings, visibility and
Top 3. Current conditions and product-source tables also display backend provider
names directly. The frontend performs no IBM provider-name conversion.

Apply `quantbuddy-gladiator-backend-provider-branding.patch` in the backend and
`benchmark-web-ui-gladiator-backend-branding.patch` in the frontend. This frontend
patch follows the IBM default-priority patch and does not require the previous
`benchmark-web-ui-gladiator-provider-branding.patch`. Deploy the backend first,
then rebuild/deploy the frontend so both endpoints return the same provider names.
Provider enum values, stored InfluxDB tags, cached DTOs and scoring remain internal
and unchanged. The distinct `BENCHMARK` provider enum is preserved.

## Clean chart cards

Each chart shows its metric, units, station time zone, data plot and selected
numeric readings. Status badges, fallback explanations, wind/bar conventions,
daily range legends, partial-day coverage and hover instructions now live in
its **i** dialog. Every dialog includes the full accuracy tables when available,
including the separate wind-direction analysis on wind-speed charts.

Headers use one fixed-height row and plots retain a consistent aspect ratio.
The selected timestamp and provider values use a fixed-height, scrollable area
below the plot; empty charts keep the same plot frame. Long titles are truncated
visually, with the full title available in the title tooltip and information
dialog. Information content never changes the card's height.

The native modal dialog supports keyboard focus containment, Escape, a close
button and clicking outside the box. Closing restores focus to the information
button. Its contents scroll independently on narrow screens, including wide
accuracy tables. English and Spanish labels are supported. Opening or closing
information makes no additional API requests and does not change rankings,
provider visibility, chart type or comparison filters.

## Selection and missing data

The frontend uses the backend's measured winner. For a successful
`INSUFFICIENT_DATA` or `INSUFFICIENT_EVENTS` response with no winner, it now selects
an available Benchmark/NOAA_GFS display default, as requested. This display choice
does not change the API's statistical result, errors or ranks:

| Response | Display |
| --- | --- |
| Measured winner | Thicker line; **Best performing** badge and ties in information |
| No statistics and a backend default | Thicker available line; **Default** badge in information |
| Insufficient samples or rain events | Highlight available Benchmark, then NOAA_GFS, labelled **Default** |
| Single provider with samples | Show its accuracy, with no competitive-winner badge |
| Failed/cancelled request | No inferred default or stale winner; retain forecast lines |

When no statistics exist, the backend prefers available IBM_GRAF forecasts (returned as `Benchmark`) for the
metric, then NOAA_GFS. A default never becomes a fabricated ranking, error score or
top-three result. If a default provider has no data in the current chart window,
use the available Benchmark/NOAA_GFS alternative. A measured winner missing from
the current view is explained without replacing it with a default. Hiding a
provider manually does not promote another model into its place.

Top 3 uses `topProviders`, capped at three, intersected with current forecast
availability and the user's provider visibility. Hiding a ranked provider does
not promote a fourth provider. Empty rankings preserve the normal selected
forecast lines and explain why Top 3 is unavailable. Fewer than three evaluated
providers show fewer lines. The backend's default panel currently has IBM_GRAF
and NOAA_GFS, with some metrics evaluated individually; the UI can consume more
providers when the backend adds them.

Supported accuracy metrics match the backend contract: temperature, humidity,
wind speed/gust/direction, precipitation amount, pressure, solar radiation, UV
and evapotranspiration. Other forecast metrics continue displaying normally and
are explained as not evaluated in the information dialog. No statistics
request is sent for those unsupported metrics. Their available Benchmark/NOAA_GFS
series can still receive a **Default** display preference; no competitive ranking
is invented.

Hardware-linked stations display hardware-only scoring; missing readings are
skipped. Other stations can display their NOAA reference source. Both station
types use the same frontend flow, without a hardware gate. The backend remains
responsible for source selection and metric comparability.

## Precipitation charts

`PRECIPITATION_QUANTITY` and `PRECIPITATION_CHANCE` render as grouped bars in the
shared chart renderer, including hourly/daily forecasts and observed rainfall.
Providers occupy consistent side-by-side positions at each timestamp. The
preferred provider's bars use a stronger outline and full opacity. Existing
provider colors and visibility/Top 3 controls still apply.

Precipitation chance uses a 0-100% scale. Zero is a real zero-height bar; missing
or invalid readings stay absent. Bar groups remain inside the plot boundaries,
and the hover values use the same original timestamps and values. Daily rain
still uses the existing total calculation, while daily chance uses its maximum.
No missing hours are filled or provider rainfall definitions changed by this
rendering update.

## Accuracy details

The information dialog tables display MAE, RMSE, signed bias, rank, sample coverage and
`outsideTolerancePercent`. The percentage means matched predictions exceeding
the metric's absolute-error tolerance, not MAPE. For example, 20% outside 2°C
means one fifth of matched predictions missed by more than 2°C.

Errors and tolerance are converted as differences: a 2°C error becomes 3.6°F,
without adding 32. Humidity errors are in percentage points, not relative percent.
Zero scores remain zero; unavailable scores are shown as a dash. The UI uses
additional precision for imperial rainfall/ET values so a 0.1 mm rain-event
threshold remains visible as approximately 0.004 inches.

Rain tables expose event counts, CSI, hit rate, false-alarm ratio, frequency bias
and observed-wet diagnostics. Solar/UV tables separate primary daylight scores
from all-hour diagnostics. Direction errors and the minimum observed-speed
threshold are explained separately in the wind-speed information dialog when arrows replace
a standalone direction chart. Measurement definitions remain available in an
expandable table, including unavailable/incompatible definitions.

Daily charts retain the same hourly evaluation result and explicitly disclose
this; they do not claim that daily extremes/totals have separately been scored.
Evaluation dates use completed UTC days, while the last-calculated timestamp and
chart axes use the station's time zone.

## Requests and refresh

Forecasts and current conditions start in parallel and render independently as
each response arrives. Gladiator waits until both requests for the current station
have settled and forecast data is available. A failed current-conditions request
does not block statistics indefinitely; its existing error remains visible.

While weather data reloads, pending Gladiator requests are cancelled and queued
metrics pause. Afterwards only unfinished metrics resume; completed results for
the same station, source, API client and evaluation filters are retained. Changing
station, location/source or filters invalidates the relevant old results. Obsolete
forecast requests now receive an abort signal too.

The hook requests one selected horizon/window for supported metrics present in
the loaded forecast. It deduplicates metrics, debounces selection changes by
200 ms and allows at most three concurrent requests per batch. Changing station,
location/source revision or filters immediately removes old winners; cancellation
and response-identity checks prevent late results from repainting another view.
403/429 responses stop remaining queued requests. A 401 uses the existing
session-expiration flow.

Changing Top 3, provider visibility, opening/closing chart information, units or
language does not itself request statistics again. Current-condition refreshes and
forecast range/aggregation changes reuse completed statistics when the evaluation
selection is unchanged. Comparison filters, the forecast Refresh button and the
hour-boundary refresh retrieve current results. No background scoring job is
triggered by the frontend.

Apply `benchmark-web-ui-weather-first-loading.patch` after the latest backend
branding frontend patch, then rebuild/deploy the frontend. Backend deployment is
not required for this scheduling change. In browser network checks, neither a
slow forecast response nor a slow current-conditions response should overlap with
the start of a new Gladiator batch. Forecast charts remain usable while statistics
load later.

## Checks

`test:gladiator` covers per-metric selection, default/eligibility rules, filtering,
units, tenant/location/filter identity, request concurrency, cancellation, API
authentication/no-store behavior, rendered accuracy states, metric diagnostics and
Spanish labels and accessible information triggers. `test:forecast-bars` checks precipitation validation and grouped
bar geometry, including gaps, boundaries, zero values, sparse samples and long
provider lists. Existing forecast aggregation/cache tests remain applicable.

The chart's new annotation/highlight props are optional; observation and product
dashboards continue using the shared renderer without Gladiator annotations.
