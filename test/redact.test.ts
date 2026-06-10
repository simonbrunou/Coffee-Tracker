import { describe, it, expect } from "vitest";
import { redactEmail, redactKey } from "@/lib/redact";

describe("redactEmail", () => {
  it("masks the local part but keeps the domain for debuggability", () => {
    expect(redactEmail("victim@example.com")).toBe("v***@example.com");
  });
  it("masks a single-char local part without leaking it", () => {
    expect(redactEmail("a@b.com")).toBe("***@b.com");
  });
  it("never returns the full address", () => {
    expect(redactEmail("longname@host.io")).not.toContain("longname");
  });
  it("redacts a string with no @ wholesale", () => {
    expect(redactEmail("notanemail")).toBe("<redacted>");
  });
});

describe("redactKey", () => {
  it("redacts the email embedded in a rate-limit key", () => {
    expect(redactKey("login:email:victim@example.com")).toBe("login:email:v***@example.com");
  });
  it("masks the IP in an ip key (PII must not hit logs)", () => {
    expect(redactKey("login:ip:1.2.3.4")).toBe("login:ip:<redacted>");
    expect(redactKey("csp:ip:203.0.113.7")).toBe("csp:ip:<redacted>");
  });
  it("masks the user id in a user key", () => {
    expect(redactKey("verify:user:u-abc123")).toBe("verify:user:<redacted>");
  });
});
