import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: connection settings live here, not in schema.prisma.
// Use the DIRECT (non-pooled) Neon connection string here — this URL
// is what the Prisma CLI uses for `migrate`/`studio`. The app's runtime
// PrismaClient (via @prisma/adapter-pg) uses the POOLED connection string
// instead — see lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Plain node, not `tsx prisma/seed.ts` — the deployed container has no
    // TypeScript runtime (see prisma/seed.mjs's own header comment).
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    // Local Neon work uses a direct connection for Prisma CLI commands.
    // The Azure classroom platform exposes only DATABASE_URL at container
    // runtime for `migrate deploy` — but the Docker build stage (where
    // `prisma generate` also runs) has no env vars at all, since .dockerignore
    // keeps .env out of the build context on purpose. `prisma generate` never
    // opens a connection, so a placeholder here is safe; it's never reached
    // once DIRECT_URL or the platform's real DATABASE_URL is set.
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgresql://build:build@localhost:5432/build",
  },
});
