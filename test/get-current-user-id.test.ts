import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fns are module-level so they survive vi.resetModules() (re-imported
// lib/auth re-binds to these same references via the hoisted factories).
const authMock = vi.fn();
const getSessionVersionMock = vi.fn();
const queryMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/users-repo", () => ({ getSessionVersion: getSessionVersionMock }));
vi.mock("@/lib/db", () => ({ query: queryMock }));

beforeEach(() => {
  vi.resetModules(); // fresh module graph re-binds the mocks per test (React.cache
                     // does not memoize outside an RSC render, so there's no cross-call memo)
  authMock.mockReset();
  getSessionVersionMock.mockReset();
  queryMock.mockReset();
});

async function loadGetCurrentUserId() {
  return (await import("@/lib/auth")).getCurrentUserId;
}

describe("getCurrentUserId — read-path revocation", () => {
  it("returns null for an anonymous request WITHOUT touching the DB", async () => {
    authMock.mockResolvedValue(null);
    const getCurrentUserId = await loadGetCurrentUserId();
    expect(await getCurrentUserId()).toBeNull();
    expect(getSessionVersionMock).not.toHaveBeenCalled();
  });

  it("returns the id when the session version matches the live version", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionVersionMock.mockResolvedValue(3);
    const getCurrentUserId = await loadGetCurrentUserId();
    expect(await getCurrentUserId()).toBe("u-1");
    // pin that the live lookup actually ran for an authenticated user
    expect(getSessionVersionMock).toHaveBeenCalledWith({ query: expect.any(Function) }, "u-1");
  });

  it("returns null when the session was revoked (version bumped)", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionVersionMock.mockResolvedValue(5);
    const getCurrentUserId = await loadGetCurrentUserId();
    expect(await getCurrentUserId()).toBeNull();
  });

  it("returns null when the user no longer exists (live version null)", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionVersionMock.mockResolvedValue(null);
    const getCurrentUserId = await loadGetCurrentUserId();
    expect(await getCurrentUserId()).toBeNull();
  });
});
