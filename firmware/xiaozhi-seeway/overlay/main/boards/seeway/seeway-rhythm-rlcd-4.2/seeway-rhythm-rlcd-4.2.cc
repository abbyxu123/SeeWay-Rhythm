#include <esp_lcd_panel_vendor.h>
#include <driver/i2c_master.h>
#include <driver/spi_common.h>
#include <esp_log.h>
#include "seeway_buttons.h"
#include "seeway_audio_privacy.h"
#include "seeway_display.h"
#include "seeway_mcp_tools.h"
#include "wifi_board.h"
#include "application.h"
#include "button.h"
#include "config.h"
#include "codecs/box_audio_codec.h"
#include "wifi_station.h"
#include "mcp_server.h"
#include "lvgl.h"

#define TAG "seeway_rhythm_rlcd_4_2"

namespace {
constexpr uint16_t kLongPressMs = 1200;
}

using seeway::ButtonAction;
using seeway::ButtonContext;
using seeway::ButtonGesture;
using seeway::ButtonPolicy;
using seeway::PhysicalButton;
using seeway::ScreenMode;
using seeway::SeeWayDisplay;
using seeway::SeeWayMcpTools;

class CustomBoard : public WifiBoard {
private:
    i2c_master_bus_handle_t i2c_bus_;
    Button boot_button_;
    Button key_button_;
    ButtonPolicy button_policy_;
    SeeWayMcpTools qimen_mcp_tools_;
    SeeWayDisplay *display_ = nullptr;
    adc_oneshot_unit_handle_t adc1_handle;
    adc_cali_handle_t cali_handle;
    bool vbat_status = 0;

    void InitializeI2c() {
        i2c_master_bus_config_t i2c_bus_cfg = {};
        i2c_bus_cfg.i2c_port = ESP32_I2C_HOST;
        i2c_bus_cfg.sda_io_num = AUDIO_CODEC_I2C_SDA_PIN;
        i2c_bus_cfg.scl_io_num = AUDIO_CODEC_I2C_SCL_PIN;
        i2c_bus_cfg.clk_source = I2C_CLK_SRC_DEFAULT;
        i2c_bus_cfg.glitch_ignore_cnt = 7;
        i2c_bus_cfg.intr_priority = 0;
        i2c_bus_cfg.trans_queue_depth = 0;
        i2c_bus_cfg.flags.enable_internal_pullup = 1;
        ESP_ERROR_CHECK(i2c_new_master_bus(&i2c_bus_cfg, &i2c_bus_));
    }

    ButtonContext CurrentButtonContext() {
        const auto device_state = Application::GetInstance().GetDeviceState();
        const auto screen_mode = display_ == nullptr
            ? ScreenMode::Ambient
            : display_->GetScreenMode();
        return {device_state == kDeviceStateStarting, screen_mode};
    }

    void ExecuteButtonAction(ButtonAction action) {
        auto& app = Application::GetInstance();
        ESP_LOGI(TAG, "button action=%d", static_cast<int>(action));
        switch (action) {
            case ButtonAction::None:
                return;
            case ButtonAction::EnterWifiConfig:
                EnterWifiConfigMode();
                return;
            case ButtonAction::ToggleChart:
                display_->ToggleCurrentChart();
                return;
            case ButtonAction::AdvanceChartPage:
                display_->AdvanceCurrentChartPage();
                return;
            case ButtonAction::ToggleVoice:
                app.ToggleChatState();
                return;
            case ButtonAction::EnablePrivacyMute:
                app.StopListening();
                seeway::AudioInputPrivacy::SetMuted(true, [this]() {
                    GetAudioCodec()->EnableInput(false);
                });
                display_->SetPrivacyMuted(true);
                return;
            case ButtonAction::DisablePrivacyMute:
                seeway::AudioInputPrivacy::SetMuted(false, []() {});
                display_->SetPrivacyMuted(false);
                return;
        }
    }

    void HandleButton(PhysicalButton button, ButtonGesture gesture) {
        ExecuteButtonAction(button_policy_.Handle(
            button, gesture, CurrentButtonContext()));
    }

    void InitializeButtons() {
        boot_button_.OnClick([this]() {
            HandleButton(PhysicalButton::Boot, ButtonGesture::ShortPress);
        });
        boot_button_.OnLongPress([this]() {
            HandleButton(PhysicalButton::Boot, ButtonGesture::LongPress);
        });
        key_button_.OnClick([this]() {
            HandleButton(PhysicalButton::Key, ButtonGesture::ShortPress);
        });
        key_button_.OnLongPress([this]() {
            HandleButton(PhysicalButton::Key, ButtonGesture::LongPress);
        });
    }

