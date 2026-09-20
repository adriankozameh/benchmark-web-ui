export type Plan = 'FREE' | 'PRO' | 'PREMIUM';

export type LocalSession = {
  apiBaseUrl: string;
  localAuthToken: string;
  userId: string;
  organizationId: string;
};

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

export type LocalSignupResponse = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  organizations: Array<{
    organizationId: string;
    name: string;
    type: string;
    role: string;
    plan: Plan;
    subscriptionStatus: string;
    seatLimit: number;
    stationLimit: number;
  }>;
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

export type StationDataProvider = {
  stationId: string;
  providerStationId: string;
  dataProvider: DataProvider;
};

export type ApiErrorPayload = {
  status?: number;
  error?: string;
  message?: string;
  path?: string;
  requestId?: string;
};
