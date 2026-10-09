#include <cassert>

#include "seeway_buttons.h"
#include "seeway_screen_state.h"

using seeway::ButtonAction;
using seeway::ButtonGesture;
using seeway::ButtonPolicy;
using seeway::PhysicalButton;
using seeway::ChartPage;
using seeway::DataStatus;
using seeway::ScreenError;
using seeway::ScreenMode;
using seeway::ScreenStateMachine;

int main()
{
    ScreenStateMachine screen(100U, DataStatus::Missing);
    assert(screen.state().mode == ScreenMode::Ambient);
    assert(screen.state().chart_page == ChartPage::Chart);
    assert(screen.state().shichen_token == 100U);

    screen.SyncShichen(100U, DataStatus::Verified);
    assert(screen.ToggleChart(100U));
    assert(screen.state().mode == ScreenMode::ChartDetail);
    assert(screen.AdvanceChartPage(100U));
    assert(screen.state().chart_page == ChartPage::Pattern);
    assert(screen.AdvanceChartPage(100U));
    assert(screen.state().chart_page == ChartPage::Guidance);
    assert(screen.AdvanceChartPage(100U));
    assert(screen.state().chart_page == ChartPage::Evidence);
    assert(screen.AdvanceChartPage(100U));
    assert(screen.state().chart_page == ChartPage::Chart);
    assert(screen.ToggleChart(100U));
    assert(screen.state().mode == ScreenMode::Ambient);

    assert(screen.SetVoiceMode(ScreenMode::Listening, 100U));
    assert(screen.state().mode == ScreenMode::Listening);
    assert(screen.SetVoiceMode(ScreenMode::Thinking, 100U));
    assert(screen.state().mode == ScreenMode::Thinking);
    assert(screen.SetVoiceMode(ScreenMode::Speaking, 100U));
    assert(screen.state().mode == ScreenMode::Speaking);
    screen.ReturnToCurrent();
    assert(screen.state().mode == ScreenMode::Ambient);

    assert(screen.EnterProvisioning());
    assert(screen.state().mode == ScreenMode::Provisioning);
    screen.SyncShichen(101U, DataStatus::Verified);
    assert(screen.state().mode == ScreenMode::Provisioning);
    screen.ReturnToCurrent();
    assert(screen.state().mode == ScreenMode::Ambient);

    assert(screen.EnterMarket(101U));
    assert(screen.state().mode == ScreenMode::Market);
    screen.ReturnToCurrent();
    assert(screen.ShowError(ScreenError::Network, 101U));
    assert(screen.state().mode == ScreenMode::Error);
    assert(screen.state().error == ScreenError::Network);
    screen.ReturnToCurrent();
    assert(screen.state().error == ScreenError::None);

    assert(screen.ToggleChart(101U));
    assert(screen.AdvanceChartPage(101U));
    assert(screen.AdvanceChartPage(101U));
    screen.SyncShichen(102U, DataStatus::Verified);
    assert(screen.state().mode == ScreenMode::Ambient);
    assert(screen.state().chart_page == ChartPage::Chart);
    assert(screen.state().shichen_token == 102U);
    assert(!screen.ToggleChart(100U));
    assert(!screen.AdvanceChartPage(100U));
    assert(!screen.SetVoiceMode(ScreenMode::Listening, 100U));
    assert(!screen.EnterMarket(100U));
    assert(!screen.ShowError(ScreenError::Internal, 100U));
    assert(screen.state().mode == ScreenMode::Ambient);

    assert(screen.ToggleChart(102U));
    screen.SyncShichen(102U, DataStatus::Blocked);
    assert(screen.state().mode == ScreenMode::Ambient);
    assert(screen.state().qimen_status == DataStatus::Blocked);

    assert(!screen.ToggleChart(102U));
    assert(screen.state().mode == ScreenMode::Error);
    assert(screen.state().error == ScreenError::QimenUnavailable);
    screen.ReturnToCurrent();

    assert(!screen.SetVoiceMode(ScreenMode::Ambient, 102U));
    assert(!screen.SetVoiceMode(ScreenMode::ChartDetail, 102U));
    assert(screen.state().mode == ScreenMode::Ambient);

    ButtonPolicy buttons;
    const auto ambient = seeway::ButtonContext{false, ScreenMode::Ambient};
    const auto chart = seeway::ButtonContext{false, ScreenMode::ChartDetail};
    const auto starting = seeway::ButtonContext{true, ScreenMode::Ambient};
    assert(buttons.Handle(PhysicalButton::Power, ButtonGesture::ShortPress, ambient) == ButtonAction::None);
    assert(buttons.Handle(PhysicalButton::Power, ButtonGesture::LongPress, ambient) == ButtonAction::None);
    assert(buttons.Handle(PhysicalButton::Boot, ButtonGesture::ShortPress, starting) == ButtonAction::EnterWifiConfig);
    assert(buttons.Handle(PhysicalButton::Key, ButtonGesture::ShortPress, starting) == ButtonAction::None);
    assert(buttons.Handle(PhysicalButton::Boot, ButtonGesture::ShortPress, ambient) == ButtonAction::None);
    assert(buttons.Handle(PhysicalButton::Boot, ButtonGesture::LongPress, ambient) == ButtonAction::ToggleChart);
    assert(buttons.Handle(PhysicalButton::Boot, ButtonGesture::ShortPress, chart) == ButtonAction::AdvanceChartPage);
    assert(buttons.Handle(PhysicalButton::Key, ButtonGesture::ShortPress, ambient) == ButtonAction::ToggleVoice);
    assert(buttons.Handle(PhysicalButton::Key, ButtonGesture::LongPress, ambient) == ButtonAction::EnablePrivacyMute);
    assert(buttons.privacy_muted());
    assert(buttons.Handle(PhysicalButton::Key, ButtonGesture::ShortPress, ambient) == ButtonAction::None);
    assert(buttons.Handle(PhysicalButton::Key, ButtonGesture::LongPress, ambient) == ButtonAction::DisablePrivacyMute);
    assert(!buttons.privacy_muted());

    return 0;
}
