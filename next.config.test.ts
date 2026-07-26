import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Next production configuration", () => {
  it("applies the baseline browser security headers to every route", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([
      expect.objectContaining({
        source: "/:path*",
        headers: expect.arrayContaining([
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ]),
      }),
    ]);
  });
});
