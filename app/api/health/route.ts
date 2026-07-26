import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness endpoint for Azure Container Apps and operational checks.
 *
 * This intentionally performs a minimal database query: a running Next.js
 * process is not ready to serve Carve if it cannot reach Postgres. The
 * response contains no credentials, deployment metadata, or internal error
 * details.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok" },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[health] database readiness check failed", error);
    return NextResponse.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
