#include "QimenPayload.h"

#include <ArduinoJson.h>
#include <stddef.h>

static const uint32_t PROFILE_MAGIC = 0x53575031U;
static const uint32_t PAYLOAD_MAGIC = 0x53574431U;
static const uint16_t STORAGE_VERSION = 1U;

static void setError(char *output, size_t outputSize, const char *message)
{
  if (outputSize == 0U) {
    return;
  }
  snprintf(output, outputSize, "%s", message);
}

static uint32_t checksumFor(const void *data, size_t length)
{
  const uint8_t *bytes = static_cast<const uint8_t *>(data);
  uint32_t value = 2166136261U;
  for (size_t index = 0; index < length; index++) {
    value ^= bytes[index];
    value *= 16777619U;
  }
  return value;
}

template <typename T>
static void finalizeStored(T &value)
{
  value.checksum = checksumFor(&value, offsetof(T, checksum));
}

template <typename T>
static bool validStored(const T &value, uint32_t magic)
{
  return value.magic == magic
    && value.storageVersion == STORAGE_VERSION
    && value.checksum == checksumFor(&value, offsetof(T, checksum));
}

static bool isAllowedKey(
  const char *key,
  const char *const *allowed,
  size_t allowedCount
)
{
  for (size_t index = 0; index < allowedCount; index++) {
    if (strcmp(key, allowed[index]) == 0) {
      return true;
    }
  }
  return false;
}

static bool hasOnlyKeys(
  JsonObjectConst object,
  const char *const *allowed,
  size_t allowedCount
)
{
  for (JsonPairConst pair : object) {
    if (!isAllowedKey(pair.key().c_str(), allowed, allowedCount)) {
      return false;
    }
  }
  return true;
}

static bool hasRequiredKeys(
  JsonObjectConst object,
  const char *const *required,
  size_t requiredCount
)
{
  for (size_t index = 0; index < requiredCount; index++) {
    if (!object.containsKey(required[index])) {
      return false;
    }
  }
  return true;
}

static bool exactObject(
  JsonObjectConst object,
  const char *const *keys,
  size_t keyCount
)
{
  return object.size() == keyCount
    && hasOnlyKeys(object, keys, keyCount)
    && hasRequiredKeys(object, keys, keyCount);
}

static bool copyString(JsonVariantConst value, char *output, size_t outputSize)
{
  if (!value.is<const char *>()) {
    return false;
  }
  const char *text = value.as<const char *>();
  size_t length = strlen(text);
  if (length == 0U || length >= outputSize) {
    return false;
  }
  memcpy(output, text, length + 1U);
  return true;
}

static bool equals(JsonVariantConst value, const char *expected)
{
  return value.is<const char *>()
    && strcmp(value.as<const char *>(), expected) == 0;
}

static bool emptyArray(JsonVariantConst value)
{
  return value.is<JsonArrayConst>() && value.as<JsonArrayConst>().size() == 0U;
}

static bool looksLikeSha256(JsonVariantConst value)
{
  if (!value.is<const char *>()) {
    return false;
  }
  const char *text = value.as<const char *>();
  if (strlen(text) != 71U || strncmp(text, "sha256:", 7U) != 0) {
    return false;
  }
  for (size_t index = 7U; index < 71U; index++) {
    if (!((text[index] >= '0' && text[index] <= '9')
      || (text[index] >= 'a' && text[index] <= 'f'))) {
      return false;
    }
  }
  return true;
}

static bool validMinuteBirth(const char *value)
{
  if (strlen(value) != 16U) {
    return false;
  }
  unsigned int year;
  unsigned int month;
  unsigned int day;
  unsigned int hour;
  unsigned int minute;
  return sscanf(value, "%4u-%2u-%2uT%2u:%2u", &year, &month, &day, &hour, &minute)
      == 5
    && year > 0U && month >= 1U && month <= 12U
    && day >= 1U && day <= 31U && hour <= 23U && minute <= 59U;
}

