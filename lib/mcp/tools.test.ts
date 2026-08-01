import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Scoped to the new list_active_assessments tool only — the original four
// tools (get_retailer_requirements, run_waterfall_calculator,
// get_brand_context, get_verification_facts) have no existing test coverage
// and adding it is out of scope for this change.
//
// Uses the MCP SDK's own InMemoryTransport (client <-> server, same
// process) rather than calling a private handler function directly — this
// exercises the real registerTool()/inputSchema/outputSchema wiring, not
// just the underlying query logic.

const { mockAssessmentFindMany } = vi.hoisted(() => ({
  mockAssessmentFindMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    assessment: { findMany: mockAssessmentFindMany },
  },
}));

async function connectedClient() {
  const { createCarveMcpServer } = await import("./tools");
  const server = createCarveMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

describe("list_active_assessments", () => {
  beforeEach(() => {
    mockAssessmentFindMany.mockReset();
  });

  it("returns brandId/assessmentId/retailer fields only — no founder PII", async () => {
    mockAssessmentFindMany.mockResolvedValue([
      {
        brandId: "brand-1",
        id: "assess-1",
        retailerId: "retailer-1",
        retailer: { slug: "whole-foods-market", name: "Whole Foods Market" },
      },
      {
        brandId: "brand-2",
        id: "assess-2",
        retailerId: "retailer-2",
        retailer: { slug: "sprouts-farmers-market", name: "Sprouts Farmers Market" },
      },
    ]);

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_active_assessments",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      assessments: [
        {
          brandId: "brand-1",
          assessmentId: "assess-1",
          retailerId: "retailer-1",
          retailerSlug: "whole-foods-market",
          retailerName: "Whole Foods Market",
        },
        {
          brandId: "brand-2",
          assessmentId: "assess-2",
          retailerId: "retailer-2",
          retailerSlug: "sprouts-farmers-market",
          retailerName: "Sprouts Farmers Market",
        },
      ],
    });

    // The tool never selects founder/brand name/email — only ids + retailer
    // fields. Assert on the actual Prisma query shape, not just the output,
    // so a future accidental `include: { brand: true }` (which would pull
    // founder-adjacent data) fails this test even before it reaches output.
    expect(mockAssessmentFindMany).toHaveBeenCalledWith({
      select: {
        brandId: true,
        id: true,
        retailerId: true,
        retailer: { select: { slug: true, name: true } },
      },
    });
  });

  it("returns an empty list when no assessments exist", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_active_assessments",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ assessments: [] });
  });

  it("rejects unrecognized input arguments (strict schema)", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_active_assessments",
      arguments: { unexpected: "field" },
    });

    expect(result.isError).toBe(true);
    const [block] = result.content as Array<{ type: string; text: string }>;
    expect(block.text).toContain("Unrecognized key");
    expect(mockAssessmentFindMany).not.toHaveBeenCalled();
  });

  it("returns a sanitized tool error, not a raw exception, on an unexpected DB failure", async () => {
    mockAssessmentFindMany.mockRejectedValue(new Error("connection reset"));

    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_active_assessments",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const [block] = result.content as Array<{ type: string; text: string }>;
    expect(block.text).not.toContain("connection reset");
    expect(block.text.toLowerCase()).toContain("unexpected error");
  });
});
