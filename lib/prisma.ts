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
//
// `prisma` is a lazy Proxy rather than a real client: `next build` imports
// every route module (even `force-dynamic` ones, like /api/health) just to
// read its config exports, with no DATABASE_URL available at that point (the
// Docker build stage never has it — see prisma.config.ts). Building the
// client eagerly at module scope would throw during that import and fail
// every build; deferring construction to first property access means it
// only runs when a real request comes in, once the platform has set
// DATABASE_URL on the running container.

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

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