static bool validDate(const char *value)
{
  if (strlen(value) != 10U) {
    return false;
  }
  unsigned int year;
  unsigned int month;
  unsigned int day;
  return sscanf(value, "%4u-%2u-%2u", &year, &month, &day) == 3
    && year > 0U && month >= 1U && month <= 12U && day >= 1U && day <= 31U;
}

static bool knownBranch(const char *value)
{
  static const char *BRANCHES[] = {
    "子", "丑", "寅", "卯", "辰", "巳",
    "午", "未", "申", "酉", "戌", "亥"
  };
  for (const char *branch : BRANCHES) {
    if (strcmp(value, branch) == 0) {
      return true;
    }
  }
  return false;
}

static const char *branchForIndex(uint8_t index)
{
  static const char *BRANCHES[] = {
    "子", "丑", "寅", "卯", "辰", "巳",
    "午", "未", "申", "酉", "戌", "亥"
  };
  return index <= 11U ? BRANCHES[index] : "";
}

static bool parseProfile(
  JsonObjectConst profile,
  DeviceProfileData &output,
  char *error,
  size_t errorSize
)
{
  static const char *PROFILE_KEYS[] = {
    "contractVersion", "profileId", "profileVersion", "originalBirthInput",
    "displayName", "sex"
  };
  static const char *PROFILE_REQUIRED[] = {
    "contractVersion", "profileId", "profileVersion", "originalBirthInput"
  };
  if (!hasOnlyKeys(profile, PROFILE_KEYS, 6U)
    || !hasRequiredKeys(profile, PROFILE_REQUIRED, 4U)
    || !equals(profile["contractVersion"], "birth-profile/v1")
    || !profile["profileVersion"].is<uint32_t>()
    || profile["profileVersion"].as<uint32_t>() == 0U) {
    setError(error, errorSize, "invalid-profile-contract");
    return false;
  }

  memset(&output, 0, sizeof(output));
  output.magic = PROFILE_MAGIC;
  output.storageVersion = STORAGE_VERSION;
  output.profileVersion = profile["profileVersion"].as<uint32_t>();
  if (!copyString(profile["profileId"], output.profileId, sizeof(output.profileId))) {
    setError(error, errorSize, "invalid-profile-id");
    return false;
  }
  if (profile.containsKey("displayName")
    && !copyString(profile["displayName"], output.displayName, sizeof(output.displayName))) {
    setError(error, errorSize, "invalid-display-name");
    return false;
  }
  if (profile.containsKey("sex")) {
    if (!(equals(profile["sex"], "male") || equals(profile["sex"], "female"))
      || !copyString(profile["sex"], output.sex, sizeof(output.sex))) {
      setError(error, errorSize, "invalid-sex");
      return false;
    }
  }

  if (!profile["originalBirthInput"].is<JsonObjectConst>()) {
    setError(error, errorSize, "invalid-birth-input");
    return false;
  }
  JsonObjectConst birth = profile["originalBirthInput"].as<JsonObjectConst>();
  static const char *BIRTH_KEYS[] = {
    "calendar", "precision", "localDateTime", "localDate", "shichenBranch",
    "timeZone", "placeText"
  };
  if (!hasOnlyKeys(birth, BIRTH_KEYS, 7U)
    || !equals(birth["calendar"], "gregorian")
    || !copyString(birth["timeZone"], output.timeZone, sizeof(output.timeZone))
    || strchr(output.timeZone, '/') == nullptr
    || !copyString(birth["placeText"], output.placeText, sizeof(output.placeText))) {
    setError(error, errorSize, "invalid-birth-context");
    return false;
  }

  if (equals(birth["precision"], "minute")) {
    static const char *MINUTE_KEYS[] = {
      "calendar", "precision", "localDateTime", "timeZone", "placeText"
    };
    if (!exactObject(birth, MINUTE_KEYS, 5U)
      || !copyString(birth["localDateTime"], output.birthText, sizeof(output.birthText))
      || !validMinuteBirth(output.birthText)) {
      setError(error, errorSize, "invalid-minute-birth");
      return false;
    }
  } else if (equals(birth["precision"], "shichen")) {
    static const char *SHICHEN_KEYS[] = {
      "calendar", "precision", "localDate", "shichenBranch", "timeZone", "placeText"
    };
    char localDate[11] = {0};
    char branch[5] = {0};
    if (!exactObject(birth, SHICHEN_KEYS, 6U)
      || !copyString(birth["localDate"], localDate, sizeof(localDate))
      || !validDate(localDate)
      || !copyString(birth["shichenBranch"], branch, sizeof(branch))
      || !knownBranch(branch)) {
      setError(error, errorSize, "invalid-shichen-birth");
      return false;
    }
    snprintf(output.birthText, sizeof(output.birthText), "%s %s时", localDate, branch);
  } else {
    setError(error, errorSize, "missing-birth-precision");
    return false;
  }

  finalizeStored(output);
  return true;
}

