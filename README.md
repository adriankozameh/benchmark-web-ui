# Benchmark UI

Benchmark Labs frontend application.

The first application slice intentionally stays small:

1. Sign up or log in through Amazon Cognito using OAuth 2.0 Authorization Code + PKCE, including Google federation.
2. Call `GET /api/v1/me` with the Cognito **access token**.
3. On first login, the backend provisions the Benchmark user, PERSONAL organization, OWNER membership, FREE subscription, entitlements, and default site.
4. Open **Settings → Stations**.
5. Load the user's sites and stations.
6. Create a weather station using a name and latitude/longitude, optionally using address search and the map.

The visual language follows the Benchmark application style:

- navy application shell
- Benchmark red accents
- compact dashboard cards
- Benchmark branding
- responsive layouts for phone, iPad/tablet, and desktop

---

# Repository structure

```text
apps/
  web/                 React + TypeScript + Vite
  mobile/              reserved for Expo / React Native

packages/
  api/                  shared Benchmark API client
  auth/                 Cognito OAuth/PKCE web implementation
  domain/               shared application models
  validation/           shared station validation
  design-tokens/        shared brand tokens
```

The goal is to share API, domain, validation, and business logic with the future mobile application while allowing the web and mobile user interfaces to be optimized independently.

---

# Responsive design

Responsive design is a first-class requirement.

The application currently targets:

```text
320-767px       phone
768-1180px      tablet / iPad
1181px+         desktop
```

## Desktop

- full left navigation
- wider content area
- multi-column layouts where appropriate
- station form and map displayed side-by-side when space allows

## iPad / tablet

- compact navigation
- tablet-sized spacing
- layouts adapt between one and two columns
- station form and map stack when necessary

## Phone

- sticky application header
- bottom navigation
- single-column forms
- touch-sized controls
- iPhone safe-area support
- 16px minimum input font size to prevent Safari form zoom

Reduced-motion preferences are respected.

## Minimum responsive QA viewports

Every major screen should be tested at:

```text
390 x 844     iPhone
430 x 932     large phone
768 x 1024    iPad portrait
1024 x 768    iPad landscape
1440 x 900    desktop
```

---

# Technology

The current web application uses:

```text
React
TypeScript
Vite
React Router
TanStack Query
Zod
pnpm workspaces
```

The planned native mobile application will use:

```text
Expo
React Native
TypeScript
```

The mobile app should reuse the shared packages rather than duplicate business logic.

---

# Development prerequisites

For the local development environment we standardize on:

```text
Node.js 24 LTS
pnpm 10.15.1
```

The project intentionally uses a pinned pnpm version to keep local and CI builds reproducible.

On macOS, Node versions are managed using **nvm**.

Do not use the Homebrew `node@24` formula for this project.

Do not rely on Corepack to select the pnpm version.

---

# macOS installation from scratch

These instructions assume macOS with Homebrew installed.

## 1. Install nvm

Check whether nvm is already installed:

```bash
brew list --versions nvm
```

If it is not installed:

```bash
brew install nvm
```

Create the nvm working directory:

```bash
mkdir -p ~/.nvm
```

Add the following configuration to `~/.zshrc`:

```bash
cat >> ~/.zshrc <<'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && source "/opt/homebrew/opt/nvm/nvm.sh"
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && source "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
EOF
```

Reload the shell:

```bash
source ~/.zshrc
```

Verify that nvm is available:

```bash
command -v nvm
nvm --version
```

Expected:

```text
nvm
```

followed by the installed nvm version.

---

# 2. Install Node.js 24

Install Node 24:

```bash
nvm install 24
```

Use Node 24:

```bash
nvm use 24
```

Make Node 24 the default for new terminal sessions:

```bash
nvm alias default 24
```

Verify:

```bash
node -v
npm -v
which node
```

Expected Node version:

```text
v24.x.x
```

`which node` should point somewhere under:

```text
~/.nvm/versions/node/
```

For example:

```text
/Users/your-user/.nvm/versions/node/v24.x.x/bin/node
```

---

# 3. Disable Corepack

Corepack can interfere with the project's pinned pnpm version.

Disable it:

```bash
corepack disable
```

---

# 4. Install the required pnpm version

