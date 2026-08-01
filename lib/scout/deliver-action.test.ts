import { beforeEach, describe, expect, it, vi } from "vitest";

const { emailsSend, Resend } = vi.hoisted(() => ({
  emailsSend: vi.fn(),
  Resend: vi.fn(),
}));
vi.mock("resend", () => ({ Resend }));

const { mockBrandFindUnique, mockRetailerFindUnique } = vi.hoisted(() => ({
  mockBrandFindUnique: vi.fn(),
  mockRetailerFindUnique: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    brand: { findUnique: mockBrandFindUnique },
    retailer: { findUnique: mockRetailerFindUnique },
  },
}));

import { deliverScoutActions } from "./deliver-action";

const ACTION = {
  brandId: "brand-1",
  retailerId: "retailer-1",
  assessmentId: "assess-1",
  title: "Close the certification gap",
  detail: "Get USDA Organic certified before your next submission window.",
  dueBy: "2026-08-08",
};

describe("deliverScoutActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Resend.mockImplementation(function MockResend() {
      return { emails: { send: emailsSend } };
    });
  });

  it("throws when Resend is unconfigured — same guard as the weekly digest mailer", async () => {
    await expect(deliverScoutActions([ACTION], undefined, undefined)).rejects.toThrow(
      "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.",
    );
    expect(mockBrandFindUnique).not.toHaveBeenCalled();
  });

  it("sends a safely rendered email using the looked-up founder/brand/retailer", async () => {
    mockBrandFindUnique.mockResolvedValue({
      name: "Carve Snacks",
      founder: { email: "founder@example.com", name: "Avery <Founder>" },
    });
    mockRetailerFindUnique.mockResolvedValue({ name: "Whole Foods Market" });
    emailsSend.mockResolvedValue({ data: { id: "email-1" }, error: null });

    const result = await deliverScoutActions([ACTION], "re_test", "Carve <actions@example.com>");

    expect(result).toEqual({ sent: 1, failed: [] });
    expect(mockBrandFindUnique).toHaveBeenCalledWith({
      where: { id: "brand-1" },
      include: { founder: true },
    });
    expect(emailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Carve <actions@example.com>",
        to: "founder@example.com",
        subject: "Carve weekly action: Close the certification gap",
        html: expect.stringContaining("Avery &lt;Founder&gt;"),
      }),
    );
    expect(emailsSend.mock.calls[0][0].html).toContain("Whole Foods Market");
  });

  it("records a failure and continues when a brand no longer exists", async () => {
    mockBrandFindUnique.mockResolvedValue(null);

    const result = await deliverScoutActions([ACTION], "re_test", "Carve <actions@example.com>");

    expect(result).toEqual({ sent: 0, failed: ["brand-1"] });
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it("records a failure without throwing when Resend rejects one delivery, and still processes the rest", async () => {
    mockBrandFindUnique
      .mockResolvedValueOnce({
        name: "Carve Snacks",
        founder: { email: "founder1@example.com", name: "Avery" },
      })
      .mockResolvedValueOnce({
        name: "Second Brand",
        founder: { email: "founder2@example.com", name: "Jordan" },
      });
    mockRetailerFindUnique.mockResolvedValue({ name: "Whole Foods Market" });
    emailsSend
      .mockResolvedValueOnce({ data: null, error: { message: "sender not verified" } })
      .mockResolvedValueOnce({ data: { id: "email-2" }, error: null });

    const result = await deliverScoutActions(
      [ACTION, { ...ACTION, brandId: "brand-2" }],
      "re_test",
      "Carve <actions@example.com>",
    );

    expect(result).toEqual({ sent: 1, failed: ["brand-1"] });
  });
});
