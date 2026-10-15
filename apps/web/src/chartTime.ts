import type { UserLanguage } from '@benchmark/domain';
import { locale } from './language';

type Timestamp = number | string;

/** Format chart instants in the station's zone, including date-specific DST rules. */
export function createChartTimeFormatter(timeZone: string, language: UserLanguage) {
  const dateFormatter = new Intl.DateTimeFormat(locale(language), {
    timeZone, month: 'short', day: 'numeric',
  });
  // Keep AM/PM and US zone abbreviations consistent in both interface languages.
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const zoneFormatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' });
  const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });

  const date = (timestamp: Timestamp) => dateFormatter.format(new Date(timestamp));
  const time = (timestamp: Timestamp) => timeFormatter.format(new Date(timestamp)).replace(':00', '');
  const zone = (timestamp: Timestamp) => {
    const instant = new Date(timestamp);
    const name = zoneFormatter.formatToParts(instant).find(part => part.type === 'timeZoneName')?.value;
    const offset = offsetFormatter.formatToParts(instant).find(part => part.type === 'timeZoneName')?.value;
    return name && offset && name !== offset ? `${name} (${offset})` : name ?? offset ?? timeZone;
  };

  return {
    date,
    time,
    zone,
    dateTime: (timestamp: Timestamp) => `${date(timestamp)}, ${time(timestamp)} ${zone(timestamp)}`,
  };
}