Remove any existing global pnpm installation:

```bash
npm uninstall -g pnpm
```

Install the exact pnpm version used by this project:

```bash
npm install -g pnpm@10.15.1
```

Refresh the shell command cache:

```bash
hash -r
```

Verify:

```bash
pnpm --version
which pnpm
```

Expected:

```text
10.15.1
```

`which pnpm` should normally point into the active nvm Node installation:

```text
~/.nvm/versions/node/v24.x.x/bin/pnpm
```

You can verify the complete environment with:

```bash
node -v
npm -v
pnpm --version
which node
which pnpm
```

The important results are:

```text
Node.js: v24.x.x
pnpm:    10.15.1
```

---

# 5. Clone or open the repository

Example:

```bash
cd /Users/your-user/path/to/benchmark-web-ui
```

The repository root should contain:

```text
package.json
pnpm-workspace.yaml
apps/
packages/
```

---

# 6. Clean previous dependency installations

If this is a completely fresh checkout, this step is harmless.

If dependencies were previously installed using another Node or pnpm version, clean them first:

```bash
rm -rf node_modules
rm -rf apps/web/node_modules
rm -rf packages/*/node_modules
```

Do **not** delete:

```text
pnpm-lock.yaml
```

The lockfile should remain committed so dependency versions are reproducible.

---

# 7. Install dependencies

Run from the repository root:

```bash
pnpm install
```

The repository is a pnpm workspace, so this installs dependencies for all workspace packages.

You should see something similar to:

```text
Scope: all workspace projects
```

---

# 8. Approve required dependency build scripts

pnpm may display:

```text
Ignored build scripts: esbuild.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

This is expected.

Run:

```bash
pnpm approve-builds
```

Select:

```text
esbuild
```

Typically:

```text
Space    select
Enter    confirm
```

Then rebuild it:

```bash
pnpm rebuild esbuild
```

---

# 9. Verify the application builds

Run:

```bash
pnpm build
```

The root build command runs the web application build:

```text
pnpm --filter @benchmark/web build
```

The build must complete successfully before starting development or deploying.

---

# 10. Configure the web application

Create the local environment file:

```bash
cp apps/web/.env.example apps/web/.env
```

The example configuration contains the current Benchmark development/production integration values needed by the frontend.

Review:

```bash
cat apps/web/.env
```

The application currently connects to:

```text
https://api-test.benchmarklabs.com
```

and uses the Benchmark production Cognito user pool/browser client.

Do not commit secret values to `.env`.

---

# Google authentication

Google login support is built into the frontend.

Enable it with:

```env
VITE_GOOGLE_AUTH_ENABLED=true
```

Disable the button temporarily with:

```env
VITE_GOOGLE_AUTH_ENABLED=false
```

Google authentication requires Google to be configured as an identity provider in Amazon Cognito.

See:

```text
GOOGLE_AUTH_SETUP.md
```

for the infrastructure and Google OAuth configuration.

The authentication path is:

```text
Google
   ↓
Amazon Cognito
   ↓
Cognito access token
   ↓
Benchmark API
```

The Benchmark backend does not authenticate Google tokens directly.

---

# Cognito local callback configuration

For local development, the Cognito browser app client must allow:

```text
http://localhost:5173/auth/callback
```

as a callback URL.

It must also allow:

```text
http://localhost:5173/
```

as a logout URL.

---

# API CORS

When the Vite application runs locally, browser requests originate from:

```text
http://localhost:5173
```

The deployed Benchmark API must therefore allow this origin in its CORS configuration during local development.

API:

```text
https://api-test.benchmarklabs.com
```

---

# Run locally

Start the Vite development server:

```bash
pnpm dev
```

Open:

```text
http://localhost:5173
```

Vite will automatically reload the application when source files change.

---

# Standard daily development workflow

After the initial machine setup, you do **not** need to reinstall Node or pnpm every time.

Open a terminal and verify:

```bash
node -v
pnpm --version
```

Expected:

```text
v24.x.x
10.15.1
```

Then:

```bash
cd /Users/your-user/path/to/benchmark-web-ui
pnpm install
pnpm dev
```

You normally only need `pnpm install` when dependencies or the lockfile change.

For normal daily development:

```bash
cd /Users/your-user/path/to/benchmark-web-ui
pnpm dev
```

---

# Production build

Before submitting or deploying frontend changes:

```bash
pnpm install
pnpm build
```

Both commands must complete successfully.

The AWS frontend pipeline will eventually perform the same reproducible installation and build using the pinned Node/pnpm toolchain.

---

# Backend endpoints currently used

The first frontend slice calls:

```text
GET  /api/v1/me
GET  /api/v1/organizations/{organizationId}/sites
GET  /api/v1/organizations/{organizationId}/stations
POST /api/v1/organizations/{organizationId}/stations
```

Station creation uses:

```json
{
  "siteId": "uuid",
  "name": "North Field",
  "latitude": 40.123,
  "longitude": -96.456,
  "metadata": null
}
```

The backend resolves and stores the station timezone.

---

# Authentication design

The Benchmark backend expects a Cognito OAuth **access token**.

The web application therefore uses:

```text
OAuth 2.0
Authorization Code Flow
PKCE
```

The basic flow is:

```text
Browser
   ↓
