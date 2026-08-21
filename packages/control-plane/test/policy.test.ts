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

  it("normalizes duplicate scopes and preserves mixed decisions", () => {
    expect(
      authorizeContext({
        agentId: "qimen-finance",
        requestedScopes: ["finance", "finance", "relationship"],
        grantedScopes: ["finance", "relationship"],
      }),
    ).toEqual({ allowed: ["finance"], denied: ["relationship"] });
  });

  it("does not let an Agent expand its own permissions", () => {
    expect(() => assertAgentScope("qimen-rhythm", "finance")).toThrow(
      /not allowed/i,
    );
    expect(assertAgentScope("qimen-finance", "finance")).toBeUndefined();
  });

  it("fails closed for an unknown Agent", () => {
    expect(() =>
      authorizeContext({
        agentId: "unknown-agent" as "qimen-rhythm",
        requestedScopes: [],
        grantedScopes: [],
      }),
    ).toThrow(/unknown agent/i);
  });

  it("returns an immutable authorization decision", () => {
    const decision = authorizeContext({
      agentId: "qimen-finance",
      requestedScopes: ["finance"],
      grantedScopes: ["finance"],
    });

    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.allowed)).toBe(true);
    expect(Object.isFrozen(decision.denied)).toBe(true);
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
        agentId: "qimen-rhythm",
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
          agentId: "qimen-rhythm",
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
        agentId: "qimen-rhythm",
        disposition: "save_timeline",
        grantedScopes: [],
      }),
    ).toEqual({
      allowed: false,
      operations: [],
      deniedScopes: ["timeline"],
    });
  });

  it("denies writes for an Agent without timeline permission", () => {
    expect(
      authorizePersistence({
        agentId: "orchestrator",
        disposition: "bookmark",
        grantedScopes: ["timeline"],
      }),
    ).toEqual({
      allowed: false,
      operations: [],
      deniedScopes: ["timeline"],
    });
  });

  it("fails closed for an unknown runtime disposition", () => {
    expect(
      authorizePersistence({
        agentId: "qimen-rhythm",
        disposition: "delete_all" as "bookmark",
        grantedScopes: ["timeline"],
      }),
    ).toEqual({
      allowed: false,
      operations: [],
      deniedScopes: [],
      reasonCode: "UNKNOWN_DISPOSITION",
    });
  });

  it("returns immutable write decisions", () => {
    const decision = authorizePersistence({
      agentId: "qimen-rhythm",
      disposition: "bookmark",
      grantedScopes: ["timeline"],
    });

    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.operations)).toBe(true);
    expect(Object.isFrozen(decision.operations[0])).toBe(true);
    expect(Object.isFrozen(decision.deniedScopes)).toBe(true);
  });
});
