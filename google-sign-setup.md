2. Fix the current redirect_mismatch

Your local frontend is sending:

http://localhost:5173/auth/callback

to Cognito.

That exact URL needs to be registered as an allowed Cognito callback URL.

Because your infrastructure is Terraform-managed, I would not make this manually in Cognito and leave it there.

Your Terraform is already designed for this. It derives Cognito callbacks, logout URLs, and API CORS from:

additional_frontend_origins

So in your infrastructure repo, find:

config/deployment.json

and change:

"additional_frontend_origins": []

to:

"additional_frontend_origins": [
"http://localhost:5173"
]

Then regenerate your Terraform configuration:

python3 scripts/configure.py --organization-outputs

Check the generated production tfvars:

grep -n "additional_frontend_origins" workloads/production/production.tfvars

You should see:

additional_frontend_origins = ["http://localhost:5173"]

Your existing Terraform logic will then derive:

Cognito callback:
http://localhost:5173/auth/callback

Cognito logout:
http://localhost:5173/

API CORS origin:
http://localhost:5173

Then:

terraform -chdir=workloads/production validate

and:

terraform -chdir=workloads/production plan \
-var-file=production.tfvars

Review the plan. You should primarily see an update to the Cognito app client plus configuration/CORS values associated with the frontend origin.

Then apply:

terraform -chdir=workloads/production apply \
-var-file=production.tfvars

After that, restart the frontend:

pnpm dev

The callback mismatch should be gone.

3. Google still needs to be configured

There is a second issue we need to address.

The frontend supports:

identity_provider=Google

but in the infrastructure you supplied, your Cognito app client currently only supports:

supported_identity_providers = ["COGNITO"]

So currently the architecture is effectively:

Email/password
↓
Cognito
↓
Benchmark

We need to change it to:

                  ┌─ Cognito username/password
Browser ─ Cognito ┤
└─ Google
↓
Cognito
↓
Cognito access token
↓
Benchmark API

AWS Cognito supports sending users straight to Google using the identity_provider=Google parameter—the code we already put in the frontend.

4. There are two different callback URLs

This distinction is very important.

Benchmark frontend callback — Cognito → your React app

http://localhost:5173/auth/callback

This goes in:

AWS Cognito
→ App client
→ Allowed callback URLs

Later production will use your real frontend domain instead.

Google callback — Google → Cognito

Google does not redirect directly to:

localhost:5173

Google redirects back to Cognito:

https://benchmark-labs-production-990721139452.auth.us-east-1.amazoncognito.com/oauth2/idpresponse

AWS explicitly requires the social provider to use the Cognito /oauth2/idpresponse endpoint.

So:

Google
│
│ redirect
▼
Cognito /oauth2/idpresponse
│
│ Cognito redirect
▼
http://localhost:5173/auth/callback
5. Next, create the Google OAuth application

In Google Cloud Console, create an OAuth client of type Web application.

The Google configuration needs:

Authorized JavaScript origin:

https://benchmark-labs-production-990721139452.auth.us-east-1.amazoncognito.com

and:

Authorized redirect URI:

https://benchmark-labs-production-990721139452.auth.us-east-1.amazoncognito.com/oauth2/idpresponse

AWS documents those exact roles for the Cognito/Google integration.

Google will then give you:

Google Client ID
Google Client Secret

Do not put the client secret in:

apps/web/.env

and do not put it in Git.

The browser doesn't need the Google secret at all.

6. Then we add Google to Terraform

Once those Google credentials exist, the Terraform side should become conceptually:

resource "aws_cognito_identity_provider" "google" {
user_pool_id  = aws_cognito_user_pool.main.id
provider_name = "Google"
provider_type = "Google"

provider_details = {
client_id        = ...
client_secret    = ...
authorize_scopes = "openid email profile"
}

attribute_mapping = {
email       = "email"
given_name  = "given_name"
family_name = "family_name"
}
}

And your app client changes from:

supported_identity_providers = ["COGNITO"]

to:

supported_identity_providers = [
"COGNITO",
"Google"
]

Cognito then performs the Google token exchange itself and issues the same Cognito-format tokens to Benchmark.

I would store the Google client secret in AWS Secrets Manager, not a Terraform .tfvars file.

What you should do right now

First fix localhost authentication:

"additional_frontend_origins": [
"http://localhost:5173"
]

Then:

python3 scripts/configure.py --organization-outputs

terraform -chdir=workloads/production validate

terraform -chdir=workloads/production plan \
-var-file=production.tfvars

Before applying, paste that Terraform plan here. I want to make sure it is only changing what we expect.

For the moment, in:

apps/web/.env

set:

VITE_GOOGLE_AUTH_ENABLED=false

Once localhost Cognito login works, we'll configure the Google OAuth client + Cognito Google provider through Terraform, then switch that to:

VITE_GOOGLE_AUTH_ENABLED=true

That gives us a clean sequence: first make normal Cognito login work locally, then add Google federation without mixing the two problems together.