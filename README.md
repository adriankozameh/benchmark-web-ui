# Benchmark Web v2 — local onboarding foundation

This is a clean React/Vite starting point for the new Benchmark frontend. The visual language intentionally follows the legacy Benchmark application (navy `#324155`, Benchmark red `#F23535`, compact dashboard controls, Leaflet map behavior) while the application structure and API flow target the new `benchmark-api` model.

## What is implemented

End-to-end local development flow:

1. **Create a local user** through `POST /api/v1/local/signup`.
2. The backend creates the real PostgreSQL user, PERSONAL organization, FREE subscription, entitlements, and default site.
3. Optionally apply a **local-only SUPERADMIN subscription override** to PRO or PREMIUM so provider behavior can be tested without Stripe.
4. **Create a station** with any of three synchronized location methods:
   - search an address;
   - type latitude/longitude;
   - click/drag a pin on the Leaflet map.
5. Backend resolves and stores the station IANA timezone.
6. For PREMIUM, create additional sites for frontend grouping.
7. For PRO/PREMIUM, either:
   - reuse an existing organization DataProvider; or
   - create another provider credential set.
8. Link the provider to the physical station using the station-specific provider identifier.
9. **Verify** all records by reloading from benchmark-api and use the supplied SQL to inspect PostgreSQL directly.

Forecast functionality is deliberately not implemented yet.

## Tech

- React + TypeScript
- Vite (`http://localhost:5173`)
- Leaflet
- OpenStreetMap base tiles
- ArcGIS satellite tiles
- OpenStreetMap Nominatim for local-development address lookup

Nominatim is fine for this low-volume development flow. Before production, route geocoding through a supported commercial/self-hosted geocoder rather than depending on the public endpoint from the browser.

## 1. Start benchmark-api

The backend local profile already allows Vite at `http://localhost:5173`.

```bash
export DB_USERNAME=benchmark
export DB_PASSWORD=benchmark-local-password
export INFLUXDB_TOKEN=benchmark-local-token

export LOCAL_AUTH_ENABLED=true
export LOCAL_AUTH_TOKEN='replace-with-a-long-random-development-secret'

mvn spring-boot:run -Dspring-boot.run.profiles=local
```

Verify:

```bash
curl http://localhost:8080/actuator/health
```

## 2. Start this frontend

```bash
cp .env.example .env
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The first screen asks for the same `LOCAL_AUTH_TOKEN` exported for the API.

## Local authentication flow

The signup request sends only:

```http
X-Local-Auth-Token: <LOCAL_AUTH_TOKEN>
```

so the request executes as the bootstrapped local SUPERADMIN.

After signup returns the new PostgreSQL `userId`, normal application requests send:

```http
X-Local-Auth-Token: <LOCAL_AUTH_TOKEN>
X-Local-User-Id: <new user UUID>
```

This exercises normal organization membership and entitlement checks as the real test user.

The token and test user identifiers are stored in browser localStorage for convenience. This is intentionally development-only behavior.

## Plan testing

Every new user is correctly created as FREE by the backend.

For this local frontend only, the account screen can immediately call the existing SUPERADMIN subscription override endpoint to simulate:

```text
FREE     → 1 station
PRO      → 1 station + observations
PREMIUM  → selected station limit + multiple sites + observations
```

Stripe remains the production billing source of truth.

## PostgreSQL verification

The final wizard screen generates SQL using the actual returned IDs. Equivalent manual queries are:

```sql
SELECT * FROM users ORDER BY created_at DESC;
SELECT * FROM organizations ORDER BY created_at DESC;
SELECT * FROM organization_memberships ORDER BY created_at DESC;
SELECT * FROM subscriptions ORDER BY created_at DESC;
SELECT * FROM sites ORDER BY created_at DESC;
SELECT * FROM weather_stations ORDER BY created_at DESC;
SELECT id, organization_id, name, provider, region FROM data_providers ORDER BY created_at DESC;
```

Important relationship checks:

```sql
SELECT
    s.name AS station_name,
    s.latitude,
    s.longitude,
    s.time_zone,
    s.provider_station_id,
    dp.name AS data_provider_name,
    dp.provider
FROM weather_stations s
LEFT JOIN data_providers dp ON dp.id = s.data_provider_id
ORDER BY s.created_at DESC;
```

Provider secret columns intentionally are not rendered by the frontend API responses.

## Expected test path

For the most complete first test, choose **PRO** on the account screen:

1. Create user.
2. Confirm the default site is loaded.
3. Search an address or click the map.
4. Create one station.
5. Confirm a timezone is returned.
6. Create a WeatherLink provider.
7. Enter a provider station ID and link it.
8. Use the Verify step and PostgreSQL SQL.

Then repeat with **PREMIUM** to validate multiple sites and higher station capacity.
