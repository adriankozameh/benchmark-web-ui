# SUPERADMIN organization dashboard

Platform SUPERADMIN users have an **Admin** tab on desktop and mobile. Sign-in at
the application root opens **Admin → Organizations** for these users.
The page is available at `/admin/organizations`; `/admin` and the earlier
`/admin/subscriptions` URL remain aliases.

## Create and hand off an organization

1. Select **Create organization** and enter its name and type. The backend makes
   the authenticated SUPERADMIN the initial OWNER, creates the default site, and
   starts the normal FREE trial. The dashboard sends no owner ID from the browser.
2. Use the subscription grant to choose PRO or PREMIUM and allow at least two
   users: the initial owner and the future owner must both fit the limit while
   the invitation is accepted. PREMIUM defaults to ten users; PRO grants can
   explicitly allow two or more users.
3. Send the customer an email invitation from **Invite people**. Invite them as
   a MEMBER; pending invitations do not grant ownership. Delivery status, resend,
   revocation, and expiry use the existing invitation workflow.
4. The customer signs in or creates an account with the invited email address,
   opens the invitation, and accepts it. The backend checks the email, token,
   organization status, and available capacity before adding the membership.
5. After they appear under **Members and ownership**, select **Make owner** and
   confirm. Joined members refresh every fifteen seconds while the page is
   visible; **Refresh members** loads them immediately.

Ownership transfer is a separate, explicit action after acceptance. It atomically
makes the selected member OWNER and the previous owner ADMIN, preserving exactly
one owner. The previous owner remains a member and still consumes a user seat.
Global SUPERADMIN privileges are unchanged. The backend rejects a target without
membership; an email invitation alone is insufficient. Owner authorization runs
after acquiring the organization row lock so concurrent transfers cannot use a
stale OWNER membership.

Email delivery uses the existing backend invitation configuration. For real
delivery, configure `INVITATIONS_ENABLED=true`, `INVITATION_EMAIL_MODE=SES`,
`INVITATION_ACCEPT_URL=https://<frontend-host>/invitations/accept`, and a verified
`INVITATION_FROM_EMAIL` with the existing SES permissions. If invitations are
already working from Account settings, the Admin dashboard uses the same setup.
LOG mode exposes a local preview link and does not deliver customer email.

## Subscription access

The dashboard lists all organizations with pagination. Select an organization to
view its status, billed subscription, effective access, current usage, and active
permissions. The grant form sets a PRO or PREMIUM plan, total users, total
stations, and a required reason. A grant lasts until revoked. Grants use the
existing SUPERADMIN subscription service, which updates PLAN entitlements,
records an audit event, and reconciles trial/billing suspension.

User and station values are **total allowed capacity**, including existing use.
The account owner counts as one user. Grants must cover current usage and
purchased quantities. The UI and backend prevent lowering the billed plan.
Saving a grant does not create a Stripe charge; an existing paid subscription
continues to be billed normally. Editing the grant does not cancel that billing.

**Revoke grant** opens a confirmation dialog and restores the billing
subscription's effective access. Revocation is blocked when current usage exceeds
the restored limits. FREE includes one user and one station. If its original
14-day trial has expired, revocation permits lifecycle reconciliation to suspend
the organization again. Closures and administrative suspensions are preserved.

## Deployment

1. Deploy the accompanying backend update first. `GET /api/v1/me` now includes
   `systemRole: "USER" | "SUPERADMIN"` from the persisted application user.
   The backend update also fixes grant revocation to use effective FREE station
   capacity rather than the stored purchased station quantity of zero.
   The organization creation API now defaults an omitted `ownerUserId` to the
   authenticated SUPERADMIN. Existing clients that explicitly provide an owner
   ID remain supported.
2. Deploy this frontend through the existing build/deployment process.
3. Reload or sign in with an application user whose `users.system_role` is
   `SUPERADMIN`. Organization OWNER/ADMIN roles do not grant platform access.

No database migration, new environment variables, Cognito groups, or additional
credentials are required. An older backend without `systemRole` safely leaves the
Admin tab hidden.

## API

All calls use the existing Cognito bearer token. The backend checks the persisted
SUPERADMIN role on every admin operation. The UI does not infer this role from
organization membership, email, browser storage, or unverified JWT claims.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/admin/organizations?page=0&size=25` | All organizations, paginated |
| POST | `/api/v1/admin/organizations` | Create `{name, type}`; owner defaults to the authenticated SUPERADMIN |
| GET | `/api/v1/organizations/{id}/members` | Joined users and their roles |
| POST | `/api/v1/organizations/{id}/invitations` | Email invitation using `{email, role: "MEMBER"}` |
| POST | `/api/v1/organizations/{id}/ownership-transfer` | Transfer to `{newOwnerUserId}` after the target joins |
| GET | `/api/v1/admin/organizations/{id}/subscription` | Billed/effective plan, limits, usage, grant |
| GET | `/api/v1/admin/organizations/{id}/entitlements` | Active and manual permissions |
| PUT | `/api/v1/admin/organizations/{id}/subscription` | Save `{plan, seatLimit, stationLimit, reason}` |
| DELETE | `/api/v1/admin/organizations/{id}/subscription/override` | Revoke a grant |

Direct admin URLs remain inaccessible to non-SUPERADMIN users. In-flight reads
are cancelled on organization changes/unmount. Submission is guarded against
duplicate clicks, server conflicts are displayed, and successful mutations
refresh both permission details and the signed-in user's organization access.

## Checks

```bash
pnpm --filter @benchmark/web test:admin
pnpm --filter @benchmark/web test:billing
pnpm --filter @benchmark/web test:hardware
pnpm --filter @benchmark/web check:localization
pnpm --filter @benchmark/web build
```

Backend checks (Java 25):

```bash
mvn -Dtest=CurrentUserControllerTest,DefaultAdminSubscriptionServiceTest,DefaultPlatformAuthorizationServiceTest,DefaultPlatformAdminServiceOrganizationCreationTest,OrganizationOwnershipTransferTest,DefaultOrganizationMembershipServiceTest,DefaultOrganizationInvitationServiceTest test
mvn spotless:check
```

Post-deployment check: grant a test FREE organization PREMIUM access with ten
users and one station; sign in as its owner and verify effective PREMIUM access.
Update its limits, then revoke the grant while its usage fits the original FREE
limits. Verify that a regular organization OWNER/ADMIN sees no Admin tab.
Then create an organization from Admin, confirm that you are its OWNER, invite
a second user, verify that a pending invitation has no Make owner action, accept
as the invitee, and transfer ownership after their membership appears.
