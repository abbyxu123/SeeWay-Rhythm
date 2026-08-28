#include <SensorPCF85063.hpp>
#include <Wire.h>
#include <mbedtls/base64.h>

#include "QimenPayload.h"
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
static QimenPayloadStore payloadStore;
static bool rtcReady = false;
static bool storageReady = false;

struct ButtonState {
  uint8_t pin;
  bool stableHigh;
  bool sampledHigh;
  uint32_t changedAtMs;
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

struct PeriodKey {
  uint16_t year;
  uint8_t month;
  uint8_t day;
  uint8_t startHour;
  uint8_t index;
};

static ButtonState keyButton = {KEY_PIN, true, true, 0, 0};
static ButtonState bootButton = {BOOT_PIN, true, true, 0, 0};
static bool showNextShichen = false;
static bool showFullChart = false;
static bool redrawRequested = true;
static uint32_t startedAtMs = 0;
static uint32_t lastDrawnMinute = UINT32_MAX;
static char serialLine[512] = {0};
static size_t serialLineLength = 0;
static bool discardSerialLine = false;
static char transferBuffer[16384] = {0};
static size_t transferBufferLength = 0;
static enum { TRANSFER_NONE, TRANSFER_PROFILE, TRANSFER_PAYLOAD } transferKind = TRANSFER_NONE;

static const char *SHICHEN_NAMES[] = {
  "子时", "丑时", "寅时", "卯时", "辰时", "巳时",
  "午时", "未时", "申时", "酉时", "戌时", "亥时"
};
static const char *WEEKDAY_NAMES[] = {
  "星期日", "星期一", "星期二", "星期三",
  "星期四", "星期五", "星期六"
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
  uint16_t adjustedYear = month < 3U ? year - 1U : year;
  return (adjustedYear + adjustedYear / 4U - adjustedYear / 100U
    + adjustedYear / 400U + MONTH_OFFSETS[month - 1U] + day) % 7U;
}

static uint8_t monthNumber(const char *monthName)
{
  static const char *MONTH_NAMES[] = {
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  };
  for (uint8_t index = 0; index < 12U; index++) {
    if (strncmp(monthName, MONTH_NAMES[index], 3) == 0) {
      return index + 1U;
    }
  }
  return 1U;
}

static ClockSnapshot buildClock()
{
  char monthName[4] = {0};
  unsigned int day = 1;
  unsigned int year = 2026;
  unsigned int hour = 0;
  unsigned int minute = 0;
  unsigned int second = 0;
  sscanf(__DATE__, "%3s %u %u", monthName, &day, &year);
  sscanf(__TIME__, "%u:%u:%u", &hour, &minute, &second);

  ClockSnapshot result = {
    (uint16_t)year,
    monthNumber(monthName),
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
  uint32_t elapsed = (millis() - startedAtMs) / 1000U;
  uint32_t seconds = result.hour * 3600U + result.minute * 60U
    + result.second + elapsed;
  result.hour = (seconds / 3600U) % 24U;
  result.minute = (seconds / 60U) % 60U;
  result.second = seconds % 60U;
  return result;
}

static ClockSnapshot currentClock()
{
  if (rtcReady) {
    RTC_DateTime value = rtc.getDateTime();
    ClockSnapshot result = {
      value.getYear(), value.getMonth(), value.getDay(), value.getHour(),
      value.getMinute(), value.getSecond(), value.getWeek()
    };
    if (validClock(result)) {
      return result;
    }
  }
  return fallbackClock();
}

static void previousDay(PeriodKey &period)
{
  if (period.day > 1U) {
    period.day--;
    return;
  }
  if (period.month > 1U) {
    period.month--;
  } else {
    period.year--;
    period.month = 12U;
  }
  period.day = daysInMonth(period.year, period.month);
}

static void nextDay(PeriodKey &period)
{
  if (period.day < daysInMonth(period.year, period.month)) {
    period.day++;
    return;
  }
  period.day = 1U;
  if (period.month < 12U) {
    period.month++;
  } else {
    period.year++;
    period.month = 1U;
  }
}

static PeriodKey currentPeriod(const ClockSnapshot &clock)
{
  uint8_t index = clock.hour == 23U ? 0U : (clock.hour + 1U) / 2U;
  PeriodKey result = {
    clock.year,
    clock.month,
    clock.day,
    (uint8_t)(index == 0U ? 23U : index * 2U - 1U),
    index
  };
  if (index == 0U && clock.hour == 0U) {
    previousDay(result);
  }
  return result;
}

static PeriodKey nextPeriod(PeriodKey period)
{
  period.index = (period.index + 1U) % 12U;
  uint8_t nextHour = period.startHour + 2U;
  if (nextHour >= 24U) {
    nextHour -= 24U;
    nextDay(period);
  }
  period.startHour = nextHour;
  return period;
}

static bool payloadMatchesPeriod(
  const DevicePayloadData *payload,
  const PeriodKey &period
)
{
  if (payload == nullptr || payload->shichenIndex != period.index) {
    return false;
  }
  unsigned int year;
  unsigned int month;
  unsigned int day;
  unsigned int hour;
  return sscanf(payload->startLocal, "%4u-%2u-%2uT%2u", &year, &month, &day, &hour)
      == 4
    && year == period.year && month == period.month && day == period.day
    && hour == period.startHour;
}

static const DevicePayloadData *payloadForPeriod(const PeriodKey &period)
{
  const DevicePayloadData *current = payloadStore.payload(false);
  if (payloadMatchesPeriod(current, period)) {
    return current;
  }
  const DevicePayloadData *next = payloadStore.payload(true);
  return payloadMatchesPeriod(next, period) ? next : nullptr;
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

static void drawFittedUtf8(int x, int y, int maximumWidth, const char *text)
{
  if (u8g2->getUTF8Width(text) <= maximumWidth) {
    u8g2->drawUTF8(x, y, text);
    return;
  }
  char fitted[205] = {0};
  size_t length = strlen(text);
  if (length >= sizeof(fitted) - 3U) {
    length = sizeof(fitted) - 4U;
  }
  memcpy(fitted, text, length);
  fitted[length] = '\0';
  while (length > 0U) {
    while (length > 0U && (((uint8_t)fitted[length]) & 0xC0U) == 0x80U) {
      length--;
    }
    fitted[length] = '\0';
    strncat(fitted, "..", sizeof(fitted) - strlen(fitted) - 1U);
    if (u8g2->getUTF8Width(fitted) <= maximumWidth) {
      u8g2->drawUTF8(x, y, fitted);
      return;
    }
    if (length == 0U) {
      break;
    }
    length--;
    while (length > 0U && (((uint8_t)fitted[length]) & 0xC0U) == 0x80U) {
      length--;
    }
    fitted[length] = '\0';
  }
}

static void drawTagRow(int y, const char *label, const char *value)
{
  u8g2->setFont(u8g2_font_wqy16_t_gb2312);
  u8g2->setDrawColor(0);
  u8g2->drawBox(8, y - 19, 58, 25);
  u8g2->setDrawColor(1);
  u8g2->drawUTF8(13, y, label);
  u8g2->setDrawColor(0);
  u8g2->setFont(u8g2_font_wqy12_t_gb2312);
  drawFittedUtf8(78, y - 1, 312, value);
}

static const char *rowValue(
  const DevicePayloadData *payload,
  const DeviceResultRow &row
)
{
  if (payload == nullptr) {
    return "未同步";
  }
  if (!payload->verified) {
    return "依据不足";
  }
  return row.text[0] == '\0' ? "--" : row.text;
}

static void fallbackRange(const PeriodKey &period, char *output, size_t size)
{
  uint8_t endHour = (period.startHour + 1U) % 24U;
  snprintf(output, size, "%02u:00-%02u:59", period.startHour, endHour);
}

static void drawSummary(
  const ClockSnapshot &clock,
  const PeriodKey &period,
  const DevicePayloadData *payload
)
{
  char clockText[6];
  char solarText[33];
  char lunarText[41];
  char termText[25];
  char pillarsText[81];
  char rangeText[12];
  char diagnostics[96];
  snprintf(clockText, sizeof(clockText), "%02u:%02u", clock.hour, clock.minute);
  snprintf(solarText, sizeof(solarText), "阳历 %04u.%02u.%02u",
    clock.year, clock.month, clock.day);
  snprintf(lunarText, sizeof(lunarText), "%s",
    payload == nullptr ? "阴历 未同步" : payload->lunarDateText);
  snprintf(termText, sizeof(termText), "%s",
    payload == nullptr ? "节气 未同步" : payload->solarTermText);
  snprintf(pillarsText, sizeof(pillarsText), "%s",
    payload == nullptr ? "历法与盘面数据未同步" : payload->pillarsText);
  if (payload == nullptr) {
    fallbackRange(period, rangeText, sizeof(rangeText));
  } else {
    snprintf(rangeText, sizeof(rangeText), "%s", payload->rangeText);
  }

  u8g2->clearBuffer();
  u8g2->setDrawColor(1);
  u8g2->drawBox(0, 0, LCD_WIDTH, LCD_HEIGHT);
  u8g2->setDrawColor(0);
  u8g2->setFont(u8g2_font_wqy16_t_gb2312);
  u8g2->drawUTF8(8, 18, clockText);
  drawCenteredUtf8(18, WEEKDAY_NAMES[clock.weekday]);
  drawRightUtf8(18, solarText);
  u8g2->drawUTF8(8, 39, lunarText);
  drawRightUtf8(39, termText);
  drawCenteredUtf8(60, pillarsText);
  u8g2->drawHLine(8, 68, 384);

  u8g2->drawFrame(8, 74, 384, 50);
  u8g2->drawBox(8, 74, 112, 50);
  u8g2->setDrawColor(1);
  drawCenteredUtf8In(8, 112, 95, showNextShichen ? "下一时辰" : "当前时辰");
  drawCenteredUtf8In(8, 112, 116, SHICHEN_NAMES[period.index]);
  u8g2->setDrawColor(0);
  u8g2->setFont(u8g2_font_logisoso24_tn);
  u8g2->drawStr(148, 109, rangeText);

  DeviceResultRow emptyRow = {};
  drawTagRow(149, "有利", rowValue(payload, payload ? payload->favorable : emptyRow));
  drawTagRow(177, "注意", rowValue(payload, payload ? payload->caution : emptyRow));
  drawTagRow(205, "方位", rowValue(payload, payload ? payload->direction : emptyRow));
  drawTagRow(233, "建议", rowValue(payload, payload ? payload->advice : emptyRow));

  u8g2->setDrawColor(0);
  u8g2->drawFrame(8, 242, 384, 8);
  if (!showNextShichen) {
    int elapsedMinutes = period.index == 0U
      ? (clock.hour == 23U ? clock.minute : 60 + clock.minute)
      : ((int)clock.hour - period.startHour) * 60 + clock.minute;
    u8g2->drawBox(10, 244, (380 * elapsedMinutes) / 120, 4);
  }

  u8g2->drawHLine(8, 258, 384);
  u8g2->setFont(u8g2_font_6x13_tf);
  snprintf(diagnostics, sizeof(diagnostics),
    "%s  %s  KEY %lu  BOOT %lu  v0.3.0",
    rtcReady ? "RTC OK" : "RTC FALLBACK",
    payload == nullptr ? "UNSYNCED" : (payload->verified ? "VERIFIED" : "BLOCKED"),
    (unsigned long)keyButton.presses,
    (unsigned long)bootButton.presses);
  u8g2->drawStr(8, 281, diagnostics);
  u8g2->sendBuffer();
}

static void drawPalaceCell(int x, int y, const DevicePalaceData &palace)
{
  char line[48];
  u8g2->drawFrame(x, y, 128, 72);
  u8g2->setFont(u8g2_font_wqy12_t_gb2312);
  snprintf(line, sizeof(line), "%s %u%s%s",
    palace.direction,
    palace.palaceNumber,
    palace.isVoid ? " 空" : "",
    palace.isHorse ? " 马" : "");
  drawFittedUtf8(x + 4, y + 15, 120, line);
  if (palace.palaceNumber == 5U) {
    snprintf(line, sizeof(line), "中宫  地%s", palace.earthStem);
    drawFittedUtf8(x + 4, y + 40, 120, line);
    return;
  }
  drawFittedUtf8(x + 4, y + 30, 120, palace.stars);
  snprintf(line, sizeof(line), "%s %s", palace.gate, palace.deity);
  drawFittedUtf8(x + 4, y + 45, 120, line);
  snprintf(line, sizeof(line), "天%s 地%s", palace.heavenStems, palace.earthStem);
  drawFittedUtf8(x + 4, y + 60, 120, line);
}

static void drawChart(
  const ClockSnapshot &clock,
  const PeriodKey &period,
  const DevicePayloadData *payload
)
{
  if (payload == nullptr || !payload->verified) {
    drawSummary(clock, period, payload);
    return;
  }
  char clockText[6];
  char chartTitle[48];
  snprintf(clockText, sizeof(clockText), "%02u:%02u", clock.hour, clock.minute);
  snprintf(chartTitle, sizeof(chartTitle), "%s%u局 %s %s",
    payload->dunType, payload->juNumber, payload->yuan, payload->shichenLabel);

  u8g2->clearBuffer();
  u8g2->setDrawColor(1);
  u8g2->drawBox(0, 0, LCD_WIDTH, LCD_HEIGHT);
  u8g2->setDrawColor(0);
  u8g2->setFont(u8g2_font_wqy16_t_gb2312);
  u8g2->drawUTF8(8, 18, clockText);
  drawCenteredUtf8(18, "奇门总盘");
  drawRightUtf8(18, chartTitle);
  u8g2->setFont(u8g2_font_wqy12_t_gb2312);
  drawFittedUtf8(8, 39, 384, payload->pillarsText);
  u8g2->drawHLine(8, 46, 384);

  static const uint8_t LUO_SHU_ORDER[] = {4, 9, 2, 3, 5, 7, 8, 1, 6};
  for (uint8_t position = 0U; position < 9U; position++) {
    uint8_t row = position / 3U;
    uint8_t column = position % 3U;
    uint8_t palaceNumber = LUO_SHU_ORDER[position];
    drawPalaceCell(8 + column * 128, 52 + row * 72, payload->palaces[palaceNumber - 1U]);
  }

  u8g2->setFont(u8g2_font_6x13_tf);
  char hashText[32];
  snprintf(hashText, sizeof(hashText), "HASH %.16s", payload->chartHash + 7U);
  u8g2->drawStr(8, 291, hashText);
  u8g2->sendBuffer();
}

static void drawScreen()
{
  const ClockSnapshot clock = currentClock();
  PeriodKey period = currentPeriod(clock);
  if (showNextShichen) {
    period = nextPeriod(period);
  }
  const DevicePayloadData *payload = payloadForPeriod(period);
  if (showFullChart) {
    drawChart(clock, period, payload);
  } else {
    drawSummary(clock, period, payload);
  }
  lastDrawnMinute = clock.hour * 60U + clock.minute;
  redrawRequested = false;
  Serial.printf(
    "DRAW time=%04u-%02u-%02uT%02u:%02u:%02u selection=%s shichen=%s view=%s payload=%s\r\n",
    clock.year, clock.month, clock.day, clock.hour, clock.minute, clock.second,
    showNextShichen ? "next" : "current",
    SHICHEN_NAMES[period.index],
    showFullChart ? "chart" : "summary",
    payload == nullptr ? "missing" : (payload->verified ? "verified" : "blocked")
  );
}

static bool buttonPressed(ButtonState &button, uint32_t nowMs)
{
  const bool sampledHigh = digitalRead(button.pin) == HIGH;
  if (sampledHigh != button.sampledHigh) {
    button.sampledHigh = sampledHigh;
    button.changedAtMs = nowMs;
  }
  if (nowMs - button.changedAtMs < 35U || sampledHigh == button.stableHigh) {
    return false;
  }
  button.stableHigh = sampledHigh;
  if (!button.stableHigh) {
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
  if (sscanf(line, "TIME=%u-%u-%uT%u:%u:%u",
      &year, &month, &day, &hour, &minute, &second) != 6) {
    Serial.printf("TIME_ERROR expected=TIME=YYYY-MM-DDTHH:MM:SS received=%s\r\n", line);
    return;
  }
  ClockSnapshot candidate = {
    (uint16_t)year, (uint8_t)month, (uint8_t)day, (uint8_t)hour,
    (uint8_t)minute, (uint8_t)second, weekdayFor(year, month, day)
  };
  if (!rtcReady || !validClock(candidate)) {
    Serial.println("TIME_ERROR rtc-not-ready-or-invalid-value");
    return;
  }
  rtc.setDateTime(candidate.year, candidate.month, candidate.day,
    candidate.hour, candidate.minute, candidate.second);
  rtc.start();
  redrawRequested = true;
  Serial.printf("TIME_OK %04u-%02u-%02uT%02u:%02u:%02u+08:00\r\n",
    candidate.year, candidate.month, candidate.day,
    candidate.hour, candidate.minute, candidate.second);
}

static void processSerialLine(const char *line)
{
  char error[64] = {0};
  if (strncmp(line, "TIME=", 5U) == 0) {
    setRtcFromLine(line);
    return;
  }
  if (strcmp(line, "STATUS") == 0) {
    payloadStore.printStatus(Serial);
    return;
  }
  if (strcmp(line, "SELECT=CURRENT") == 0 || strcmp(line, "SELECT=NEXT") == 0) {
    showNextShichen = strcmp(line, "SELECT=NEXT") == 0;
    redrawRequested = true;
    Serial.printf("SELECT_OK selection=%s\r\n", showNextShichen ? "next" : "current");
    return;
  }
  if (strcmp(line, "VIEW=SUMMARY") == 0 || strcmp(line, "VIEW=CHART") == 0) {
    showFullChart = strcmp(line, "VIEW=CHART") == 0;
    redrawRequested = true;
    Serial.printf("VIEW_OK view=%s\r\n", showFullChart ? "chart" : "summary");
    return;
  }
  if (strcmp(line, "BEGIN=PROFILE") == 0 || strcmp(line, "BEGIN=PAYLOAD") == 0) {
    transferKind = strcmp(line, "BEGIN=PROFILE") == 0
      ? TRANSFER_PROFILE
      : TRANSFER_PAYLOAD;
    transferBufferLength = 0U;
    transferBuffer[0] = '\0';
    Serial.printf("TRANSFER_BEGIN kind=%s\r\n",
      transferKind == TRANSFER_PROFILE ? "PROFILE" : "PAYLOAD");
    return;
  }
  if (strncmp(line, "CHUNK=", 6U) == 0) {
    if (transferKind == TRANSFER_NONE) {
      Serial.println("TRANSFER_ERROR reason=begin-required");
      return;
    }
    const unsigned char *encoded = reinterpret_cast<const unsigned char *>(line + 6U);
    size_t encodedLength = strlen(line + 6U);
    unsigned char decoded[128] = {0};
    size_t decodedLength = 0U;
    int result = mbedtls_base64_decode(
      decoded,
      sizeof(decoded),
      &decodedLength,
      encoded,
      encodedLength
    );
    if (result != 0 || transferBufferLength + decodedLength >= sizeof(transferBuffer)) {
      transferKind = TRANSFER_NONE;
      transferBufferLength = 0U;
      Serial.println("TRANSFER_ERROR reason=invalid-or-oversized-chunk");
      return;
    }
    memcpy(transferBuffer + transferBufferLength, decoded, decodedLength);
    transferBufferLength += decodedLength;
    transferBuffer[transferBufferLength] = '\0';
    return;
  }
  if (strcmp(line, "END") == 0) {
    if (transferKind == TRANSFER_NONE || transferBufferLength == 0U) {
      Serial.println("TRANSFER_ERROR reason=no-active-transfer");
      return;
    }
    bool accepted = transferKind == TRANSFER_PROFILE
      ? payloadStore.acceptProvisioning(transferBuffer, error, sizeof(error))
      : payloadStore.acceptPayload(transferBuffer, error, sizeof(error));
    const char *kindName = transferKind == TRANSFER_PROFILE ? "PROFILE" : "PAYLOAD";
    transferKind = TRANSFER_NONE;
    transferBufferLength = 0U;
    transferBuffer[0] = '\0';
    if (accepted) {
      Serial.printf("TRANSFER_OK kind=%s\r\n", kindName);
      payloadStore.printStatus(Serial);
      redrawRequested = true;
    } else {
      Serial.printf("TRANSFER_ERROR kind=%s reason=%s\r\n", kindName, error);
    }
    return;
  }
  if (strncmp(line, "PROFILE=", 8U) == 0) {
    if (payloadStore.acceptProvisioning(line + 8U, error, sizeof(error))) {
      const DeviceProfileData *profile = payloadStore.profile();
      Serial.printf("PROFILE_OK id=%s version=%lu\r\n",
        profile->profileId, (unsigned long)profile->profileVersion);
      redrawRequested = true;
    } else {
      Serial.printf("PROFILE_ERROR reason=%s\r\n", error);
    }
    return;
  }
  if (strncmp(line, "PAYLOAD=", 8U) == 0) {
    if (payloadStore.acceptPayload(line + 8U, error, sizeof(error))) {
      Serial.println("PAYLOAD_OK");
      payloadStore.printStatus(Serial);
      redrawRequested = true;
    } else {
      Serial.printf("PAYLOAD_ERROR reason=%s\r\n", error);
    }
    return;
  }
  Serial.println("COMMAND_ERROR expected=TIME|STATUS|SELECT|VIEW|BEGIN|CHUNK|END|PROFILE|PAYLOAD");
}

static void readSerialCommands()
{
  while (Serial.available() > 0) {
    char value = (char)Serial.read();
    if (value == '\r') {
      continue;
    }
    if (discardSerialLine && value != '\n') {
      continue;
    }
    if (value == '\n') {
      if (discardSerialLine) {
        discardSerialLine = false;
        serialLineLength = 0U;
        continue;
      }
      serialLine[serialLineLength] = '\0';
      if (serialLineLength > 0U) {
        processSerialLine(serialLine);
      }
      serialLineLength = 0U;
      continue;
    }
    if (serialLineLength + 1U < sizeof(serialLine)) {
      serialLine[serialLineLength++] = value;
    } else {
      serialLineLength = 0U;
      discardSerialLine = true;
      Serial.println("COMMAND_ERROR command-too-long");
    }
  }
}

void setup()
{
  Serial.begin(115200);
  delay(300);

  pinMode(KEY_PIN, INPUT_PULLUP);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  keyButton.stableHigh = keyButton.sampledHigh = digitalRead(KEY_PIN) == HIGH;
  bootButton.stableHigh = bootButton.sampledHigh = digitalRead(BOOT_PIN) == HIGH;

  startedAtMs = millis();
  lcd.begin(0, U8G2_R1);
  u8g2 = lcd.getU8g2();
  u8g2->setFontMode(1);

  rtcReady = rtc.begin(Wire, RTC_SDA_PIN, RTC_SCL_PIN);
  if (rtcReady) {
    rtc.start();
    RTC_DateTime value = rtc.getDateTime();
    ClockSnapshot clock = {
      value.getYear(), value.getMonth(), value.getDay(), value.getHour(),
      value.getMinute(), value.getSecond(), value.getWeek()
    };
    if (!rtc.isClockIntegrityGuaranteed() || !validClock(clock)) {
      ClockSnapshot build = buildClock();
      rtc.setDateTime(build.year, build.month, build.day,
        build.hour, build.minute, build.second);
      rtc.start();
      Serial.println("RTC_INIT source=build-time reason=invalid-or-stopped");
    }
  }
  storageReady = payloadStore.begin();

  Serial.printf(
    "SEAWAY_READY board=ESP32-S3-RLCD-4.2 flash=%lu psram=%lu rtc=%s storage=%s version=0.3.0\r\n",
    (unsigned long)ESP.getFlashChipSize(),
    (unsigned long)ESP.getPsramSize(),
    rtcReady ? "PCF85063" : "fallback",
    storageReady ? "ready" : "failed"
  );
  Serial.println("COMMANDS TIME | STATUS | SELECT | VIEW | BEGIN/CHUNK/END");
  payloadStore.printStatus(Serial);
  drawScreen();
}

void loop()
{
  const uint32_t nowMs = millis();
  readSerialCommands();

  if (buttonPressed(keyButton, nowMs)) {
    showNextShichen = !showNextShichen;
    redrawRequested = true;
    Serial.printf("BUTTON key=KEY action=toggle-shichen selection=%s count=%lu\r\n",
      showNextShichen ? "next" : "current", (unsigned long)keyButton.presses);
  }
  if (buttonPressed(bootButton, nowMs)) {
    showFullChart = !showFullChart;
    redrawRequested = true;
    Serial.printf("BUTTON key=BOOT action=toggle-view view=%s count=%lu\r\n",
      showFullChart ? "chart" : "summary", (unsigned long)bootButton.presses);
  }

  const ClockSnapshot clock = currentClock();
  const uint32_t minuteOfDay = clock.hour * 60U + clock.minute;
  if (minuteOfDay != lastDrawnMinute) {
    redrawRequested = true;
  }
  if (redrawRequested) {
    drawScreen();
  }
  delay(5);
}
