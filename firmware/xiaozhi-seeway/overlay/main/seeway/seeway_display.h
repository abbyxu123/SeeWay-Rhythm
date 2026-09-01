#pragma once

#include "custom_lcd_display.h"
#include "seeway_screen_state.h"

#include <array>
#include <cstdint>
#include <string>

namespace seeway {

struct PalaceContent {
    std::array<std::string, 4> lines{};
};

struct SeeWayScreenContent {
    std::string clock = "--:--";
    std::string weekday = "星期--";
    std::string solar_date = "----.--.--";
    std::string solar_term = "节气 --";
    std::string lunar_date = "阴历 --";
    std::string pillars = "四柱等待校验";
    std::string shichen_range = "当前时辰";
    int second = 0;
    int minute = 0;
    int battery_percent = -1;
    int shichen_index = -1;

    std::string main_tendency = "等待已校验盘面";
    std::string favorable = "完成数据同步后显示";
    std::string caution = "完成数据同步后显示";
    std::string direction = "完成数据同步后显示";
    std::string action = "完成数据同步后显示";

    std::string chart_heading = "当前时辰奇门盘";
    std::array<PalaceContent, 9> palaces{};
    std::array<std::string, 4> pattern_lines{};
    std::array<std::string, 5> guidance_lines{};
    std::array<std::string, 4> evidence_lines{};
};

class SeeWayDisplay final : public CustomLcdDisplay {
public:
    SeeWayDisplay(
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
        spi_host_device_t spi_host = SPI3_HOST);

    void SetupUI() override;
    void SetStatus(const char* status) override;
    void SetEmotion(const char* emotion) override;
    void SetChatMessage(const char* role, const char* content) override;
    void ClearChatMessages() override;
    void UpdateStatusBar(bool update_all = false) override;

    void SetScreenContent(
        const SeeWayScreenContent& content,
        std::uint64_t shichen_token,
        DataStatus status);
    bool ToggleChart(std::uint64_t shichen_token);
    bool AdvanceChartPage(std::uint64_t shichen_token);
    bool EnterMarket(std::uint64_t shichen_token);
    void ReturnToCurrent();
    bool ShowScreenError(ScreenError error, std::uint64_t shichen_token);

private:
    static constexpr int kBranchCount = 12;
    static constexpr int kAmbientRowCount = 5;
    static constexpr int kPalaceCount = 9;
    static constexpr int kPatternLineCount = 4;
    static constexpr int kGuidanceLineCount = 5;
    static constexpr int kEvidenceLineCount = 4;

    ScreenStateMachine state_machine_;
    SeeWayScreenContent model_;
    std::string transcript_;
    std::string emotion_ = "neutral";
    bool ui_ready_ = false;
    std::uint32_t status_tick_ = 0U;

    lv_obj_t* root_ = nullptr;
    lv_obj_t* header_ = nullptr;
    lv_obj_t* clock_label_ = nullptr;
    lv_obj_t* weekday_label_ = nullptr;
    lv_obj_t* date_label_ = nullptr;
    lv_obj_t* term_label_ = nullptr;
    lv_obj_t* battery_percent_label_ = nullptr;
    lv_obj_t* lunar_label_ = nullptr;
    lv_obj_t* pillars_label_ = nullptr;
    lv_obj_t* analog_clock_ = nullptr;
    lv_obj_t* minute_hand_ = nullptr;
    lv_obj_t* second_hand_ = nullptr;
    lv_point_precise_t minute_points_[2]{};
    lv_point_precise_t second_points_[2]{};

    lv_obj_t* ambient_view_ = nullptr;
    std::array<lv_obj_t*, kBranchCount> branch_cells_{};
    std::array<lv_obj_t*, kBranchCount> branch_labels_{};
    lv_obj_t* shichen_range_label_ = nullptr;
    std::array<lv_obj_t*, kAmbientRowCount> ambient_values_{};

    lv_obj_t* chart_view_ = nullptr;
    lv_obj_t* chart_title_label_ = nullptr;
    lv_obj_t* chart_page_label_ = nullptr;
    lv_obj_t* chart_grid_view_ = nullptr;
    lv_obj_t* chart_pattern_view_ = nullptr;
    lv_obj_t* chart_guidance_view_ = nullptr;
    lv_obj_t* chart_evidence_view_ = nullptr;
    std::array<lv_obj_t*, kPalaceCount> palace_labels_{};
    std::array<lv_obj_t*, kPatternLineCount> pattern_labels_{};
    std::array<lv_obj_t*, kGuidanceLineCount> guidance_labels_{};
    std::array<lv_obj_t*, kEvidenceLineCount> evidence_labels_{};

    lv_obj_t* voice_view_ = nullptr;
    lv_obj_t* voice_state_label_ = nullptr;
    lv_obj_t* voice_character_label_ = nullptr;
    lv_obj_t* transcript_label_ = nullptr;

    lv_obj_t* market_view_ = nullptr;
    lv_obj_t* error_view_ = nullptr;
    lv_obj_t* error_label_ = nullptr;

    void CreateHeader();
    void CreateAmbientView();
    void CreateChartView();
    void CreateVoiceView();
    void CreateMarketView();
    void CreateErrorView();
    void RenderLocked();
    void RenderHeaderLocked();
    void RenderAnalogClock(int minute, int second);
    void RenderAmbientLocked();
    void RenderChartLocked();
    void RenderVoiceLocked();
    void RenderErrorLocked();
    void ShowOnlyLocked(lv_obj_t* active_view);
};

}  // namespace seeway
