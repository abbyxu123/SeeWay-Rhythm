#include "seeway_screen_state.h"

namespace seeway {

ScreenStateMachine::ScreenStateMachine(
    std::uint64_t shichen_token,
    DataStatus qimen_status)
{
    state_.shichen_token = shichen_token;
    state_.qimen_status = qimen_status;
}

const ScreenState& ScreenStateMachine::state() const
{
    return state_;
}

void ScreenStateMachine::SyncShichen(
    std::uint64_t shichen_token,
    DataStatus qimen_status)
{
    const bool token_changed = shichen_token != state_.shichen_token;
    const bool status_changed = qimen_status != state_.qimen_status;
    if (!token_changed && !status_changed) {
        return;
    }

    state_.shichen_token = shichen_token;
    state_.qimen_status = qimen_status;
    if ((token_changed && state_.mode != ScreenMode::Provisioning) ||
        (state_.mode == ScreenMode::ChartDetail &&
         qimen_status != DataStatus::Verified)) {
        ResetToAmbient();
    }
    MarkChanged();
}

bool ScreenStateMachine::ToggleChart(std::uint64_t context_token)
{
    if (!IsCurrent(context_token)) {
        return false;
    }
    if (state_.qimen_status != DataStatus::Verified) {
        state_.mode = ScreenMode::Error;
        state_.chart_page = ChartPage::Chart;
        state_.error = ScreenError::QimenUnavailable;
        MarkChanged();
        return false;
    }
    if (state_.mode == ScreenMode::ChartDetail) {
        ReturnToCurrent();
        return true;
    }

    state_.mode = ScreenMode::ChartDetail;
    state_.chart_page = ChartPage::Chart;
    state_.error = ScreenError::None;
    MarkChanged();
    return true;
}

bool ScreenStateMachine::AdvanceChartPage(std::uint64_t context_token)
{
    if (!IsCurrent(context_token) || state_.mode != ScreenMode::ChartDetail) {
        return false;
    }

    const auto next =
        (static_cast<std::uint8_t>(state_.chart_page) + 1U) % kChartPageCount;
    state_.chart_page = static_cast<ChartPage>(next);
    MarkChanged();
    return true;
}

bool ScreenStateMachine::SetVoiceMode(
    ScreenMode mode,
    std::uint64_t context_token)
{
    const bool is_voice_mode =
        mode == ScreenMode::Listening ||
        mode == ScreenMode::Thinking ||
        mode == ScreenMode::Speaking;
    if (!is_voice_mode || !IsCurrent(context_token)) {
        return false;
    }

    state_.mode = mode;
    state_.chart_page = ChartPage::Chart;
    state_.error = ScreenError::None;
    MarkChanged();
    return true;
}

bool ScreenStateMachine::EnterProvisioning()
{
    if (state_.mode == ScreenMode::Provisioning) {
        return false;
    }

    state_.mode = ScreenMode::Provisioning;
    state_.chart_page = ChartPage::Chart;
    state_.error = ScreenError::None;
    MarkChanged();
    return true;
}

bool ScreenStateMachine::EnterMarket(std::uint64_t context_token)
{
    if (!IsCurrent(context_token)) {
        return false;
    }

    state_.mode = ScreenMode::Market;
    state_.chart_page = ChartPage::Chart;
    state_.error = ScreenError::None;
    MarkChanged();
    return true;
}

bool ScreenStateMachine::ShowError(
    ScreenError error,
    std::uint64_t context_token)
{
    if (error == ScreenError::None || !IsCurrent(context_token)) {
        return false;
    }

    state_.mode = ScreenMode::Error;
    state_.chart_page = ChartPage::Chart;
    state_.error = error;
    MarkChanged();
    return true;
}

void ScreenStateMachine::ReturnToCurrent()
{
    const bool changed =
        state_.mode != ScreenMode::Ambient ||
        state_.chart_page != ChartPage::Chart ||
        state_.error != ScreenError::None;
    ResetToAmbient();
    if (changed) {
        MarkChanged();
    }
}

bool ScreenStateMachine::IsCurrent(std::uint64_t context_token) const
{
    return context_token == state_.shichen_token;
}

void ScreenStateMachine::ResetToAmbient()
{
    state_.mode = ScreenMode::Ambient;
    state_.chart_page = ChartPage::Chart;
    state_.error = ScreenError::None;
}

void ScreenStateMachine::MarkChanged()
{
    state_.revision++;
}

}  // namespace seeway
