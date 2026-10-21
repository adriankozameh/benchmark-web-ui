# Sites in the Stations tab

Sites group an organization's stations by location, farm or project. Open **Stations** to create a
site, filter stations to a site, or toggle **Group by site**. Site names are limited to 200 characters.
Organization owners, administrators and platform SUPERADMIN users can create sites in active
organizations. Other members can view the site's stations without site creation controls.

A newly created site is selected in the filter and station creation form. Choose the **Site** when
creating a station, or open an existing station, change its **Site**, and select **Save station
details** to move it. Site assignment is saved on the station and survives a page reload. Site
creation does not create a station or increase purchased station capacity.

FREE organizations are limited to one site; PRO and PREMIUM allow multiple sites. Sites retained
after a downgrade to FREE remain visible and can still be used to group stations, but FREE cannot
create additional sites. Manual PRO and PREMIUM subscription grants also enable multiple sites
through the existing effective subscription rules. Station capacity follows the subscription.

The frontend uses the existing APIs:

- `GET /api/v1/organizations/{organizationId}/sites`
- `POST /api/v1/organizations/{organizationId}/sites` with `{ "name": "North Farm" }`
- Existing station POST/PATCH endpoints with `siteId` for assignment.

Site creation uses existing endpoints. Enabling multiple sites on PRO requires the backend policy
update below; no database migrations or new environment variables are required. English and Spanish
are supported. The grouping/filter controls in this change apply to the Stations tab.

Apply `frontend-pro-sites.patch` from the frontend repository root after `frontend-sites.patch`
and the earlier Admin/ownership changes. Apply `backend-pro-sites.patch` in the backend repository
and deploy the backend before the frontend so PRO site creation is accepted by the server. Then run:

```bash
pnpm --filter @benchmark/web test:sites
pnpm --filter @benchmark/web check:localization
pnpm --filter @benchmark/web build
```
