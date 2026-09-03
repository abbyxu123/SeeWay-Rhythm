#include "seeway_buttons.h"

namespace seeway {

ButtonAction ButtonPolicy::Handle(
    PhysicalButton button,
    ButtonGesture gesture,
    ButtonContext context)
{
    if (button == PhysicalButton::Power) {
        return ButtonAction::None;
    }

    if (button == PhysicalButton::Boot) {
        if (context.starting && gesture == ButtonGesture::ShortPress) {
            return ButtonAction::EnterWifiConfig;
        }
        if (context.starting) {
            return ButtonAction::None;
        }
        if (gesture == ButtonGesture::LongPress) {
            return ButtonAction::ToggleChart;
        }
        return context.screen_mode == ScreenMode::ChartDetail
            ? ButtonAction::AdvanceChartPage
            : ButtonAction::None;
    }

    if (context.starting) {
        return ButtonAction::None;
    }
    if (gesture == ButtonGesture::LongPress) {
        privacy_muted_ = !privacy_muted_;
        return privacy_muted_
            ? ButtonAction::EnablePrivacyMute
            : ButtonAction::DisablePrivacyMute;
    }
    return privacy_muted_ ? ButtonAction::None : ButtonAction::ToggleVoice;
}

bool ButtonPolicy::privacy_muted() const
{
    return privacy_muted_;
}

}  // namespace seeway