static bool parseRow(
  JsonVariantConst value,
  DeviceResultRow &output,
  bool &hasText
)
{
  static const char *ROW_KEYS[] = {"text", "evidenceIds"};
  if (!value.is<JsonObjectConst>()) {
    return false;
  }
  JsonObjectConst row = value.as<JsonObjectConst>();
  if (!exactObject(row, ROW_KEYS, 2U) || !row["evidenceIds"].is<JsonArrayConst>()) {
    return false;
  }
  JsonArrayConst evidence = row["evidenceIds"].as<JsonArrayConst>();
  hasText = !row["text"].isNull();
  memset(output.text, 0, sizeof(output.text));
  if (hasText) {
    if (!copyString(row["text"], output.text, sizeof(output.text))
      || evidence.size() == 0U || evidence.size() > 16U) {
      return false;
    }
  } else if (evidence.size() != 0U) {
    return false;
  }
  for (JsonVariantConst evidenceId : evidence) {
    if (!evidenceId.is<const char *>() || strlen(evidenceId.as<const char *>()) == 0U) {
      return false;
    }
  }
  return true;
}

static bool joinStringArray(
  JsonVariantConst value,
  char *output,
  size_t outputSize,
  size_t maximumCount
)
{
  if (!value.is<JsonArrayConst>()) {
    return false;
  }
  JsonArrayConst array = value.as<JsonArrayConst>();
  if (array.size() > maximumCount) {
    return false;
  }
  output[0] = '\0';
  for (JsonVariantConst item : array) {
    if (!item.is<const char *>()) {
      return false;
    }
    const char *text = item.as<const char *>();
    size_t used = strlen(output);
    size_t incoming = strlen(text);
    size_t separator = used == 0U ? 0U : 1U;
    if (incoming == 0U || used + separator + incoming >= outputSize) {
      return false;
    }
    if (separator != 0U) {
      output[used++] = '/';
      output[used] = '\0';
    }
    memcpy(output + used, text, incoming + 1U);
  }
  return true;
}

static const char *directionForPalace(uint8_t palaceNumber)
{
  static const char *DIRECTIONS[] = {
    "北", "西南", "东", "东南", "中", "西北", "西", "东北", "南"
  };
  return palaceNumber >= 1U && palaceNumber <= 9U
    ? DIRECTIONS[palaceNumber - 1U]
    : "";
}

