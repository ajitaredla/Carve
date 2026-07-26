# Production image for Azure Container Apps.
#
# `next.config.ts` enables standalone output. Prisma migrations are applied
# before the app starts, so committed migration files are the release contract.

FROM node:22-alpine AS build
WORKDIR /src

COPY package*.json ./
RUN npm ci

COPY . ./
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public

# Prisma CLI needs its config, schema, migrations, and runtime packages to run
# `migrate deploy` before Node starts the standalone Next server.
COPY --from=build /src/prisma ./prisma
COPY --from=build /src/prisma.config.ts ./prisma.config.ts
COPY --from=build /src/node_modules/prisma ./node_modules/prisma
COPY --from=build /src/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /src/node_modules/dotenv ./node_modules/dotenv

EXPOSE 3000
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
