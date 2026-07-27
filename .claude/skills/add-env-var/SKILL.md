---
name: add-env-var
description: Add an environment variable (API key, external service URL, config flag) to a capstone deployed on the class Azure platform (*.apps.human-angle.com). Use whenever the app needs a new env var in production — an API key for an external service, a setting read via process.env, or anything that works locally with .env but is undefined after deploy.
---

# Add an environment variable to the deployed capstone

This repo deploys to the class Azure platform: a Container App named
`ca-<team>` in resource group `rg-students-platform`, deployed by
`.github/workflows/deploy.yml` on every merge to `main`. The workflow's CI
identity has permission to update **this team's app only** — all config
changes go through the workflow, never through `az` commands run locally
(students have no Azure write access from their laptops; don't suggest it).

## Step 0 — classify the variable

Ask (or determine from the code) three things, then follow exactly one route:

1. **Is it platform-managed?** `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`,
   `PORT`, `HOSTNAME` are already set on the app by the platform.
   **Never set, override, or remove these.** If one of them seems wrong,
   the student should ask the instructor — stop here.
2. **Is it secret?** API keys, tokens, passwords, anything from a provider
   dashboard → Route B. Non-secret settings (a public URL, a feature flag,
   a model name) → Route A.
3. **Does client-side code read it?** Any `NEXT_PUBLIC_*` variable → Route C
   (runtime env vars will NOT work for these), regardless of the answers above.
   A secret must never be `NEXT_PUBLIC_*` — that ships it to every browser.

In all routes, also add the variable to the student's local `.env` for
development, and verify `.env` is in `.gitignore` (never committed).

## Route A — non-secret runtime variable

Edit `.github/workflows/deploy.yml`. Add a "Sync app config" step **after the
`azure/login` step and before the "Deploy to Container App" step** (create it
if absent; if it already exists, append to its `--set-env-vars` list):

```yaml
      - name: Sync app config
        run: |
          az containerapp update \
            --resource-group rg-students-platform \
            --name ca-${{ vars.STUDENT }} \
            --set-env-vars SUPPORT_EMAIL=team@example.com FEATURE_QUIZ=on
```

Values live in the workflow file, versioned like code. `--set-env-vars`
merges — it never removes other variables — and the step is idempotent, so
running on every push is correct.

## Route B — secret runtime variable (API keys)

Two parts: the student stores the value in GitHub, the workflow puts it on
the app.

**1. Student action (GitHub UI — you cannot do this for them; give exact
clicks):** repo **Settings → Secrets and variables → Actions → Secrets tab →
New repository secret**. Name it in `UPPER_SNAKE_CASE` (e.g.
`OPENWEATHER_API_KEY`), paste the value.

⚠️ This is the **Secrets** tab — the opposite of setup day, when the five
deploy values went in the **Variables** tab. Secrets are for values that must
stay hidden; GitHub masks them in logs.

**2. Edit `.github/workflows/deploy.yml`** — same placement as Route A:

```yaml
      - name: Sync app config
        run: |
          az containerapp secret set \
            --resource-group rg-students-platform \
            --name ca-${{ vars.STUDENT }} \
            --secrets openweather-api-key="${{ secrets.OPENWEATHER_API_KEY }}"
          az containerapp update \
            --resource-group rg-students-platform \
            --name ca-${{ vars.STUDENT }} \
            --set-env-vars OPENWEATHER_API_KEY=secretref:openweather-api-key
```

Naming: the Container App secret name (`openweather-api-key`) must be
lowercase letters, numbers, and hyphens only; the env var name matches what
the code reads (`process.env.OPENWEATHER_API_KEY`). Keep the convention:
env var `FOO_BAR` ↔ secret `foo-bar`.

This mirrors how the platform already wires `DATABASE_URL` and `AUTH_SECRET`
(a secret on the app, referenced by an env var). The key never appears in
code, in the image, or in logs.

## Route C — `NEXT_PUBLIC_*` variable (build-time)

Next.js inlines `NEXT_PUBLIC_*` values **at build time**, and the build
happens inside `az acr build` — a runtime env var on the Container App does
nothing for these. Two edits:

**1. `Dockerfile`** — in the build stage, before `npm run build`:

```dockerfile
ARG NEXT_PUBLIC_MAP_STYLE
ENV NEXT_PUBLIC_MAP_STYLE=$NEXT_PUBLIC_MAP_STYLE
RUN npx prisma generate && npm run build
```

**2. `.github/workflows/deploy.yml`** — pass it in the build step:

```yaml
          az acr build --registry ${{ vars.ACR_NAME }} \
            --image ${{ vars.STUDENT }}/web:${{ github.sha }} \
            --build-arg NEXT_PUBLIC_MAP_STYLE=streets .
```

Never route a secret this way — build args and `NEXT_PUBLIC_*` values end up
readable in the shipped JavaScript.

## Guardrails (apply to every route)

- **Never** pass `--command` or any container command override to
  `az containerapp update` — an override persists across all future deploys
  and silently pins the app to stale behavior.
- Values containing a literal `$` get mangled (the platform applies
  shell-style expansion; `$$` collapses to `$`). If a generated key contains
  `$`, regenerate it rather than trying to escape it.
- Quote any value containing spaces.
- Don't `echo` secret values in workflow steps, even "temporarily".
- Removing a variable later: run `--remove-env-vars NAME` once (a one-commit
  change to the sync step), then delete both the flag and, for secrets, the
  GitHub secret.

## Verify

1. Commit on a branch, PR, merge to `main` (the class workflow — never push
   straight to `main`).
2. Watch the **Actions** run go green.
3. Confirm in the app itself (the feature that needed the key now works), or
   in the portal (read-only): `rg-students-platform` → `ca-<team>` →
   **Log stream** — no "missing key"/undefined-variable errors at startup.
