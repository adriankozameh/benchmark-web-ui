export type Plan = 'FREE' | 'PRO' | 'PREMIUM';

export type BillingInterval = 'MONTHLY' | 'ANNUAL';
export type BillingSelection = {
  plan: Exclude<Plan, 'FREE'>;
  interval: BillingInterval;
  stationsPurchased: number;
  monthlySeatAddons: number;
  annualSeatAddons: number;
};
export type BillingPrice = {
  priceId: string;
  kind: 'PLAN' | 'STATION' | 'SEAT';
  plan: Plan | null;
  interval: BillingInterval;
  unitAmount: number;
  currency: string;
};
export type BillingSummary = {
  plan: Plan;
  status: string;
  selection: BillingSelection | null;
  seatsPurchased: number;
  stationsPurchased: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPayment: boolean;
  paymentUrl: string | null;
  pendingAnnualTransition: {
    id: string;
    status: 'AWAITING_PAYMENT' | 'PAID' | 'SCHEDULED';
    startsAt: string;
    endsAt: string;
    amount: number;
    currency: string;
    sessionUrl: string | null;
  } | null;
  prices: BillingPrice[];
  /** Scheduled moves of existing items to changed prices, applied at renewal. */
  priceChanges?: BillingPriceChange[];
  /** Where renewals are charged; brand and last4 are set for cards. */
  paymentMethod?: { type: string; brand: string | null; last4: string | null } | null;
};
export type BillingPriceChange = {
  id: string;
  itemId: string;
  from: BillingPrice;
  to: BillingPrice;
  quantity: number;
  effectiveAt: string;
  status: 'SCHEDULED';
};
export type BillingQuote = {
  id: string;
  selection: BillingSelection;
  mode: 'IMMEDIATE' | 'ANNUAL_PREPAYMENT';
  amountDue: number;
  currency: string;
  effectiveAt: string;
  expiresAt: string;
  lines: { description: string; amount: number; currency: string; periodStart: string | null; periodEnd: string | null }[];
  /** Recurring charges after the change, per interval; renewsAt is null for a first item of that interval. */
  renewals: { interval: BillingInterval; amount: number; currency: string; renewsAt: string | null }[];
};
export type BillingChangeResult = {
  status: 'COMPLETE' | 'AWAITING_PAYMENT' | 'SCHEDULED';
  actionUrl: string | null;
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
export type ForecastProduct = 'burncast' | 'safecast' | 'farmcast';
export type ForecastProductSources = {
  points: Array<{ utcDateTime: string; sources: Record<string, string> }>;
};
export type ForecastProductsResponse = {
  expiresAt?: string;
  cacheVersion?: string;
  settings?: FarmcastSettings;
  season?: { growingDegreeDays: FarmcastSeasonTotal | null; chillingHours: FarmcastSeasonTotal | null; timeStandard: string };
  forecast: { from: string; to: string; timeZone: string; count: number };
  products: {
    hourly?: Array<{ utcDateTime: string; values: Record<string, number> }>;
    daily: Array<{ localDate: string; utcDateTime: string; values: Record<string, number> }>;
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
