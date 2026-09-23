import type { CreateStationInput } from '@benchmark/domain';

export type StationValidationErrors = Partial<Record<'name' | 'latitude' | 'longitude', string>>;

export function validateStation(input: CreateStationInput): StationValidationErrors {
  const errors: StationValidationErrors = {};
  const name = input.name.trim();

  if (!name) errors.name = 'Station name is required.';
  else if (name.length > 200) errors.name = 'Station name must be 200 characters or fewer.';

  if (!Number.isFinite(input.latitude)) errors.latitude = 'Latitude is required.';
  else if (input.latitude < -90 || input.latitude > 90) errors.latitude = 'Latitude must be between -90 and 90.';

  if (!Number.isFinite(input.longitude)) errors.longitude = 'Longitude is required.';
  else if (input.longitude < -180 || input.longitude > 180) errors.longitude = 'Longitude must be between -180 and 180.';

  return errors;
}

export function hasValidationErrors(errors: StationValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
