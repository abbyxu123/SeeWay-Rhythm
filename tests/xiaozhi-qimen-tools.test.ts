import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("firmware/xiaozhi-seeway");
const toolHeader = resolve(root, "overlay/main/seeway/seeway_mcp_tools.h");
const toolSource = resolve(root, "overlay/main/seeway/seeway_mcp_tools.cc");
const boardSource = resolve(
  root,
  "overlay/main/boards/seeway/seeway-rhythm-rlcd-4.2/seeway-rhythm-rlcd-4.2.cc",
);
const patcherSource = resolve(root, "scripts/apply-overlay.py");
const protocol = resolve("docs/protocols/voice-qimen-flow.md");

describe("SeeWay verified Qimen MCP bridge", () => {
  it("exposes only bounded context, submit, status and cancellation tools", () => {
    const header = readFileSync(toolHeader, "utf8");
    const source = readFileSync(toolSource, "utf8");
    const toolNames = [
      "self.seeway.qimen.current_context",
      "self.seeway.qimen.submit_question",
      "self.seeway.qimen.response_status",
      "self.seeway.qimen.cancel_question",
    ];

    for (const name of toolNames) {
      expect(source).toContain(name);
    }
    expect(source.match(/self\.seeway\.qimen\./g)).toHaveLength(4);
    expect(header).toContain("SetCurrentContext");
    expect(header).toContain("TakePendingQuestion");
    expect(header).toContain("CompleteQuestion");
    expect(source).toContain('"verification"');
    expect(source).toContain('"verified"');
    expect(source).toContain('"chartHash"');
    expect(source).toContain('"evidenceIds"');
    expect(source).not.toContain("calculateQimenChart");
  });

  it("registers the bridge on the board and compiles it through the overlay", () => {
    const board = readFileSync(boardSource, "utf8");
    const patcher = readFileSync(patcherSource, "utf8");

    expect(board).toContain('#include "seeway_mcp_tools.h"');
    expect(board).toContain("SeeWayMcpTools qimen_mcp_tools_");
    expect(board).toContain("qimen_mcp_tools_.Register()");
    expect(patcher).toContain("seeway/seeway_mcp_tools.cc");
  });

  it("rejects responses that do not match the active verified context", () => {
    const source = readFileSync(toolSource, "utf8");

    expect(source).toContain("cJSON_ParseWithOpts");
    expect(source).toContain('JsonString(profile_ref, "profileId")');
    expect(source).toContain('"qimen-verifier/v1"');
    expect(source).toContain('JsonString(root, "validFrom")');
    expect(source).toContain('JsonString(root, "validUntil")');
    expect(source).toContain(
      "ValidEvidenceIds(evidence_ids, context.evidence_ids)",
    );
  });

  it("does not report a different question id as cancelled", () => {
    const source = readFileSync(toolSource, "utf8");

    expect(source).toMatch(
      /question_id == active_question_\.question_id\s*&&\s*question_status_ == QuestionStatus::Cancelled/,
    );
  });
  it("documents fail-closed narration and exact host response playback", () => {
    const text = readFileSync(protocol, "utf8");

    expect(text).toContain("voice-question/v1");
    expect(text).toContain("voice-response/v1");
    expect(text).toContain("chart_hash_mismatch");
    expect(text).toContain("语言模型不得自行排盘");
    expect(text).toContain("原样朗读");
  });
});
