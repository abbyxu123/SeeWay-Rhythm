#include "seeway_display.h"

#include "assets/lang_config.h"
#include "board.h"
#include "seeway_character.h"

#include <algorithm>
#include <array>
#include <cstdio>
#include <cstring>
#include <ctime>

LV_FONT_DECLARE(seeway_font_14);

namespace seeway {
namespace {

constexpr int kScreenWidth = 400;
constexpr int kScreenHeight = 300;
constexpr int kHeaderHeight = 56;

lv_color_t Black()
{
    return lv_color_hex(0x000000);
}

lv_color_t White()
{
    return lv_color_hex(0xFFFFFF);
}

lv_obj_t* MakeBox(
    lv_obj_t* parent,
    int x,
    int y,
    int width,
    int height,
    int border_width = 0,
    bool black_fill = false)
{
    lv_obj_t* object = lv_obj_create(parent);
    lv_obj_set_pos(object, x, y);
    lv_obj_set_size(object, width, height);
    lv_obj_remove_flag(object, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_scrollbar_mode(object, LV_SCROLLBAR_MODE_OFF);
    lv_obj_set_style_radius(object, 0, 0);
    lv_obj_set_style_pad_all(object, 0, 0);
    lv_obj_set_style_border_width(object, border_width, 0);
    lv_obj_set_style_border_color(object, Black(), 0);
    lv_obj_set_style_bg_opa(object, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(object, black_fill ? Black() : White(), 0);
    return object;
}

lv_obj_t* MakeLabel(
    lv_obj_t* parent,
    int x,
    int y,
    int width,
    int height,
    const char* text,
    lv_text_align_t align = LV_TEXT_ALIGN_LEFT)
{
    lv_obj_t* label = lv_label_create(parent);
    lv_obj_set_pos(label, x, y);
    lv_obj_set_size(label, width, height);
    lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
    lv_label_set_text(label, text);
    lv_obj_set_style_text_align(label, align, 0);
    lv_obj_set_style_text_color(label, Black(), 0);
    return label;
}

void MakeDivider(lv_obj_t* parent, int x, int y, int width, int height)
{
    MakeBox(parent, x, y, width, height, 0, true);
}

void SetVisible(lv_obj_t* object, bool visible)
{
    if (object == nullptr) {
        return;
    }
    if (visible) {
        lv_obj_remove_flag(object, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
}

const char* ErrorText(ScreenError error)
{
    switch (error) {
        case ScreenError::QimenUnavailable:
            return "当前盘尚未通过校验\n请稍后再看，系统不会用猜测补齐结论";
        case ScreenError::Network:
            return "网络暂时不可用\n常亮信息保留，联网后继续同步";
        case ScreenError::Internal:
            return "这次结果没有通过内部检查\n已停止呈现，请稍后重试";
        case ScreenError::None:
            return "";
    }
    return "";
}

}  // namespace

SeeWayDisplay::SeeWayDisplay(
    esp_lcd_panel_io_handle_t panel_io,
    esp_lcd_panel_handle_t panel,
    int width,
    int height,
    int offset_x,
    int offset_y,
    bool mirror_x,
    bool mirror_y,
    bool swap_xy,
    spi_display_config_t spi_config,
    spi_host_device_t spi_host)
    : CustomLcdDisplay(
          panel_io,
          panel,
          width,
          height,
          offset_x,
          offset_y,
          mirror_x,
          mirror_y,
          swap_xy,
          spi_config,
          spi_host)
{
}

void SeeWayDisplay::SetupUI()
{
    if (setup_ui_called_) {
        return;
    }
    Display::SetupUI();

    {
        DisplayLockGuard lock(this);
        lv_obj_t* screen = lv_display_get_screen_active(display_);
        lv_obj_clean(screen);
        lv_obj_set_style_bg_color(screen, White(), 0);
        lv_obj_set_style_text_color(screen, Black(), 0);

        lv_obj_set_style_text_font(screen, &seeway_font_14, 0);
        lv_obj_set_style_text_line_space(screen, 0, 0);

        root_ = MakeBox(screen, 0, 0, kScreenWidth, kScreenHeight);
        CreateHeader();
        CreateAmbientView();
        CreateChartView();
        CreateVoiceView();
        CreateProvisioningView();
        CreateMarketView();
        CreateErrorView();

        status_label_ = MakeLabel(root_, 0, 0, 1, 1, "");
        lv_obj_add_flag(status_label_, LV_OBJ_FLAG_HIDDEN);
        notification_label_ = MakeLabel(
            root_, 28, 118, 344, 54, "", LV_TEXT_ALIGN_CENTER);
        lv_obj_set_style_bg_opa(notification_label_, LV_OPA_COVER, 0);
        lv_obj_set_style_bg_color(notification_label_, Black(), 0);
        lv_obj_set_style_text_color(notification_label_, White(), 0);
        lv_obj_set_style_pad_all(notification_label_, 10, 0);
        lv_obj_add_flag(notification_label_, LV_OBJ_FLAG_HIDDEN);

        ui_ready_ = true;
        RenderLocked();
    }

    UpdateStatusBar(true);
}

void SeeWayDisplay::CreateHeader()
{
    header_ = MakeBox(root_, 0, 0, kScreenWidth, kHeaderHeight);
    clock_label_ = MakeLabel(header_, 4, 3, 52, 20, "--:--");

    analog_clock_ = MakeBox(header_, 60, 2, 26, 26, 1);
    lv_obj_set_style_radius(analog_clock_, LV_RADIUS_CIRCLE, 0);
    minute_hand_ = lv_line_create(analog_clock_);
    second_hand_ = lv_line_create(analog_clock_);
    lv_obj_set_style_line_color(minute_hand_, Black(), 0);
    lv_obj_set_style_line_color(second_hand_, Black(), 0);
    lv_obj_set_style_line_width(minute_hand_, 2, 0);
    lv_obj_set_style_line_width(second_hand_, 1, 0);

    weekday_label_ = MakeLabel(
        header_, 92, 3, 62, 20, "星期--", LV_TEXT_ALIGN_CENTER);
    MakeDivider(header_, 157, 2, 1, 23);
    date_label_ = MakeLabel(
        header_, 164, 3, 104, 20, "----.--.--", LV_TEXT_ALIGN_CENTER);
    term_label_ = MakeLabel(
        header_, 270, 3, 62, 20, "节气 --", LV_TEXT_ALIGN_CENTER);
    MakeDivider(header_, 334, 2, 1, 23);
    battery_percent_label_ = MakeLabel(
        header_, 338, 3, 58, 20, "--%", LV_TEXT_ALIGN_RIGHT);

    MakeDivider(header_, 0, 27, kScreenWidth, 1);
    lunar_label_ = MakeLabel(header_, 4, 32, 148, 20, "阴历 --");
    MakeDivider(header_, 157, 30, 1, 20);
    pillars_label_ = MakeLabel(
        header_, 164, 32, 232, 20, "四柱等待校验", LV_TEXT_ALIGN_RIGHT);
    MakeDivider(header_, 0, kHeaderHeight - 2, kScreenWidth, 2);
}

void SeeWayDisplay::CreateAmbientView()
{
    static constexpr std::array<const char*, kBranchCount> kBranches = {
        "子", "丑", "寅", "卯", "辰", "巳",
        "午", "未", "申", "酉", "戌", "亥",
    };
    static constexpr std::array<const char*, kAmbientRowCount> kRowNames = {
        "本时主势", "宜做", "慎防", "吉方", "行动",
    };

    ambient_view_ = MakeBox(
        root_, 0, kHeaderHeight, kScreenWidth, kScreenHeight - kHeaderHeight);

    for (int index = 0; index < kBranchCount; ++index) {
        const int x = 2 + index * 25;
        branch_cells_[index] = MakeBox(ambient_view_, x, 2, 24, 23, 1);
        branch_labels_[index] = MakeLabel(
            branch_cells_[index], 0, 2, 22, 18, kBranches[index], LV_TEXT_ALIGN_CENTER);
    }
    shichen_range_label_ = MakeLabel(
        ambient_view_, 304, 4, 94, 19, "当前", LV_TEXT_ALIGN_CENTER);
    MakeDivider(ambient_view_, 0, 28, kScreenWidth, 1);

    for (int row = 0; row < kAmbientRowCount; ++row) {
        const int y = 32 + row * 42;
        lv_obj_t* name_box = MakeBox(ambient_view_, 2, y, 76, 37, 0, true);
        lv_obj_t* name = MakeLabel(
            name_box, 3, 8, 70, 20, kRowNames[row], LV_TEXT_ALIGN_CENTER);
        lv_obj_set_style_text_color(name, White(), 0);
        ambient_values_[row] = MakeLabel(ambient_view_, 86, y + 2, 310, 34, "");
        MakeDivider(ambient_view_, 82, y, 1, 37);
    }
}

void SeeWayDisplay::CreateChartView()
{
    chart_view_ = MakeBox(root_, 0, 0, kScreenWidth, kScreenHeight);
    chart_title_label_ = MakeLabel(
        chart_view_, 8, 4, 292, 22, "当前时辰奇门盘");
    chart_page_label_ = MakeLabel(
        chart_view_, 304, 4, 88, 22, "盘面 1/4", LV_TEXT_ALIGN_RIGHT);
    MakeDivider(chart_view_, 0, 28, kScreenWidth, 2);

    chart_grid_view_ = MakeBox(chart_view_, 0, 31, kScreenWidth, 234);
    for (int index = 0; index < kPalaceCount; ++index) {
        const int column = index % 3;
        const int row = index / 3;
        lv_obj_t* cell = MakeBox(
            chart_grid_view_, column * 133, row * 78, 134, 79, 1);
        palace_labels_[index] = MakeLabel(cell, 4, 3, 126, 72, "");
    }

    chart_pattern_view_ = MakeBox(chart_view_, 0, 31, kScreenWidth, 234);
    for (int index = 0; index < kPatternLineCount; ++index) {
        const int y = index * 56;
        pattern_labels_[index] = MakeLabel(
            chart_pattern_view_, 12, y + 5, 376, 46, "");
        MakeDivider(chart_pattern_view_, 8, y + 54, 384, 1);
    }

    chart_guidance_view_ = MakeBox(chart_view_, 0, 31, kScreenWidth, 234);
    for (int index = 0; index < kGuidanceLineCount; ++index) {
        const int y = index * 44;
        guidance_labels_[index] = MakeLabel(
            chart_guidance_view_, 12, y + 4, 376, 36, "");
        MakeDivider(chart_guidance_view_, 8, y + 42, 384, 1);
    }

    chart_evidence_view_ = MakeBox(chart_view_, 0, 31, kScreenWidth, 234);
    for (int index = 0; index < kEvidenceLineCount; ++index) {
        const int y = index * 56;
        evidence_labels_[index] = MakeLabel(
            chart_evidence_view_, 12, y + 5, 376, 46, "");
        MakeDivider(chart_evidence_view_, 8, y + 54, 384, 1);
    }

    MakeDivider(chart_view_, 0, 267, kScreenWidth, 1);
    MakeLabel(
        chart_view_, 8, 275, 384, 20,
        "短按翻页  |  长按返回当前时辰", LV_TEXT_ALIGN_CENTER);
}

void SeeWayDisplay::CreateVoiceView()
{
    voice_view_ = MakeBox(root_, 0, 0, kScreenWidth, kScreenHeight);
    voice_state_label_ = MakeLabel(
        voice_view_, 0, 8, kScreenWidth, 22, "小智", LV_TEXT_ALIGN_CENTER);
    MakeDivider(voice_view_, 128, 34, 144, 1);

    voice_character_label_ = MakeLabel(
        voice_view_, 0, 0, 1, 1, "小智", LV_TEXT_ALIGN_CENTER);
    lv_obj_add_flag(voice_character_label_, LV_OBJ_FLAG_HIDDEN);
    voice_character_image_ = lv_image_create(voice_view_);
    lv_obj_set_pos(voice_character_image_, 116, 38);
    lv_obj_set_style_image_recolor(voice_character_image_, Black(), 0);
    lv_obj_set_style_image_recolor_opa(voice_character_image_, LV_OPA_COVER, 0);

    MakeDivider(voice_view_, 24, 211, 352, 2);
    transcript_label_ = MakeLabel(
        voice_view_, 24, 221, 352, 70, "请说", LV_TEXT_ALIGN_CENTER);
    lv_label_set_long_mode(transcript_label_, LV_LABEL_LONG_MODE_SCROLL);
}

void SeeWayDisplay::CreateProvisioningView()
{
    provisioning_view_ = MakeBox(root_, 0, 0, kScreenWidth, kScreenHeight);
    MakeLabel(
        provisioning_view_, 12, 8, 376, 20,
        "SEEWAY / CONNECT", LV_TEXT_ALIGN_CENTER);
    MakeDivider(provisioning_view_, 0, 34, kScreenWidth, 2);
    MakeLabel(
        provisioning_view_, 24, 54, 352, 28,
        "连接设备", LV_TEXT_ALIGN_CENTER);
    MakeDivider(provisioning_view_, 92, 88, 216, 1);
    provisioning_label_ = MakeLabel(
        provisioning_view_, 34, 108, 332, 104,
        "正在建立配网热点", LV_TEXT_ALIGN_CENTER);
    MakeDivider(provisioning_view_, 92, 226, 216, 1);
    MakeLabel(
        provisioning_view_, 24, 246, 352, 24,
        "完成后自动回到当前时辰", LV_TEXT_ALIGN_CENTER);
}

void SeeWayDisplay::CreateMarketView()
{
    market_view_ = MakeBox(root_, 0, 0, kScreenWidth, kScreenHeight);
    MakeLabel(market_view_, 12, 34, 376, 34, "市场模式", LV_TEXT_ALIGN_CENTER);
    MakeDivider(market_view_, 32, 78, 336, 2);
    MakeLabel(
        market_view_, 24, 102, 352, 76,
        "等待独立市场盘面\n个人盘、市场盘与小智上下文分别校验",
        LV_TEXT_ALIGN_CENTER);
    MakeDivider(market_view_, 32, 198, 336, 1);
    MakeLabel(
        market_view_, 16, 224, 368, 34,
        "术数观察  |  娱乐研究  |  非投资建议",
        LV_TEXT_ALIGN_CENTER);
}

void SeeWayDisplay::CreateErrorView()
{
    error_view_ = MakeBox(root_, 0, 0, kScreenWidth, kScreenHeight);
    MakeLabel(error_view_, 12, 38, 376, 30, "本次内容暂停显示", LV_TEXT_ALIGN_CENTER);
    MakeDivider(error_view_, 48, 80, 304, 2);
    error_label_ = MakeLabel(
        error_view_, 28, 108, 344, 86, "", LV_TEXT_ALIGN_CENTER);
    MakeDivider(error_view_, 80, 214, 240, 1);
    MakeLabel(
        error_view_, 20, 236, 360, 32,
        "返回后仍可查看当前时间与基础信息",
        LV_TEXT_ALIGN_CENTER);
}

void SeeWayDisplay::SetScreenContent(
    const SeeWayScreenContent& content,
    std::uint64_t shichen_token,
    DataStatus status)
{
    DisplayLockGuard lock(this);
    model_ = content;
    state_machine_.SyncShichen(shichen_token, status);
    if (privacy_muted_) {
        state_machine_.SetVoiceMode(ScreenMode::Listening, shichen_token);
    }
    RenderLocked();
}

bool SeeWayDisplay::ToggleChart(std::uint64_t shichen_token)
{
    DisplayLockGuard lock(this);
    const bool changed = state_machine_.ToggleChart(shichen_token);
    RenderLocked();
    return changed;
}

bool SeeWayDisplay::AdvanceChartPage(std::uint64_t shichen_token)
{
    DisplayLockGuard lock(this);
    const bool changed = state_machine_.AdvanceChartPage(shichen_token);
    RenderLocked();
    return changed;
}

bool SeeWayDisplay::EnterMarket(std::uint64_t shichen_token)
{
    DisplayLockGuard lock(this);
    const bool changed = state_machine_.EnterMarket(shichen_token);
    RenderLocked();
    return changed;
}

void SeeWayDisplay::ReturnToCurrent()
{
    DisplayLockGuard lock(this);
    state_machine_.ReturnToCurrent();
    RenderLocked();
}

bool SeeWayDisplay::ShowScreenError(
    ScreenError error,
    std::uint64_t shichen_token)
{
    DisplayLockGuard lock(this);
    const bool changed = state_machine_.ShowError(error, shichen_token);
    RenderLocked();
    return changed;
}

ScreenMode SeeWayDisplay::GetScreenMode()
{
    DisplayLockGuard lock(this);
    return state_machine_.state().mode;
}

bool SeeWayDisplay::ToggleCurrentChart()
{
    DisplayLockGuard lock(this);
    const bool changed = state_machine_.ToggleChart(
        state_machine_.state().shichen_token);
    RenderLocked();
    return changed;
}

bool SeeWayDisplay::AdvanceCurrentChartPage()
{
    DisplayLockGuard lock(this);
    const bool changed = state_machine_.AdvanceChartPage(
        state_machine_.state().shichen_token);
    RenderLocked();
    return changed;
}

void SeeWayDisplay::SetPrivacyMuted(bool muted)
{
    DisplayLockGuard lock(this);
    privacy_muted_ = muted;
    emotion_ = muted ? "mute" : "neutral";
    if (muted) {
        transcript_ = "麦克风已关闭\n长按 KEY 恢复";
        state_machine_.SetVoiceMode(
            ScreenMode::Listening,
            state_machine_.state().shichen_token);
    } else {
        transcript_.clear();
        state_machine_.ReturnToCurrent();
    }
    RenderLocked();
}

void SeeWayDisplay::SetStatus(const char* status)
{
    if (status == nullptr) {
        return;
    }

    DisplayLockGuard lock(this);
    const std::uint64_t token = state_machine_.state().shichen_token;
    if (std::strcmp(status, Lang::Strings::WIFI_CONFIG_MODE) == 0) {
        state_machine_.EnterProvisioning();
    } else if (std::strcmp(status, Lang::Strings::LISTENING) == 0) {
        state_machine_.SetVoiceMode(ScreenMode::Listening, token);
    } else if (std::strcmp(status, Lang::Strings::SPEAKING) == 0) {
        state_machine_.SetVoiceMode(ScreenMode::Speaking, token);
    } else if (std::strcmp(status, Lang::Strings::CONNECTING) == 0) {
        const ScreenMode mode = state_machine_.state().mode;
        if (mode == ScreenMode::Listening || mode == ScreenMode::Thinking) {
            state_machine_.SetVoiceMode(ScreenMode::Thinking, token);
        }
    } else if (std::strcmp(status, Lang::Strings::STANDBY) == 0) {
        if (privacy_muted_) {
            state_machine_.SetVoiceMode(ScreenMode::Listening, token);
        } else {
            state_machine_.ReturnToCurrent();
        }
    }
    RenderLocked();
}

void SeeWayDisplay::SetEmotion(const char* emotion)
{
    DisplayLockGuard lock(this);
    emotion_ = emotion == nullptr ? "neutral" : emotion;
    const ScreenMode mode = state_machine_.state().mode;
    if (mode == ScreenMode::Listening ||
        mode == ScreenMode::Thinking ||
        mode == ScreenMode::Speaking) {
        RenderVoiceLocked();
    }
}

void SeeWayDisplay::SetChatMessage(const char* /*role*/, const char* content)
{
    DisplayLockGuard lock(this);
    transcript_ = content == nullptr ? "" : content;
    if (state_machine_.state().mode == ScreenMode::Provisioning) {
        RenderProvisioningLocked();
    } else {
        RenderVoiceLocked();
    }
}

void SeeWayDisplay::ClearChatMessages()
{
    DisplayLockGuard lock(this);
    transcript_.clear();
    state_machine_.ReturnToCurrent();
    RenderLocked();
}

void SeeWayDisplay::UpdateStatusBar(bool update_all)
{
    std::time_t now = std::time(nullptr);
    std::tm local_time{};
    localtime_r(&now, &local_time);

    char clock[8] = "--:--";
    char date[16] = "----.--.--";
    if (local_time.tm_year >= 125) {
        std::strftime(clock, sizeof(clock), "%H:%M", &local_time);
        std::strftime(date, sizeof(date), "%Y.%m.%d", &local_time);
    }

    int battery_level = -1;
    bool charging = false;
    bool discharging = false;
    const bool update_battery = update_all || (status_tick_ % 60U == 0U);
    if (update_battery) {
        Board::GetInstance().GetBatteryLevel(
            battery_level, charging, discharging);
    }

    static constexpr std::array<const char*, 7> kWeekdays = {
        "星期日", "星期一", "星期二", "星期三",
        "星期四", "星期五", "星期六",
    };

    DisplayLockGuard lock(this);
    status_tick_++;
    model_.clock = clock;
    model_.solar_date = date;
    model_.weekday = local_time.tm_year >= 125
        ? kWeekdays[std::clamp(local_time.tm_wday, 0, 6)] : "星期--";
    model_.minute = std::clamp(local_time.tm_min, 0, 59);
    model_.second = std::clamp(local_time.tm_sec, 0, 59);
    if (update_battery && battery_level >= 0) {
        model_.battery_percent = std::clamp(battery_level, 0, 100);
    }
    RenderHeaderLocked();
    const ScreenMode mode = state_machine_.state().mode;
    if (mode == ScreenMode::Listening ||
        mode == ScreenMode::Thinking ||
        mode == ScreenMode::Speaking) {
        RenderVoiceLocked();
    }
}

void SeeWayDisplay::RenderLocked()
{
    if (!ui_ready_) {
        return;
    }

    RenderHeaderLocked();
    switch (state_machine_.state().mode) {
        case ScreenMode::Ambient:
            ShowOnlyLocked(ambient_view_);
            RenderAmbientLocked();
            break;
        case ScreenMode::ChartDetail:
            ShowOnlyLocked(chart_view_);
            RenderChartLocked();
            break;
        case ScreenMode::Listening:
        case ScreenMode::Thinking:
        case ScreenMode::Speaking:
            ShowOnlyLocked(voice_view_);
            RenderVoiceLocked();
            break;
        case ScreenMode::Provisioning:
            ShowOnlyLocked(provisioning_view_);
            RenderProvisioningLocked();
            break;
        case ScreenMode::Market:
            ShowOnlyLocked(market_view_);
            break;
        case ScreenMode::Error:
            ShowOnlyLocked(error_view_);
            RenderErrorLocked();
            break;
    }
}

void SeeWayDisplay::RenderHeaderLocked()
{
    if (!ui_ready_) {
        return;
    }
    lv_label_set_text(clock_label_, model_.clock.c_str());
    lv_label_set_text(weekday_label_, model_.weekday.c_str());
    lv_label_set_text(date_label_, model_.solar_date.c_str());
    lv_label_set_text(term_label_, model_.solar_term.c_str());
    lv_label_set_text(lunar_label_, model_.lunar_date.c_str());
    lv_label_set_text(pillars_label_, model_.pillars.c_str());

    char battery[12];
    if (model_.battery_percent < 0) {
        std::snprintf(battery, sizeof(battery), "--%%");
    } else {
        std::snprintf(
            battery, sizeof(battery), "%d%%", model_.battery_percent);
    }
    lv_label_set_text(battery_percent_label_, battery);
    RenderAnalogClock(model_.minute, model_.second);
}

void SeeWayDisplay::RenderAnalogClock(int minute, int second)
{
    constexpr int center = 12;
    constexpr int minute_length = 8;
    constexpr int second_length = 10;

    const int minute_angle = std::clamp(minute, 0, 59) * 6;
    const int second_angle = std::clamp(second, 0, 59) * 6;
    minute_points_[0] = {center, center};
    minute_points_[1] = {
        static_cast<lv_value_precise_t>(
            center + ((lv_trigo_sin(minute_angle) * minute_length) >> LV_TRIGO_SHIFT)),
        static_cast<lv_value_precise_t>(
            center - ((lv_trigo_sin(minute_angle + 90) * minute_length) >> LV_TRIGO_SHIFT)),
    };
    second_points_[0] = {center, center};
    second_points_[1] = {
        static_cast<lv_value_precise_t>(
            center + ((lv_trigo_sin(second_angle) * second_length) >> LV_TRIGO_SHIFT)),
        static_cast<lv_value_precise_t>(
            center - ((lv_trigo_sin(second_angle + 90) * second_length) >> LV_TRIGO_SHIFT)),
    };
    lv_line_set_points_mutable(minute_hand_, minute_points_, 2);
    lv_line_set_points_mutable(second_hand_, second_points_, 2);
}

void SeeWayDisplay::RenderAmbientLocked()
{
    for (int index = 0; index < kBranchCount; ++index) {
        const bool active = index == model_.shichen_index;
        lv_obj_set_style_bg_color(branch_cells_[index], active ? Black() : White(), 0);
        lv_obj_set_style_text_color(branch_labels_[index], active ? White() : Black(), 0);
    }
    lv_label_set_text(shichen_range_label_, model_.shichen_range.c_str());

    const std::array<const std::string*, kAmbientRowCount> values = {
        &model_.main_tendency,
        &model_.favorable,
        &model_.caution,
        &model_.direction,
        &model_.action,
    };
    for (int index = 0; index < kAmbientRowCount; ++index) {
        lv_label_set_text(ambient_values_[index], values[index]->c_str());
    }
}

void SeeWayDisplay::RenderChartLocked()
{
    lv_label_set_text(chart_title_label_, model_.chart_heading.c_str());
    const ChartPage page = state_machine_.state().chart_page;
    SetVisible(chart_grid_view_, page == ChartPage::Chart);
    SetVisible(chart_pattern_view_, page == ChartPage::Pattern);
    SetVisible(chart_guidance_view_, page == ChartPage::Guidance);
    SetVisible(chart_evidence_view_, page == ChartPage::Evidence);

    switch (page) {
        case ChartPage::Chart:
            lv_label_set_text(chart_page_label_, "盘面 1/4");
            for (int index = 0; index < kPalaceCount; ++index) {
                std::string chart_text;
                for (const std::string& line : model_.palaces[index].lines) {
                    if (!line.empty()) {
                        if (!chart_text.empty()) {
                            chart_text += '\n';
                        }
                        chart_text += line;
                    }
                }
                lv_label_set_text(palace_labels_[index], chart_text.c_str());
            }
            break;
        case ChartPage::Pattern:
            lv_label_set_text(chart_page_label_, "盘眼 2/4");
            for (int index = 0; index < kPatternLineCount; ++index) {
                lv_label_set_text(pattern_labels_[index], model_.pattern_lines[index].c_str());
            }
            break;
        case ChartPage::Guidance:
            lv_label_set_text(chart_page_label_, "解读 3/4");
            for (int index = 0; index < kGuidanceLineCount; ++index) {
                lv_label_set_text(guidance_labels_[index], model_.guidance_lines[index].c_str());
            }
            break;
        case ChartPage::Evidence:
            lv_label_set_text(chart_page_label_, "依据 4/4");
            for (int index = 0; index < kEvidenceLineCount; ++index) {
                lv_label_set_text(evidence_labels_[index], model_.evidence_lines[index].c_str());
            }
            break;
    }
}

void SeeWayDisplay::RenderVoiceLocked()
{
    if (!ui_ready_) {
        return;
    }
    const ScreenMode mode = state_machine_.state().mode;
    const char* state_text = "小智";
    if (privacy_muted_) {
        state_text = "隐私静音";
    } else if (mode == ScreenMode::Listening) {
        state_text = "我在听";
    } else if (mode == ScreenMode::Thinking) {
        state_text = "正在分析";
    } else if (mode == ScreenMode::Speaking) {
        state_text = "我来说清楚";
    }
    lv_label_set_text(voice_state_label_, state_text);
    lv_label_set_text(voice_character_label_, "小智");
    const CharacterFrame frame = CharacterFrameAt(
        CharacterStateLocked(), status_tick_ * 1000U);
    lv_image_set_src(voice_character_image_, CharacterImage(frame));
    const char* text = transcript_.empty() ? "请说" : transcript_.c_str();
    if (std::strcmp(lv_label_get_text(transcript_label_), text) != 0) {
        lv_label_set_text(transcript_label_, text);
    }
}

void SeeWayDisplay::RenderProvisioningLocked()
{
    if (!ui_ready_) {
        return;
    }
    lv_label_set_text(
        provisioning_label_,
        transcript_.empty() ? "正在建立配网热点" : transcript_.c_str());
}

CharacterState SeeWayDisplay::CharacterStateLocked() const
{
    if (privacy_muted_ ||
        emotion_.find("mute") != std::string::npos ||
        emotion_.find("offline") != std::string::npos) {
        return CharacterState::MutedError;
    }
    if (emotion_.find("sad") != std::string::npos ||
        emotion_.find("angry") != std::string::npos ||
        emotion_.find("caution") != std::string::npos) {
        return CharacterState::Caution;
    }
    if (emotion_.find("happy") != std::string::npos ||
        emotion_.find("laugh") != std::string::npos ||
        emotion_.find("positive") != std::string::npos) {
        return CharacterState::Positive;
    }

    switch (state_machine_.state().mode) {
        case ScreenMode::Listening:
            return CharacterState::Listening;
        case ScreenMode::Thinking:
            return CharacterState::Thinking;
        case ScreenMode::Speaking:
            return CharacterState::Speaking;
        case ScreenMode::Ambient:
        case ScreenMode::ChartDetail:
        case ScreenMode::Provisioning:
        case ScreenMode::Market:
        case ScreenMode::Error:
            return CharacterState::Idle;
    }
    return CharacterState::Idle;
}

void SeeWayDisplay::RenderErrorLocked()
{
    lv_label_set_text(error_label_, ErrorText(state_machine_.state().error));
}

void SeeWayDisplay::ShowOnlyLocked(lv_obj_t* active_view)
{
    const std::array<lv_obj_t*, 6> views = {
        ambient_view_, chart_view_, voice_view_, provisioning_view_,
        market_view_, error_view_,
    };
    SetVisible(header_, active_view == ambient_view_);
    for (lv_obj_t* view : views) {
        SetVisible(view, view == active_view);
    }
}

}  // namespace seeway
