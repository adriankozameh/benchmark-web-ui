export type CognitoAuthConfig = {
  domain: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
  scopes?: string[];
};

export type TokenSet = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt: number;
};

export type AuthMode = 'login' | 'signup';

export type FederatedIdentityProvider = 'Google' | string;

type StoredPkce = {
  verifier: string;
  state: string;
};

const TOKEN_KEY = 'benchmark.auth.tokens';
const PKCE_KEY = 'benchmark.auth.pkce';

// React StrictMode intentionally re-runs effects in development. Without a
// single-flight guard, the OAuth callback can exchange the same one-time
// authorization code twice; Cognito accepts the first request and rejects the
// second with invalid_grant. Share one in-flight exchange across callers.
let callbackExchange: Promise<TokenSet> | null = null;

function normalizeDomain(domain: string): string {
  return domain.replace(/\/+$/, '');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

function saveTokens(tokens: TokenSet): void {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

function loadTokens(): TokenSet | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

function savePkce(value: StoredPkce): void {
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(value));
}

function loadPkce(): StoredPkce | null {
  const raw = sessionStorage.getItem(PKCE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredPkce;
  } catch {
    sessionStorage.removeItem(PKCE_KEY);
    return null;
  }
}

function parseTokenResponse(payload: Record<string, unknown>, previousRefreshToken?: string): TokenSet {
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : null;
  const expiresIn = Number(payload.expires_in ?? 3600);
  if (!accessToken) throw new Error('Cognito token response did not include an access token.');

  return {
    accessToken,
    idToken: typeof payload.id_token === 'string' ? payload.id_token : undefined,
    refreshToken:
      typeof payload.refresh_token === 'string' ? payload.refresh_token : previousRefreshToken,
    expiresAt: Date.now() + Math.max(30, expiresIn - 30) * 1000,
  };
}

export class CognitoPkceAuth {
  private readonly config: CognitoAuthConfig;

  constructor(config: CognitoAuthConfig) {
    this.config = {
      ...config,
      domain: normalizeDomain(config.domain),
      scopes: config.scopes ?? ['openid', 'email', 'profile'],
    };
  }

  isAuthenticated(): boolean {
    return loadTokens() !== null;
  }

  private async createAuthorizationParams(): Promise<URLSearchParams> {
    const verifier = randomBase64Url(48);
    const state = randomBase64Url(24);
    const challenge = await sha256(verifier);
    savePkce({ verifier, state });

    return new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: (this.config.scopes ?? []).join(' '),
      redirect_uri: this.config.redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
  }

  async begin(mode: AuthMode): Promise<void> {
    const params = await this.createAuthorizationParams();
    const path = mode === 'signup' ? '/signup' : '/oauth2/authorize';
    window.location.assign(`${this.config.domain}${path}?${params.toString()}`);
  }

  async beginWithProvider(provider: FederatedIdentityProvider): Promise<void> {
    const params = await this.createAuthorizationParams();
    params.set('identity_provider', provider);
    window.location.assign(`${this.config.domain}/oauth2/authorize?${params.toString()}`);
  }

  handleCallback(callbackUrl = window.location.href): Promise<TokenSet> {
    if (callbackExchange) return callbackExchange;

    callbackExchange = (async () => {
      const url = new URL(callbackUrl);
      const error = url.searchParams.get('error');
      if (error) {
        const description = url.searchParams.get('error_description');
        throw new Error(description || error);
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const pkce = loadPkce();

      // If another callback invocation already completed, reuse the stored
      // session instead of attempting to redeem the one-time code again.
      if (!pkce) {
        const tokens = loadTokens();
        if (tokens) return tokens;
      }

      if (!code || !state || !pkce) throw new Error('Missing Cognito OAuth callback state.');
      if (state !== pkce.state) throw new Error('OAuth state did not match.');

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: pkce.verifier,
      });

      const response = await fetch(`${this.config.domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(String(payload.error_description || payload.error || 'Cognito token exchange failed.'));
      }

      const tokens = parseTokenResponse(payload);
      saveTokens(tokens);
      sessionStorage.removeItem(PKCE_KEY);
      return tokens;
    })();

    return callbackExchange.finally(() => {
      callbackExchange = null;
    });
  }

  async getAccessToken(): Promise<string | null> {
    const tokens = loadTokens();
    if (!tokens) return null;
    if (tokens.expiresAt > Date.now()) return tokens.accessToken;
    if (!tokens.refreshToken) {
      this.clear();
      return null;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        refresh_token: tokens.refreshToken,
      });

      const response = await fetch(`${this.config.domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error('Token refresh failed.');

      const refreshed = parseTokenResponse(payload, tokens.refreshToken);
      saveTokens(refreshed);
      return refreshed.accessToken;
    } catch {
      this.clear();
      return null;
    }
  }

  clear(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(PKCE_KEY);
  }

  logout(): void {
    this.clear();
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      logout_uri: this.config.logoutUri,
    });
    window.location.assign(`${this.config.domain}/logout?${params.toString()}`);
  }
}
