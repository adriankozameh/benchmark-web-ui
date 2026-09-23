# Google sign-in through Amazon Cognito

The web application already supports Google federation with the same OAuth 2.0 Authorization Code + PKCE flow used for email/password authentication.

The browser does **not** send a Google token directly to Benchmark API. Google authenticates the user, Cognito federates that identity, and the application receives a Cognito access token. Benchmark API therefore continues to see a Cognito bearer token for both login methods.

## Flow

```text
Benchmark web
    |
    +-- Email/password --> Cognito
    |
    +-- Continue with Google --> Google --> Cognito
                                      |
                                      v
                              Cognito access token
                                      |
                                      v
                              Benchmark API /api/v1/me
```

## 1. Create a Google OAuth client

In Google Cloud Console:

1. Configure the OAuth consent screen.
2. Create an **OAuth 2.0 Client ID** for a **Web application**.
3. Add the Cognito federation callback as an authorized redirect URI:

```text
https://benchmark-labs-production-990721139452.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
```

This is the callback from **Google to Cognito**. It is different from the Benchmark application's `/auth/callback` URL.

Record the Google client ID and client secret. Do not commit the client secret to Git.

## 2. Add Google as a Cognito identity provider

Configure Google on the existing Benchmark Cognito user pool using the Google client ID and secret.

Use scopes:

```text
openid email profile
```

Recommended attribute mapping:

```text
email       -> email
given_name  -> given_name
family_name -> family_name
name        -> name
```

The `email` mapping is the important one for Benchmark account provisioning.

## 3. Enable Google on the Cognito app client

The existing browser app client must support both providers:

```text
COGNITO
Google
```

Keep Authorization Code flow enabled and keep the existing callback/logout URLs.

For local development:

```text
Callback URL:
http://localhost:5173/auth/callback

Logout URL:
http://localhost:5173/
```

For the deployed frontend, add the corresponding CloudFront/custom-domain URLs too.

## 4. Web application configuration

The starter enables the Google button by default:

```env
VITE_GOOGLE_AUTH_ENABLED=true
```

If Cognito Google federation has not been configured yet, temporarily set:

```env
VITE_GOOGLE_AUTH_ENABLED=false
```

The implementation calls:

```ts
auth.beginWithProvider('Google')
```

which sends the user to Cognito `/oauth2/authorize` with:

```text
identity_provider=Google
```

PKCE and OAuth state validation are still used.

## 5. Infrastructure recommendation

Manage the Cognito Google identity provider and the app client's supported identity providers in Terraform. Keep the Google client secret in a secret store rather than `deployment.json`, `.tfvars`, or the frontend repository.

The frontend implementation is ready before the provider is enabled; the remaining work is Cognito/Google infrastructure configuration.
