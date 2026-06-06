import { describe, it, expect } from "vitest";
import { validateEnv } from "@/lib/env";

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
    expect(() => validateEnv(prod({ AUTH_SECRET: "x", DATABASE_URL: "y" }))).not.toThrow();
  });
});
