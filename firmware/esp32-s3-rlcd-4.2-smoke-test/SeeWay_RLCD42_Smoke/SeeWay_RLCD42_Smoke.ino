#include <SensorPCF85063.hpp>
#include <Wire.h>

#include "ST7305_U8g2.h"

#define LCD_WIDTH 400
#define LCD_HEIGHT 300

#define RLCD_SCK_PIN 11
#define RLCD_MOSI_PIN 12
#define RLCD_DC_PIN 5
#define RLCD_CS_PIN 40
#define RLCD_RST_PIN 41

#define RTC_SDA_PIN 13
#define RTC_SCL_PIN 14

#define KEY_PIN 18
#define BOOT_PIN 0

static ST7305_U8g2 lcd(
  RLCD_SCK_PIN,
  RLCD_MOSI_PIN,
  RLCD_DC_PIN,
  RLCD_CS_PIN,
  RLCD_RST_PIN
);
static U8G2 *u8g2 = nullptr;
static SensorPCF85063 rtc;
static bool rtc_ready = false;

struct ButtonState {
  uint8_t pin;
  bool stable_high;
  bool sampled_high;
  uint32_t changed_at_ms;
  uint32_t presses;
};

struct ClockSnapshot {
  uint16_t year;
  uint8_t month;
  uint8_t day;
  uint8_t hour;
  uint8_t minute;
  uint8_t second;
  uint8_t weekday;
};

static ButtonState key_button = {KEY_PIN, true, true, 0, 0};
static ButtonState boot_button = {BOOT_PIN, true, true, 0, 0};
static bool show_next_shichen = false;
static bool redraw_requested = true;
static uint32_t started_at_ms = 0;
static uint32_t last_drawn_minute = UINT32_MAX;
static char serial_line[48] = {0};
static size_t serial_line_length = 0;

static const char *SHICHEN_NAMES[] = {
  "子时", "丑时", "寅时", "卯时", "辰时", "巳时",
  "午时", "未时", "申时", "酉时", "戌时", "亥时"
};
static const char *WEEKDAY_NAMES[] = {
  "星期日", "星期一", "星期二", "星期三",
  "星期四", "星期五", "星期六"
};

// Candidate display fixture for the current hardware-review date. Production
// calendar facts will arrive from the independently verified time-core payload.
static const char *AUG_25_HOUR_PILLARS[] = {
  "戊子", "己丑", "庚寅", "辛卯", "壬辰", "癸巳",
  "甲午", "乙未", "丙申", "丁酉", "戊戌", "己亥"
};

static bool isLeapYear(uint16_t year)
{
  return year % 400U == 0U || (year % 4U == 0U && year % 100U != 0U);
}

static uint8_t daysInMonth(uint16_t year, uint8_t month)
{
  static const uint8_t DAYS[] = {
    31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
  };
  if (month == 2U && isLeapYear(year)) {
    return 29U;
  }
  return month >= 1U && month <= 12U ? DAYS[month - 1U] : 0U;
}

static bool validClock(const ClockSnapshot &clock)
{
  return clock.year >= 2024U && clock.year <= 2099U
    && clock.month >= 1U && clock.month <= 12U
    && clock.day >= 1U && clock.day <= daysInMonth(clock.year, clock.month)
    && clock.hour <= 23U && clock.minute <= 59U && clock.second <= 59U
    && clock.weekday <= 6U;
}

static uint8_t weekdayFor(uint16_t year, uint8_t month, uint8_t day)
{
  static const uint8_t MONTH_OFFSETS[] = {
    0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4
  };
  uint16_t adjusted_year = month < 3U ? year - 1U : year;
  return (adjusted_year + adjusted_year / 4U - adjusted_year / 100U
    + adjusted_year / 400U + MONTH_OFFSETS[month - 1U] + day) % 7U;
}

static uint8_t monthNumber(const char *month_name)
{
  static const char *MONTH_NAMES[] = {
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  };
  for (uint8_t i = 0; i < 12U; i++) {
    if (strncmp(month_name, MONTH_NAMES[i], 3) == 0) {
      return i + 1U;
    }
  }
  return 1U;
}

