import {
  AgentReportSchema,
  AgentRequestSchema,
  MARKET_METHOD_PENDING_VERSION,
  MarketSourceCandidateSchema,
  type AgentReport,
  type MarketSourceCandidate,
  type NeedsInputAgentReport,
  type UnsupportedAgentReport,
} from "@seeway/contracts";
import {
  getAgentDefinition,
  type DeepReadonly,
  type DomainAgentDefinition,
} from "@seeway/control-plane";
import type {
  AgentClockOptions,
  AuthorizedContext,
  DomainAgent,
} from "./types";

const AgentVersion = "0.1.0";

const sourceCandidates: readonly MarketSourceCandidate[] = [
  {
    sourceId: "market-source-yuejia-stock",
    title: "月家奇门股市用法经验",
    fingerprint:
      "sha256:fe4687bb550bf61ef828b2c3e3ce776fcbfc288906978713f1a2601a2ca18ab8",
    domain: "stock",
    reviewStatus: "candidate",
    ruleIds: [],
  },
  {
    sourceId: "market-source-zhanghaibin-stock",
    title: "奇门应用研究与股市实战解秘",
    fingerprint:
      "sha256:0eb88b5bf4fb5f25cc692a2365e0f1d14dba1dec6238c46a29e0531315f9e6ec",
    domain: "stock",
    reviewStatus: "candidate",
    ruleIds: [],
  },
  {
    sourceId: "market-source-rijia-stock",
    title: "日家奇门的股市应用经验",
    fingerprint:
      "sha256:12998b9e9931a28ab414dc75febd88b8e48da11065dbb5b39e763e9263f570d8",
    domain: "stock",
    reviewStatus: "candidate",
    ruleIds: [],
  },
  {
    sourceId: "market-source-tianji-lottery",
    title: "《天机推演图》奇门测彩票",
    fingerprint:
      "sha256:7f9fefb0f658a56e5761590f248db0a693b2b83b8654329f3e83b892cbf939a5",
    domain: "lottery",
    reviewStatus: "candidate",
    ruleIds: [],
  },
].map((source) => MarketSourceCandidateSchema.parse(source));

export const QIMEN_MARKET_SOURCE_CANDIDATES = deepFreeze(
  sourceCandidates,
);

export interface QimenMarketAgent extends DomainAgent {
  readonly definition: DomainAgentDefinition;
  readonly candidateSourceIds: readonly string[];
}

export function createQimenMarketAgent({
  clock,
}: AgentClockOptions): QimenMarketAgent {
  const definition = getAgentDefinition("qimen-finance");
  if (!definition || definition.role !== "domain") {
    throw new Error("Missing qimen-finance domain Agent definition.");
  }

  const candidateSourceIds = Object.freeze(
    QIMEN_MARKET_SOURCE_CANDIDATES.filter(
      (source) => source.domain === "stock",
    ).map((source) => source.sourceId),
  );

  return Object.freeze({
    definition,
    candidateSourceIds,
    async execute(
      rawRequest: unknown,
      _context: AuthorizedContext,
    ): Promise<DeepReadonly<AgentReport>> {
      const request = AgentRequestSchema.parse(rawRequest);
      if (request.category !== "finance") {
        throw new Error(
          `Agent ${definition.id} does not support ${request.category}.`,
        );
      }
      if (
        request.requestedAgent !== undefined &&
        request.requestedAgent !== definition.id
      ) {
        throw new Error(
          `Requested Agent ${request.requestedAgent} does not match ${definition.id}.`,
        );
      }

      const missingInput = !request.instrument
        ? "instrument"
        : !request.investmentHorizon
          ? "investmentHorizon"
          : undefined;
      if (missingInput) {
        const report: NeedsInputAgentReport = {
          agentId: definition.id,
          agentVersion: AgentVersion,
          status: "needs_input",
          evidence: [],
          conflicts: [],
          requiredInputs: [missingInput],
          ruleVersion: MARKET_METHOD_PENDING_VERSION,
          generatedAt: clock().toISOString(),
        };
        return deepFreeze(AgentReportSchema.parse(report));
      }

      const report: UnsupportedAgentReport = {
        agentId: definition.id,
        agentVersion: AgentVersion,
        status: "unsupported",
        evidence: [],
        conflicts: [],
        requiredInputs: [],
        ruleVersion: MARKET_METHOD_PENDING_VERSION,
        generatedAt: clock().toISOString(),
        reasonCode: "MARKET_RULESET_UNVERIFIED",
        reason:
          "Stock-market rules remain unavailable until their executable conditions and expected results pass review.",
        prerequisites: [
          "stable stock-market rule IDs and source locators",
          "reviewed executable conditions",
          "backtest report and golden fixtures",
        ],
      };
      return deepFreeze(AgentReportSchema.parse(report));
    },
  });
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
