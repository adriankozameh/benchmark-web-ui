// Condition descriptions and Celsius thresholds preserved from the legacy UI.
const HEAT_CONDITIONS = [
  { level: 'Low', workRest: 'Normal / Scheduled', water: 'Drink water regularly', recommendation: 'Provide water; encourage regular hydration.' },
  { level: 'Caution', workRest: '30 : 30', water: '1 cup every 15–20 minutes', recommendation: 'Increase breaks and monitor new/unacclimatized workers.' },
  { level: 'Extreme caution', workRest: '15 : 45', water: '1 cup every 15 minutes', recommendation: 'Mandatory rest breaks in shade/cooling; buddy monitoring.' },
  { level: 'Danger', workRest: 'Stop / critical only', water: '1 cup every 10–15 minutes', recommendation: 'Reduce work intensity/duration; active monitoring and cooling required.' },
  { level: 'Extreme danger', workRest: 'Stop / critical only', water: '1 cup every 10 minutes', recommendation: 'Consider stopping work; only critical tasks with continuous monitoring.' },
];
export function heatCondition(celsius?: number) {
  if (celsius === undefined || !Number.isFinite(celsius)) return null;
  return HEAT_CONDITIONS[celsius >= 54 ? 4 : celsius >= 46 ? 3 : celsius >= 39 ? 2 : celsius >= 33 ? 1 : 0];
}
const FROST_CONDITIONS = [
  { exposure: '>30 min', description: 'Frostbite risk is low; frostbite would generally take more than 30 minutes.' },
  { exposure: '30 min', description: 'Frostbite may occur in around 30 minutes.' },
  { exposure: '10 min', description: 'Frostbite may occur in around 10 minutes.' },
  { exposure: '5 min', description: 'Frostbite may occur in around 5 minutes.' },
];
export function frostbiteCondition(category?: number) {
  return category !== undefined && Number.isInteger(category) ? FROST_CONDITIONS[category] ?? null : null;
}
