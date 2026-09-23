export type AppConfig = {
  apiBaseUrl: string;
  cognitoDomain: string;
  cognitoClientId: string;
  cognitoRedirectUri: string;
  cognitoLogoutUri: string;
  googleAuthEnabled: boolean;
};

export type ConfigurationIssue = {
  key: string;
  message: string;
};

export type AppConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; issues: ConfigurationIssue[] };

function readValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateUrl(key: string, value: string, issues: ConfigurationIssue[]): void {
  if (!value) return;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      issues.push({ key, message: 'must use http:// or https://' });
    }
  } catch {
    issues.push({ key, message: 'must be a valid absolute URL' });
  }
}

function getFrontendOrigin(): string {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return '';
  }

  return window.location.origin.replace(/\/+$/, '');
}

export function loadAppConfig(): AppConfigResult {
  const frontendOrigin = getFrontendOrigin();
  const values = {
    apiBaseUrl: readValue(import.meta.env.VITE_API_BASE_URL),
    cognitoDomain: readValue(import.meta.env.VITE_COGNITO_DOMAIN),
    cognitoClientId: readValue(import.meta.env.VITE_COGNITO_CLIENT_ID),
    cognitoRedirectUri: frontendOrigin ? `${frontendOrigin}/auth/callback` : '',
    cognitoLogoutUri: frontendOrigin ? `${frontendOrigin}/` : '',
  };

  const required: Array<[keyof typeof values, string]> = [
    ['apiBaseUrl', 'VITE_API_BASE_URL'],
    ['cognitoDomain', 'VITE_COGNITO_DOMAIN'],
    ['cognitoClientId', 'VITE_COGNITO_CLIENT_ID'],
    ['cognitoRedirectUri', 'window.location.origin'],
    ['cognitoLogoutUri', 'window.location.origin'],
  ];

  const issues: ConfigurationIssue[] = [];

  for (const [property, envKey] of required) {
    if (!values[property]) {
      issues.push({ key: envKey, message: 'is missing' });
    }
  }

  validateUrl('VITE_API_BASE_URL', values.apiBaseUrl, issues);
  validateUrl('VITE_COGNITO_DOMAIN', values.cognitoDomain, issues);
  validateUrl('Cognito redirect URI', values.cognitoRedirectUri, issues);
  validateUrl('Cognito logout URI', values.cognitoLogoutUri, issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    config: {
      ...values,
      googleAuthEnabled: readValue(import.meta.env.VITE_GOOGLE_AUTH_ENABLED).toLowerCase() !== 'false',
    },
  };
}