static bool parseChart(JsonVariantConst value, DevicePayloadData &output)
{
  static const char *CHART_KEYS[] = {
    "dunType", "juNumber", "yuan", "xunHead", "chiefStar", "chiefGate",
    "voidPalaces", "horsePalace", "palaces"
  };
  static const char *PALACE_KEYS[] = {
    "palaceNumber", "direction", "earthStem", "heavenStems", "stars", "gate",
    "deity", "isVoid", "isHorse"
  };
  if (!value.is<JsonObjectConst>()) {
    return false;
  }
  JsonObjectConst chart = value.as<JsonObjectConst>();
  if (!exactObject(chart, CHART_KEYS, 9U)
    || !(equals(chart["dunType"], "阳遁") || equals(chart["dunType"], "阴遁"))
    || !copyString(chart["dunType"], output.dunType, sizeof(output.dunType))
    || !chart["juNumber"].is<uint8_t>()
    || chart["juNumber"].as<uint8_t>() < 1U || chart["juNumber"].as<uint8_t>() > 9U
    || !copyString(chart["yuan"], output.yuan, sizeof(output.yuan))
    || !copyString(chart["xunHead"], output.xunHead, sizeof(output.xunHead))
    || !copyString(chart["chiefStar"], output.chiefStar, sizeof(output.chiefStar))
    || !copyString(chart["chiefGate"], output.chiefGate, sizeof(output.chiefGate))
    || !chart["horsePalace"].is<uint8_t>()
    || !chart["voidPalaces"].is<JsonArrayConst>()
    || !chart["palaces"].is<JsonArrayConst>()) {
    return false;
  }
  output.juNumber = chart["juNumber"].as<uint8_t>();
  output.horsePalace = chart["horsePalace"].as<uint8_t>();
  JsonArrayConst voids = chart["voidPalaces"].as<JsonArrayConst>();
  if (voids.size() < 1U || voids.size() > 2U) {
    return false;
  }
  output.voidPalaceCount = voids.size();
  for (size_t index = 0; index < voids.size(); index++) {
    if (!voids[index].is<uint8_t>()) {
      return false;
    }
    output.voidPalaces[index] = voids[index].as<uint8_t>();
  }

  bool seen[10] = {false};
  JsonArrayConst palaces = chart["palaces"].as<JsonArrayConst>();
  if (palaces.size() != 9U) {
    return false;
  }
  for (JsonVariantConst palaceValue : palaces) {
    if (!palaceValue.is<JsonObjectConst>()) {
      return false;
    }
    JsonObjectConst palace = palaceValue.as<JsonObjectConst>();
    if (!exactObject(palace, PALACE_KEYS, 9U)
      || !palace["palaceNumber"].is<uint8_t>()) {
      return false;
    }
    uint8_t number = palace["palaceNumber"].as<uint8_t>();
    if (number < 1U || number > 9U || seen[number]
      || !equals(palace["direction"], directionForPalace(number))) {
      return false;
    }
    seen[number] = true;
    DevicePalaceData &target = output.palaces[number - 1U];
    memset(&target, 0, sizeof(target));
    target.palaceNumber = number;
    if (!copyString(palace["direction"], target.direction, sizeof(target.direction))
      || !copyString(palace["earthStem"], target.earthStem, sizeof(target.earthStem))
      || !joinStringArray(palace["heavenStems"], target.heavenStems, sizeof(target.heavenStems), 2U)
      || !joinStringArray(palace["stars"], target.stars, sizeof(target.stars), 2U)
      || !palace["isVoid"].is<bool>() || !palace["isHorse"].is<bool>()) {
      return false;
    }
    target.isVoid = palace["isVoid"].as<bool>();
    target.isHorse = palace["isHorse"].as<bool>();
    bool center = number == 5U;
    if (center) {
      if (!palace["gate"].isNull() || !palace["deity"].isNull()
        || strlen(target.heavenStems) != 0U || strlen(target.stars) != 0U) {
        return false;
      }
    } else if (!copyString(palace["gate"], target.gate, sizeof(target.gate))
      || !copyString(palace["deity"], target.deity, sizeof(target.deity))
      || strlen(target.heavenStems) == 0U || strlen(target.stars) == 0U) {
      return false;
    }
    bool expectedVoid = false;
    for (size_t index = 0; index < voids.size(); index++) {
      expectedVoid = expectedVoid || output.voidPalaces[index] == number;
    }
    if (target.isVoid != expectedVoid || target.isHorse != (number == output.horsePalace)) {
      return false;
    }
  }
  return true;
}

