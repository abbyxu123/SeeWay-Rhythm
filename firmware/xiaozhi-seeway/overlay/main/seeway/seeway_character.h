#pragma once

#include "lvgl.h"

#include <cstdint>

namespace seeway {

enum class CharacterState : std::uint8_t {
    Idle,
    Listening,
    Thinking,
    Speaking,
    Positive,
    Caution,
    MutedError,
};

enum class CharacterFrame : std::uint8_t {
    IdleOpen,
    IdleBlink,
    Listening,
    ThinkingA,
    ThinkingB,
    SpeakingClosed,
    SpeakingOpen,
    Positive,
    Caution,
    MutedError,
};

CharacterFrame CharacterFrameAt(
    CharacterState state,
    std::uint32_t elapsed_ms,
    bool animations_enabled = true);

const lv_image_dsc_t* CharacterImage(CharacterFrame frame);

}  // namespace seeway
