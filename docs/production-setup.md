# Carve production setup

Follow these steps in order. Do not paste a secret into GitHub issues, pull
requests, chat, or a source file.

## 1. Create the Clerk application and the Neon database

Carve's identity provider is Clerk; its Postgres database is Neon. Both are
self-serve — no Azure platform permissions are needed for either.

### Clerk

1. Go to <https://dashboard.clerk.com> and sign in.
2. Create an application (or use an existing one). Clerk gives you separate
   **Development** and **Production** instances within one application —
   use Development for local work and CI, Production for the deployed app,
   so they never share a user pool.
3. Enable email/password sign-in. Set the verification strategy to **email
   code** (not link) — Carve's sign-up flow expects an inline 6-digit code,
   not a clicked link, and has no callback route for the link-based flow.
   No OAuth providers are configured.
4. Open **API Keys** (left sidebar). Copy the **Publishable key** →
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; reveal and copy the **Secret key** →
   `CLERK_SECRET_KEY`. The publishable key is safe for the browser; the
   secret key is server-only and must never reach a Client Component.
5. Under **Configure**, set the allowed origins/redirect URLs to include
   `http://localhost:3000` and the final production URL, once known.

### Neon

1. Go to <https://neon.tech> and sign in (GitHub login works).
2. Create a project named `carve-production`, choosing a region close to
   the Azure Container App's region. Create a second project (or a separate
   branch within one project) for dev/CI, so production and dev/CI data
   never mix — matches how dev/CI already uses its own separate database
   today.
3. Open **Connect** on the project dashboard. Click **Show password**.
   Toggle **Connection pooling** — with it on, copy the string
   (hostname has a `-pooler` suffix) as `DATABASE_URL`; with it off, copy
   the string (no suffix) as `DIRECT_URL`. Store both in a password manager.
4. Add `&pgbouncer=true` to `DATABASE_URL` if Neon's own string doesn't
   already include it — this tells Prisma's query engine to behave
   correctly against a PgBouncer-fronted pooled connection; it is a
   Prisma-specific flag, not a Neon one, and must not be added to
   `DIRECT_URL`.

### Use the intended public domain

If the production URL is `https://carve.apps.human-angle.com/`, configure
that exact hostname on the Azure Container App first (Container App →
**Custom domains** → **Add custom domain**; add the hostname and create the
DNS record Azure displays in the `human-angle.com` DNS provider; wait until
Azure reports the certificate as active), then add it as an allowed
origin/redirect URL in Clerk's **Configure** settings above.

## 2. Create the Anthropic key

1. Go to <https://console.anthropic.com/> and sign in.
2. Open **Settings** → **API keys**.
3. Click **Create key**.
4. Name it `carve-production`, create it, and copy it immediately. It starts
   with `sk-ant-` and is shown only once.
5. Save it as the server-only `ANTHROPIC_API_KEY` secret below. Never put it
   in a `NEXT_PUBLIC_*` variable.

## 3. Add Container App secrets

1. Open <https://portal.azure.com/>.
2. Open **Container Apps**, then open `ca-<STUDENT>`.
3. In the left menu, select **Secrets** and click **Add** once for each secret
   value below. Use lowercase, hyphenated secret names such as
   `anthropic-api-key`; paste the value only in Azure.
4. Open **Revisions and replicas** → **Create new revision**. Select the
   container, then **Environment variables** → **Add**.
5. Add the matching uppercase variable name. For every private value, select
   **Reference a secret** and choose the secret you just added. Save and
   create the revision.

Create these variables:

