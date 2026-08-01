import { beforeEach, describe, expect, it, vi } from "vitest";

const { emailsSend, Resend } = vi.hoisted(() => ({
  emailsSend: vi.fn(),
  Resend: vi.fn(),
}));
vi.mock("resend", () => ({ Resend }));

const {
  mockLeapAlertLogFindFirst,
  mockLeapAlertLogCreate,
  mockAssessmentFindMany,
} = vi.hoisted(() => ({
  mockLeapAlertLogFindFirst: vi.fn(),
  mockLeapAlertLogCreate: vi.fn(),
  mockAssessmentFindMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    leapAlertLog: { findFirst: mockLeapAlertLogFindFirst, create: mockLeapAlertLogCreate },
    assessment: { findMany: mockAssessmentFindMany },
  },
}));

import { sendLeapAlerts } from "./send-leap-alerts";

const ALERT = {
  retailerId: "retailer-1",
  programName: "Local & National Buying Window",
  summary: "Applications are open for Q4.",
  sourceUrl: "https://www.wholefoodsmarket.com/suppliers/leap",
  applicationLink: "https://www.wholefoodsmarket.com/suppliers/leap/apply",
};

describe("sendLeapAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Resend.mockImplementation(function MockResend() {
      return { emails: { send: emailsSend } };
    });
  });

  it("throws when Resend is unconfigured", async () => {
    await expect(sendLeapAlerts([ALERT], undefined, undefined)).rejects.toThrow(
      "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.",
    );
  });

  it("emails every founder targeting the retailer and logs the content hash", async () => {
    mockLeapAlertLogFindFirst.mockResolvedValue(null);
    mockAssessmentFindMany.mockResolvedValue([
      { brand: { founder: { email: "a@example.com", name: "Avery" } } },
      { brand: { founder: { email: "j@example.com", name: "Jordan" } } },
    ]);
    emailsSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
    mockLeapAlertLogCreate.mockResolvedValue({ id: "log-1" });

    const result = await sendLeapAlerts([ALERT], "re_test", "Carve <actions@example.com>");

    expect(result).toEqual({ sent: 2, skippedDuplicate: 0, failed: [] });
    expect(emailsSend).toHaveBeenCalledTimes(2);
    expect(mockLeapAlertLogCreate).toHaveBeenCalledWith({
      data: { retailerId: "retailer-1", contentHash: expect.any(String) },
    });
  });

  it("skips an announcement already logged with the same content hash", async () => {
    mockLeapAlertLogFindFirst.mockResolvedValue({ id: "log-existing" });

    const result = await sendLeapAlerts([ALERT], "re_test", "Carve <actions@example.com>");

    expect(result).toEqual({ sent: 0, skippedDuplicate: 1, failed: [] });
    expect(mockAssessmentFindMany).not.toHaveBeenCalled();
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it("hashes on retailerId+programName+summary+sourceUrl — a changed summary is a new hash, not a duplicate", async () => {
    mockLeapAlertLogFindFirst.mockResolvedValue(null);
    mockAssessmentFindMany.mockResolvedValue([]);

    await sendLeapAlerts([ALERT], "re_test", "Carve <actions@example.com>");
    await sendLeapAlerts(
      [{ ...ALERT, summary: "Applications are open for Q1 next year." }],
      "re_test",
      "Carve <actions@example.com>",
    );

    const hashes = mockLeapAlertLogFindFirst.mock.calls.map((call) => call[0].where.contentHash);
    expect(hashes[0]).not.toEqual(hashes[1]);
  });

  it("records a failure and continues when Resend rejects a delivery", async () => {
    mockLeapAlertLogFindFirst.mockResolvedValue(null);
    mockAssessmentFindMany.mockResolvedValue([
      { brand: { founder: { email: "a@example.com", name: "Avery" } } },
    ]);
    emailsSend.mockResolvedValue({ data: null, error: { message: "sender not verified" } });

    const result = await sendLeapAlerts([ALERT], "re_test", "Carve <actions@example.com>");

    expect(result).toEqual({ sent: 0, skippedDuplicate: 0, failed: ["retailer-1"] });
    expect(mockLeapAlertLogCreate).not.toHaveBeenCalled();
  });
});
