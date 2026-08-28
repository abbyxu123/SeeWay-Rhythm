#pragma once

#include <Arduino.h>
#include <Preferences.h>

struct DeviceProfileData {
  uint32_t magic;
  uint16_t storageVersion;
  char profileId[65];
  uint32_t profileVersion;
  char displayName[81];
  char sex[7];
  char birthText[33];
  char timeZone[65];
  char placeText[201];
  uint32_t checksum;
};

struct DeviceResultRow {
  char text[201];
};

struct DevicePalaceData {
  uint8_t palaceNumber;
  char direction[9];
  char earthStem[5];
  char heavenStems[17];
  char stars[33];
  char gate[9];
  char deity[9];
  bool isVoid;
  bool isHorse;
};

struct DevicePayloadData {
  uint32_t magic;
  uint16_t storageVersion;
  bool verified;
  char selection[8];
  char profileId[65];
  uint32_t profileVersion;
  uint8_t shichenIndex;
  char shichenLabel[13];
  char rangeText[12];
  char startLocal[64];
  char endLocal[64];
  char clockText[6];
  char weekdayText[13];
  char solarDateText[33];
  char lunarDateText[41];
  char solarTermText[25];
  char pillarsText[81];
  char chartHash[72];
  char issueCode[40];
  DeviceResultRow favorable;
  DeviceResultRow caution;
  DeviceResultRow direction;
  DeviceResultRow advice;
  char dunType[10];
  uint8_t juNumber;
  char yuan[10];
  char xunHead[7];
  char chiefStar[10];
  char chiefGate[10];
  uint8_t voidPalaces[2];
  uint8_t voidPalaceCount;
  uint8_t horsePalace;
  DevicePalaceData palaces[9];
  uint32_t checksum;
};

class QimenPayloadStore {
public:
  bool begin();
  bool acceptProvisioning(const char *json, char *error, size_t errorSize);
  bool acceptPayload(const char *json, char *error, size_t errorSize);

  bool hasProfile() const;
  const DeviceProfileData *profile() const;
  const DevicePayloadData *payload(bool next) const;
  bool hasPayload(bool next) const;
  void printStatus(Stream &output) const;

private:
  Preferences preferences;
  DeviceProfileData storedProfile = {};
  DevicePayloadData currentPayload = {};
  DevicePayloadData nextPayload = {};
  bool profileReady = false;
  bool currentReady = false;
  bool nextReady = false;

  void clearPayloads();
  bool persistProfile();
  bool persistPayload(const DevicePayloadData &payload);
};
