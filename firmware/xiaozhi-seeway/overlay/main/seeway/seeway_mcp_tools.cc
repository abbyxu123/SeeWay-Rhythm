#include "seeway_mcp_tools.h"

#include "mcp_server.h"

#include <cctype>
#include <stdexcept>
#include <unordered_set>

#include <cJSON.h>

namespace seeway {
namespace {

constexpr std::size_t kMaximumQuestionIdLength = 160;
constexpr std::size_t kMaximumTranscriptLength = 500;
constexpr std::size_t kMaximumResponseLength = 4096;

std::string Serialize(cJSON* root)
{
    char* text = cJSON_PrintUnformatted(root);
    if (text == nullptr) {
        cJSON_Delete(root);
        throw std::runtime_error("Unable to serialize SeeWay MCP response.");
    }
    std::string result(text);
    cJSON_free(text);
    cJSON_Delete(root);
    return result;
}

void AddString(cJSON* object, const char* name, const std::string& value)
{
    cJSON_AddStringToObject(object, name, value.c_str());
}

std::string BlockedJson(
    const std::string& reason_code,
    const std::string& question_id = {})
{
    cJSON* root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "status", "blocked");
    AddString(root, "reasonCode", reason_code);
    if (!question_id.empty()) {
        AddString(root, "questionId", question_id);
    }
    return Serialize(root);
}

bool IsSha256(const std::string& value)
{
    if (value.size() != 71 || value.rfind("sha256:", 0) != 0) {
        return false;
    }
    for (std::size_t index = 7; index < value.size(); ++index) {
        const unsigned char character =
            static_cast<unsigned char>(value[index]);
        if (!std::isdigit(character) &&
            !(character >= 'a' && character <= 'f')) {
            return false;
        }
    }
    return true;
}

const char* JsonString(const cJSON* object, const char* name)
{
    const cJSON* value = cJSON_GetObjectItemCaseSensitive(object, name);
    return cJSON_IsString(value) ? value->valuestring : nullptr;
}

bool ValidEvidenceIds(
    const cJSON* evidence_ids,
    const std::vector<std::string>& allowed_ids)
{
    if (!cJSON_IsArray(evidence_ids) ||
        cJSON_GetArraySize(evidence_ids) <= 0 ||
        cJSON_GetArraySize(evidence_ids) > 32) {
        return false;
    }
    const std::unordered_set<std::string> allowed(
        allowed_ids.begin(),
        allowed_ids.end());
    std::unordered_set<std::string> seen;
    const cJSON* item = nullptr;
    cJSON_ArrayForEach(item, evidence_ids) {
        if (!cJSON_IsString(item) || item->valuestring == nullptr ||
            item->valuestring[0] == '\0' ||
            std::string(item->valuestring).size() > 160 ||
            allowed.find(item->valuestring) == allowed.end() ||
            !seen.insert(item->valuestring).second) {
            return false;
        }
    }
    return true;
}

bool ValidCompletedResponse(
    const std::string& response_json,
    const PendingQimenQuestion& question,
    const QimenMcpContext& context)
{
    if (response_json.empty() || response_json.size() > kMaximumResponseLength) {
        return false;
    }
    cJSON* root = cJSON_ParseWithOpts(response_json.c_str(), nullptr, 1);
    if (!cJSON_IsObject(root)) {
        cJSON_Delete(root);
        return false;
    }
    const char* version = JsonString(root, "contractVersion");
    const char* basis = JsonString(root, "basis");
    const char* question_id = JsonString(root, "questionId");
    const char* chart_hash = JsonString(root, "chartHash");
    const char* display_text = JsonString(root, "displayText");
    const char* spoken_answer = JsonString(root, "spokenAnswer");
    const char* valid_from = JsonString(root, "validFrom");
    const char* valid_until = JsonString(root, "validUntil");
    const cJSON* profile_ref =
        cJSON_GetObjectItemCaseSensitive(root, "profileRef");
    const char* profile_id = cJSON_IsObject(profile_ref)
        ? JsonString(profile_ref, "profileId")
        : nullptr;
    const cJSON* profile_version = cJSON_IsObject(profile_ref)
        ? cJSON_GetObjectItemCaseSensitive(profile_ref, "profileVersion")
        : nullptr;
    const cJSON* verification =
        cJSON_GetObjectItemCaseSensitive(root, "verification");
    const char* verification_status = cJSON_IsObject(verification)
        ? JsonString(verification, "status")
        : nullptr;
    const char* verifier_version = cJSON_IsObject(verification)
        ? JsonString(verification, "verifierVersion")
        : nullptr;
    const cJSON* evidence_ids =
        cJSON_GetObjectItemCaseSensitive(root, "evidenceIds");
    const bool valid =
        version != nullptr && std::string(version) == "voice-response/v1" &&
        basis != nullptr && std::string(basis) == "qimen" &&
        question_id != nullptr && question.question_id == question_id &&
        chart_hash != nullptr && context.chart_hash == chart_hash &&
        profile_id != nullptr && context.profile_id == profile_id &&
        cJSON_IsNumber(profile_version) &&
        profile_version->valuedouble ==
            static_cast<double>(context.profile_version) &&
        valid_from != nullptr && context.valid_from == valid_from &&
        valid_until != nullptr && context.valid_until == valid_until &&
        display_text != nullptr && display_text[0] != '\0' &&
        spoken_answer != nullptr && spoken_answer[0] != '\0' &&
        verification_status != nullptr &&
        std::string(verification_status) == "verified" &&
        verifier_version != nullptr &&
        std::string(verifier_version) == "qimen-verifier/v1" &&
        ValidEvidenceIds(evidence_ids, context.evidence_ids);
    cJSON_Delete(root);
    return valid;
}

}  // namespace