static bool validDirectionItems(JsonVariantConst value, bool verified)
{
  if (!value.is<JsonArrayConst>()) {
    return false;
  }
  JsonArrayConst items = value.as<JsonArrayConst>();
  if ((verified && items.size() == 0U) || (!verified && items.size() != 0U)) {
    return false;
  }
  static const char *DIRECTION_KEYS[] = {
    "polarity", "palaceNumber", "direction", "gate", "purpose", "strength",
    "evidenceIds"
  };
  for (JsonVariantConst value : items) {
    if (!value.is<JsonObjectConst>()) {
      return false;
    }
    JsonObjectConst item = value.as<JsonObjectConst>();
    if (!exactObject(item, DIRECTION_KEYS, 7U)
      || !(equals(item["polarity"], "supportive") || equals(item["polarity"], "avoid"))
      || !item["palaceNumber"].is<uint8_t>()
      || !item["direction"].is<const char *>()
      || !item["gate"].is<const char *>()
      || !item["purpose"].is<const char *>()
      || !(equals(item["strength"], "low") || equals(item["strength"], "medium")
        || equals(item["strength"], "high"))
      || !item["evidenceIds"].is<JsonArrayConst>()
      || item["evidenceIds"].as<JsonArrayConst>().size() == 0U) {
      return false;
    }
  }
  return true;
}

static bool validRuleIds(JsonVariantConst value, bool verified)
{
  if (!value.is<JsonArrayConst>()) {
    return false;
  }
  JsonArrayConst rules = value.as<JsonArrayConst>();
  if ((verified && rules.size() == 0U) || (!verified && rules.size() != 0U)) {
    return false;
  }
  for (JsonVariantConst rule : rules) {
    if (!rule.is<const char *>() || strncmp(rule.as<const char *>(), "QG-GATE-", 8U) != 0) {
      return false;
    }
  }
  return true;
}

