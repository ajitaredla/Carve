import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Runtime PrismaClient singleton.
//
// Prisma 7 requires an explicit driver adapter — the client no longer talks
// to Postgres directly. This uses the POOLED `DATABASE_URL` (e.g. Supabase's
// pgbouncer/transaction-mode connection string), which is what the running
// app should use for request-scoped queries. This is intentionally distinct
// from `DIRECT_URL`, which `prisma.config.ts` uses for migrations/introspection
// — those need a direct (non-pooled) connection.
//
// The `globalThis` cache prevents Next.js dev-mode hot reload from opening a
// new connection pool on every file save/module reload.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill in the pooled Supabase connection string.",
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