Cognito Hosted Login / Google
   ↓
Authorization Code
   ↓
PKCE token exchange
   ↓
Cognito access token
   ↓
Benchmark API
```

After authentication the frontend calls:

```text
GET /api/v1/me
```

The backend handles first-login application provisioning.

Tokens are currently stored in:

```text
sessionStorage
```

for the browser implementation.

The future Expo application should use native secure storage instead of browser storage.

---

# Google authentication flow

When the user chooses Google:

```text
Benchmark login page
      ↓
Cognito authorize endpoint
      ↓
identity_provider=Google
      ↓
Google login
      ↓
Cognito
      ↓
PKCE callback
      ↓
Cognito access token
      ↓
Benchmark API
```

The backend therefore continues to see normal Cognito-authenticated requests regardless of whether the user signed in with:

```text
email/password
```

or:

```text
Google
```

---

# Future mobile application

The native mobile application will live under:

```text
apps/mobile
```

and use:

```text
Expo
React Native
TypeScript
```

Do not duplicate shared backend/domain logic in the mobile application.

The mobile application should consume:

```text
@benchmark/api
@benchmark/domain
@benchmark/validation
@benchmark/design-tokens
```

Authentication should use a mobile-specific adapter and secure native token storage.

The intended architecture is:

```text
                     Benchmark API
                          ↑
                          │
                    packages/api
                          ↑
              ┌───────────┴───────────┐
              │                       │
         React Web               Expo Mobile
         apps/web                apps/mobile
              │                       │
              └──── shared packages ──┘
```

This allows the web interface to remain optimized for desktop/tablet/browser use while the native application can provide a proper iOS/Android experience.

---

# Troubleshooting

## `Cannot find matching keyid`

If you see an error similar to:

```text
Cannot find matching keyid
```

from Corepack, do not upgrade the project's pnpm version.

Make sure Corepack is disabled:

```bash
corepack disable
```

Then reinstall the pinned pnpm version:

```bash
npm uninstall -g pnpm
npm install -g pnpm@10.15.1
hash -r
```

Verify:

```bash
pnpm --version
```

Expected:

```text
10.15.1
```

---

## `ERR_PNPM_BAD_PM_VERSION`

If you see:

```text
ERR_PNPM_BAD_PM_VERSION
```

check:

```bash
pnpm --version
```

This project expects:

```text
10.15.1
```

Fix it with:

```bash
corepack disable

npm uninstall -g pnpm
npm install -g pnpm@10.15.1

hash -r

pnpm --version
```

---

## `Ignored build scripts: esbuild`

Run:

```bash
pnpm approve-builds
```

Select:

```text
esbuild
```

Then:

```bash
pnpm rebuild esbuild
```

and retry:

```bash
pnpm build
```

---

## Verify the complete frontend toolchain

When troubleshooting, run:

```bash
command -v nvm
nvm --version

node -v
npm -v
pnpm --version

which node
which npm
which pnpm
```

The intended environment is:

```text
nvm        installed and loaded
Node.js    24.x LTS
pnpm       10.15.1
```

Node and pnpm should normally resolve through:

```text
~/.nvm/versions/node/...
```