static bool parsePayload(
  const char *json,
  const DeviceProfileData &profile,
  DevicePayloadData &output,
  char *error,
  size_t errorSize
)
{
  JsonDocument document;
  DeserializationError jsonError = deserializeJson(document, json);
  if (jsonError || !document.is<JsonObjectConst>()) {
    setError(error, errorSize, "invalid-payload-json");
    return false;
  }
  JsonObjectConst root = document.as<JsonObjectConst>();
  static const char *ROOT_KEYS[] = {
    "payloadVersion", "calculatedAt", "profileRef", "targetShichen",
    "calendarHeader", "versions", "verification", "chartHash", "guidanceStatus",
    "rows", "directions", "ruleIds", "chart"
  };
  if (!exactObject(root, ROOT_KEYS, 13U)
    || !equals(root["payloadVersion"], "seeway-device-payload/v1")
    || !root["calculatedAt"].is<const char *>()
    || strlen(root["calculatedAt"].as<const char *>()) < 20U) {
    setError(error, errorSize, "invalid-payload-contract");
    return false;
  }

  static const char *REF_KEYS[] = {"profileId", "profileVersion"};
  if (!root["profileRef"].is<JsonObjectConst>()) {
    setError(error, errorSize, "missing-profile-ref");
    return false;
  }
  JsonObjectConst profileRef = root["profileRef"].as<JsonObjectConst>();
  if (!exactObject(profileRef, REF_KEYS, 2U)
    || !equals(profileRef["profileId"], profile.profileId)
    || !profileRef["profileVersion"].is<uint32_t>()
    || profileRef["profileVersion"].as<uint32_t>() != profile.profileVersion) {
    setError(error, errorSize, "profile-mismatch");
    return false;
  }

  memset(&output, 0, sizeof(output));
  output.magic = PAYLOAD_MAGIC;
  output.storageVersion = STORAGE_VERSION;
  memcpy(output.profileId, profile.profileId, sizeof(output.profileId));
  output.profileVersion = profile.profileVersion;

  static const char *SHICHEN_KEYS[] = {
    "selection", "index", "branch", "label", "startLocal", "endLocal", "rangeText"
  };
  if (!root["targetShichen"].is<JsonObjectConst>()) {
    setError(error, errorSize, "missing-target-shichen");
    return false;
  }
  JsonObjectConst shichen = root["targetShichen"].as<JsonObjectConst>();
  uint8_t shichenIndex = shichen["index"].is<uint8_t>()
    ? shichen["index"].as<uint8_t>()
    : 255U;
  char expectedLabel[13] = {0};
  snprintf(expectedLabel, sizeof(expectedLabel), "%s时", branchForIndex(shichenIndex));
  if (!exactObject(shichen, SHICHEN_KEYS, 7U)
    || !(equals(shichen["selection"], "current") || equals(shichen["selection"], "next"))
    || !copyString(shichen["selection"], output.selection, sizeof(output.selection))
    || shichenIndex > 11U
    || !equals(shichen["branch"], branchForIndex(shichenIndex))
    || !equals(shichen["label"], expectedLabel)
    || !copyString(shichen["label"], output.shichenLabel, sizeof(output.shichenLabel))
    || !copyString(shichen["rangeText"], output.rangeText, sizeof(output.rangeText))
    || !copyString(shichen["startLocal"], output.startLocal, sizeof(output.startLocal))
    || !copyString(shichen["endLocal"], output.endLocal, sizeof(output.endLocal))) {
    setError(error, errorSize, "invalid-target-shichen");
    return false;
  }
  output.shichenIndex = shichenIndex;

  static const char *HEADER_KEYS[] = {
    "clockText", "weekdayText", "solarDateText", "lunarDateText",
    "solarTermText", "pillarsText"
  };
  if (!root["calendarHeader"].is<JsonObjectConst>()) {
    setError(error, errorSize, "missing-calendar-header");
    return false;
  }
  JsonObjectConst header = root["calendarHeader"].as<JsonObjectConst>();
  if (!exactObject(header, HEADER_KEYS, 6U)
    || !copyString(header["clockText"], output.clockText, sizeof(output.clockText))
    || !copyString(header["weekdayText"], output.weekdayText, sizeof(output.weekdayText))
    || !copyString(header["solarDateText"], output.solarDateText, sizeof(output.solarDateText))
    || !copyString(header["lunarDateText"], output.lunarDateText, sizeof(output.lunarDateText))
    || !copyString(header["solarTermText"], output.solarTermText, sizeof(output.solarTermText))
    || !copyString(header["pillarsText"], output.pillarsText, sizeof(output.pillarsText))) {
    setError(error, errorSize, "invalid-calendar-header");
    return false;
  }

  static const char *VERSION_KEYS[] = {
    "profile", "timeContext", "qimenChart", "qimenAlgorithm", "qimenVerifier",
    "qimenGuidance", "qimenRuleSet"
  };
  if (!root["versions"].is<JsonObjectConst>()) {
    setError(error, errorSize, "missing-versions");
    return false;
  }
  JsonObjectConst versions = root["versions"].as<JsonObjectConst>();
  if (!exactObject(versions, VERSION_KEYS, 7U)
    || !equals(versions["profile"], "birth-profile/v1")
    || !equals(versions["timeContext"], "time-cn-zhang-v1")
    || !equals(versions["qimenChart"], "qimen-chart/v1")
    || !equals(versions["qimenAlgorithm"], "qimen-zhuanpan-chaibu-v1")
    || !equals(versions["qimenVerifier"], "qimen-verifier/v1")
    || !equals(versions["qimenGuidance"], "qimen-guidance/v1")
    || !equals(versions["qimenRuleSet"], "qimen-gate-baseline/v1")) {
    setError(error, errorSize, "version-mismatch");
    return false;
  }

  static const char *VERIFICATION_KEYS[] = {"status", "issueCodes"};
  if (!root["verification"].is<JsonObjectConst>()) {
    setError(error, errorSize, "missing-verification");
    return false;
  }
  JsonObjectConst verification = root["verification"].as<JsonObjectConst>();
  if (!exactObject(verification, VERIFICATION_KEYS, 2U)
    || !verification["issueCodes"].is<JsonArrayConst>()) {
    setError(error, errorSize, "invalid-verification");
    return false;
  }
  output.verified = equals(verification["status"], "verified");
  if (!output.verified && !equals(verification["status"], "blocked")) {
    setError(error, errorSize, "invalid-verification-status");
    return false;
  }
  JsonArrayConst issueCodes = verification["issueCodes"].as<JsonArrayConst>();
  if ((output.verified && issueCodes.size() != 0U)
    || (!output.verified && issueCodes.size() == 0U)) {
    setError(error, errorSize, "invalid-verification-issues");
    return false;
  }
  if (!output.verified
    && !copyString(issueCodes[0], output.issueCode, sizeof(output.issueCode))) {
    setError(error, errorSize, "invalid-issue-code");
    return false;
  }

  static const char *ROW_GROUP_KEYS[] = {"favorable", "caution", "direction", "advice"};
  if (!root["rows"].is<JsonObjectConst>()) {
    setError(error, errorSize, "missing-result-rows");
    return false;
  }
  JsonObjectConst rows = root["rows"].as<JsonObjectConst>();
  bool hasFavorable;
  bool hasCaution;
  bool hasDirection;
  bool hasAdvice;
  if (!exactObject(rows, ROW_GROUP_KEYS, 4U)
    || !parseRow(rows["favorable"], output.favorable, hasFavorable)
    || !parseRow(rows["caution"], output.caution, hasCaution)
    || !parseRow(rows["direction"], output.direction, hasDirection)
    || !parseRow(rows["advice"], output.advice, hasAdvice)) {
    setError(error, errorSize, "invalid-result-rows");
    return false;
  }

  if (output.verified) {
    if (!equals(root["guidanceStatus"], "derived")
      || !looksLikeSha256(root["chartHash"])
      || !copyString(root["chartHash"], output.chartHash, sizeof(output.chartHash))
      || (!hasFavorable && !hasCaution) || !hasDirection || !hasAdvice
      || !validDirectionItems(root["directions"], true)
      || !validRuleIds(root["ruleIds"], true)
      || !parseChart(root["chart"], output)) {
      setError(error, errorSize, "verified-payload-incomplete");
      return false;
    }
  } else if (!equals(root["guidanceStatus"], "insufficient")
    || !root["chartHash"].isNull() || !root["chart"].isNull()
    || hasFavorable || hasCaution || hasDirection || hasAdvice
    || !validDirectionItems(root["directions"], false)
    || !validRuleIds(root["ruleIds"], false)) {
    setError(error, errorSize, "blocked-payload-carried-content");
    return false;
  }

  finalizeStored(output);
  return true;
}