void SeeWayMcpTools::Register()
{
    auto& server = McpServer::GetInstance();
    server.AddTool(
        "self.seeway.qimen.current_context",
        "奇门问题前必须先调用。只返回设备当前已同步且已校验的受限上下文；"
        "若 status 不是 verified，不得推断或声称奇门结论。",
        PropertyList(),
        [this](const PropertyList&) -> ReturnValue {
            return CurrentContextJson();
        });
    server.AddTool(
        "self.seeway.qimen.submit_question",
        "提交奇门问题。必须原样传入当前上下文的 chartHash；返回 pending 后"
        "使用 response_status 查询，不得自行补写答案。",
        PropertyList({
            Property("question_id", kPropertyTypeString),
            Property("transcript", kPropertyTypeString),
            Property("expected_chart_hash", kPropertyTypeString),
        }),
        [this](const PropertyList& properties) -> ReturnValue {
            return SubmitQuestion(
                properties["question_id"].value<std::string>(),
                properties["transcript"].value<std::string>(),
                properties["expected_chart_hash"].value<std::string>());
        });
    server.AddTool(
        "self.seeway.qimen.response_status",
        "查询后端对奇门问题的处理状态。completed 时只可原样朗读返回的"
        " voice-response/v1，不得改写吉凶或证据。",
        PropertyList({Property("question_id", kPropertyTypeString)}),
        [this](const PropertyList& properties) -> ReturnValue {
            return ResponseStatusJson(
                properties["question_id"].value<std::string>());
        });
    server.AddTool(
        "self.seeway.qimen.cancel_question",
        "取消仍在等待的奇门问题。",
        PropertyList({Property("question_id", kPropertyTypeString)}),
        [this](const PropertyList& properties) -> ReturnValue {
            return CancelQuestion(
                properties["question_id"].value<std::string>());
        });
}

void SeeWayMcpTools::SetCurrentContext(const QimenMcpContext& context)
{
    std::lock_guard<std::mutex> lock(mutex_);
    QimenMcpContext next = context;
    if (next.status == QimenContextStatus::Verified &&
        (next.profile_id.empty() || next.profile_version <= 0 ||
         !IsSha256(next.chart_hash) || next.valid_from.empty() ||
         next.valid_until.empty() || next.evidence_ids.empty())) {
        next = QimenMcpContext{};
        next.status = QimenContextStatus::Blocked;
        next.reason_code = "unverified_context";
    }
    if (question_status_ == QuestionStatus::Pending &&
        next.chart_hash != context_.chart_hash) {
        question_status_ = QuestionStatus::Blocked;
        question_reason_code_ = "chart_hash_mismatch";
    }
    context_ = std::move(next);
}

std::optional<PendingQimenQuestion> SeeWayMcpTools::TakePendingQuestion()
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (question_status_ != QuestionStatus::Pending || question_dispatched_) {
        return std::nullopt;
    }
    question_dispatched_ = true;
    return active_question_;
}

