#include "seeway_display.h"
#include "assets/lang_config.h"
#include "src/misc/lv_text_private.h"
#define LODEPNG_NO_COMPILE_CPP
#include "src/libs/lodepng/lodepng.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include <cstring>

static std::vector<unsigned char> pixels(400 * 300 * 4);
static std::vector<unsigned char> draw_buffer(400 * 300 * 4);

static void Flush(lv_display_t* display, const lv_area_t* area, uint8_t* data) {
    int width = area->x2 - area->x1 + 1;
    for (int y = area->y1; y <= area->y2; ++y) {
        for (int x = area->x1; x <= area->x2; ++x) {
            int src = ((y-area->y1)*width+x-area->x1)*4;
            int dst = (y*400+x)*4;
            pixels[dst] = data[src+2];
            pixels[dst+1] = data[src+1];
            pixels[dst+2] = data[src];
            pixels[dst+3] = 255;
        }
    }
    lv_display_flush_ready(display);
}

static void CheckLabels(lv_obj_t* object, bool hidden = false) {
    hidden = hidden || lv_obj_has_flag(object, LV_OBJ_FLAG_HIDDEN);
    if (hidden) return;
    if (lv_obj_check_type(object, &lv_label_class)) {
        const char* text = lv_label_get_text(object);
        if (*text) {
            for (uint32_t index = 0; text[index];) {
                const auto codepoint = lv_text_encoded_next(text, &index);
                if (codepoint == '\n' || codepoint == '\r') continue;
                lv_font_glyph_dsc_t glyph{};
                if (!lv_obj_get_style_text_font(object, LV_PART_MAIN)->get_glyph_dsc(
                        lv_obj_get_style_text_font(object, LV_PART_MAIN), &glyph, codepoint, 0))
                    throw std::runtime_error("Missing glyph " + std::to_string(codepoint));
            }
            lv_point_t size;
            lv_text_get_size(&size, text, lv_obj_get_style_text_font(object, LV_PART_MAIN),
                lv_obj_get_style_text_letter_space(object, LV_PART_MAIN),
                lv_obj_get_style_text_line_space(object, LV_PART_MAIN),
                lv_obj_get_content_width(object), LV_TEXT_FLAG_NONE);
            if (size.y > lv_obj_get_content_height(object) &&
                lv_label_get_long_mode(object) != LV_LABEL_LONG_MODE_SCROLL) {
                throw std::runtime_error(std::string("Clipped label: ")+text+
                    " needs "+std::to_string(size.y)+" has "+std::to_string(lv_obj_get_content_height(object)));
            }
        }
    }
    for (unsigned i = 0; i < lv_obj_get_child_count(object); ++i)
        CheckLabels(lv_obj_get_child(object, i), hidden);
}

static void Capture(const std::filesystem::path& path) {
    auto* screen = lv_screen_active();
    lv_obj_update_layout(screen);
    CheckLabels(screen);
    lv_obj_invalidate(screen);
    lv_refr_now(nullptr);
    unsigned dark = 0;
    for (size_t i=0; i<pixels.size(); i+=4) if(pixels[i]<128) ++dark;
    if(dark < 400 || dark > 110000) throw std::runtime_error("Blank or obscured screen");
    unsigned char* encoded = nullptr;
    size_t encoded_size = 0;
    auto error = lodepng_encode32(&encoded, &encoded_size, pixels.data(), 400, 300);
    if (error) throw std::runtime_error(lodepng_error_text(error));
    std::ofstream file(path, std::ios::binary);
    file.write(reinterpret_cast<const char*>(encoded), encoded_size);
    lv_free(encoded);
    if (!file) throw std::runtime_error("Cannot write preview");
    std::cout << path.filename() << " labels fit, dark pixels=" << dark << '\n';
}

