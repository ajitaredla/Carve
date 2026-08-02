# Production image for Azure Container Apps.
#
# `next.config.ts` enables standalone output. Prisma migrations are applied
# before the app starts, so committed migration files are the release contract.

FROM node:22-alpine AS build
WORKDIR /src

COPY package*.json ./
RUN npm ci

COPY . ./

# NEXT_PUBLIC_* values are inlined into the client bundle at build time —
# a Container App env var can't reach them, so they must come in as build
# args here instead. Clerk's publishable key is meant to be public (the
# secret key, never a NEXT_PUBLIC_* var, is what actually gates access), so
# passing it as a plain build arg is fine.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime

# Prisma CLI needs its config, schema, and migrations to run `migrate deploy`
# before Node starts the standalone Next server. Install the CLI fresh in its
# own directory rather than copying files out of the build stage's node_modules:
# @prisma/config pulls in its own transitive tree (effect, c12, and c12's own
# dependencies) that shifts across Prisma releases, and hand-picking which
# packages to copy broke once already when a nested dependency was missed.
#
# This can't run in /app: Next's standalone output ships its own package.json
# (a copy of the real one, which already lists prisma/dotenv as
# devDependencies), and once that's in place npm silently refuses to give our
# explicit `dotenv@^16.4.5` a top-level node_modules/dotenv — c12 wants
# dotenv@^17 too, and npm treats the existing devDependency entry as already
# accounted for instead of installing ours alongside it. Installing into a
# clean directory first sidesteps that entirely.
#
# @prisma/adapter-pg is also installed here even though lib/prisma.ts already
# imports it: Next's bundler inlines that pure-JS package straight into the
# compiled server chunk, so it was never traced into .next/standalone's own
# node_modules as a real package. That's invisible to the running app (the
# code is already bundled in), but prisma/seed.mjs runs as plain, unbundled
# Node outside that compiled output, so it needs the real package on disk —
# confirmed by actually building this image and running `db seed` in it, not
# just by re-reading this comment next time something here changes.
WORKDIR /prisma-cli
RUN npm install --no-save prisma@^7.0.0 dotenv@^16.4.5 @prisma/adapter-pg@^7.0.0

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public
COPY --from=build /src/prisma ./prisma
COPY --from=build /src/prisma.config.ts ./prisma.config.ts
RUN cp -r /prisma-cli/node_modules/. ./node_modules/

EXPOSE 3000
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node node_modules/prisma/build/index.js db seed && node server.js"]