bool QimenPayloadStore::begin()
{
  if (!preferences.begin("seeway", false)) {
    return false;
  }
  if (preferences.getBytesLength("profile") == sizeof(storedProfile)) {
    preferences.getBytes("profile", &storedProfile, sizeof(storedProfile));
    profileReady = validStored(storedProfile, PROFILE_MAGIC);
  }
  if (preferences.getBytesLength("current") == sizeof(currentPayload)) {
    preferences.getBytes("current", &currentPayload, sizeof(currentPayload));
    currentReady = validStored(currentPayload, PAYLOAD_MAGIC);
  }
  if (preferences.getBytesLength("next") == sizeof(nextPayload)) {
    preferences.getBytes("next", &nextPayload, sizeof(nextPayload));
    nextReady = validStored(nextPayload, PAYLOAD_MAGIC);
  }
  if (!profileReady) {
    clearPayloads();
  } else {
    if (currentReady && (strcmp(currentPayload.profileId, storedProfile.profileId) != 0
      || currentPayload.profileVersion != storedProfile.profileVersion)) {
      currentReady = false;
    }
    if (nextReady && (strcmp(nextPayload.profileId, storedProfile.profileId) != 0
      || nextPayload.profileVersion != storedProfile.profileVersion)) {
      nextReady = false;
    }
  }
  return true;
}

void QimenPayloadStore::clearPayloads()
{
  currentReady = false;
  nextReady = false;
  memset(&currentPayload, 0, sizeof(currentPayload));
  memset(&nextPayload, 0, sizeof(nextPayload));
  preferences.remove("current");
  preferences.remove("next");
}