static ClockSnapshot buildClock()
{
  char month_name[4] = {0};
  unsigned int day = 1;
  unsigned int year = 2026;
  unsigned int hour = 0;
  unsigned int minute = 0;
  unsigned int second = 0;
  sscanf(__DATE__, "%3s %u %u", month_name, &day, &year);
  sscanf(__TIME__, "%u:%u:%u", &hour, &minute, &second);

  ClockSnapshot result = {
    (uint16_t)year,
    monthNumber(month_name),
    (uint8_t)day,
    (uint8_t)hour,
    (uint8_t)minute,
    (uint8_t)second,
    0
  };
  result.weekday = weekdayFor(result.year, result.month, result.day);
  return result;
}

static ClockSnapshot fallbackClock()
{
  ClockSnapshot result = buildClock();
  uint32_t elapsed = (millis() - started_at_ms) / 1000U;
  uint32_t seconds = result.hour * 3600U + result.minute * 60U
    + result.second + elapsed;
  result.hour = (seconds / 3600U) % 24U;
  result.minute = (seconds / 60U) % 60U;
  result.second = seconds % 60U;
  return result;
}

static ClockSnapshot currentClock()
{
  if (rtc_ready) {
    RTC_DateTime value = rtc.getDateTime();
    ClockSnapshot result = {
      value.getYear(),
      value.getMonth(),
      value.getDay(),
      value.getHour(),
      value.getMinute(),
      value.getSecond(),
      value.getWeek()
    };
    if (validClock(result)) {
      return result;
    }
  }
  return fallbackClock();
}

static void drawCenteredUtf8(int y, const char *text)
{
  int x = (LCD_WIDTH - u8g2->getUTF8Width(text)) / 2;
  u8g2->drawUTF8(x < 0 ? 0 : x, y, text);
}

static void drawCenteredUtf8In(int left, int width, int y, const char *text)
{
  int x = left + (width - u8g2->getUTF8Width(text)) / 2;
  u8g2->drawUTF8(x < left ? left : x, y, text);
}

static void drawRightUtf8(int y, const char *text)
{
  int x = LCD_WIDTH - u8g2->getUTF8Width(text) - 8;
  u8g2->drawUTF8(x < 0 ? 0 : x, y, text);
}

static void drawTagRow(int y, const char *label, const char *value)
{
  u8g2->setFont(u8g2_font_wqy16_t_gb2312);
  u8g2->setDrawColor(0);
  u8g2->drawBox(8, y - 20, 58, 27);
  u8g2->setDrawColor(1);
  u8g2->drawUTF8(13, y, label);
  u8g2->setDrawColor(0);
  u8g2->drawUTF8(80, y, value);
}

static bool calendarFixtureFor(
  const ClockSnapshot &clock,
  int shichen_index,
  char *lunar_text,
  size_t lunar_size,
  char *term_text,
  size_t term_size,
  char *pillars_text,
  size_t pillars_size
)
{
  if (clock.year != 2026U || clock.month != 8U || clock.day != 25U) {
    snprintf(lunar_text, lunar_size, "阴历 待同步");
    snprintf(term_text, term_size, "节气 待同步");
    snprintf(pillars_text, pillars_size, "历法数据待同步");
    return false;
  }

  snprintf(lunar_text, lunar_size, "阴历 七月十三");
  snprintf(term_text, term_size, "节气 处暑");
  snprintf(pillars_text, pillars_size, "丙午年 丙申月 辛未日 %s时",
    AUG_25_HOUR_PILLARS[shichen_index]);
  return true;
}

