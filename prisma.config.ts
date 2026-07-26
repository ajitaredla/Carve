import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7: connection settings live here, not in schema.prisma.
// Use the DIRECT (non-pooled) Supabase connection string here — this URL
// is what the Prisma CLI uses for `migrate`/`studio`. The app's runtime
// PrismaClient (via @prisma/adapter-pg) uses the POOLED connection string
// instead — see prisma/client.ts once the app is scaffolded.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Local Supabase work uses a direct connection for Prisma CLI commands.
    // The Azure classroom platform exposes only DATABASE_URL, so use it as a
    // safe deployment fallback rather than making every container crash before
    // `migrate deploy` can run.
    url: process.env.DIRECT_URL ?? env("DATABASE_URL"),
  },
});
