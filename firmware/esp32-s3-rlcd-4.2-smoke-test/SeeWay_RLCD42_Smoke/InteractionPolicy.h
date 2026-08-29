#pragma once

#include <stdint.h>

namespace seeway {

enum class GuidanceRow : uint8_t {
  Favorable,
  Caution,
  Direction,
  Advice,
};

struct SelectionDecision {
  bool showNext;
  bool nextMissing;
};

inline bool normalizePreviewForPeriod(
  bool showNext,
  uint32_t previousPeriodToken,
  uint32_t currentPeriodToken
)
{
  return previousPeriodToken == currentPeriodToken ? showNext : false;
}

inline SelectionDecision toggleShichenSelection(
  bool showNext,
  bool nextAvailable
)
{
  if (showNext) {
    return {false, false};
  }
  return nextAvailable
    ? SelectionDecision{true, false}
    : SelectionDecision{false, true};
}

inline const char *emptyGuidanceText(GuidanceRow row)
{
  switch (row) {
    case GuidanceRow::Favorable:
      return "暂无明确有利项";
    case GuidanceRow::Caution:
      return "暂无明确注意项";
    case GuidanceRow::Direction:
      return "暂无明确方位";
    case GuidanceRow::Advice:
      return "暂无明确建议";
  }
  return "暂无明确结论";
}

}  // namespace seeway
