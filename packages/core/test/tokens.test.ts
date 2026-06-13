import { describe, expect, it } from "vitest";
import { estimateTokens } from "../src";

describe("token estimation", () => {
  it("estimates one token per four characters rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("1234")).toBe(1);
    expect(estimateTokens("12345")).toBe(2);
  });
});
