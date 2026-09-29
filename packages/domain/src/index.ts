export type Plan = 'FREE' | 'PRO' | 'PREMIUM';

export type OrganizationSummary = {
  id: string;
  name: string;
  type: string;
  role: string;
  organizationStatus: string;
  organizationStatusReason?: string | null;
  organizationStatusChangedAt?: string | null;
  plan: Plan;
  subscriptionStatus: string;
  seatsPurchased: number;
  stationsPurchased: number;
  seatLimit: number;
  stationLimit: number;
  subscriptionOverrideActive: boolean;
};

export type CurrentUser = {
  id: string;
  username: string | null;
  email: string;
  displayName: string | null;
  organizations: OrganizationSummary[];
};

export type OrganizationInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: 'MEMBER' | 'ADMIN';
  status: string;
  expiresAt: string;
  createdAt: string;
  deliveryStatus: string;
  deliveryAttemptedAt: string | null;
};

export type CreatedOrganizationInvitation = {
  invitation: OrganizationInvitation;
  localPreviewUrl: string | null;
};

export type DisplayUnits = 'METRIC' | 'IMPERIAL';
export type UserLanguage = 'en' | 'es';
export type UserSettings = {
  userId: string;
  metadata: { language: UserLanguage; units: DisplayUnits; [key: string]: unknown };
};

export type Site = {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type WeatherStation = {
  id: string;
  organizationId: string;
  siteId: string;
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  dataProviderId: string | null;
  provider: string | null;
  providerStationId: string | null;
  metadata: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  locationRevision?: string | null;
};

export interface ProviderDeletionPreview {
  providerId: string;
  providerName: string;
  stations: { id: string; name: string }[];
}

export type DataProvider = {
  id: string;
  organizationId: string;
  name: string;
  provider: string;
  region: string | null;
  apiKeyConfigured: boolean;
  apiKeySecretConfigured: boolean;
  usernameConfigured: boolean;
  passwordConfigured: boolean;
  tokenConfigured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderCredentials = {
  apiKey?: string;
  apiKeySecret?: string;
  username?: string;
  password?: string;
  token?: string;
};

export type CreateDataProviderInput = ProviderCredentials & {
  name: string;
  provider: string;
  region?: string;
};

export type UpdateDataProviderInput = ProviderCredentials & {
  name?: string;
  region?: string;
};

export type UpdateStationInput = {
  name?: string;
  siteId?: string;
  latitude?: number;
  longitude?: number;
  metadata?: Record<string, unknown>;
};

export type StationTimeSeriesPoint = {
  utcDateTime: string;
  localDateTime?: string | null;
  provider: string;
  hoursFrom0Time: number | null;
  values: Record<string, number>;
};

export type StationTimeSeries = {
  organizationId: string;
  stationId: string;
  timeZone?: string | null;
  series: string;
  from: string;
  to: string;
  count: number;
  points: StationTimeSeriesPoint[];
};

export type DailyStationObservation = {
  localDate: string;
  utcDateTime: string;
  localDateTime: string;
  provider: string;
  temperatureMax: number | null;
  temperatureMin: number | null;
  relativeHumidityMax: number | null;
  relativeHumidityMin: number | null;
  precipitationTotal: number | null;
  windSpeedMax: number | null;
  windDirectionAtMax: number | null;
};

export type DailyStationObservations = {
  organizationId: string;
  stationId: string;
  timeZone: string;
  from: string;
  to: string;
  count: number;
  days: DailyStationObservation[];
};

export type ObservationBackfillResponse = {
  organizationId: string;
  stationId: string;
  from: string;
  to: string;
  queuedDays: number;
};

export type CreateStationInput = {
  siteId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  metadata?: Record<string, unknown> | null;
};

export type ApiErrorPayload = {
  status?: number;
  error?: string;
  message?: string;
  path?: string;
  requestId?: string;
};

export type ProviderConnectionResult = {
  status: 'CONNECTED' | 'NO_AUTH_REQUIRED' | 'INVALID_CREDENTIALS' | 'FORBIDDEN'
    | 'MISSING_CREDENTIALS' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'INVALID_RESPONSE'
    | 'NOT_SUPPORTED' | 'NOT_CONFIGURED';
  message: string;
  checkedAt: string;
};

export type OrganizationMember = {
  userId: string;
  username: string | null;
  email: string;
  displayName: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
};

export type FarmcastSettings = { gddStartDate: string | null; chillingStartDate: string | null };
export type FarmcastSeasonTotal = { startDate: string; throughDate: string; value: number | null;
  availableSamples: number; expectedSamples: number; complete: boolean };
export type ForecastProductsResponse = {
  settings: FarmcastSettings;
  season: { growingDegreeDays: FarmcastSeasonTotal | null; chillingHours: FarmcastSeasonTotal | null; timeStandard: string };
  forecast: Omit<StationTimeSeries, 'points'> & {
    providerPriority: string[];
    points: Array<Omit<StationTimeSeriesPoint, 'provider' | 'hoursFrom0Time'> & {
      sources: Record<string, { provider: string; hoursFrom0Time: number | null }>;
    }>;
  };
  products: {
    hourly: Array<{ utcDateTime: string; values: Record<string, number> }>;
    daily: Array<{ localDate: string; utcDateTime: string; expectedHours: number;
      availableHours: Record<string, number>; values: Record<string, number> }>;
  };
  notices: string[];
};

/** Values use SI units; each value identifies whether it is measured or forecast. */
export type CurrentConditionReading = {
  value: number;
  source: 'OBSERVED' | 'FORECAST';
  provider: string;
  validAt: string;
  period: 'INSTANT' | 'PAST_HOUR' | 'ROLLING_HOUR' | 'REPORTED_PAST_HOUR' | 'FORECAST_HOUR' | 'LOCAL_DAY';
  periodStart: string | null;
  periodEnd: string | null;
};
export type CurrentConditions = {
  stationId: string;
  timeZone: string;
  fetchedAt: string;
  observationStatus: 'LIVE' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'UNSUPPORTED' | 'INACTIVE' | 'PLAN_REQUIRED';
  metrics: Record<string, CurrentConditionReading>;
};
