#pragma once

#include <cstdint>

namespace seeway {

enum class ScreenMode : std::uint8_t {
    Ambient,
    ChartDetail,
    Listening,
    Thinking,
    Speaking,
    Provisioning,
    Market,
    Error,
};

enum class ChartPage : std::uint8_t {
    Chart,
    Pattern,
    Guidance,
    Evidence,
};

enum class DataStatus : std::uint8_t {
    Missing,
    Blocked,
    Verified,
};

enum class ScreenError : std::uint8_t {
    None,
    QimenUnavailable,
    Network,
    Internal,
};

struct ScreenState {
    ScreenMode mode = ScreenMode::Ambient;
    ChartPage chart_page = ChartPage::Chart;
    DataStatus qimen_status = DataStatus::Missing;
    ScreenError error = ScreenError::None;
    std::uint64_t shichen_token = 0U;
    std::uint32_t revision = 0U;
};

class ScreenStateMachine {
public:
    explicit ScreenStateMachine(
        std::uint64_t shichen_token = 0U,
        DataStatus qimen_status = DataStatus::Missing);

    const ScreenState& state() const;

    void SyncShichen(std::uint64_t shichen_token, DataStatus qimen_status);
    bool ToggleChart(std::uint64_t context_token);
    bool AdvanceChartPage(std::uint64_t context_token);
    bool SetVoiceMode(ScreenMode mode, std::uint64_t context_token);
    bool EnterProvisioning();
    bool EnterMarket(std::uint64_t context_token);
    bool ShowError(ScreenError error, std::uint64_t context_token);
    void ReturnToCurrent();

private:
    static constexpr std::uint8_t kChartPageCount = 4U;

    ScreenState state_;

    bool IsCurrent(std::uint64_t context_token) const;
    void ResetToAmbient();
    void MarkChanged();
};

}  // namespace seeway
