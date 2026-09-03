#pragma once

#include "seeway_screen_state.h"

#include <cstdint>

namespace seeway {

enum class PhysicalButton : std::uint8_t {
    Boot,
    Key,
    Power,
};

enum class ButtonGesture : std::uint8_t {
    ShortPress,
    LongPress,
};

enum class ButtonAction : std::uint8_t {
    None,
    EnterWifiConfig,
    ToggleChart,
    AdvanceChartPage,
    ToggleVoice,
    EnablePrivacyMute,
    DisablePrivacyMute,
};

struct ButtonContext {
    bool starting = false;
    ScreenMode screen_mode = ScreenMode::Ambient;
};

class ButtonPolicy {
public:
    ButtonAction Handle(
        PhysicalButton button,
        ButtonGesture gesture,
        ButtonContext context);
    bool privacy_muted() const;

private:
    bool privacy_muted_ = false;
};

}  // namespace seeway
