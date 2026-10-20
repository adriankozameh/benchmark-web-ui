import type { HardwareProvider, ProviderCredentials, HardwareChatTurn } from '@benchmark/domain';

export const HARDWARE_PROVIDERS: {
  id: HardwareProvider; label: string; fields: (keyof ProviderCredentials)[];
}[] = [
  { id: 'WEATHER_LINK', label: 'WeatherLink', fields: ['apiKey', 'apiKeySecret'] },
  { id: 'AMBIENT_WEATHER', label: 'Ambient Weather', fields: ['apiKey'] },
  { id: 'TEMPEST', label: 'Tempest', fields: ['token'] },
  { id: 'SENSECAP_GLOBAL', label: 'SenseCAP Global', fields: ['apiKey', 'apiKeySecret'] },
  { id: 'SENSECAP_CHINA', label: 'SenseCAP China', fields: ['apiKey', 'apiKeySecret'] },
  { id: 'METOS', label: 'METOS', fields: ['apiKey', 'apiKeySecret'] },
  { id: 'ZEUS', label: 'Zeus', fields: ['username', 'password'] },
  { id: 'RANCH_SYSTEM', label: 'Ranch System', fields: ['username', 'password'] },
  { id: 'FAWN', label: 'FAWN', fields: [] },
];

/** Send only bounded conversation text; provider forms and credentials stay separate. */
export function hardwareHistory(turns: HardwareChatTurn[]): HardwareChatTurn[] {
  return turns.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
}
