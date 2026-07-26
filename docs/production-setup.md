# Carve production setup

Follow these steps in order. Do not paste a secret into GitHub issues, pull
requests, chat, or a source file.

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and sign in.
2. Click **New project**.
3. Choose your organization, name the project `carve-production`, choose the
   closest region, and set a long database password. Store that password in a
   password manager.
4. Click **Create new project** and wait until the project says it is ready.
5. Open the project's **Connect** dialog. Copy the project URL and the
   publishable key. In Carve, they become `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, respectively. The publishable key is safe
   for the browser; it is not the service-role key.
6. In the same **Connect** dialog, copy both PostgreSQL connection strings:
   the transaction-pooler string (port `6543`) is `DATABASE_URL`; the direct
   string (port `5432`) is `DIRECT_URL`. Keep both private.
7. Open **Authentication** → **URL Configuration**. Set **Site URL** to the
   final public `https://...` URL for Carve. Add these redirect URLs:
   `http://localhost:3000/**` and `https://<your-public-carve-url>/**`.
8. In **Authentication** → **Providers** → **Email**, enable **Confirm email**.
   Carve uses confirmation links to establish a verified account before the
   founder starts an assessment.

### Use the intended public domain

If the production URL is `https://carve.apps.human-angle.com/`, configure that
exact hostname on the Azure Container App first, then add it as the Supabase
**Site URL** and redirect URL above. In Azure: open the Container App →
**Custom domains** → **Add custom domain**; add the hostname and create the DNS
record Azure displays in the `human-angle.com` DNS provider. Wait until Azure
reports the certificate as active before switching traffic to the hostname.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Connect dialog | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Connect dialog: publishable key | No |
| `NEXT_PUBLIC_APP_URL` | Final public Carve URL, no trailing slash | No |
| `DATABASE_URL` | Supabase transaction pooler, port 6543 | Yes |
| `DIRECT_URL` | Supabase direct connection, port 5432 | Yes |
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

1. Open the public Carve URL and create a test account.
2. In Supabase, open **Authentication** → **Users** and copy that user's UUID.
3. In **SQL Editor**, create a founder row using the UUID, email, and name:

```sql
insert into public.founders (id, email, name)
values ('PASTE-THE-AUTH-USER-UUID', 'you@example.com', 'Your Name')
on conflict (id) do update
set email = excluded.email, name = excluded.name;
```

4. Sign out and back in. Carve should now let that account complete intake.

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
