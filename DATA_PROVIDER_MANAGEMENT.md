# Organization data provider management

Deploy the backend first so its migration job applies `V14__provider_connection_station.sql`, then deploy the frontend.

## Use

1. Sign in as an OWNER or ADMIN of a PREMIUM organization.
2. Open Settings → Data providers → Add provider.
3. Enter an account name, vendor, and credentials. METER and Vaisala also need **Station ID for connection test**: a logger/device serial accessible with those credentials. Save provider makes a backend test request before saving. A failed check does not create an account or replace existing credentials.
4. Open Settings → Stations, create or select a station, choose the saved provider account, and enter that station's vendor identifier. Newly created stations open their details automatically.
5. Reuse the same provider account on other stations with their own identifiers.
6. Use Test connection on a provider card to check the saved credentials again. Edit permits credential rotation; blank credential fields preserve existing values. Renaming alone does not call the vendor.

Credentials are managed centrally. Station settings only link/unlink accounts and store station identifiers. Provider cards show linked stations. Members have a read-only provider list and cannot create, edit, or test accounts; the backend independently enforces this. FREE/PRO accounts retain the existing PREMIUM requirement.

## Validation coverage

| Provider | Account-level check |
| --- | --- |
| WeatherLink | GET /v2/stations with api-key and X-Api-Secret; stations array required |
| Ambient Weather | GET /v1/devices with user API key and server application key; array required |
| Tempest | GET /swd/rest/stations with token; success status and stations array required |
| SenseCAP Global / China | GET /openapi/list_groups with HTTP Basic credentials; code 0 and data required |
| METOS | GET /v1/user/stations with HMAC; array or documented 204 no-devices response |
| Zeus | Existing vendor login endpoint; nonempty user.token required |
| Ranch System | Existing vendor login endpoint; nonempty X-AUTH-TOKEN required |
| FAWN | Public feed; returns NO_AUTH_REQUIRED, without claiming authentication was tested |
| Acuity Agriculture | GET /api/users/me with Authorization: Token; authenticated profile with id, email and farms required |
| CIMIS | One day of public station data with the customer's appKey; CIMIS station-provider response required |
| LI-COR Cloud / HOBO | GET /v2/devices?includeSensors=false with Bearer token; devices array and total required; tokens saved in apiKey remain supported |
| METER / ZENTRA Cloud 1.0 | GET /api/v3/get_readings/ with Token and the verification logger serial; one record per page; data object required |
| Vaisala Wx Beacon | Documented XML API with API key and verification device serial; one measurement requested; device serial must match, including empty measurement responses |

All fourteen observation provider types are selectable in the provider form and hardware assistant. METER and Vaisala verify one representative device; this does not link that device to a Benchmark station. Other account-level checks do not verify a customer station ID. None of these checks proves that ingestion is enabled or that every station or historical period is accessible. Vaisala ingestion and current conditions use the same documented Wx Beacon XML API as its connection check, with the actual station serial and requested job window; it no longer relies on the previous undocumented JSON endpoint. Ambient Weather needs `provider.ambient-weather.application-key` configured on the backend; this is the application's key, not the user's API key.

## API behavior

- Existing POST /api/v1/organizations/{organizationId}/data-providers validates before creation.
- Existing PATCH /api/v1/organizations/{organizationId}/data-providers/{dataProviderId} merges omitted fields with saved credentials and validates changes to connection fields, including verificationStationId, before updating. Blank credential fields in the UI remain omitted.
- New POST /api/v1/organizations/{organizationId}/data-providers/{dataProviderId}/test-connection tests the saved account. It returns HTTP 200 with `status`, `message`, and `checkedAt`. The operation succeeding does not imply that authentication succeeded: inspect `status`.
- Successful checks use CONNECTED; FAWN uses NO_AUTH_REQUIRED. Other statuses distinguish missing/invalid credentials, denied permissions, rate limits, unavailable providers, malformed responses, missing server configuration, and unsupported validation.
- Failed validation during create/update returns a sanitized HTTP 409 error and does not persist the candidate credentials. Authorization and resource lookup retain normal 403/404 behavior.
- Management validation and test endpoints share limits of 10 requests per user and 30 per organization per minute, through the existing Redis rate limiter.
- Interactive requests have a 5-second connection timeout, 12-second request timeout, no retries, and no redirects. Vendor origins are fixed; organization input cannot select an arbitrary URL.
- API responses contain credential-presence flags, never saved secrets or raw vendor responses. Backend logs include organization/provider IDs, provider type, and result status, without credentials.
- The UI displays the latest test result for the current page session. Results are not stored in a new database table.
- V14 adds nullable data_providers.verification_station_id. Create/update requests accept verificationStationId; provider responses return it without credential values. The per-station ingestion ID remains weather_stations.provider_station_id.
- Existing METER/Vaisala accounts without a verification ID use a linked station serial for testing and credential rotation when available. Otherwise, an Owner/Admin must enter a test station ID. Renaming still works without contacting the vendor.
- METER targets the existing ZENTRA Cloud 1.0 v3 ingestion contract. ZENTRA Cloud 2.0 v5 is a separate integration, not introduced by these checks.

## Verification

Frontend: TypeScript check, Vite production build, Spanish localization check, and browser checks with mocked API responses covering success/failure on save, Test connection, credential-preserving edits, role/plan gating, Spanish, mobile navigation, and station linking.

Targeted tests cover all five added providers, bounded requests and authentication headers, malformed and embedded-error responses, missing credentials/device IDs, XML entity rejection, credential rotation, legacy linked-station fallback, and Vaisala observation writes. The PostgreSQL repository test requires Docker.

Backend tests are in `ProviderConnectionValidatorTest` and `DefaultDataProviderServiceTest`, alongside existing station-link authorization tests. Run with Java 25:

```bash
mvn -Dtest=ProviderConnectionValidatorTest,DefaultDataProviderServiceTest,DefaultStationDataProviderServiceTest,VaisalaXmlTest,VaisalaStrategyTest,DataProviderRepositoryTest test
```

No live vendor credentials were supplied for testing. Verify an actual provider account after deploying the backend and before rolling out the frontend broadly.

## Vendor references

- https://weatherlink.github.io/v2-api/authentication
- https://weatherlink.github.io/v2-api/api-reference
- https://github.com/ambient-weather/api-docs/blob/master/apiary.apib
- https://apidocs.tempestwx.com/reference/get_stations
- https://sensecap-docs.seeed.cc/httpapi_quickstart.html
- https://sensecap-docs.seeed.cc/httpapi_access.html
- https://api.fieldclimate.com/v1/docs/
- https://documenter.getpostman.com/view/13196952/TVYDeKbN
- https://et.water.ca.gov/Rest/Index
- https://api.licor.cloud/v2/docs/
- https://docs.zentracloud.io/l/en/article/gbv2iyxhar-api-v-3-0
- https://www.vaisala.com/sites/default/files/documents/Vaisala-Wx-Beacon-XML-API-Reference-in-English-M212639EN.pdf

Zeus and Ranch authentication checks use the login contracts already implemented in this backend.
