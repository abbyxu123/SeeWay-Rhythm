import { readFileSync } from "node:fs";
import {
  BirthProfileSchema,
  DEVICE_PROVISIONING_VERSION,
  DeviceProvisioningSchema,
} from "@seeway/contracts";
import { buildQimenDevicePayload } from "@seeway/control-plane";
import { calculateQimenChart } from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";

const SOURCE_REFERENCE = Object.freeze({
  sourceId: "zhang-advanced-course-notes",
  title: "河北周易研究会奇门遁甲高级班笔记",
  locator: "PDF第2页，例一",
  fingerprint:
    "sha256:4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47",
});

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return value;
}

const profilePath = argument("--profile");
const localDateTime = argument("--time");
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(localDateTime)) {
  throw new Error("--time must use YYYY-MM-DDTHH:mm:ss in Asia/Shanghai.");
}

const profile = BirthProfileSchema.parse(
  JSON.parse(readFileSync(profilePath, "utf8")),
);
const currentContext = buildTimeContext(
  resolveCivilTime({
    localDateTime,
    timeZone: "Asia/Shanghai",
    precision: "second",
  }),
);
const nextContext = buildTimeContext(
  resolveCivilTime({
    localDateTime: currentContext.shichen.next.startLocal.slice(0, 19),
    timeZone: "Asia/Shanghai",
    precision: "second",
  }),
);

const provisioning = DeviceProvisioningSchema.parse({
  provisioningVersion: DEVICE_PROVISIONING_VERSION,
  provisionedAt: currentContext.civil.instant,
  profile,
});
const currentChart = calculateQimenChart(currentContext, SOURCE_REFERENCE);
const nextChart = calculateQimenChart(nextContext, SOURCE_REFERENCE);
const currentPayload = buildQimenDevicePayload({
  calculatedAt: currentContext.civil.instant,
  selection: "current",
  profile,
  timeContext: currentContext,
  chart: currentChart,
});
const nextPayload = buildQimenDevicePayload({
  calculatedAt: currentContext.civil.instant,
  selection: "next",
  profile,
  timeContext: nextContext,
  chart: nextChart,
});

function transferCommands(
  kind: "PROFILE" | "PAYLOAD",
  value: unknown,
): string[] {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  const chunks = encoded.match(/.{1,120}/g) ?? [];
  return [`BEGIN=${kind}`, ...chunks.map((chunk) => `CHUNK=${chunk}`), "END"];
}

process.stdout.write(
  [
    ...transferCommands("PROFILE", provisioning),
    ...transferCommands("PAYLOAD", currentPayload),
    ...transferCommands("PAYLOAD", nextPayload),
    "STATUS",
  ].join("\n") + "\n",
);
