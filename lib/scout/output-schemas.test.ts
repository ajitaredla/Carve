import { describe, expect, it } from "vitest";
import {
  ActionOutputSchema,
  LeapAlertOutputSchema,
  ProposalOutputSchema,
  classifyOutputFilename,
} from "./output-schemas";

describe("classifyOutputFilename", () => {
  it("classifies each recognized prefix", () => {
    expect(classifyOutputFilename("action-brand-1.json")).toBe("action");
    expect(classifyOutputFilename("proposal-retailer-1-abc.json")).toBe("proposal");
    expect(classifyOutputFilename("leap-retailer-1-xyz.json")).toBe("leap");
  });

  it("returns null for anything else, rather than guessing", () => {
    expect(classifyOutputFilename("summary.json")).toBeNull();
    // "actions.json" has no hyphen after "action" — must NOT match.
    expect(classifyOutputFilename("actions.json")).toBeNull();
  });
});

describe("ActionOutputSchema", () => {
  it("rejects unrecognized keys (strict)", () => {
    const result = ActionOutputSchema.safeParse({
      brandId: "brand-1",
      retailerId: "retailer-1",
      assessmentId: "assess-1",
      title: "t",
      detail: "d",
      dueBy: "2026-08-08",
      extra: "not allowed",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed action", () => {
    const result = ActionOutputSchema.safeParse({
      brandId: "brand-1",
      retailerId: "retailer-1",
      assessmentId: "assess-1",
      title: "t",
      detail: "d",
      dueBy: "2026-08-08",
    });
    expect(result.success).toBe(true);
  });
});

describe("ProposalOutputSchema", () => {
  it("accepts an arbitrary-shaped proposedRequirements object", () => {
    const result = ProposalOutputSchema.safeParse({
      retailerId: "retailer-1",
      proposedRequirements: { minGrossMarginPct: 42, requiredCertifications: ["non_gmo"] },
      sourceUrl: "https://example.com",
      rationale: "because",
    });
    expect(result.success).toBe(true);
  });
});

describe("LeapAlertOutputSchema", () => {
  it("allows applicationLink to be explicitly null", () => {
    const result = LeapAlertOutputSchema.safeParse({
      retailerId: "retailer-1",
      programName: "LEAP",
      summary: "s",
      sourceUrl: "https://example.com",
      applicationLink: null,
    });
    expect(result.success).toBe(true);
  });
});
