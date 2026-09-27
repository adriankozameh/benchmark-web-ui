# Organization data provider management

Deploy the backend first, then the frontend. No Terraform changes or database migration are required.

## Use

1. Sign in as an OWNER or ADMIN of a PREMIUM organization.
2. Open Settings → Data providers → Add provider.
3. Enter an account name, vendor, and credentials. Save provider makes a backend test request before saving. A failed check does not create an account or replace existing credentials.
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
| Vaisala, METER, CIMIS, Acuity, LI-COR / HOBO | Account-level validation is not implemented. Existing accounts remain linkable and can be renamed. Test returns NOT_SUPPORTED. New accounts and credential changes are blocked rather than silently accepted. |

The frontend creation menu exposes the supported vendors and FAWN. An account-level check does not verify a station ID, ingestion enablement, or access to paid historical data. Existing provider ingestion implementations are unchanged. Ambient Weather needs `provider.ambient-weather.application-key` configured on the backend; this is the application's key, not the user's API key.

## API behavior

- Existing POST /api/v1/organizations/{organizationId}/data-providers validates before creation.
- Existing PATCH /api/v1/organizations/{organizationId}/data-providers/{dataProviderId} merges omitted fields with saved credentials and validates changes to connection fields before updating.
- New POST /api/v1/organizations/{organizationId}/data-providers/{dataProviderId}/test-connection tests the saved account. It returns HTTP 200 with `status`, `message`, and `checkedAt`. The operation succeeding does not imply that authentication succeeded: inspect `status`.
- Successful checks use CONNECTED; FAWN uses NO_AUTH_REQUIRED. Other statuses distinguish missing/invalid credentials, denied permissions, rate limits, unavailable providers, malformed responses, missing server configuration, and unsupported validation.
- Failed validation during create/update returns a sanitized HTTP 409 error and does not persist the candidate credentials. Authorization and resource lookup retain normal 403/404 behavior.
- Management validation and test endpoints share limits of 10 requests per user and 30 per organization per minute, through the existing Redis rate limiter.
- Interactive requests have a 5-second connection timeout, 12-second request timeout, no retries, and no redirects. Vendor origins are fixed; organization input cannot select an arbitrary URL.
- API responses contain credential-presence flags, never saved secrets or raw vendor responses. Backend logs include organization/provider IDs, provider type, and result status, without credentials.
- The UI displays the latest test result for the current page session. Results are not stored in a new database table.

## Verification

Frontend: TypeScript check, Vite production build, Spanish localization check, and browser checks with mocked API responses covering success/failure on save, Test connection, credential-preserving edits, role/plan gating, Spanish, mobile navigation, and station linking.

Verification completed: **29 targeted backend tests passed**, with Java 25 and the Mockito agent supplied explicitly in this environment. Production and test sources compiled successfully.

Backend tests are in `ProviderConnectionValidatorTest` and `DefaultDataProviderServiceTest`, alongside existing station-link authorization tests. Run with Java 25:

```bash
mvn -Dtest=ProviderConnectionValidatorTest,DefaultDataProviderServiceTest,DefaultStationDataProviderServiceTest test
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

Zeus and Ranch authentication checks use the login contracts already implemented in this backend.
