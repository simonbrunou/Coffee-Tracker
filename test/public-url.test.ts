import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getPublicBaseUrl } from "@/lib/public-url";
import { validateEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

describe("getPublicBaseUrl", () => {
  let orig: string | undefined;
  beforeEach(() => { orig = process.env.AUTH_URL; });
  afterEach(() => { if (orig === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = orig; });

  it("uses AUTH_URL, stripping a trailing slash", () => {
    process.env.AUTH_URL = "https://cortado.example.com/";
    expect(getPublicBaseUrl()).toBe("https://cortado.example.com");
  });
  it("falls back to localhost when AUTH_URL is unset", () => {
    delete process.env.AUTH_URL;
    expect(getPublicBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("validateEnv requires AUTH_URL in production", () => {
  it("throws when AUTH_URL is missing in production", () => {
    expect(() => validateEnv({ NODE_ENV: "production", AUTH_SECRET: "x", DATABASE_URL: "y" } as NodeJS.ProcessEnv))
      .toThrow(/AUTH_URL/);
  });
  it("passes in production when all present", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(() => validateEnv({ NODE_ENV: "production", AUTH_SECRET: "x", DATABASE_URL: "y", AUTH_URL: "https://h", RESEND_API_KEY: "r", EMAIL_FROM: "e" } as NodeJS.ProcessEnv))
      .not.toThrow();
    warn.mockRestore();
  });
});
