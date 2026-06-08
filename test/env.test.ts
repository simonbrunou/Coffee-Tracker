import { describe, it, expect, vi } from "vitest";
import { validateEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const prod = (extra: Record<string, string> = {}) =>
  ({ NODE_ENV: "production", ...extra }) as unknown as NodeJS.ProcessEnv;

describe("validateEnv", () => {
  it("no-ops outside production", () => {
    expect(() => validateEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("throws listing BOTH missing vars in production", () => {
    expect(() => validateEnv(prod())).toThrow(/AUTH_SECRET[\s\S]*DATABASE_URL/);
  });

  it("throws naming only the still-missing var", () => {
    expect(() => validateEnv(prod({ AUTH_SECRET: "x" }))).toThrow(/DATABASE_URL/);
  });

  it("passes when both are present", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(() => validateEnv(prod({ AUTH_SECRET: "x", DATABASE_URL: "y", AUTH_URL: "https://h" }))).not.toThrow();
    warn.mockRestore();
  });
});

describe("validateEnv — Resend config", () => {
  it("warns (does not throw) when RESEND_API_KEY/EMAIL_FROM are missing in production", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(() => validateEnv(prod({ AUTH_SECRET: "x", DATABASE_URL: "y", AUTH_URL: "https://h" }))).not.toThrow();
    expect(warn).toHaveBeenCalledWith("email_not_configured", expect.anything());
    warn.mockRestore();
  });
  it("does not warn when Resend is configured", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    validateEnv(prod({ AUTH_SECRET: "x", DATABASE_URL: "y", AUTH_URL: "https://h", RESEND_API_KEY: "re_x", EMAIL_FROM: "n@e.com" }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
