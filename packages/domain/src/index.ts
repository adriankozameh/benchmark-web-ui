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
};

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
