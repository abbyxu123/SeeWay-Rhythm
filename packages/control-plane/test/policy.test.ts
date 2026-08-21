import { describe, expect, it } from "vitest";
import {
  assertAgentScope,
  authorizeContext,
  authorizePersistence,
  authorizeProfileContext,
} from "@seeway/control-plane";

describe("memory context authorization", () => {
  it("allows Qimen Finance to read finance memory only when granted", () => {
    expect(
      authorizeContext({
        agentId: "qimen-finance",
        requestedScopes: ["finance"],
        grantedScopes: ["finance"],
      }),
    ).toEqual({ allowed: ["finance"], denied: [] });

    expect(
      authorizeContext({
        agentId: "qimen-finance",
        requestedScopes: ["finance"],
        grantedScopes: [],
      }),
    ).toEqual({ allowed: [], denied: ["finance"] });
  });

  it("denies scopes outside an Agent's declared permissions", () => {
    expect(
      authorizeContext({
        agentId: "qimen-rhythm",
        requestedScopes: ["relationship", "finance"],
        grantedScopes: ["relationship", "finance"],
      }),
    ).toEqual({ allowed: [], denied: ["relationship", "finance"] });
  });

  it("does not let an Agent expand its own permissions", () => {
    expect(() => assertAgentScope("qimen-rhythm", "finance")).toThrow(
      /not allowed/i,
    );
    expect(assertAgentScope("qimen-finance", "finance")).toBeUndefined();
  });
});

describe("profile context authorization", () => {
  it("allows Bazi birth data only when it is granted for this request", () => {
    expect(
      authorizeProfileContext({
        agentId: "bazi-profile",
        requestedScopes: ["birth-data"],
        grantedScopes: ["birth-data"],
      }),
    ).toEqual({ allowed: ["birth-data"], denied: [] });

    expect(
      authorizeProfileContext({
        agentId: "bazi-profile",
        requestedScopes: ["birth-data"],
        grantedScopes: [],
      }),
    ).toEqual({ allowed: [], denied: ["birth-data"] });
  });

  it("denies profile scopes the Agent did not declare", () => {
    expect(
      authorizeProfileContext({
        agentId: "qimen-rhythm",
        requestedScopes: ["finance-profile"],
        grantedScopes: ["finance-profile"],
      }),
    ).toEqual({ allowed: [], denied: ["finance-profile"] });
  });
});

describe("persistence authorization", () => {
  it("emits no write operation for a one-time result", () => {
    expect(
      authorizePersistence({
        disposition: "once",
        grantedScopes: ["timeline"],
      }),
    ).toEqual({ allowed: true, operations: [], deniedScopes: [] });
  });

  it.each(["save_timeline", "bookmark", "add_note"] as const)(
    "creates an explicit %s operation when timeline access is granted",
    (disposition) => {
      expect(
        authorizePersistence({
          disposition,
          grantedScopes: ["timeline"],
        }),
      ).toEqual({
        allowed: true,
        operations: [{ type: disposition, scope: "timeline" }],
        deniedScopes: [],
      });
    },
  );

  it("denies persistence without an explicit timeline grant", () => {
    expect(
      authorizePersistence({
        disposition: "save_timeline",
        grantedScopes: [],
      }),
    ).toEqual({
      allowed: false,
      operations: [],
      deniedScopes: ["timeline"],
    });
  });
});
