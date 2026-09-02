#include "seeway_character.h"

#include <array>

namespace seeway {
namespace {

#include "seeway_character_assets.inc"

CharacterFrame StaticFrame(CharacterState state)
{
    switch (state) {
        case CharacterState::Idle:
            return CharacterFrame::IdleOpen;
        case CharacterState::Listening:
            return CharacterFrame::Listening;
        case CharacterState::Thinking:
            return CharacterFrame::ThinkingA;
        case CharacterState::Speaking:
            return CharacterFrame::SpeakingClosed;
        case CharacterState::Positive:
            return CharacterFrame::Positive;
        case CharacterState::Caution:
            return CharacterFrame::Caution;
        case CharacterState::MutedError:
            return CharacterFrame::MutedError;
    }
    return CharacterFrame::IdleOpen;
}

}  // namespace

CharacterFrame CharacterFrameAt(
    CharacterState state,
    std::uint32_t elapsed_ms,
    bool animations_enabled)
{
    const bool static_fallback = !animations_enabled;
    if (static_fallback) {
        return StaticFrame(state);
    }

    switch (state) {
        case CharacterState::Idle: {
            const std::uint32_t phase = elapsed_ms % 6000U;
            return phase >= 5000U && phase < 5500U
                ? CharacterFrame::IdleBlink
                : CharacterFrame::IdleOpen;
        }
        case CharacterState::Thinking:
            return (elapsed_ms / 1000U) % 2U == 0U
                ? CharacterFrame::ThinkingA
                : CharacterFrame::ThinkingB;
        case CharacterState::Speaking:
            return (elapsed_ms / 1000U) % 2U == 0U
                ? CharacterFrame::SpeakingClosed
                : CharacterFrame::SpeakingOpen;
        case CharacterState::Listening:
        case CharacterState::Positive:
        case CharacterState::Caution:
        case CharacterState::MutedError:
            return StaticFrame(state);
    }
    return CharacterFrame::IdleOpen;
}

const lv_image_dsc_t* CharacterImage(CharacterFrame frame)
{
    static constexpr std::array<const lv_image_dsc_t*, 10> kImages = {
        &seeway_xiaozhi_idle_open,
        &seeway_xiaozhi_idle_blink,
        &seeway_xiaozhi_listening,
        &seeway_xiaozhi_thinking_a,
        &seeway_xiaozhi_thinking_b,
        &seeway_xiaozhi_speaking_closed,
        &seeway_xiaozhi_speaking_open,
        &seeway_xiaozhi_positive,
        &seeway_xiaozhi_caution,
        &seeway_xiaozhi_muted_error,
    };
    const auto index = static_cast<std::size_t>(frame);
    return index < kImages.size() ? kImages[index] : kImages[0];
}

}  // namespace seeway
