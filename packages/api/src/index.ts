import type {
  ApiErrorPayload,
  CreateStationInput,
  CurrentUser,
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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  expectNoContent?: boolean;
};

export class BenchmarkApi {
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

  listSites(organizationId: string): Promise<Site[]> {
    return this.request(`/api/v1/organizations/${organizationId}/sites`);
  }

  listStations(organizationId: string): Promise<WeatherStation[]> {
    return this.request(`/api/v1/organizations/${organizationId}/stations`);
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

  createStation(organizationId: string, input: CreateStationInput): Promise<WeatherStation> {
    return this.request(`/api/v1/organizations/${organizationId}/stations`, {
      method: 'POST',
      body: input,
    });
  }
}
