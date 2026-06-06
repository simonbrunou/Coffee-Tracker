import { describe, it, expect, vi } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  it("emits one parseable JSON line with level, msg, spread ctx, and ts", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("hello", { a: 1 });
    expect(out).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(out.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "info", msg: "hello", a: 1 });
    expect(typeof parsed.ts).toBe("string");
    out.mockRestore();
  });

  it("routes warn/error to console.error and debug/info to console.log", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(log).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledTimes(2);
    log.mockRestore();
    err.mockRestore();
  });
});
