import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const createTokenMock = vi.fn();
vi.mock("@/lib/verification-tokens", () => ({ createVerificationToken: (...a: unknown[]) => createTokenMock(...a) }));
const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
const infoMock = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { info: (...a: unknown[]) => infoMock(...a), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { sendVerificationEmail } from "@/lib/verify-email";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
beforeEach(() => {
  queryMock.mockReset();
  createTokenMock.mockReset(); createTokenMock.mockResolvedValue("raw-token");
  sendEmailMock.mockReset();
  infoMock.mockReset();
  process.env.AUTH_URL = "https://cortado.test";
  delete process.env.RESEND_API_KEY;
});
const mutableEnv = process.env as Record<string, string | undefined>;
afterEach(() => {
  mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
});

function setNodeEnv(value: string) {
  mutableEnv.NODE_ENV = value;
}

describe("sendVerificationEmail", () => {
  it("no-ops when the user is already verified", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ email: "a@b.com", email_verified: new Date() }] });
    await sendVerificationEmail("u-1");
    expect(createTokenMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
  it("creates a token and emails a /api/verify link when unverified", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ email: "a@b.com", email_verified: null }] });
    await sendVerificationEmail("u-1");
    expect(createTokenMock).toHaveBeenCalled();
    const [to, , html] = sendEmailMock.mock.calls[0];
    expect(to).toBe("a@b.com");
    expect(html).toContain("https://cortado.test/api/verify?token=raw-token");
  });
  it("L1: in production never logs the raw token URL, even without a Resend key", async () => {
    setNodeEnv("production");
    queryMock.mockResolvedValueOnce({ rows: [{ email: "a@b.com", email_verified: null }] });
    await sendVerificationEmail("u-1");
    const loggedUrl = infoMock.mock.calls.some(([, ctx]) =>
      typeof (ctx as { url?: string })?.url === "string" && (ctx as { url: string }).url.includes("raw-token"),
    );
    expect(loggedUrl).toBe(false);
    expect(infoMock).toHaveBeenCalledWith("verify_email_sent", { userId: "u-1" });
  });
  it("logs the raw token URL only in non-production dev fallback", async () => {
    setNodeEnv("development");
    queryMock.mockResolvedValueOnce({ rows: [{ email: "a@b.com", email_verified: null }] });
    await sendVerificationEmail("u-1");
    expect(infoMock).toHaveBeenCalledWith(
      "verify_link",
      expect.objectContaining({ url: expect.stringContaining("raw-token") }),
    );
  });
});
