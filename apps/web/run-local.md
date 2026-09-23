# Run locally

```bash
cp .env.example .env
cd ../..
corepack enable
pnpm install
pnpm dev
```

The web app derives its Cognito callback and logout URLs from the browser origin.
When Vite runs on the default port, it automatically uses:

```text
Callback: http://localhost:5173/auth/callback
Logout:   http://localhost:5173/
```

In production at `https://weather.benchmarklabs.com`, the same code automatically uses:

```text
Callback: https://weather.benchmarklabs.com/auth/callback
Logout:   https://weather.benchmarklabs.com/
```

Both origins must be registered on the Cognito public browser client.

If the local browser calls the deployed API directly, `http://localhost:5173` must also be an allowed API CORS origin.
