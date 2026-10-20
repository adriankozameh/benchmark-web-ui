# Data providers hardware assistant

Settings → Data providers now displays a hardware setup chat panel beside the
provider accounts on desktop and below them on smaller screens. Users choose a
supported provider, ask follow-up questions, or use the credential/test/station-link
starter questions. English and Spanish are supported. The assistant gives guidance;
customers continue to enter credentials in the existing provider form and perform
changes with the existing controls.

The panel uses the existing authenticated API client and calls
`POST /api/v1/organizations/{organizationId}/hardware-assistant/messages`.
It has no AWS credentials or direct runtime access. Do not add provider form state
or saved credentials to chat requests. Organization, user, plan, and role authorization
belong to the backend. The panel also appears for FREE/PRO users so they can learn
the setup process; actual hardware management retains its existing PREMIUM rules.

Conversations stay in component memory. Navigating away, changing organization, or
choosing a different provider clears the conversation. A New conversation button
resets it manually. The request contains at most 12 previous turns. Navigation
aborts in-flight requests, and unavailable/rate-limited responses show a retryable
message without interfering with the existing provider form.

Deploy the updated chatbot runtime and Java backend before this frontend. The
backend repository's `HARDWARE_ASSISTANT.md` documents runtime configuration and
IAM permissions. There are no new frontend environment variables.

```bash
pnpm install --frozen-lockfile
pnpm --filter @benchmark/web build
pnpm --filter @benchmark/web test:hardware
pnpm --filter @benchmark/web check:localization
```
