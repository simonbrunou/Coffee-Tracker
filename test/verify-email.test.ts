import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const createTokenMock = vi.fn();
vi.mock("@/lib/verification-tokens", () => ({ createVerificationToken: (...a: unknown[]) => createTokenMock(...a) }));
const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { sendVerificationEmail } from "@/lib/verify-email";

beforeEach(() => {
  queryMock.mockReset();
  createTokenMock.mockReset(); createTokenMock.mockResolvedValue("raw-token");
  sendEmailMock.mockReset();
  process.env.AUTH_URL = "https://cortado.test";
});

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
});
