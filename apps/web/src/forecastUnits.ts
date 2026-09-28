import type { DisplayUnits } from '@benchmark/domain';

const METRIC_UNITS: Record<string, string> = {
  TEMPERATURE: '°C', HEAT_INDEX: '°C', WIND_CHILL: '°C', GROWING_DEGREE_DAYS: '°C·day', WATER_BALANCE: 'mm', CHILLING_HOURS: 'h',
  WIND_SPEED: 'm/s',
  WIND_GUST: 'm/s',
  TRANSPORT_WIND_SPEED: 'm/s',
  PRECIPITATION_QUANTITY: 'mm',
  EVAPOTRANSPIRATION: 'mm/h',
  MIXING_HEIGHT: 'm',
  VENTILATION_RATE: 'm²/s',
  PRESSURE: 'hPa',
  SOLAR_RADIATION: 'W/m²',
};

const IMPERIAL_UNITS: Record<string, string> = {
  TEMPERATURE: '°F', HEAT_INDEX: '°F', WIND_CHILL: '°F', GROWING_DEGREE_DAYS: '°F·day', WATER_BALANCE: 'in', CHILLING_HOURS: 'h',
  WIND_SPEED: 'mph',
  WIND_GUST: 'mph',
  TRANSPORT_WIND_SPEED: 'mph',
  PRECIPITATION_QUANTITY: 'in',
  EVAPOTRANSPIRATION: 'in/h',
  MIXING_HEIGHT: 'ft',
  VENTILATION_RATE: 'ft²/s',
  PRESSURE: 'inHg',
  SOLAR_RADIATION: 'W/m²',
};

const UNCHANGED_UNITS: Record<string, string> = {
  CLOUD_COVER: '%',
  PRECIPITATION_CHANCE: '%',
  RELATIVE_HUMIDITY: '%',
  WIND_DIRECTION: '°',
  TRANSPORT_WIND_DIRECTION: '°',
};

export function metricUnit(metric: string, units: DisplayUnits): string {
  return (units === 'IMPERIAL' ? IMPERIAL_UNITS : METRIC_UNITS)[metric] ?? UNCHANGED_UNITS[metric] ?? '';
}

export function displayMetricValue(metric: string, value: number, units: DisplayUnits): number {
  if (units === 'METRIC') return value;
  switch (metric) {
    case 'HEAT_INDEX':
    case 'WIND_CHILL':
    case 'TEMPERATURE': return value * 9 / 5 + 32;
    case 'WIND_SPEED':
    case 'WIND_GUST':
    case 'TRANSPORT_WIND_SPEED': return value / 0.44704;
    case 'GROWING_DEGREE_DAYS': return value * 9 / 5;
    case 'WATER_BALANCE':
    case 'PRECIPITATION_QUANTITY':
    case 'EVAPOTRANSPIRATION': return value / 25.4;
    case 'MIXING_HEIGHT': return value * 3.280839895;
    case 'VENTILATION_RATE': return value * 10.763910417;
    case 'PRESSURE': return value * 0.0295299830714;
    default: return value; // Percentages, degrees, indexes and unrecognized metrics.
  }
}