| Variable | Where its value comes from | Private? |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard -> API Keys | No |
| `CLERK_SECRET_KEY` | Clerk dashboard -> API Keys (reveal first) | Yes |
| `NEXT_PUBLIC_APP_URL` | Final public Carve URL, no trailing slash | No |
| `DATABASE_URL` | Neon Connect dialog, pooling toggle ON | Yes |
| `DIRECT_URL` | Neon Connect dialog, pooling toggle OFF | Yes |
| `ANTHROPIC_API_KEY` | Anthropic Console | Yes |
| `CARVE_CHAT_MODEL` | `claude-haiku-4-5` unless deliberately changed after evaluation | No |
| `MCP_SERVER_TOKEN` | New random token: `openssl rand -hex 32` | Yes |
| `CARVE_ENVIRONMENT_ID` | Existing Carve Managed Agents environment | Yes |
| `CARVE_GENERATOR_AGENT_ID` | Existing generator agent | Yes |
| `CARVE_VERIFIER_AGENT_ID` | Existing verifier agent | Yes |
| `CARVE_VAULT_ID` | Existing Carve vault | Yes |
| `RESEND_API_KEY` | Resend API key | Yes |
| `RESEND_FROM_EMAIL` | A verified Resend sender, e.g. `Carve <hello@example.com>` | No |
| `CRON_SECRET` | A different new random token: `openssl rand -hex 32` | Yes |

Never set `CARVE_MOCK_AGENTS=1` in production.

## 4. Set up weekly email

1. Go to <https://resend.com/domains> and add your sending domain.
2. Copy the DNS records Resend shows into your DNS provider.
3. Return to Resend and wait for the domain to show **Verified**.
4. Go to **API Keys** → **Create API Key**. Name it `carve-production` and
   choose **Sending access**, restricted to your verified domain.
5. Use the value once as `RESEND_API_KEY` above, then set
   `RESEND_FROM_EMAIL` to an address on that verified domain.

## 5. Set GitHub's weekly scheduler secrets

1. Open <https://github.com/ajitaredla/Carve/settings/secrets/actions>.
2. Click **New repository secret**.
3. Create `CARVE_APP_URL` with the complete public URL, for example
   `https://carve.example.com` (no trailing slash).
4. Create `CRON_SECRET` with exactly the same value used in Azure.
5. After the deployment is healthy, open the repository's **Actions** tab,
   choose **Send weekly Carve actions**, click **Run workflow**, and confirm
   it succeeds. Do this only after there is at least one test founder and a
   verified Resend sender.

## 6. Apply the database schema and verify sign-in

The production container automatically runs `prisma migrate deploy` before it
starts. After the first successful deployment:

1. Open the public Carve URL and create a test account (email + password,
   then the inline verification code Clerk emails you).
2. Sign-up provisions the matching `founders` row automatically, keyed on
   Clerk's user id (`clerkUserId`) — no manual SQL step should normally be
   needed. If it ever is (e.g. a founder migrated from the old Supabase
   setup whose row predates Clerk), Carve's own self-heal flow
   (`components/account-not-provisioned.tsx`) provisions it automatically
   on that founder's first post-cutover sign-in — just sign in normally and
   follow the on-screen prompt.
3. To confirm a founder's Clerk identity is wired up correctly, open
   Clerk's dashboard → **Users**, find the account by email, and confirm
   its user id (`user_...`) matches the `clerk_user_id` column on that
   founder's row in Neon (via `npx prisma studio` or the SQL Editor).

### Apply the assistant migration

The Ask Carve workspace stores a brand-scoped conversation history. Before
deploying the version that contains it, run this command from the Carve folder
with production database variables loaded:

```bash
npx prisma migrate deploy
```

Confirm the migration named `20260726113000_add_assistant_chat` is applied.
Do not launch the assistant before this step: it needs the `chat_conversations`
and `chat_messages` tables.

## 7. Do not invent retailer data

Before using a production assessment, the `retailers` table needs approved,
dated retailer requirements. Every row must include at least this JSON shape:

```json
{
  "minGrossMarginPct": 40,
  "requiredCertifications": ["sqf"],
  "submissionWindow": { "open": false, "daysUntilNextWindow": 30 }
}
```

This repository intentionally does not contain an authoritative retailer-data
source or seed script. Do not copy example values into production as if they
were retailer facts. First choose an approved source and owner for each
retailer's data; then add a reviewed, repeatable seed/import step.

## 8. Remove setup data before inviting users

Before launch, remove or replace the temporary retailer and any documents made
while `CARVE_MOCK_AGENTS=1` was enabled. Those records are useful for local
testing but are not customer-facing content. Use approved retailer facts, run
real generation after the Anthropic MCP URL is configured, and review every
document before it is shared externally.
