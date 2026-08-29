#include <cassert>
#include <cstring>

#include "../SeeWay_RLCD42_Smoke/InteractionPolicy.h"

int main()
{
  using namespace seeway;

  assert(normalizePreviewForPeriod(true, 100U, 101U) == false);
  assert(normalizePreviewForPeriod(true, 100U, 100U) == true);
  assert(normalizePreviewForPeriod(false, 100U, 101U) == false);

  const SelectionDecision missing = toggleShichenSelection(false, false);
  assert(missing.showNext == false);
  assert(missing.nextMissing == true);

  const SelectionDecision preview = toggleShichenSelection(false, true);
  assert(preview.showNext == true);
  assert(preview.nextMissing == false);

  const SelectionDecision current = toggleShichenSelection(true, false);
  assert(current.showNext == false);
  assert(current.nextMissing == false);

  assert(std::strcmp(
    emptyGuidanceText(GuidanceRow::Favorable),
    "暂无明确有利项"
  ) == 0);
  assert(std::strcmp(
    emptyGuidanceText(GuidanceRow::Caution),
    "暂无明确注意项"
  ) == 0);
  assert(std::strcmp(
    emptyGuidanceText(GuidanceRow::Direction),
    "暂无明确方位"
  ) == 0);
  assert(std::strcmp(
    emptyGuidanceText(GuidanceRow::Advice),
    "暂无明确建议"
  ) == 0);

  return 0;
}
