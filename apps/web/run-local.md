# Run locally

```bash
cp .env.example .env
cd ../..
corepack enable
pnpm install
pnpm dev
```

Before using Cognito from localhost, add these URLs to the Cognito public browser client:

```text
Callback: http://localhost:5173/auth/callback
Logout:   http://localhost:5173/
```

If the browser calls the deployed API directly, `http://localhost:5173` must also be an allowed API CORS origin.
