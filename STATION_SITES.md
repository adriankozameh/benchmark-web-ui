# Sites in the Stations tab

Sites group an organization's stations by location, farm or project. Open **Stations** to create a
site, filter stations to a site, or toggle **Group by site**. Site names are limited to 200 characters.
Organization owners, administrators and platform SUPERADMIN users can create, rename and delete
sites in active organizations. Other members can view sites without management controls.

Open **Sites → Manage sites** in the Stations tab to find **Rename site** and **Delete site** for
each site. Renaming updates the displayed name while preserving its station assignments. Names must
be unique within the organization (case-insensitive); duplicate names are rejected by the backend.

A Delete click opens a dialog. If the site contains stations, the dialog explains that every station
must be moved to another site first. **View stations** selects that site's stations; open each
station, change its **Site**, and select **Save station details**. The last remaining site cannot be
deleted, even when empty. Only an empty, non-last site can be confirmed for deletion. The backend
checks these conditions again under the organization lock, so concurrent changes cannot bypass the
rules. Failed requests keep the site visible and display the server's error.

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
- `PATCH /api/v1/organizations/{organizationId}/sites/{siteId}` with `{ "name": "North Farm" }`
- `DELETE /api/v1/organizations/{organizationId}/sites/{siteId}` (204 on success)
- Existing station POST/PATCH endpoints with `siteId` for assignment.

Site creation uses existing endpoints. Enabling multiple sites on PRO requires the backend policy
update below; no database migrations or new environment variables are required. English and Spanish
are supported. The grouping/filter controls in this change apply to the Stations tab.

Apply `frontend-site-management.patch` after the earlier frontend patches, including the macOS
import fix. Renaming and deleting use existing backend endpoints and require no backend changes.
Multiple sites on PRO use the earlier `backend-pro-sites.patch` policy update. Then run:

```bash
pnpm --filter @benchmark/web test:sites
pnpm --filter @benchmark/web check:localization
pnpm --filter @benchmark/web build
```