bool SeeWayMcpTools::CompleteQuestion(const std::string& response_json)
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (question_status_ != QuestionStatus::Pending ||
        context_.status != QimenContextStatus::Verified ||
        !ValidCompletedResponse(response_json, active_question_, context_)) {
        return false;
    }
    completed_response_json_ = response_json;
    question_status_ = QuestionStatus::Completed;
    return true;
}

std::string SeeWayMcpTools::CurrentContextJson() const
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (context_.status == QimenContextStatus::Unsynced) {
        return BlockedJson("missing_payload");
    }
    if (context_.status == QimenContextStatus::Blocked) {
        return BlockedJson(context_.reason_code);
    }
    cJSON* root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "status", "verified");
    cJSON_AddStringToObject(root, "contractVersion", "voice-context/v1");
    cJSON* profile = cJSON_AddObjectToObject(root, "profileRef");
    AddString(profile, "profileId", context_.profile_id);
    cJSON_AddNumberToObject(profile, "profileVersion", context_.profile_version);
    AddString(root, "chartHash", context_.chart_hash);
    AddString(root, "validFrom", context_.valid_from);
    AddString(root, "validUntil", context_.valid_until);
    cJSON* rows = cJSON_AddObjectToObject(root, "rows");
    AddString(rows, "favorable", context_.favorable);
    AddString(rows, "caution", context_.caution);
    AddString(rows, "direction", context_.direction);
    AddString(rows, "advice", context_.advice);
    cJSON* evidence = cJSON_AddArrayToObject(root, "evidenceIds");
    for (const auto& evidence_id : context_.evidence_ids) {
        cJSON_AddItemToArray(evidence, cJSON_CreateString(evidence_id.c_str()));
    }
    return Serialize(root);
}

std::string SeeWayMcpTools::SubmitQuestion(
    const std::string& question_id,
    const std::string& transcript,
    const std::string& expected_chart_hash)
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (context_.status != QimenContextStatus::Verified) {
        return BlockedJson(context_.reason_code);
    }
    if (question_id.empty() || question_id.size() > kMaximumQuestionIdLength ||
        transcript.empty() || transcript.size() > kMaximumTranscriptLength) {
        return BlockedJson("invalid_question");
    }
    if (expected_chart_hash != context_.chart_hash) {
        return BlockedJson("chart_hash_mismatch");
    }
    if (question_status_ == QuestionStatus::Pending) {
        return BlockedJson("question_in_progress");
    }
    active_question_ = {question_id, transcript, expected_chart_hash};
    question_status_ = QuestionStatus::Pending;
    question_dispatched_ = false;
    question_reason_code_.clear();
    completed_response_json_.clear();
    cJSON* root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "status", "pending");
    AddString(root, "questionId", question_id);
    return Serialize(root);
}

std::string SeeWayMcpTools::ResponseStatusJson(
    const std::string& question_id) const
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (question_status_ == QuestionStatus::None ||
        question_id != active_question_.question_id) {
        cJSON* root = cJSON_CreateObject();
        cJSON_AddStringToObject(root, "status", "not_found");
        AddString(root, "questionId", question_id);
        return Serialize(root);
    }
    if (question_status_ == QuestionStatus::Blocked) {
        return BlockedJson(question_reason_code_, question_id);
    }
    cJSON* root = cJSON_CreateObject();
    const char* status = question_status_ == QuestionStatus::Pending
        ? "pending"
        : question_status_ == QuestionStatus::Completed
            ? "completed"
            : "cancelled";
    cJSON_AddStringToObject(root, "status", status);
    AddString(root, "questionId", question_id);
    if (question_status_ == QuestionStatus::Completed) {
        cJSON* response = cJSON_Parse(completed_response_json_.c_str());
        cJSON_AddItemToObject(root, "response", response);
    }
    return Serialize(root);
}

std::string SeeWayMcpTools::CancelQuestion(const std::string& question_id)
{
    std::lock_guard<std::mutex> lock(mutex_);
    if (question_status_ == QuestionStatus::Pending &&
        question_id == active_question_.question_id) {
        question_status_ = QuestionStatus::Cancelled;
    }
    cJSON* root = cJSON_CreateObject();
    cJSON_AddStringToObject(
        root,
        "status",
        question_id == active_question_.question_id &&
            question_status_ == QuestionStatus::Cancelled
            ? "cancelled"
            : "not_found");
    AddString(root, "questionId", question_id);
    return Serialize(root);
}

}  // namespace seeway