static void drawScreen()
{
  char clock_text[6];
  char solar_text[24];
  char lunar_text[32];
  char term_text[24];
  char pillars_text[64];
  char range_text[16];
  char diagnostics[64];
  const ClockSnapshot clock = currentClock();
  const uint32_t minute_of_day = clock.hour * 60U + clock.minute;
  const int current_index = clock.hour == 23U ? 0 : (clock.hour + 1U) / 2U;
  const int shown_index = show_next_shichen
    ? (current_index + 1) % 12
    : current_index;
  const int start_hour = shown_index == 0 ? 23 : shown_index * 2 - 1;
  const int end_hour = shown_index == 0 ? 0 : shown_index * 2;

  snprintf(clock_text, sizeof(clock_text), "%02u:%02u", clock.hour, clock.minute);
  snprintf(solar_text, sizeof(solar_text), "阳历 %04u.%02u.%02u",
    clock.year, clock.month, clock.day);
  snprintf(range_text, sizeof(range_text), "%02d:00-%02d:59", start_hour, end_hour);
  calendarFixtureFor(
    clock,
    shown_index,
    lunar_text,
    sizeof(lunar_text),
    term_text,
    sizeof(term_text),
    pillars_text,
    sizeof(pillars_text)
  );

  u8g2->clearBuffer();
  u8g2->setDrawColor(1);
  u8g2->drawBox(0, 0, LCD_WIDTH, LCD_HEIGHT);
  u8g2->setDrawColor(0);
  u8g2->setFont(u8g2_font_wqy16_t_gb2312);
  u8g2->drawUTF8(8, 18, clock_text);
  drawCenteredUtf8(18, WEEKDAY_NAMES[clock.weekday]);
  drawRightUtf8(18, solar_text);
  u8g2->drawUTF8(8, 39, lunar_text);
  drawRightUtf8(39, term_text);
  drawCenteredUtf8(60, pillars_text);
  u8g2->drawHLine(8, 68, 384);

  u8g2->drawFrame(8, 76, 384, 54);
  u8g2->drawBox(8, 76, 112, 54);
  u8g2->setDrawColor(1);
  drawCenteredUtf8In(8, 112, 98, show_next_shichen ? "下一时辰" : "当前时辰");
  drawCenteredUtf8In(8, 112, 120, SHICHEN_NAMES[shown_index]);
  u8g2->setDrawColor(0);
  u8g2->setFont(u8g2_font_logisoso24_tn);
  u8g2->drawStr(148, 113, range_text);

  drawTagRow(160, "有利", "等待算法");
  drawTagRow(192, "注意", "等待算法");
  drawTagRow(224, "方位", "等待算法");

  u8g2->setDrawColor(0);
  u8g2->drawFrame(8, 237, 384, 10);
  if (!show_next_shichen) {
    int elapsed_minutes = current_index == 0
      ? (clock.hour == 23U ? clock.minute : 60 + clock.minute)
      : ((int)clock.hour - start_hour) * 60 + clock.minute;
    u8g2->drawBox(10, 239, (380 * elapsed_minutes) / 120, 6);
  }

  u8g2->drawHLine(8, 258, 384);
  u8g2->setFont(u8g2_font_6x13_tf);
  snprintf(diagnostics, sizeof(diagnostics), "%s   KEY %lu   BOOT %lu   v0.2.0",
    rtc_ready ? "RTC OK" : "RTC FALLBACK",
    (unsigned long)key_button.presses,
    (unsigned long)boot_button.presses);
  u8g2->drawStr(8, 281, diagnostics);
  u8g2->sendBuffer();

  last_drawn_minute = minute_of_day;
  redraw_requested = false;
  Serial.printf(
    "draw=%04u-%02u-%02uT%02u:%02u:%02u weekday=%u shichen=%s next=%u rtc=%u\r\n",
    clock.year,
    clock.month,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
    clock.weekday,
    SHICHEN_NAMES[shown_index],
    show_next_shichen ? 1U : 0U,
    rtc_ready ? 1U : 0U
  );
}

static bool buttonPressed(ButtonState &button, uint32_t now_ms)
{
  const bool sampled_high = digitalRead(button.pin) == HIGH;
  if (sampled_high != button.sampled_high) {
    button.sampled_high = sampled_high;
    button.changed_at_ms = now_ms;
  }

  if (now_ms - button.changed_at_ms < 35U || sampled_high == button.stable_high) {
    return false;
  }

  button.stable_high = sampled_high;
  if (!button.stable_high) {
    button.presses++;
    return true;
  }
  return false;
}

