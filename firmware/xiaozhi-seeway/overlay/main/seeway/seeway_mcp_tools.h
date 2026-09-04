#pragma once

#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace seeway {

enum class QimenContextStatus : std::uint8_t {
    Unsynced,
    Blocked,
    Verified,
};

struct QimenMcpContext {
    QimenContextStatus status = QimenContextStatus::Unsynced;
    std::string reason_code = "missing_payload";
    std::string profile_id;
    int profile_version = 0;
    std::string chart_hash;
    std::string valid_from;
    std::string valid_until;
    std::string favorable;
    std::string caution;
    std::string direction;
    std::string advice;
    std::vector<std::string> evidence_ids;
};

struct PendingQimenQuestion {
    std::string question_id;
    std::string transcript;
    std::string expected_chart_hash;
};

class SeeWayMcpTools {
public:
    void Register();
    void SetCurrentContext(const QimenMcpContext& context);
    std::optional<PendingQimenQuestion> TakePendingQuestion();
    bool CompleteQuestion(const std::string& response_json);

private:
    enum class QuestionStatus : std::uint8_t {
        None,
        Pending,
        Completed,
        Cancelled,
        Blocked,
    };

    std::string CurrentContextJson() const;
    std::string SubmitQuestion(
        const std::string& question_id,
        const std::string& transcript,
        const std::string& expected_chart_hash);
    std::string ResponseStatusJson(const std::string& question_id) const;
    std::string CancelQuestion(const std::string& question_id);

    mutable std::mutex mutex_;
    QimenMcpContext context_;
    PendingQimenQuestion active_question_;
    QuestionStatus question_status_ = QuestionStatus::None;
    bool question_dispatched_ = false;
    std::string question_reason_code_;
    std::string completed_response_json_;
};

}  // namespace seeway