int main(int argc, char** argv) {
    if(argc != 2) return 2;
    std::filesystem::path out(argv[1]);
    std::filesystem::create_directories(out);
    lv_init();
    seeway::SeeWayDisplay display(nullptr,nullptr,400,300,0,0,false,false,false,{},3);
    auto* d=lv_display_get_default();
    lv_display_set_color_format(d,LV_COLOR_FORMAT_ARGB8888);
    lv_display_set_buffers(d,draw_buffer.data(),nullptr,draw_buffer.size(),LV_DISPLAY_RENDER_MODE_FULL);
    lv_display_set_flush_cb(d,Flush);
    display.SetupUI();
    Capture(out/"ambient-offline.png");
    seeway::SeeWayScreenContent content;
    content.clock="13:26";
    content.weekday="星期一";
    content.solar_date="2026.09.07";
    content.lunar_date="阴历 七月廿六";
    content.solar_term="处暑";
    content.pillars="丙午年 丙申月 甲申日 辛未时";
    content.shichen_range="13:00-14:59";
    content.shichen_index=7;
    content.battery_percent=82;
    content.main_tendency="界面排版测试";
    content.favorable="整理计划，核对待办与资料";
    content.caution="此页文字仅用于检查显示效果";
    content.direction="方位内容将在校验后显示";
    content.action="查看完整盘面与规则依据";
    content.chart_heading="当前时辰奇门盘";
    for (auto& palace: content.palaces) palace.lines={"东南 巽四宫","天辅 杜门 六合","天盘乙 地盘丁","排版样例"};
    for(auto& line:content.pattern_lines)line="盘眼测试：长内容应在完整页面内换行显示";
    for(auto& line:content.guidance_lines)line="解读测试：详细内容独立呈现，不覆盖主屏";
    for(auto& line:content.evidence_lines)line="依据测试：规则编号与书籍来源按条显示";
    display.SetScreenContent(content,1,seeway::DataStatus::Verified);
    Capture(out/"ambient-layout.png");
    display.ToggleChart(1);
    for(int i=0;i<4;++i) { Capture(out/("chart-"+std::to_string(i)+".png")); display.AdvanceChartPage(1); }
    display.SetStatus(Lang::Strings::LISTENING);
    display.SetChatMessage("user","这段话用来检查语音字幕的排版");
    Capture(out/"voice-listening.png");
    display.SetStatus(Lang::Strings::SPEAKING);
    display.SetChatMessage("assistant","我会根据已经校验的盘面来回答。");
    Capture(out/"voice-speaking.png");
    auto previous = pixels;
    display.UpdateStatusBar(false);
    Capture(out/"voice-speaking-next.png");
    if(previous == pixels) throw std::runtime_error("Character did not animate");
    display.SetChatMessage("assistant", "长回答显示测试：这段文字需要超过字幕区域的四行。我们保留完整文字，用户应能看到后续内容，不能将未显示的文字当作不存在。第一部分用于检查换行，第二部分用于检查超出内容的呈现，第三部分用于确认文字不会盖住角色，也不会丢失最后一句。这里是结束标记。");
    Capture(out/"voice-long-answer.png");
    auto before_scroll = pixels;
    for (int tick = 0; tick < 240; ++tick) { lv_tick_inc(20); lv_timer_handler(); }
    Capture(out/"voice-long-answer-scrolled.png");
    if (std::equal(pixels.begin()+221*400*4, pixels.end(), before_scroll.begin()+221*400*4))
        throw std::runtime_error("Long subtitle did not scroll");
    display.SetStatus(Lang::Strings::WIFI_CONFIG_MODE);
    display.SetChatMessage("system","连接热点 Xiaozhi-D19D\n浏览器打开\nhttp://192.168.4.1");
    Capture(out/"provisioning.png");
    display.SetScreenContent(content,2,seeway::DataStatus::Verified);
    if(display.GetScreenMode()!=seeway::ScreenMode::Provisioning)throw std::runtime_error("Provisioning interrupted");
    display.SetStatus(Lang::Strings::STANDBY);
    display.EnterMarket(2);
    Capture(out/"market-unavailable.png");
    display.ShowScreenError(seeway::ScreenError::QimenUnavailable,2);
    Capture(out/"unavailable.png");
    return 0;
}