static void setRtcFromLine(const char *line)
{
  unsigned int year;
  unsigned int month;
  unsigned int day;
  unsigned int hour;
  unsigned int minute;
  unsigned int second;
  if (sscanf(
      line,
      "TIME=%u-%u-%uT%u:%u:%u",
      &year,
      &month,
      &day,
      &hour,
      &minute,
      &second
    ) != 6) {
    Serial.printf("TIME_ERROR expected=TIME=YYYY-MM-DDTHH:MM:SS received=%s\r\n", line);
    return;
  }

  ClockSnapshot candidate = {
    (uint16_t)year,
    (uint8_t)month,
    (uint8_t)day,
    (uint8_t)hour,
    (uint8_t)minute,
    (uint8_t)second,
    weekdayFor(year, month, day)
  };
  if (!rtc_ready || !validClock(candidate)) {
    Serial.println("TIME_ERROR rtc-not-ready-or-invalid-value");
    return;
  }

  rtc.setDateTime(
    candidate.year,
    candidate.month,
    candidate.day,
    candidate.hour,
    candidate.minute,
    candidate.second
  );
  rtc.start();
  redraw_requested = true;
  Serial.printf("TIME_OK %04u-%02u-%02uT%02u:%02u:%02u+08:00\r\n",
    candidate.year,
    candidate.month,
    candidate.day,
    candidate.hour,
    candidate.minute,
    candidate.second);
}

static void readSerialCommands()
{
  while (Serial.available() > 0) {
    char value = (char)Serial.read();
    if (value == '\r') {
      continue;
    }
    if (value == '\n') {
      serial_line[serial_line_length] = '\0';
      if (serial_line_length > 0U) {
        setRtcFromLine(serial_line);
      }
      serial_line_length = 0U;
      continue;
    }
    if (serial_line_length + 1U < sizeof(serial_line)) {
      serial_line[serial_line_length++] = value;
    } else {
      serial_line_length = 0U;
      Serial.println("TIME_ERROR command-too-long");
    }
  }
}

void setup()
{
  Serial.begin(115200);
  delay(300);

  pinMode(KEY_PIN, INPUT_PULLUP);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  key_button.stable_high = key_button.sampled_high = digitalRead(KEY_PIN) == HIGH;
  boot_button.stable_high = boot_button.sampled_high = digitalRead(BOOT_PIN) == HIGH;

  started_at_ms = millis();
  lcd.begin(0, U8G2_R1);
  u8g2 = lcd.getU8g2();
  u8g2->setFontMode(1);

  rtc_ready = rtc.begin(Wire, RTC_SDA_PIN, RTC_SCL_PIN);
  if (rtc_ready) {
    rtc.start();
    RTC_DateTime value = rtc.getDateTime();
    ClockSnapshot clock = {
      value.getYear(), value.getMonth(), value.getDay(), value.getHour(),
      value.getMinute(), value.getSecond(), value.getWeek()
    };
    if (!rtc.isClockIntegrityGuaranteed() || !validClock(clock)) {
      ClockSnapshot build = buildClock();
      rtc.setDateTime(
        build.year,
        build.month,
        build.day,
        build.hour,
        build.minute,
        build.second
      );
      rtc.start();
      Serial.println("RTC_INIT source=build-time reason=invalid-or-stopped");
    }
  }

  Serial.printf(
    "SEAWAY_READY board=ESP32-S3-RLCD-4.2 flash=%lu psram=%lu rtc=%s\r\n",
    (unsigned long)ESP.getFlashChipSize(),
    (unsigned long)ESP.getPsramSize(),
    rtc_ready ? "PCF85063" : "fallback"
  );
  Serial.println("TIME_COMMAND format=TIME=YYYY-MM-DDTHH:MM:SS");
  drawScreen();
}

void loop()
{
  const uint32_t now_ms = millis();
  readSerialCommands();

  if (buttonPressed(key_button, now_ms)) {
    show_next_shichen = !show_next_shichen;
    redraw_requested = true;
    Serial.printf("button=KEY count=%lu\r\n", (unsigned long)key_button.presses);
  }
  if (buttonPressed(boot_button, now_ms)) {
    redraw_requested = true;
    Serial.printf("button=BOOT count=%lu\r\n", (unsigned long)boot_button.presses);
  }

  const ClockSnapshot clock = currentClock();
  const uint32_t minute_of_day = clock.hour * 60U + clock.minute;
  if (minute_of_day != last_drawn_minute) {
    redraw_requested = true;
  }
  if (redraw_requested) {
    drawScreen();
  }

  delay(5);
}
