import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send: sendMock }; } }));
const infoMock = vi.fn();
const errorMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { info: (...a: unknown[]) => infoMock(...a), error: (...a: unknown[]) => errorMock(...a), warn: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => { sendMock.mockReset(); infoMock.mockReset(); errorMock.mockReset(); delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; });

async function load() { return (await import("@/lib/email")).sendEmail; }

describe("sendEmail", () => {
  it("dev fallback: logs (no SDK call) with a REDACTED recipient when RESEND_API_KEY is absent", async () => {
    const sendEmail = await load();
    await sendEmail("user@e.com", "Subj", "<p>hi</p>");
    expect(sendMock).not.toHaveBeenCalled();
    const [, ctx] = infoMock.mock.calls[0] as [string, { to: string }];
    expect(ctx.to).not.toBe("user@e.com"); // L2: no raw PII in logs
    expect(ctx.to).toBe("u***@e.com");
  });
  it("sends via Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_x"; process.env.EMAIL_FROM = "no-reply@cortado.test";
    sendMock.mockResolvedValueOnce({ data: { id: "e1" }, error: null });
    const sendEmail = await load();
    await sendEmail("u@e.com", "Subj", "<p>hi</p>");
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ from: "no-reply@cortado.test", to: "u@e.com", subject: "Subj" }));
  });
  it("throws when Resend returns an error, logging a REDACTED recipient", async () => {
    process.env.RESEND_API_KEY = "re_x"; process.env.EMAIL_FROM = "no-reply@cortado.test";
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "bad" } });
    const sendEmail = await load();
    await expect(sendEmail("user@e.com", "Subj", "<p>hi</p>")).rejects.toThrow(/bad/);
    const [, ctx] = errorMock.mock.calls[0] as [string, { to: string }];
    expect(ctx.to).toBe("u***@e.com");
  });
});
