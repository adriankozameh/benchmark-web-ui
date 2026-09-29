import type {
  ApiErrorPayload,
  CurrentConditions,
  ForecastProductsResponse,
  ForecastProduct,
  ForecastProductSources,
  FarmcastSettings,
  ProviderConnectionResult,
  ObservationBackfillResponse,
  DailyStationObservations,
  OrganizationInvitation,
  OrganizationMember,
  CreatedOrganizationInvitation,
  CreateStationInput,
  CurrentUser,
  CreateDataProviderInput,
  DataProvider,
  ProviderDeletionPreview,
  UpdateDataProviderInput,
  UpdateStationInput,
  UserSettings,
  Site,
  StationTimeSeries,
  WeatherStation,
} from '@benchmark/domain';

export class BenchmarkApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload | null;

  constructor(status: number, message: string, payload: ApiErrorPayload | null) {
    super(message);
    this.name = 'BenchmarkApiError';
    this.status = status;
    this.payload = payload;
  }
}

type AccessTokenProvider = () => Promise<string | null>;

type RequestOptions = {
  signal?: AbortSignal;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  expectNoContent?: boolean;
};

export class BenchmarkApi {
  private readonly forecastResponses = new Map<string, { data: ForecastProductsResponse; checkedAt: number }>();
  private readonly forecastRequests = new Map<string, Promise<ForecastProductsResponse>>();
  private forecastCacheRevision = 0;

  clearForecastCache(): void {
    this.forecastCacheRevision++;
    this.forecastResponses.clear();
    this.forecastRequests.clear();
  }

  private forecastKey(organizationId: string, stationId: string, days: number, product: string, stationVersion: string): string {
    return JSON.stringify([organizationId, stationId, days, product, stationVersion]);
  }

