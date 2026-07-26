import { beforeEach, describe, expect, it, vi } from "vitest";

const { emailsSend, Resend } = vi.hoisted(() => ({
  emailsSend: vi.fn(),
  Resend: vi.fn(),
}));

vi.mock("resend", () => ({ Resend }));

import { createResendWeeklyActionMailer } from "./weekly-action";

describe("createResendWeeklyActionMailer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Resend.mockImplementation(function MockResend() {
      return { emails: { send: emailsSend } };
    });
  });

  it("sends a safely rendered weekly action without making a live network call", async () => {
    emailsSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
    const mailer = createResendWeeklyActionMailer("re_test", "Carve <actions@example.com>");

    await mailer.send({
      to: "founder@example.com",
      founderName: "Avery <Founder>",
      brandName: "Carve Snacks",
      retailerName: "Carve Market",
      action: {
        dimension: "distributor",
        title: "Contact a distributor",
        detail: "Ask for an intake call.",
        dueBy: "2026-08-02",
        template: "Hi <Distributor>",
      },
    });

    expect(Resend).toHaveBeenCalledWith("re_test");
    expect(emailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Carve <actions@example.com>",
        to: "founder@example.com",
        subject: "Carve weekly action: Contact a distributor",
        html: expect.stringContaining("Avery &lt;Founder&gt;"),
      }),
    );
    expect(emailsSend.mock.calls[0][0].html).toContain("Hi &lt;Distributor&gt;");
  });

  it("fails clearly when Resend rejects a delivery", async () => {
    emailsSend.mockResolvedValue({ data: null, error: { message: "sender not verified" } });
    const mailer = createResendWeeklyActionMailer("re_test", "Carve <actions@example.com>");

    await expect(
      mailer.send({
        to: "founder@example.com",
        founderName: "Avery",
        brandName: "Carve Snacks",
        retailerName: "Carve Market",
        action: {
          dimension: "margin",
          title: "Approve a price",
          detail: "Model the margin.",
          dueBy: "2026-08-02",
        },
      }),
    ).rejects.toThrow("Resend rejected the weekly action email: sender not verified");
  });
});
