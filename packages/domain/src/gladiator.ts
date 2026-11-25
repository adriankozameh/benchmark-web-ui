export type GladiatorMetric = 'TEMPERATURE' | 'RELATIVE_HUMIDITY' | 'WIND_SPEED' | 'WIND_GUST'
  | 'WIND_DIRECTION' | 'PRECIPITATION_QUANTITY' | 'PRESSURE' | 'SOLAR_RADIATION'
  | 'UV_INDEX' | 'EVAPOTRANSPIRATION';
export type GladiatorHorizon = 24 | 48 | 120 | 240 | 336;
export type GladiatorWindow = 7 | 15 | 30;
export type GladiatorStatus = 'PENDING' | 'NO_DATA' | 'INSUFFICIENT_DATA' | 'INSUFFICIENT_EVENTS'
  | 'INCOMPARABLE' | 'SINGLE_PROVIDER' | 'PARTIAL' | 'READY';

export type GladiatorDiagnostic = {
  sampleCount: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  outsideTolerancePercent: number | null;
};

export type GladiatorRainEvents = {
  eventThresholdMm: number;
  hits: number;
  misses: number;
  falseAlarms: number;
  correctNegatives: number;
  criticalSuccessIndex: number | null;
  hitRatePercent: number | null;
  falseAlarmRatioPercent: number | null;
  frequencyBias: number | null;
  observedWetHours: GladiatorDiagnostic;
};

export type GladiatorModelScore = GladiatorDiagnostic & {
  provider: string;
  rank: number | null;
  eligible: boolean;
  expectedSamples: number;
  availableForecastSamples: number;
  scoredDays: number;
  coveragePercent: number;
  allHours: GladiatorDiagnostic | null;
  rainEvents: GladiatorRainEvents | null;
};

export type GladiatorDefinition = {
  quantity: string;
  unit: string;
  intervalHours: number;
  timestampLabel: 'INSTANT' | 'PERIOD_START' | 'PERIOD_END';
};

export type GladiatorResponse = {
  organizationId: string;
  stationId: string;
  locationRevision: string | null;
  metric: GladiatorMetric;
  hoursFrom0Time: GladiatorHorizon;
  days: GladiatorWindow;
  from: string;
  to: string;
  observationSource: { kind: 'HARDWARE' | 'NOAA'; id: string | null; provider: string | null };
  scoringPolicy: string;
  scoreMetric: string;
  unit: string;
  tolerance: number;
  percentageDefinition: string;
  status: GladiatorStatus;
  winnerProvider: string | null;
  tiedForBest: boolean;
  comparisonProviders: string[];
  topProviders: string[];
  rankings: GladiatorModelScore[];
  committedDays: number;
  scoredDays: number;
  windowCoveragePercent: number;
  minimumSamples: number;
  minimumDays: number;
  minimumCoveragePercent: number;
  lastCalculatedAt: string | null;
  sampleSelection: string;
  comparisonMode: string;
  comparisonDefinition: {
    issue: string | null;
    timestampConvention: string;
    observation: GladiatorDefinition | null;
    forecasts: Record<string, GladiatorDefinition>;
  };
  minimumWindSpeed: number | null;
  daylightElevation: number | null;
  minimumRainEvents: number | null;
  statisticsAvailable: boolean;
  bestForecastProvider: string | null;
  bestForecastBasis: 'STATISTICS' | 'DEFAULT' | 'NONE';
};
