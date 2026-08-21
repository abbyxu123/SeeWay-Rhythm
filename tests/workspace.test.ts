import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION } from "@seeway/contracts";

describe("workspace", () => {
  it("resolves workspace packages", () => {
    expect(CONTRACT_VERSION).toBe("1.0.0");
  });
});
