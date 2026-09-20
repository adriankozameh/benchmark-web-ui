import type {
  ApiErrorPayload,
  CurrentUser,
  DataProvider,
  LocalSession,
  LocalSignupResponse,
  Plan,
  Site,
  StationDataProvider,
  WeatherStation,
} from '../types';

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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  localAuthToken?: string;
  userId?: string | null;
  expectNoContent?: boolean;
};

export class BenchmarkApi {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers({ Accept: 'application/json' });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.localAuthToken) headers.set('X-Local-Auth-Token', options.localAuthToken);
    if (options.userId) headers.set('X-Local-User-Id', options.userId);

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
        // Keep the HTTP status as the fallback error context.
      }
      const message = payload?.message || payload?.error || `${response.status} ${response.statusText}`;
      throw new BenchmarkApiError(response.status, message, payload);
    }

    if (options.expectNoContent || response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async health(): Promise<{ status: string }> {
    return this.request('/actuator/health');
  }

  async signupLocal(input: {
    localAuthToken: string;
    identitySubject: string;
    username: string;
    email: string;
    displayName: string;
  }): Promise<LocalSignupResponse> {
    return this.request('/api/v1/local/signup', {
      method: 'POST',
      localAuthToken: input.localAuthToken,
      body: {
        identitySubject: input.identitySubject,
        username: input.username,
        email: input.email,
        displayName: input.displayName,
      },
    });
  }

  async overrideSubscription(input: {
    localAuthToken: string;
    organizationId: string;
    plan: Plan;
    seatLimit: number;
    stationLimit: number;
  }): Promise<unknown> {
    return this.request(`/api/v1/admin/organizations/${input.organizationId}/subscription`, {
      method: 'PUT',
      localAuthToken: input.localAuthToken,
      body: {
        plan: input.plan,
        seatLimit: input.seatLimit,
        stationLimit: input.stationLimit,
        reason: 'Local frontend onboarding test',
      },
    });
  }

  async getMe(session: LocalSession): Promise<CurrentUser> {
    return this.request('/api/v1/me', this.userAuth(session));
  }

  async listSites(session: LocalSession): Promise<Site[]> {
    return this.request(`/api/v1/organizations/${session.organizationId}/sites`, this.userAuth(session));
  }

  async createSite(session: LocalSession, name: string): Promise<Site> {
    return this.request(`/api/v1/organizations/${session.organizationId}/sites`, {
      ...this.userAuth(session),
      method: 'POST',
      body: { name },
    });
  }

  async listStations(session: LocalSession): Promise<WeatherStation[]> {
    return this.request(`/api/v1/organizations/${session.organizationId}/stations`, this.userAuth(session));
  }

  async createStation(
    session: LocalSession,
    input: {
      siteId?: string | null;
      name: string;
      latitude: number;
      longitude: number;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<WeatherStation> {
    return this.request(`/api/v1/organizations/${session.organizationId}/stations`, {
      ...this.userAuth(session),
      method: 'POST',
      body: input,
    });
  }

  async listDataProviders(session: LocalSession): Promise<DataProvider[]> {
    return this.request(
      `/api/v1/organizations/${session.organizationId}/data-providers`,
      this.userAuth(session),
    );
  }

  async createDataProvider(
    session: LocalSession,
    input: {
      name: string;
      provider: string;
      apiKey?: string;
      apiKeySecret?: string;
      username?: string;
      password?: string;
      token?: string;
      region?: string;
    },
  ): Promise<DataProvider> {
    return this.request(`/api/v1/organizations/${session.organizationId}/data-providers`, {
      ...this.userAuth(session),
      method: 'POST',
      body: input,
    });
  }

  async linkStationDataProvider(
    session: LocalSession,
    stationId: string,
    dataProviderId: string,
    providerStationId: string,
  ): Promise<StationDataProvider> {
    return this.request(
      `/api/v1/organizations/${session.organizationId}/stations/${stationId}/data-provider`,
      {
        ...this.userAuth(session),
        method: 'PUT',
        body: { dataProviderId, providerStationId },
      },
    );
  }

  async getStationDataProvider(
    session: LocalSession,
    stationId: string,
  ): Promise<StationDataProvider | null> {
    try {
      return await this.request(
        `/api/v1/organizations/${session.organizationId}/stations/${stationId}/data-provider`,
        this.userAuth(session),
      );
    } catch (error) {
      if (error instanceof BenchmarkApiError && error.status === 404) return null;
      throw error;
    }
  }

  private userAuth(session: LocalSession): RequestOptions {
    return {
      localAuthToken: session.localAuthToken,
      userId: session.userId,
    };
  }
}
