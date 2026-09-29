# Current conditions bar

The Forecast, Burncast, Farmcast, Safecast, and observation screens now show a shared current-conditions
bar for their selected station. It displays temperature, minimum/maximum temperature, humidity,
wind speed/direction, precipitation and precipitation chance.

Deploy the companion backend update first. The API is:
`GET /api/v1/organizations/{organizationId}/stations/{stationId}/current-conditions`.

The bar refreshes every 15 minutes, when the tab becomes visible, and using its own refresh button.
Changing station cancels the old request. Metric/imperial and English/Spanish preferences are honored.
Eight columns wrap to four on tablets and two on phones. Temperature, humidity and wind show the
latest station sample. Min/max temperatures show recorded extrema since local midnight, labeled
“Today — station local time”. Older observations retain their actual timestamps and show a stale
status. Missing readings remain unavailable. Only precipitation chance uses a forecast, explicitly
labeled “IBM forecast”; the UI also rejects non-IBM chance and forecast values for other metrics.
Rainfall accumulation is unchanged and still uses the explicitly labeled past-hour period.

No observation values are fabricated when sources are unavailable. Existing Safecast-specific UV
and heat-index display defaults remain unchanged.

Verified with TypeScript, Vite, localization checks, and a Playwright fixture covering responsive
layout, station switching, unit conversion, Spanish, polling and API failure. Live credentials and
end-to-end deployed backend behavior still need verification in your environment.