bool QimenPayloadStore::persistProfile()
{
  return preferences.putBytes("profile", &storedProfile, sizeof(storedProfile))
    == sizeof(storedProfile);
}

bool QimenPayloadStore::persistPayload(const DevicePayloadData &payload)
{
  const char *key = strcmp(payload.selection, "next") == 0 ? "next" : "current";
  return preferences.putBytes(key, &payload, sizeof(payload)) == sizeof(payload);
}

bool QimenPayloadStore::acceptProvisioning(
  const char *json,
  char *error,
  size_t errorSize
)
{
  JsonDocument document;
  DeserializationError jsonError = deserializeJson(document, json);
  if (jsonError || !document.is<JsonObjectConst>()) {
    setError(error, errorSize, "invalid-provisioning-json");
    return false;
  }
  JsonObjectConst root = document.as<JsonObjectConst>();
  static const char *ROOT_KEYS[] = {"provisioningVersion", "provisionedAt", "profile"};
  if (!exactObject(root, ROOT_KEYS, 3U)
    || !equals(root["provisioningVersion"], "device-provisioning/v1")
    || !root["provisionedAt"].is<const char *>()
    || !root["profile"].is<JsonObjectConst>()) {
    setError(error, errorSize, "invalid-provisioning-contract");
    return false;
  }
  DeviceProfileData candidate = {};
  if (!parseProfile(root["profile"].as<JsonObjectConst>(), candidate, error, errorSize)) {
    return false;
  }
  if (profileReady
    && strcmp(candidate.profileId, storedProfile.profileId) == 0
    && candidate.profileVersion == storedProfile.profileVersion
    && memcmp(
      &candidate,
      &storedProfile,
      offsetof(DeviceProfileData, checksum)
    ) != 0) {
    setError(error, errorSize, "profile-version-conflict");
    return false;
  }
  bool changed = !profileReady
    || strcmp(candidate.profileId, storedProfile.profileId) != 0
    || candidate.profileVersion != storedProfile.profileVersion;
  storedProfile = candidate;
  profileReady = true;
  if (!persistProfile()) {
    profileReady = false;
    setError(error, errorSize, "profile-persistence-failed");
    return false;
  }
  if (changed) {
    clearPayloads();
  }
  setError(error, errorSize, "ok");
  return true;
}

bool QimenPayloadStore::acceptPayload(
  const char *json,
  char *error,
  size_t errorSize
)
{
  if (!profileReady) {
    setError(error, errorSize, "profile-required");
    return false;
  }
  DevicePayloadData candidate = {};
  if (!parsePayload(json, storedProfile, candidate, error, errorSize)) {
    return false;
  }
  if (!persistPayload(candidate)) {
    setError(error, errorSize, "payload-persistence-failed");
    return false;
  }
  if (strcmp(candidate.selection, "next") == 0) {
    nextPayload = candidate;
    nextReady = true;
  } else {
    currentPayload = candidate;
    currentReady = true;
  }
  setError(error, errorSize, "ok");
  return true;
}

bool QimenPayloadStore::hasProfile() const
{
  return profileReady;
}

const DeviceProfileData *QimenPayloadStore::profile() const
{
  return profileReady ? &storedProfile : nullptr;
}

const DevicePayloadData *QimenPayloadStore::payload(bool next) const
{
  if (next) {
    return nextReady ? &nextPayload : nullptr;
  }
  return currentReady ? &currentPayload : nullptr;
}

bool QimenPayloadStore::hasPayload(bool next) const
{
  return next ? nextReady : currentReady;
}

void QimenPayloadStore::printStatus(Stream &output) const
{
  output.printf(
    "STATUS profile=%u current=%u next=%u current_verified=%u next_verified=%u\r\n",
    profileReady ? 1U : 0U,
    currentReady ? 1U : 0U,
    nextReady ? 1U : 0U,
    currentReady && currentPayload.verified ? 1U : 0U,
    nextReady && nextPayload.verified ? 1U : 0U
  );
}
