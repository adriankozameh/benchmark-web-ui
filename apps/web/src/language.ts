import type { UserLanguage } from '@benchmark/domain';

const spanish: Record<string, string> = {
  Workspace: 'Espacio de trabajo', Dashboard: 'Panel', Settings: 'Configuración', Stations: 'Estaciones',
  Forecasts: 'Pronósticos', 'Weather stations': 'Estaciones meteorológicas', Account: 'Cuenta',
  'Data providers': 'Proveedores de datos', Soon: 'Pronto', 'Log out': 'Cerrar sesión',
  'Preparing your account…': 'Preparando tu cuenta…',
  'Loading your Benchmark organization and station settings.': 'Cargando tu organización y tus estaciones.',
  'Unable to load settings': 'No se pudo cargar la configuración',
  'Latest forecast': 'Pronóstico reciente', 'Compare forecast providers': 'Comparar proveedores de pronósticos',
  "Compare providers at the same moment. Times are shown in the selected station's local time zone.":
    'Compara proveedores en el mismo momento. Las horas se muestran en la zona horaria de la estación.',
  Refresh: 'Actualizar', Station: 'Estación', Providers: 'Proveedores',
  'Forecast unavailable': 'Pronóstico no disponible', 'Loading forecasts…': 'Cargando pronósticos…',
  'No forecast data was returned for this station and time range.': 'No hay pronósticos para esta estación y período.',
  'Add a station in Settings to see its forecasts.': 'Agrega una estación en Configuración para ver pronósticos.',
  'No numeric metrics were returned.': 'No se recibieron valores numéricos.',
  'Select a provider to view this metric.': 'Selecciona un proveedor para ver esta variable.',
  'Move over the chart to compare values.': 'Pasa el cursor sobre el gráfico para comparar valores.',
  'No values at this time.': 'No hay valores para esta hora.',
  'Arrows point toward where the wind comes from · degrees clockwise from true north':
    'Las flechas apuntan hacia donde viene el viento · grados en sentido horario desde el norte verdadero',
  '24 hours': '24 horas', '3 days': '3 días', '7 days': '7 días', '16 days': '16 días',
  'Forecast time range': 'Período del pronóstico', 'Visible forecast providers': 'Proveedores visibles',
  'Station name': 'Nombre de la estación', Site: 'Sitio', 'Find location': 'Buscar ubicación',
  'Default Site': 'Sitio predeterminado',
  Latitude: 'Latitud', Longitude: 'Longitud', 'Save station': 'Guardar estación',
  'Saving station…': 'Guardando estación…', 'Your stations': 'Tus estaciones',
  'Add station': 'Agregar estación', 'Station capacity reached': 'Límite de estaciones alcanzado',
  'Atmospheric dispersion index': 'Índice de dispersión atmosférica', 'Cloud cover': 'Nubosidad',
  Evapotranspiration: 'Evapotranspiración', 'Haines index': 'Índice de Haines',
  'Mixing height': 'Altura de mezcla', 'Precipitation chance': 'Probabilidad de precipitación',
  Precipitation: 'Precipitación', 'Precipitation probability above': 'Probabilidad de precipitación superior',
  'Precipitation probability below': 'Probabilidad de precipitación inferior',
  Pressure: 'Presión', 'Relative humidity': 'Humedad relativa',
  'Solar radiation': 'Radiación solar', Temperature: 'Temperatura',
  'Temperature probability above': 'Probabilidad de temperatura superior',
  'Temperature probability below': 'Probabilidad de temperatura inferior',
  'Transport wind direction': 'Dirección del viento de transporte',
  'Transport wind speed': 'Velocidad del viento de transporte',
  'UV index': 'Índice UV', 'Ventilation rate': 'Tasa de ventilación',
  'Wind direction': 'Dirección del viento', 'Wind gust': 'Ráfaga de viento',
  'Wind speed': 'Velocidad del viento',
  'Set up your first station': 'Configura tu primera estación',
  "Benchmark uses each station's precise coordinates to resolve timezone and weather data.":
    'Benchmark usa las coordenadas de cada estación para calcular la zona horaria y obtener datos meteorológicos.',
  'Station capacity': 'Capacidad de estaciones', of: 'de',
  'Station configuration': 'Configuración de estación',
  'Tell us where your station is': 'Indica dónde está tu estación',
  'Add another station': 'Agregar otra estación', Cancel: 'Cancelar',
  'e.g. North Field': 'p. ej., Campo Norte',
  'Every new account already has a Default Site.': 'Las cuentas nuevas incluyen un sitio predeterminado.',
  'Search, enter coordinates, or click the map.': 'Busca, escribe coordenadas o haz clic en el mapa.',
  'Click or drag the pin to place the station.': 'Haz clic o arrastra el marcador para ubicar la estación.',
  'No Benchmark organization is available for this account.':
    'Esta cuenta no tiene una organización de Benchmark disponible.',
  'Something went wrong.': 'Ocurrió un error.',
  'You are not signed in.': 'No has iniciado sesión.',
  'Could not load the forecast.': 'No se pudo cargar el pronóstico.',
  'Your preferences': 'Tus preferencias',
  'These choices apply to all your stations and devices.': 'Estas opciones se aplican a todas tus estaciones y dispositivos.',
  Language: 'Idioma', Units: 'Unidades',
  'Metric (°C, m/s, mm)': 'Métrico (°C, m/s, mm)',
  'Imperial (°F, mph, in)': 'Imperial (°F, mph, pulgadas)',
  'Save preferences': 'Guardar preferencias', Saved: 'Guardado',
  'Primary navigation': 'Navegación principal',
  'Benchmark user': 'Usuario de Benchmark', plan: 'plan',
  'Station location map': 'Mapa de ubicación de la estación',
  'Base map': 'Mapa base', Satellite: 'Satélite',
  'Search street address, city, farm, or place': 'Busca una dirección, ciudad, finca o lugar',
  'Searching…': 'Buscando…', 'No matching locations': 'No se encontraron ubicaciones',
  'Station name is required.': 'El nombre de la estación es obligatorio.',
  'Station name must be 200 characters or fewer.': 'El nombre de la estación debe tener 200 caracteres o menos.',
  'Latitude is required.': 'La latitud es obligatoria.',
  'Latitude must be between -90 and 90.': 'La latitud debe estar entre -90 y 90.',
  'Longitude is required.': 'La longitud es obligatoria.',
  'Longitude must be between -180 and 180.': 'La longitud debe estar entre -180 y 180.',
  'forecast chart': 'gráfico de pronóstico', 'by provider': 'por proveedor',
  'to': 'a', 'in': 'en', 'arrows point toward the wind source': 'las flechas apuntan hacia el origen del viento',
  'clockwise from N': 'en sentido horario desde el norte',
  ACTIVE: 'Activa', INACTIVE: 'Inactiva', FREE: 'Gratis', PRO: 'Pro', PREMIUM: 'Premium',
};

export type { UserLanguage };
export function t(english: string, language: UserLanguage): string {
  return language === 'es' ? spanish[english] ?? english : english;
}

export function errorMessage(error: unknown, language: UserLanguage): string {
  const english = error instanceof Error ? error.message : 'Something went wrong.';
  if (language === 'en') return english;
  if (Object.hasOwn(spanish, english)) return spanish[english];
  // API error descriptions may only be in English.
  // Keep the HTTP code if available while showing a fully localized message.
  const status = typeof error === 'object' && error !== null && 'status' in error &&
    typeof error.status === 'number' ? ` (HTTP ${error.status})` : '';
  return `No se pudo completar la solicitud${status}.`;
}

export const locale = (language: UserLanguage): string => language === 'es' ? 'es-AR' : 'en-US';
