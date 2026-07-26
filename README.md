# Carve

Carve is an AI retail-readiness application for CPG founders. It scores a
brand against a retailer, isolates the highest-priority blocker, calculates
unit economics, generates verified submission materials, and records outcomes.

## Current delivery status

The v1 core loop is implemented: Supabase authentication, Prisma/Postgres data
model, scoring, waterfall, MCP-backed generation/verification, and the founder
dashboard, and Weekly Action Cadence (FR-04) are in the repository. The
remaining v1 work is its final integrated review and browser end-to-end tests.
See [the task list](tasks/tasks-carve-v1.md) for the source-of-truth checklist.

## Local development

Copy `.env.example` to `.env`, fill in the Supabase/Postgres and Managed Agent
values, then run:

```sh
npm ci
npx prisma migrate dev
npm run dev
```

Verification:

```sh
npx prisma validate
npm test
npm run type-check
npm run lint
npm run build
```

## Pull-request workflow with Factory

`main` is protected. Every change is made on a branch, verified by CI, reviewed
in a PR, and merged by a human. Factory provides the issue-to-PR control plane:

1. Create the labels listed in `.factory/tickets.toml` in GitHub.
2. Install Factory, authenticate `gh` and Codex, then run `factory validate`.
3. Add `factory:ready-for-spec` to an issue. Factory turns it into a scoped,
   testable specification.
4. A human reviews the ticket and applies `factory:ready-to-implement`.
5. Factory implements the ticket on a branch and opens a PR. It never merges.

The current host needs `gh auth login` before Factory can access GitHub.

## Azure deployment

Merging a PR into `main` triggers `.github/workflows/deploy.yml`: Azure builds
an immutable image in ACR and updates the Container App. Before merging the
deployment PR, configure these GitHub **Actions variables**:

- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `ACR_NAME`
- `STUDENT` — the Azure platform/team slug used by `ca-<STUDENT>` and the ACR
  image path. This value is still required even though it was not supplied in
  the current local environment.

Configure these runtime values as Azure Container App secrets/environment
variables, never in Git: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DIRECT_URL` (when different),
`ANTHROPIC_API_KEY`, `MCP_SERVER_TOKEN`, `CARVE_ENVIRONMENT_ID`, `CARVE_GENERATOR_AGENT_ID`,
`CARVE_VERIFIER_AGENT_ID`, and `CARVE_VAULT_ID`. The deploy image applies
committed Prisma migrations before starting.

For Weekly Action Cadence, configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
and `CRON_SECRET` as Container App runtime secrets. Configure GitHub Actions
secrets `CARVE_APP_URL` (the public `https://…` application origin) and the
same `CRON_SECRET`; `.github/workflows/weekly-actions.yml` invokes the
authenticated endpoint every Monday at 14:00 UTC.

After the first successful deployment, update the two Managed Agent YAML
definitions and the Vault credential from their placeholder MCP URL to
`https://<your-domain>/api/mcp`, then run the two-tool live MCP session test.