    void InitializeTools() {
        qimen_mcp_tools_.Register();
        auto& mcp_server = McpServer::GetInstance();
        mcp_server.AddTool("self.disp.network", "重新配网", PropertyList(),
        [this](const PropertyList&) -> ReturnValue {
            EnterWifiConfigMode();
            return true;
        });
    }

    void InitializeLcdDisplay() {
        spi_display_config_t spi_config = {};
        spi_config.mosi = RLCD_MOSI_PIN;
        spi_config.scl = RLCD_SCK_PIN;
        spi_config.dc = RLCD_DC_PIN;
        spi_config.cs = RLCD_CS_PIN;
        spi_config.rst = RLCD_RST_PIN;
        display_ = new SeeWayDisplay(NULL, NULL, RLCD_WIDTH,RLCD_HEIGHT,DISPLAY_OFFSET_X,DISPLAY_OFFSET_Y,DISPLAY_MIRROR_X,DISPLAY_MIRROR_Y,DISPLAY_SWAP_XY,spi_config);
    }

    uint16_t BatterygetVoltage(void) {
        static bool initialized = false;
        static adc_oneshot_unit_handle_t adc_handle;
        static adc_cali_handle_t cali_handle = NULL;
        if (!initialized) {
            adc_oneshot_unit_init_cfg_t init_config = {
                .unit_id = ADC_UNIT_1,
            };
            adc_oneshot_new_unit(&init_config, &adc_handle);

            adc_oneshot_chan_cfg_t ch_config = {
                .atten = ADC_ATTEN_DB_12,
                .bitwidth = ADC_BITWIDTH_12,
            };
            adc_oneshot_config_channel(adc_handle, BATTERY_ADC_CHANNEL, &ch_config);

            adc_cali_curve_fitting_config_t cali_config = {
                .unit_id = ADC_UNIT_1,
                .atten = ADC_ATTEN_DB_12,
                .bitwidth = ADC_BITWIDTH_12,
            };
            if (adc_cali_create_scheme_curve_fitting(&cali_config, &cali_handle) == ESP_OK) {
                initialized = true;
            }
        }

        if (initialized) {
            int raw_value = 0;
            int raw_voltage = 0;
            int voltage = 0; // mV
            adc_oneshot_read(adc_handle, BATTERY_ADC_CHANNEL, &raw_value);
            adc_cali_raw_to_voltage(cali_handle, raw_value, &raw_voltage);
            voltage =  raw_voltage * 3;
            // ESP_LOGI(TAG, "voltage: %dmV", voltage);
            return (uint16_t)voltage;
        }

        return 0;
    }

    uint8_t BatterygetPercent() {
        int voltage = 0;
        for (uint8_t i = 0; i < 10; i++) {
            voltage += BatterygetVoltage();
        }

        voltage /= 10;
        int percent = (-1 * voltage * voltage + 9016 * voltage - 19189000) / 10000;
        percent = (percent > 100) ? 100 : (percent < 0) ? 0 : percent;
        // ESP_LOGI(TAG, "voltage: %dmV, percentage: %d%%", voltage, percent);
        return (uint8_t)percent;
    }

public:
    CustomBoard()
        : boot_button_(BOOT_BUTTON_GPIO, false, kLongPressMs),
          key_button_(KEY_BUTTON_GPIO, false, kLongPressMs) {
        InitializeI2c();
        InitializeLcdDisplay();
        InitializeButtons();
        InitializeTools();
   }

    virtual AudioCodec* GetAudioCodec() override {
        static BoxAudioCodec audio_codec(
            i2c_bus_,
            AUDIO_INPUT_SAMPLE_RATE,
            AUDIO_OUTPUT_SAMPLE_RATE,
            AUDIO_I2S_GPIO_MCLK,
            AUDIO_I2S_GPIO_BCLK,
            AUDIO_I2S_GPIO_WS,
            AUDIO_I2S_GPIO_DOUT,
            AUDIO_I2S_GPIO_DIN,
            AUDIO_CODEC_PA_PIN,
            AUDIO_CODEC_ES8311_ADDR,
            AUDIO_CODEC_ES7210_ADDR,
            AUDIO_INPUT_REFERENCE);
        return &audio_codec;
    }

    virtual Display* GetDisplay() override {
        return display_;
    }

    virtual bool GetBatteryLevel(int &level, bool& charging, bool& discharging) override {
        charging = false;
        discharging = !charging;
        level = (int)BatterygetPercent();

        return true;
    }
};

DECLARE_BOARD(CustomBoard);
