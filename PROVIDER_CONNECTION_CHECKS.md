# Provider connection checks

Acuity Agriculture, CIMIS, LI-COR Cloud / HOBO, METER, and Vaisala are now available in Settings → Data providers → Add provider. The backend validates credentials before saving new accounts and before applying credential changes. Rejected or unverified credentials are not saved.

## Required fields

| Provider | Credentials | Station ID for connection test |
| --- | --- | --- |
| Acuity Agriculture | Access token | Not required |
| CIMIS | API key (appKey) | Not required; the check reads one day from a public CIMIS sample station |
| LI-COR Cloud / HOBO | LI-COR Cloud API token | Not required; the check lists devices without sensor data |
| METER / ZENTRA Cloud 1.0 | API token | Logger serial number accessible to the token |
| Vaisala Wx Beacon | API key | Device serial number accessible to the key |

The METER and Vaisala test station is a representative device for verification. Each linked Benchmark station keeps its own vendor station identifier for ingestion. Existing accounts can use a linked station when no test station has been saved. Renaming does not contact the vendor, and leaving credentials blank while editing preserves them.

METER retains the existing Cloud 1.0 v3 integration. Cloud 2.0 v5 support is a separate integration. LI-COR tokens previously stored in apiKey remain supported.

## Deploy

1. Apply the backend changes and deploy through the existing backend pipeline. Its Flyway migration job must apply `V14__provider_connection_station.sql` before the new API pods start. V14 adds nullable `data_providers.verification_station_id` and preserves existing accounts.
2. Deploy the frontend after the backend is healthy. All five providers are added to the account form and hardware assistant selector, including Spanish text and METER/Vaisala test-station inputs.
3. Add or edit an account using valid vendor credentials, then use **Test connection**. Link stations separately in Settings → Stations.

Vaisala ingestion and current conditions now use the documented Wx Beacon XML API, shared with its connection check. Ingestion uses the actual station serial and job window. XML parsing rejects external entities; credential-bearing query parameters are redacted in provider HTTP errors.

## Verification

- 124 backend tests passed across provider validation, account saves/updates, station linking, observation processing, current conditions, assistant access, and ingestion architecture.
- One PostgreSQL migration/repository integration test was skipped because Docker is unavailable. It runs with the rest of the targeted suite when Docker is available.
- Nine frontend tests passed. TypeScript, the Vite production build, and Spanish localization passed.
- Browser checks with mocked API responses passed for all five forms, required device IDs, failed saves, name-only updates, credential rotation, Test connection, and Spanish mobile layout.
- Live vendor accounts were not tested; no vendor credentials were supplied.

Backend targeted checks, using Java 25:

```bash
mvn -Dtest=ProviderConnectionValidatorTest,DefaultDataProviderServiceTest,DefaultStationDataProviderServiceTest,VaisalaXmlTest,VaisalaStrategyTest,DataProviderRepositoryTest,ProviderHistoryParityTest,HardwareAssistantServiceTest,RealtimeProviderClientTest,CurrentConditionsServiceTest,StationObservationsTest,WeatherLinkRealtimeTest,ProviderIngestionArchitectureTest test
```

Frontend:

```bash
pnpm install --frozen-lockfile
pnpm --filter @benchmark/web test:providers
pnpm --filter @benchmark/web test:hardware
pnpm --filter @benchmark/web check:localization
pnpm --filter @benchmark/web build
```

See `DATA_PROVIDER_MANAGEMENT.md` for API behavior, vendor documentation, and the existing role/plan requirements.