  getCachedForecastProducts(organizationId: string, stationId: string, days: number,
    product: ForecastProduct, stationVersion = ''): ForecastProductsResponse | null {
    const key = this.forecastKey(organizationId, stationId, days, product, stationVersion);
    const entry = this.forecastResponses.get(key);
    if (!entry) return null;
    if (Date.parse(entry.data.expiresAt ?? '') <= Date.now() || !entry.data.expiresAt) {
      this.forecastResponses.delete(key);
      return null;
    }
    return entry.data;
  }

  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: AccessTokenProvider,
  ) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) throw new BenchmarkApiError(401, 'You are not signed in.', null);

    const headers = new Headers({
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    });

    if (options.body !== undefined) headers.set('Content-Type', 'application/json');

    const response = await fetch(`${this.baseUrl}${path}`, {
      signal: options.signal,
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      let payload: ApiErrorPayload | null = null;
      try {
        payload = (await response.json()) as ApiErrorPayload;
      } catch {
        // Keep HTTP status/statusText as fallback context.
      }
      const message = payload?.message || payload?.error || `${response.status} ${response.statusText}`;
      throw new BenchmarkApiError(response.status, message, payload);
    }

    if (options.expectNoContent || response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  getMe(): Promise<CurrentUser> {
    return this.request('/api/v1/me');
  }

  listMembers(organizationId: string, signal?: AbortSignal): Promise<OrganizationMember[]> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members`, { signal });
  }

  updateMemberRole(organizationId: string, userId: string, role: 'ADMIN' | 'MEMBER'): Promise<OrganizationMember> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      { method: 'PUT', body: { role } });
  }

  removeMember(organizationId: string, userId: string, signal?: AbortSignal): Promise<void> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE', expectNoContent: true, signal });
  }

  listInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/invitations`);
  }

  inviteUser(organizationId: string, email: string, role: 'MEMBER' | 'ADMIN'): Promise<CreatedOrganizationInvitation> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/invitations`,
      { method: 'POST', body: { email, role } });
  }

  resendInvitation(organizationId: string, invitationId: string): Promise<CreatedOrganizationInvitation> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/invitations/${encodeURIComponent(invitationId)}/resend`, { method: 'POST' });
  }

  revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE', expectNoContent: true });
  }

  acceptInvitation(token: string): Promise<unknown> {
    return this.request('/api/v1/invitations/accept', { method: 'POST', body: { token } });
  }

  getUserSettings(): Promise<UserSettings> {
    return this.request('/api/v1/me/settings');
  }

  updateUserSettings(metadata: Partial<Pick<UserSettings['metadata'], 'language' | 'units'>>): Promise<UserSettings> {
    return this.request('/api/v1/me/settings', { method: 'PATCH', body: { metadata } });
  }

  listSites(organizationId: string): Promise<Site[]> {
    return this.request(`/api/v1/organizations/${organizationId}/sites`);
  }

  listStations(organizationId: string): Promise<WeatherStation[]> {
    return this.request(`/api/v1/organizations/${organizationId}/stations`);
  }

  async saveForecastSettings(organizationId: string, stationId: string, settings: FarmcastSettings): Promise<FarmcastSettings> {
    const result = await this.request<FarmcastSettings>(`/api/v1/organizations/${encodeURIComponent(organizationId)}/stations/${encodeURIComponent(stationId)}/forecast-settings`, {
      method: 'PUT', body: settings,
    });
    this.clearForecastCache();
    return result;
  }

  getCurrentConditions(organizationId: string, stationId: string, signal?: AbortSignal): Promise<CurrentConditions> {
    return this.request(`/api/v1/organizations/${organizationId}/stations/${stationId}/current-conditions`, { signal });
  }

  getForecastProducts(organizationId: string, stationId: string, days: number,
    product: ForecastProduct, stationVersion = '', refresh = false): Promise<ForecastProductsResponse> {
    const key = this.forecastKey(organizationId, stationId, days, product, stationVersion);
    const cached = this.getCachedForecastProducts(organizationId, stationId, days, product, stationVersion);
    const entry = this.forecastResponses.get(key);
    // Brief reuse avoids repeat navigation requests; revalidate against the shared server cache
    // after a minute so an ingestion completing mid-hour becomes visible.
    const maxAge = cached?.notices.includes('ENRICHMENT_PENDING') ? 5_000 : 60_000;
    if (!refresh && cached && entry && Date.now() - entry.checkedAt < maxAge) return Promise.resolve(cached);
    const pending = this.forecastRequests.get(key);
    if (pending) return pending;
    const revision = this.forecastCacheRevision;
    const path = `/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/stations/${encodeURIComponent(stationId)}/timeseries/forecast/products`;
    const request = this.request<ForecastProductsResponse>(`${path}?${new URLSearchParams({ days: String(days), product })}`)
      .then(data => {
        const previous = this.forecastResponses.get(key)?.data;
        const response = previous?.cacheVersion && previous.cacheVersion === data.cacheVersion ? previous : data;
        if (revision === this.forecastCacheRevision) {
          this.forecastResponses.delete(key);
          this.forecastResponses.set(key, { data: response, checkedAt: Date.now() });
          while (this.forecastResponses.size > 24) this.forecastResponses.delete(this.forecastResponses.keys().next().value!);
        }
        return response;
      }).catch(error => {
        if (error instanceof BenchmarkApiError && (error.status === 401 || error.status === 403)) this.clearForecastCache();
        throw error;
      }).finally(() => { if (this.forecastRequests.get(key) === request) this.forecastRequests.delete(key); });
    this.forecastRequests.set(key, request);
    return request;
  }

  getForecastProductSources(organizationId: string, stationId: string, days: number,
    product: ForecastProduct, signal?: AbortSignal): Promise<ForecastProductSources> {
    const path = `/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/stations/${encodeURIComponent(stationId)}/timeseries/forecast/products/sources`;
    return this.request(`${path}?${new URLSearchParams({ days: String(days), product })}`, { signal });
  }

  getStationForecast(
    organizationId: string,
    stationId: string,
    from: string,
    to: string,
  ): Promise<StationTimeSeries> {
    const path = `/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/stations/${encodeURIComponent(stationId)}/timeseries/forecast`;
    const params = new URLSearchParams({ from, to });
    return this.request(`${path}?${params}`);
  }

  getStationObservations(
    organizationId: string,
    stationId: string,
    from: string,
    to: string,
  ): Promise<StationTimeSeries> {
    const path = `/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/stations/${encodeURIComponent(stationId)}/timeseries/observations`;
    return this.request(`${path}?${new URLSearchParams({ from, to })}`);
  }

  getDailyStationObservations(
    organizationId: string,
    stationId: string,
    from: string,
    to: string,
  ): Promise<DailyStationObservations> {
    const path = `/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/stations/${encodeURIComponent(stationId)}/timeseries/observations/daily`;
    return this.request(`${path}?${new URLSearchParams({ from, to })}`);
  }

  requestObservationBackfill(
    organizationId: string,
    stationId: string,
    from: string,
    to: string,
  ): Promise<ObservationBackfillResponse> {
    return this.request(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/stations/${encodeURIComponent(stationId)}/observations/backfill`,
      { method: 'POST', body: { from, to } },
    );
  }

  testDataProvider(organizationId: string, dataProviderId: string): Promise<ProviderConnectionResult> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}` +
      `/data-providers/${encodeURIComponent(dataProviderId)}/test-connection`, { method: 'POST' });
  }

  createStation(organizationId: string, input: CreateStationInput): Promise<WeatherStation> {
    return this.request(`/api/v1/organizations/${organizationId}/stations`, {
      method: 'POST',
      body: input,
    });
  }

  deleteStation(organizationId: string, stationId: string): Promise<void> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/stations/${encodeURIComponent(stationId)}`, {
      method: 'DELETE', expectNoContent: true,
    });
  }

  updateStation(organizationId: string, stationId: string, input: UpdateStationInput): Promise<WeatherStation> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/stations/${encodeURIComponent(stationId)}`, {
      method: 'PATCH', body: input,
    });
  }

  listDataProviders(organizationId: string): Promise<DataProvider[]> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/data-providers`);
  }

  createDataProvider(organizationId: string, input: CreateDataProviderInput): Promise<DataProvider> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/data-providers`, {
      method: 'POST', body: input,
    });
  }

  updateDataProvider(organizationId: string, providerId: string, input: UpdateDataProviderInput): Promise<DataProvider> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/data-providers/${encodeURIComponent(providerId)}`, {
      method: 'PATCH', body: input,
    });
  }

  previewDataProviderDeletion(organizationId: string, providerId: string): Promise<ProviderDeletionPreview> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/data-providers/${encodeURIComponent(providerId)}/deletion-preview`);
  }

  deleteDataProvider(organizationId: string, providerId: string, confirmedStationIds: string[]): Promise<void> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/data-providers/${encodeURIComponent(providerId)}`, {
      method: 'DELETE', body: { confirmedStationIds }, expectNoContent: true,
    });
  }

  linkStationDataProvider(organizationId: string, stationId: string, dataProviderId: string, providerStationId: string): Promise<void> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/stations/${encodeURIComponent(stationId)}/data-provider`, {
      method: 'PUT', body: { dataProviderId, providerStationId },
    });
  }

  unlinkStationDataProvider(organizationId: string, stationId: string): Promise<void> {
    return this.request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/stations/${encodeURIComponent(stationId)}/data-provider`, {
      method: 'DELETE', expectNoContent: true,
    });
  }
}
