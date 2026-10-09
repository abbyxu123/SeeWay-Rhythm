#pragma once
#include "lvgl.h"
using esp_lcd_panel_io_handle_t = void*;
using esp_lcd_panel_handle_t = void*;
using spi_host_device_t = int;
constexpr int SPI3_HOST = 3;
struct spi_display_config_t {};
class Display {
public:
    virtual ~Display() = default;
    virtual void SetupUI() { setup_ui_called_ = true; }
    virtual void SetStatus(const char*) {}
    virtual void SetEmotion(const char*) {}
    virtual void SetChatMessage(const char*, const char*) {}
    virtual void ClearChatMessages() {}
    virtual void UpdateStatusBar(bool = false) {}
protected:
    bool setup_ui_called_ = false;
    lv_obj_t* status_label_ = nullptr;
    lv_obj_t* notification_label_ = nullptr;
};
class CustomLcdDisplay : public Display {
public:
    CustomLcdDisplay(esp_lcd_panel_io_handle_t, esp_lcd_panel_handle_t,
        int width, int height, int, int, bool, bool, bool,
        spi_display_config_t, spi_host_device_t)
    { display_ = lv_display_create(width, height); }
protected:
    lv_display_t* display_ = nullptr;
};
class DisplayLockGuard {
public:
    explicit DisplayLockGuard(Display*) {}
};
