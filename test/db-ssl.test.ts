import { describe, it, expect, vi } from "vitest";
import { resolveSslConfig } from "@/lib/db-ssl";

const env = (v?: string) => ({ DATABASE_SSL: v }) as unknown as NodeJS.ProcessEnv;

describe("resolveSslConfig", () => {
  it("returns undefined when unset or 'disable'", () => {
    expect(resolveSslConfig(env())).toBeUndefined();
    expect(resolveSslConfig(env("disable"))).toBeUndefined();
  });

  it("requires verified TLS for 'require'", () => {
    expect(resolveSslConfig(env("require"))).toEqual({ rejectUnauthorized: true });
  });

  it("disables verification for 'no-verify' AND warns once", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveSslConfig(env("no-verify"))).toEqual({ rejectUnauthorized: false });
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
