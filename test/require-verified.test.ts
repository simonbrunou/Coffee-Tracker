import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const getSessionStateMock = vi.fn();
const queryMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/users-repo", () => ({ getSessionState: getSessionStateMock, getSessionVersion: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: queryMock }));

beforeEach(() => { vi.resetModules(); authMock.mockReset(); getSessionStateMock.mockReset(); queryMock.mockReset(); });
async function load() { return (await import("@/lib/auth")).requireVerifiedUserId; }

describe("requireVerifiedUserId", () => {
  it("returns the id for a verified credential user", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionStateMock.mockResolvedValue({ sessionVersion: 3, emailVerified: new Date(), hasPassword: true });
    expect(await (await load())()).toBe("u-1");
  });
  it("throws for an unverified credential user", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionStateMock.mockResolvedValue({ sessionVersion: 3, emailVerified: null, hasPassword: true });
    await expect((await load())()).rejects.toThrow(/not verified/i);
  });
  it("allows an OAuth user (no password)", async () => {
    authMock.mockResolvedValue({ user: { id: "u-2" }, sessionVersion: 0 });
    getSessionStateMock.mockResolvedValue({ sessionVersion: 0, emailVerified: null, hasPassword: false });
    expect(await (await load())()).toBe("u-2");
  });
  it("throws on revocation (sv mismatch) before the verified check", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionStateMock.mockResolvedValue({ sessionVersion: 9, emailVerified: new Date(), hasPassword: true });
    await expect((await load())()).rejects.toThrow(/revoked/i);
  });
});
