import type { UserLanguage } from '@benchmark/domain';

const spanish: Record<string, string> = {
  Workspace: 'Espacio de trabajo', Dashboard: 'Panel', Settings: 'Configuración', Stations: 'Estaciones',
  Forecasts: 'Pronósticos', Forecast: 'Pronóstico', Observations: 'Observaciones', Historic: 'Histórico',
  'Weather stations': 'Estaciones meteorológicas', Account: 'Cuenta',
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
  'Forecasts for the new location are being prepared. Checking again automatically.': 'Se están preparando los pronósticos para la nueva ubicación. Se volverá a consultar automáticamente.',
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
  'Coming soon': 'Próximamente',
  'Station observations will appear here.': 'Las observaciones de las estaciones aparecerán aquí.',
  'Station observations': 'Observaciones de la estación',
  'Observed weather': 'Datos meteorológicos observados',
  "Hourly observations use the selected station's local time zone.":
    'Las observaciones horarias se muestran en la zona horaria local de la estación seleccionada.',
  'View from (UTC day)': 'Ver desde (día UTC)',
  'View through (UTC day)': 'Ver hasta (día UTC)',
  'Choose 1 to 31 UTC days to view.': 'Selecciona entre 1 y 31 días UTC para visualizar.',
  'Choose a UTC range within the last 12 months to view.':
    'Selecciona un período UTC dentro de los últimos 12 meses para visualizar.',
  'View range': 'Período a visualizar',
  '1 month': '1 mes', '3 months': '3 meses', '6 months': '6 meses', '1 year': '1 año',
  'Loading observations…': 'Cargando observaciones…',
  'No observations were returned for this station and time range.':
    'No hay observaciones para esta estación y período.',
  'Add a station in Settings to see its observations.':
    'Agrega una estación en Configuración para ver sus observaciones.',
  'Load historical station data': 'Cargar datos históricos de la estación',
  'Request complete UTC days from your linked station provider. Existing hourly values are updated as data arrives.':
    'Solicita días UTC completos al proveedor conectado. Los valores horarios existentes se actualizan al llegar nuevos datos.',
  'Historical imports require PREMIUM and a connected station provider.':
    'Las importaciones históricas requieren PREMIUM y un proveedor conectado a la estación.',
  'First UTC day': 'Primer día UTC', 'Last UTC day': 'Último día UTC',
  'Queuing days…': 'Encolando días…', 'Load historical data': 'Cargar datos históricos',
  'Days queued:': 'Días encolados:',
  'Import runs in the background. Refresh the charts to see new data.':
    'La importación continúa en segundo plano. Actualiza los gráficos para ver los datos nuevos.',
  'observation chart': 'gráfico de observaciones',
  'Historical weather data will appear here.': 'Los datos meteorológicos históricos aparecerán aquí.',
  'Benchmark user': 'Usuario de Benchmark', plan: 'plan',
  'Station location map': 'Mapa de ubicación de la estación',
  'Base map': 'Mapa base', Satellite: 'Satélite',
  'Search street address, city, farm, or place': 'Busca una dirección, ciudad, finca o lugar',
  'Searching…': 'Buscando…', 'No matching locations': 'No se encontraron ubicaciones',
  'Station name is required.': 'El nombre de la estación es obligatorio.',
  'Station details': 'Detalles de la estación',
  'Station location': 'Ubicación de la estación',
  'Location is fixed on the FREE plan. Upgrade to PRO or PREMIUM to change it.':
    'La ubicación queda fija en el plan GRATIS. Actualiza a PRO o PREMIUM para cambiarla.',
  'Weather station hardware setup is available on the PREMIUM plan.':
    'La configuración del equipo meteorológico está disponible con el plan PREMIUM.',
  'Time zone is calculated from the station coordinates.': 'La zona horaria se calcula a partir de las coordenadas de la estación.',
  'Additional station metadata (JSON)': 'Metadatos adicionales de la estación (JSON)',
  'For hardware fields such as STATION_TYPE. Never put API keys or passwords here.':
    'Para datos del equipo como STATION_TYPE. Nunca ingreses claves API ni contraseñas aquí.',
  'Save station details': 'Guardar detalles de la estación',
  'Weather station hardware': 'Equipo de la estación meteorológica',
  'Provider accounts can be reused by multiple stations. Each station has its own hardware ID.':
    'Varias estaciones pueden usar la misma cuenta del proveedor. Cada estación tiene su propio ID de equipo.',
  'Loading provider accounts…': 'Cargando cuentas de proveedores…',
  'Provider account': 'Cuenta del proveedor',
  'Select a provider account': 'Selecciona una cuenta del proveedor',
  'Create a new provider account': 'Crear una cuenta del proveedor',
  'Hardware station ID': 'ID de la estación en el proveedor',
  'Device ID, station ID, or MAC address': 'ID de equipo, ID de estación o dirección MAC',
  'Provider account name': 'Nombre de la cuenta del proveedor',
  'e.g. Farm weather stations': 'p. ej., estaciones de la finca',
  'Hardware provider': 'Proveedor del equipo',
  'Credentials already saved:': 'Credenciales ya guardadas:',
  'Leave credential fields blank to keep saved values.': 'Deja las credenciales en blanco para conservar las guardadas.',
  'API key': 'Clave API', 'API key secret': 'Secreto de la clave API',
  Username: 'Usuario', Password: 'Contraseña', 'Access token': 'Token de acceso',
  Region: 'Región', None: 'Ninguna',
  'Changing saved credentials affects every station using this provider account.':
    'Cambiar estas credenciales afecta a todas las estaciones que usan esta cuenta del proveedor.',
  'Save hardware connection': 'Guardar conexión del equipo',
  'Disconnect hardware': 'Desvincular equipo',
  'Currently connected to:': 'Actualmente conectada a:',
  'Observation provider access is unavailable for this account.':
    'Esta cuenta no tiene acceso a los proveedores de observaciones.',
  'Enter a station name and valid coordinates.': 'Ingresa un nombre y coordenadas válidas.',
  'Station metadata must be valid JSON.': 'Los metadatos de la estación deben ser JSON válido.',
  'Station metadata must be a JSON object.': 'Los metadatos de la estación deben ser un objeto JSON.',
  'Keep credentials in provider fields, not station metadata.':
    'Ingresa las credenciales en los campos del proveedor, no en los metadatos de la estación.',
  'Enter a valid hardware station ID (up to 255 characters).':
    'Ingresa un ID de estación válido (hasta 255 caracteres).',
  'Enter a name for the provider account.': 'Ingresa un nombre para la cuenta del proveedor.',
  'Choose a provider account or create one.': 'Selecciona una cuenta del proveedor o crea una nueva.',
  'The selected provider account is no longer available.': 'La cuenta del proveedor seleccionada ya no está disponible.',
  'Missing required credential:': 'Falta la credencial obligatoria:',
  'An access token or API key is required for this provider.':
    'Este proveedor requiere un token de acceso o una clave API.',
  'Provider account saved, but linking the station failed. Try saving the connection again.':
    'La cuenta del proveedor se guardó, pero no se pudo vincular la estación. Vuelve a guardar la conexión.',
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
