import { describe, it, expect } from "vitest";
import { escapeLike } from "@/lib/like";

describe("escapeLike", () => {
  it("escapes the % wildcard so it matches literally", () => {
    expect(escapeLike("50%")).toBe("50\\%");
  });
  it("escapes the _ single-char wildcard", () => {
    expect(escapeLike("a_b")).toBe("a\\_b");
  });
  it("escapes the backslash escape character itself (first, to avoid double-escaping)", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });
  it("leaves ordinary text untouched", () => {
    expect(escapeLike("Ethiopia")).toBe("Ethiopia");
  });
  it("handles a combined pattern", () => {
    expect(escapeLike("100%_\\")).toBe("100\\%\\_\\\\");
  });
});
